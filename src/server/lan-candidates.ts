// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

/**
 * Which of the machine's addresses the panel announces to the phone.
 *
 * The order is how reachable an address looks from another device: a pinned
 * adapter, then one a phone already proved it used, then the one the system
 * routes through, then one with a gateway. Virtual adapters and VPNs are
 * announced only when nothing better exists, and a public address is never
 * announced on its own.
 */

import { networkInterfaces } from "node:os";
import { isRfc1918 } from "../util/helpers.js";

export type LanKind = "wifi" | "ethernet" | "virtual" | "vpn" | "hotspot" | "other";

export interface LanInterfaceInfo {
  address: string;
  netmask?: string;
  family?: string;
  internal?: boolean;
  mac?: string;
}

export type LanInterfaceMap = Record<string, readonly LanInterfaceInfo[] | undefined>;

export interface LanSignals {
  defaultRouteIp: string | null;
  gateways: readonly string[];
  routeChecked: boolean;
}

export type LanChoice = { mode: "auto" } | { mode: "pinned"; id: string };

export interface LanProof {
  key: string;
  at: number;
}

export interface LanCandidate {
  id: string;
  ip: string;
  netmask: string | null;
  subnet: string | null;
  interfaceName: string;
  mac: string;
  kind: LanKind;
  linkLocal: boolean;
  public: boolean;
  gateway: string | null;
  defaultRoute: boolean;
  proven: boolean;
  provenUntil: number | null;
  level: number;
  reasons: string[];
}

export interface LanSnapshot {
  candidates: LanCandidate[];
  selected: LanCandidate | null;
  primaryIp: string;
  otherIps: string[];
  mode: "auto" | "pinned";
  pinMissing: boolean;
  ambiguous: boolean;
  needsPublicChoice: boolean;
}

export interface LanSnapshotOptions {
  choice?: LanChoice;
  proofs?: readonly LanProof[];
  now?: number;
}

/** How long a phone proof keeps its network first, in milliseconds. */
export const PROOF_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const HOTSPOT_IP = "192.168.137.1";
const HOTSPOT_NAME = "bridge100";
const VIRTUAL_NAMES = /vethernet|vmnet|virtualbox|vboxnet|docker/i;
const VIRTUAL_PREFIX = /^br-|^veth/i;
const VPN_NAMES = /tailscale|zerotier|wireguard|openvpn|kaspersky vpn|utun/i;
const VPN_PREFIX = /^tun\d|^tap\d|^ppp|^ipsec|^wg\d/i;
const ETHERNET_NAMES = /^ethernet(\s+\d+)?$|^en\d+$|^eth\d+$/i;
const WIFI_NAMES = /^wi-fi(\s+\d+)?$|^wlan\d+$|^wl[a-z0-9]+$/i;
const VIRTUAL_MACS = ["00:15:5d", "00:50:56", "00:0c:29", "00:05:69", "08:00:27", "00:1c:42", "02:42"];
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const KIND_REASONS: Partial<Record<LanKind, string>> = { virtual: "virtual", vpn: "vpn", hotspot: "hotspot" };

interface LanProfile {
  id: string;
  ip: string;
  netmask: string | null;
  subnet: string | null;
  mac: string;
  kind: LanKind;
  linkLocal: boolean;
  public: boolean;
}

interface LanMarks {
  pinned: boolean;
  proven: boolean;
  defaultRoute: boolean;
  gateway: string | null;
  routeChecked: boolean;
}

interface CandidateContext {
  signals: LanSignals;
  choice: LanChoice;
  proofs: readonly LanProof[];
  now: number;
}

export function classifyInterface(name: string, mac: string, ip: string): LanKind {
  const byName = tunnelKind(name);
  if (byName) return byName;
  if (ip === HOTSPOT_IP || name.toLowerCase() === HOTSPOT_NAME) return "hotspot";
  const byMac = macKind(mac);
  if (byMac) return byMac;
  return linkKind(name) ?? "other";
}

export function networkKey(candidate: LanCandidate): string {
  return `${candidate.id}|${candidate.gateway ?? ""}`;
}

