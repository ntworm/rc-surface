// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

/**
 * The address the panel announces, and what makes it change.
 *
 * The watcher reads the machine, the candidates module ranks what it finds
 * and this module decides what the phone is told: an address is published
 * only once the certificate covers it, and a new address takes a new
 * certificate without a restart.
 */

import { networkInterfaces } from "node:os";
import {
  buildSnapshot,
  getNetworkSnapshot,
  networkKey,
  setNetworkSnapshot,
  type LanCandidate,
  type LanInterfaceMap,
  type LanKind,
  type LanSignals,
  type LanSnapshot,
} from "./lan-candidates.js";
import { createLanWatcher, type LanWatcher, type LanWatcherDeps } from "./lan-probe.js";
import { createLanSearch, type LanSearch, type LanSearchView } from "./lan-search.js";
import { runNetworkCheck, type NetworkCheckItem } from "./lan-diagnostics.js";
import { getNetworkChoice, getNetworkProofs, recordNetworkProof, setNetworkChoice } from "./lan-settings.js";
import { certificateCovers, ensureCertificateCovers, httpsOptions, requiredCertAddresses } from "./cert.js";

/** How long a proof keeps its network from being proven again. */
const PROOF_RECENT_MS = 60 * 60 * 1000;

/** One adapter, without the details the panel has no use for. */
export interface NetworkRow {
  id: string;
  ip: string;
  interfaceName: string;
  kind: LanKind;
  gateway: string | null;
  defaultRoute: boolean;
  proven: boolean;
  provenUntil: number | null;
  level: number;
  linkLocal: boolean;
  public: boolean;
  reasons: string[];
}

/** What the panel shows about the network. */
export interface NetworkView {
  mode: "auto" | "pinned";
  /** The adapter a pin names, when the mode is pinned. */
  pinnedId: string | null;
  pinMissing: boolean;
  ambiguous: boolean;
  needsPublicChoice: boolean;
  certificatePending: boolean;
  certificateFailed: boolean;
  candidates: NetworkRow[];
}

/** The address the phone is told to use, and the network behind it. */
export interface PublishedLan {
  primaryIp: string;
  otherIps: string[];
  certificatePending: boolean;
  network: NetworkView;
}

/** What the last check found about this machine. */
export interface NetworkCheckReport {
  at: number;
  address: string;
  items: NetworkCheckItem[];
}

type Reading = { interfaces: LanInterfaceMap; signals: LanSignals };

let watcher: LanWatcher | null = null;
let reading: Reading | null = null;
let current: LanSnapshot | null = null;
let certificatePending = false;
let certificateFailed = false;
let certificateWork: Promise<void> | null = null;
let announcedIp: string | null = null;
let search: LanSearch | null = null;
let searchTurn = 0;
let heldDuringSearch = false;
let lastCheck: NetworkCheckReport | null = null;

/** What the panel is told about the network right now. */
export function getPublishedLan(): PublishedLan {
  const snapshot = getNetworkSnapshot();
  const choice = getNetworkChoice();
  const primaryIp = isPublishable(snapshot.primaryIp) ? snapshot.primaryIp : "";
  const otherIps = snapshot.otherIps.filter(isPublishable);
  return {
    primaryIp,
    otherIps,
    certificatePending,
    network: {
      mode: snapshot.mode,
      pinnedId: isPinnedChoice(choice) ? choice.id : null,
      pinMissing: snapshot.pinMissing,
      ambiguous: snapshot.ambiguous,
      needsPublicChoice: snapshot.needsPublicChoice,
      certificatePending,
      certificateFailed,
      candidates: snapshot.candidates.map(toRow),
    },
  };
}

/** Watches the machine while the server runs. Safe to call again: the
 *  previous watcher stops first, so there is only ever one. */
export async function startLanRuntime(deps?: Partial<LanWatcherDeps>): Promise<void> {
  stopLanRuntime();
  let created: LanWatcher | null = null;
  try {
    // A reading counts only while its watcher is the current one.
    created = createLanWatcher({
      ...deps,
      onUpdate: update => { if (created === watcher) onUpdate(update); },
    });
    watcher = created;
    await created.start();
  } catch (err) {
    if (watcher === created) watcher = null;
    console.warn(`[ableton-rc-surface] the LAN watcher could not start: ${describe(err)}`);
  }
}

/** Stops watching and forgets the last reading. */
export function stopLanRuntime(): void {
  endSearch();
  lastCheck = null;
  if (watcher) {
    try {
      watcher.stop();
    } catch (err) {
      console.warn(`[ableton-rc-surface] the LAN watcher could not stop: ${describe(err)}`);
    }
    watcher = null;
  }
  reading = null;
  current = null;
  announcedIp = null;
  certificatePending = false;
  certificateFailed = false;
  setNetworkSnapshot(null);
}