export function buildSnapshot(
  interfaces: LanInterfaceMap,
  signals: LanSignals,
  options: LanSnapshotOptions = {},
): LanSnapshot {
  const context: CandidateContext = {
    signals,
    choice: options.choice ?? { mode: "auto" },
    proofs: options.proofs ?? [],
    now: options.now ?? Date.now(),
  };
  const candidates = collectCandidates(interfaces, context);
  candidates.sort(compareCandidates);
  const first = candidates[0] ?? null;
  const selected = first && first.level === 8 ? null : first;
  const pin = pinState(candidates, context.choice);
  return {
    candidates,
    selected,
    primaryIp: selected ? selected.ip : "",
    otherIps: candidates.filter(candidate => candidate !== selected && candidate.level !== 8).map(candidate => candidate.ip),
    mode: pin.mode,
    pinMissing: pin.missing,
    ambiguous: isAmbiguous(candidates, selected),
    needsPublicChoice: needsPublicChoice(candidates, selected),
  };
}

let storedSnapshot: LanSnapshot | null = null;

/** The last snapshot the server stored, or a fresh read of the interfaces. */
export function getNetworkSnapshot(): LanSnapshot {
  if (storedSnapshot) return storedSnapshot;
  return buildSnapshot(networkInterfaces(), { defaultRouteIp: null, gateways: [], routeChecked: false });
}

export function setNetworkSnapshot(snapshot: LanSnapshot | null): void {
  storedSnapshot = snapshot;
}

function tunnelKind(name: string): "virtual" | "vpn" | null {
  if (VIRTUAL_NAMES.test(name) || VIRTUAL_PREFIX.test(name)) return "virtual";
  if (VPN_NAMES.test(name) || VPN_PREFIX.test(name)) return "vpn";
  return null;
}

function macKind(mac: string): "virtual" | "vpn" | null {
  const lower = mac.toLowerCase().replace(/-/g, ":");
  if (VIRTUAL_MACS.some(prefix => lower.startsWith(prefix))) return "virtual";
  if (/^00(:00){5}$/.test(lower)) return "vpn";
  return null;
}

function linkKind(name: string): "ethernet" | "wifi" | null {
  if (ETHERNET_NAMES.test(name)) return "ethernet";
  if (WIFI_NAMES.test(name)) return "wifi";
  return null;
}

function parseIp(ip: string): number | null {
  const match = IPV4.exec(ip);
  if (!match) return null;
  const octets = match.slice(1).map(part => Number(part));
  if (octets.some(octet => !Number.isInteger(octet) || octet > 255)) return null;
  return (((octets[0] ?? 0) * 0x1000000) + ((octets[1] ?? 0) * 0x10000) + ((octets[2] ?? 0) * 0x100) + (octets[3] ?? 0)) >>> 0;
}

function formatIp(value: number): string {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

/** The prefix length of a netmask, or null when the mask is not contiguous. */
function prefixFromMask(mask: number): number | null {
  let bits = 0;
  while (bits < 32 && (mask & 2 ** (31 - bits)) !== 0) bits += 1;
  const expected = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return expected === mask ? bits : null;
}

function subnetText(ip: string, netmask: string | null): string {
  const value = parseIp(ip);
  if (value === null || netmask === null) return ip;
  const mask = parseIp(netmask);
  if (mask === null) return ip;
  const prefix = prefixFromMask(mask);
  if (prefix === null) return ip;
  return `${formatIp((value & mask) >>> 0)}/${prefix}`;
}

function isLinkLocal(value: number): boolean {
  return (value >>> 16) === 0xa9fe;
}

function isPublicAddress(ip: string, value: number): boolean {
  if (isRfc1918(ip) || isLinkLocal(value)) return false;
  const second = (value >>> 16) & 255;
  return (value >>> 24) !== 100 || second < 64 || second > 127;
}

/** The first gateway on the same subnet as the address, never the address itself. */
function findGateway(ip: string, netmask: string | null, gateways: readonly string[]): string | null {
  const value = parseIp(ip);
  const mask = netmask === null ? null : parseIp(netmask);
  if (value === null || mask === null || prefixFromMask(mask) === null) return null;
  const network = (value & mask) >>> 0;
  for (const gateway of gateways) {
    const other = parseIp(gateway);
    if (other === null || other === value) continue;
    if (((other & mask) >>> 0) === network) return gateway;
  }
  return null;
}

function findProof(key: string, proofs: readonly LanProof[], now: number): LanProof | null {
  for (const proof of proofs) {
    if (proof.key === key && now - proof.at < PROOF_TTL_MS) return proof;
  }
  return null;
}

function describeEntry(name: string, entry: LanInterfaceInfo): LanProfile | null {
  if (entry.internal === true) return null;
  if (entry.family !== undefined && entry.family !== "IPv4") return null;
  const ip = entry.address;
  const value = parseIp(ip);
  if (value === null) return null;
  const mac = entry.mac ?? "";
  const netmask = entry.netmask ?? null;
  const subnet = subnetText(ip, netmask);
  return {
    id: `${name}|${subnet}`, ip, netmask, subnet, mac,
    kind: classifyInterface(name, mac, ip),
    linkLocal: isLinkLocal(value), public: isPublicAddress(ip, value),
  };
}

function collectCandidates(interfaces: LanInterfaceMap, context: CandidateContext): LanCandidate[] {
  const candidates: LanCandidate[] = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      const candidate = makeCandidate(name, entry, context);
      if (candidate) candidates.push(candidate);
    }
  }
  return candidates;
}