/** Asks the watcher to read the machine again. */
export async function refreshLanRuntime(): Promise<void> {
  if (!watcher) return;
  try {
    await watcher.refresh();
  } catch (err) {
    console.warn(`[ableton-rc-surface] the LAN watcher could not refresh: ${describe(err)}`);
  }
}

/** Applies a network choice. A pin that names no known adapter is refused
 *  and changes nothing. */
export async function chooseNetwork(value: unknown): Promise<void> {
  if (isPinnedChoice(value) && !getNetworkSnapshot().candidates.some(c => c.id === value.id)) {
    throw new Error("[ableton-rc-surface] unknown network candidate");
  }
  await setNetworkChoice(value);
  endSearch();
  recompute();
}

/** Remembers that a phone reached this machine on a network, which lifts
 *  that address above the ones the machine only guesses. */
export async function noteControllerConnection(
  localAddress: string | undefined,
  remoteAddress: string | undefined,
  now: number = Date.now(),
): Promise<void> {
  try {
    const candidate = reachedCandidate(localAddress, remoteAddress);
    if (!candidate) return;
    const fresh = !hasRecentProof(candidate, now);
    if (fresh) {
      await recordNetworkProof(networkKey(candidate), now);
      console.log(`[ableton-rc-surface] a controller reached this machine on ${candidate.ip}`);
    }
    const running = search;
    if (running?.active()) running.noteProof(candidate.ip);
    else if (fresh && watcher) recompute();
  } catch (err) {
    console.warn(`[ableton-rc-surface] could not record the controller network: ${describe(err)}`);
  }
}

/** The search as the panel sees it, or nothing when no search runs. */
export function getNetworkSearch(): LanSearchView | null {
  return search?.view() ?? null;
}

/** What the last check found, or nothing when no check ran. */
export function getNetworkCheck(): NetworkCheckReport | null {
  return lastCheck;
}

/** Walks the candidates one at a time, to find the address a phone can
 *  reach. The published address stays as it is until the walk ends. */
export async function startNetworkSearch(): Promise<void> {
  if (!watcher) throw new Error("[ableton-rc-surface] the server is not running");
  endSearch();
  const turn = searchTurn;
  await refreshLanRuntime();
  if (turn !== searchTurn || !watcher) return;
  const created: LanSearch = createLanSearch({
    candidates: () => getNetworkSnapshot().candidates,
    ownAddresses: () => getNetworkSnapshot().candidates.map(candidate => candidate.ip),
    ensureCovered: coverSearchAddress,
    onChange: () => {},
    onFinish: () => { if (search === created) releaseSnapshot(); },
  });
  search = created;
  await created.start();
}

/** Ends the walk and applies what the machine reads now. */
export async function stopNetworkSearch(): Promise<void> {
  endSearch();
  releaseSnapshot();
}

/** Gives the walk the next candidate, with a window of its own. */
export async function nextNetworkAddress(): Promise<void> {
  const running = search;
  if (!running || !(await running.next())) {
    throw new Error("[ableton-rc-surface] no network search is running");
  }
}

/** Notes that a phone reached this machine, so the walk can pause. */
export function noteHttpsConnection(localAddress: string | undefined, remoteAddress: string | undefined): void {
  search?.noteArrival(localAddress, remoteAddress);
}

/** Reads what can be read about why a phone does not reach this machine. */
export async function checkNetwork(httpsPort: number | null): Promise<NetworkCheckReport> {
  const running = search;
  const view = running?.active() ? running.view() : null;
  const address = view?.ip ?? getPublishedLan().primaryIp;
  const items = await runNetworkCheck({ platform: process.platform, address, httpsPort, execPath: process.execPath });
  lastCheck = { at: Date.now(), address, items };
  return lastCheck;
}

/** Resolves when no certificate work is running. */
export async function lanRuntimeIdle(): Promise<void> {
  for (;;) {
    const work = certificateWork;
    if (!work) return;
    await work;
    if (certificateWork === work) {
      certificateWork = null;
      return;
    }
  }
}

function onUpdate(update: Reading): void {
  reading = update;
  recompute();
}

/** Ends the search, whatever it was doing. */
function endSearch(): void {
  searchTurn += 1;
  const running = search;
  search = null;
  heldDuringSearch = false;
  running?.stop();
}

/** The address the machine reads now is applied when the search ends. */
function releaseSnapshot(): void {
  heldDuringSearch = false;
  if (watcher) recompute();
}

/** The published address stays as it is while the search runs. */
function holdSnapshot(): void {
  if (heldDuringSearch) return;
  heldDuringSearch = true;
  console.log("[ableton-rc-surface] the network changed during the search; it applies when the search ends");
}

/** The certificate has to cover the address before the search tries it. */
async function coverSearchAddress(ip: string): Promise<boolean> {
  if (httpsOptions === null) return false;
  if (certificateCovers(ip)) return true;
  return ensureCertificateCovers([ip]);
}

function recompute(): void {
  if (search?.active()) {
    holdSnapshot();
    return;
  }
  const now = Date.now();
  const snapshot = buildSnapshot(readInterfaces(), readSignals(), {
    choice: getNetworkChoice(),
    proofs: getNetworkProofs(now),
    now,
  });
  current = snapshot;
  setNetworkSnapshot(snapshot);
  announce(snapshot);
  coverAddresses(snapshot);
}

/** The adapters of the last reading, or of the machine right now. */
function readInterfaces(): LanInterfaceMap {
  return reading ? reading.interfaces : networkInterfaces();
}

/** The routes of the last reading, or none at all. */
function readSignals(): LanSignals {
  if (reading) return reading.signals;
  return { defaultRouteIp: null, gateways: [], routeChecked: false };
}

/** An address is publishable when the certificate covers it, or when there
 *  is no certificate to cover it with. */
function isPublishable(address: string): boolean {
  if (!address) return false;
  return httpsOptions === null || certificateCovers(address);
}

/** Gives the certificate the addresses the network needs, and tells the
 *  panel when the answer changed. */
function coverAddresses(snapshot: LanSnapshot): void {
  if (httpsOptions === null) return;
  const required = requiredCertAddresses(snapshot);
  const missing = required.filter(address => !certificateCovers(address));
  if (missing.length === 0) {
    certificatePending = false;
    certificateFailed = false;
    return;
  }
  certificatePending = true;
  const started = snapshot;
  const work = ensureCertificateCovers(required)
    .then(covered => {
      // Work that outlives Stop has nobody left to report to.
      if (watcher === null) return;
      certificatePending = false;
      certificateFailed = !covered;
      if (current !== started) recompute();
    })
    .catch(() => {
      if (watcher === null) return;
      certificatePending = false;
      certificateFailed = true;
    });
  certificateWork = work;
}

/** The address is worth a line in the log only when it changes. */
function announce(snapshot: LanSnapshot): void {
  const ip = snapshot.selected?.ip ?? "";
  if (ip === announcedIp) return;
  announcedIp = ip;
  const reasons = snapshot.selected?.reasons ?? [];
  const why = reasons.length > 0 ? ` (${reasons.join(", ")})` : "";
  console.log(`[ableton-rc-surface] announcing LAN address ${ip || "none"}${why}`);
}

function toRow(candidate: LanCandidate): NetworkRow {
  return {
    id: candidate.id,
    ip: candidate.ip,
    interfaceName: candidate.interfaceName,
    kind: candidate.kind,
    gateway: candidate.gateway,
    defaultRoute: candidate.defaultRoute,
    proven: candidate.proven,
    provenUntil: candidate.provenUntil,
    level: candidate.level,
    linkLocal: candidate.linkLocal,
    public: candidate.public,
    reasons: candidate.reasons,
  };
}

function isPinnedChoice(value: unknown): value is { mode: "pinned"; id: string } {
  if (!value || typeof value !== "object") return false;
  const record = value as { mode?: unknown; id?: unknown };
  return record.mode === "pinned" && typeof record.id === "string";
}

/** The candidate a connection landed on, when the phone came from another
 *  network. */
function reachedCandidate(localAddress: string | undefined, remoteAddress: string | undefined): LanCandidate | null {
  const local = stripMapped(localAddress);
  const remote = stripMapped(remoteAddress);
  if (!local || !remote) return null;
  if (isLoopback(remote)) return null;
  const candidates = getNetworkSnapshot().candidates;
  if (candidates.some(candidate => candidate.ip === remote)) return null;
  return candidates.find(entry => entry.ip === local) ?? null;
}

function hasRecentProof(candidate: LanCandidate, now: number): boolean {
  const key = networkKey(candidate);
  return getNetworkProofs(now).some(proof => proof.key === key && now - proof.at < PROOF_RECENT_MS);
}

/** An IPv4-mapped address is the same address as its IPv4 form. */
function stripMapped(address: string | undefined): string {
  return (address ?? "").replace(/^::ffff:/i, "");
}

function isLoopback(address: string): boolean {
  return address === "::1" || address.startsWith("127.");
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