function makeCandidate(name: string, entry: LanInterfaceInfo, context: CandidateContext): LanCandidate | null {
  const profile = describeEntry(name, entry);
  if (!profile) return null;
  const gateway = findGateway(profile.ip, profile.netmask, context.signals.gateways);
  const defaultRoute = profile.ip === context.signals.defaultRouteIp;
  const pinned = context.choice.mode === "pinned" && context.choice.id === profile.id;
  const proof = findProof(`${profile.id}|${gateway ?? ""}`, context.proofs, context.now);
  const provenAt = proof !== null && !profile.public ? proof : null;
  const marks: LanMarks = {
    pinned, proven: provenAt !== null, defaultRoute, gateway,
    routeChecked: context.signals.routeChecked,
  };
  return {
    ...profile, interfaceName: name, gateway, defaultRoute,
    proven: marks.proven, provenUntil: provenAt !== null ? provenAt.at + PROOF_TTL_MS : null,
    level: levelFor(profile, marks), reasons: reasonsFor(profile, marks),
  };
}

function levelFor(profile: LanProfile, marks: LanMarks): number {
  if (marks.pinned) return 1;
  if (marks.proven) return 2;
  if (profile.public) return 8;
  if (profile.kind === "hotspot") return 6;
  if (profile.kind === "virtual" || profile.kind === "vpn" || profile.linkLocal) return 7;
  if (marks.defaultRoute) return 3;
  if (marks.gateway !== null) return 4;
  return 5;
}

function reasonsFor(profile: LanProfile, marks: LanMarks): string[] {
  const reasons: string[] = [];
  if (marks.pinned) reasons.push("pinned");
  if (marks.proven) reasons.push("proven");
  if (marks.defaultRoute) reasons.push("default-route");
  reasons.push(marks.gateway !== null ? "gateway" : marks.routeChecked ? "no-gateway" : "route-unchecked");
  const kind = KIND_REASONS[profile.kind];
  if (kind) reasons.push(kind);
  if (profile.linkLocal) reasons.push("link-local");
  if (profile.public) reasons.push("public");
  return reasons;
}

function compareCandidates(left: LanCandidate, right: LanCandidate): number {
  if (left.level !== right.level) return left.level - right.level;
  // Only a proven network has a date, and the freshest proof comes first.
  const byProof = (right.provenUntil ?? 0) - (left.provenUntil ?? 0);
  if (byProof !== 0) return byProof;
  const byKind = kindRank(left.kind) - kindRank(right.kind);
  if (byKind !== 0) return byKind;
  if (left.interfaceName !== right.interfaceName) return left.interfaceName < right.interfaceName ? -1 : 1;
  return (parseIp(left.ip) ?? 0) - (parseIp(right.ip) ?? 0);
}

const kindRank = (kind: LanKind): number => (kind === "ethernet" ? 0 : kind === "wifi" ? 1 : 2);

function pinState(candidates: readonly LanCandidate[], choice: LanChoice): { mode: "auto" | "pinned"; missing: boolean } {
  if (choice.mode !== "pinned") return { mode: "auto", missing: false };
  const found = candidates.some(candidate => candidate.id === choice.id);
  return found ? { mode: "pinned", missing: false } : { mode: "auto", missing: true };
}

function isAmbiguous(candidates: readonly LanCandidate[], selected: LanCandidate | null): boolean {
  if (!selected || selected.level < 4) return false;
  return candidates.some(candidate => candidate !== selected && candidate.level === selected.level);
}

function needsPublicChoice(candidates: readonly LanCandidate[], selected: LanCandidate | null): boolean {
  const publicCandidate = candidates.find(candidate => candidate.public);
  if (!publicCandidate || publicCandidate === selected) return false;
  return selected === null || selected.level >= 7;
}
