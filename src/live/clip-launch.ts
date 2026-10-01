// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0

// Launch Clip: a control asks Live for a Session clip.
//
// The SDK lists tracks and clips but cannot launch them, so requests go out
// through the existing AbletonOSC link with no extra argument: Live applies
// its own launch quantization. What Live says back (fired and playing slot per
// track) is the only thing allowed to claim that a clip is waiting or playing,
// and it is also what keeps requests idempotent: asking for the clip that is
// already queued or already playing sends nothing, so held poses, detection
// loss and reconnections cannot double-launch.
//
// Nothing here writes a clip, track or song property, and nothing here edits
// native Follow Actions. "After it starts" rules are Surface's own and are
// labelled as such.

import { getExtensionContext } from "../context.js";
import { oscTransport, type ClipPropertyName } from "./osc-transport.js";
import {
  ContinuationTracker,
  SONG_QUANTIZATION_LABELS,
  effectiveSongQuantization,
  planPasses,
  predictLanding,
  quantumBeats,
  type ClipGeometry,
  type ContinuationDecision,
  type ContinuationDiagnostics,
} from "./clip-continuation.js";

export type LaunchMode = "clip" | "list" | "stop";
export type ThenAction = "none" | "clip" | "stop";

export interface ClipTrackRef {
  trackIndex: number;
  trackName: string;
  trackSessionId?: string | undefined;
}

export interface ClipSlotRef {
  slotIndex: number;
  clipName: string;
  clipSessionId?: string | undefined;
}

export interface ClipThen {
  action: ThenAction;
  passes?: number | undefined;
  clip?: ClipSlotRef | undefined;
}

/** The Launch Clip fields of a mapping target. */
export interface ClipLaunchTarget {
  type: "clip_launch";
  trackIndex: number;
  launchMode: LaunchMode;
  track: ClipTrackRef;
  clip?: ClipSlotRef | undefined;
  clips?: ClipSlotRef[] | undefined;
  then?: ClipThen | undefined;
  threshold?: number | undefined;
  label?: string | undefined;
  relinkStatus?: "loaded" | "relinked" | "review" | "ambiguous" | "missing" | undefined;
  relinkConfidence?: number | undefined;
}

export const CLIP_LIST_MIN = 2;
export const CLIP_LIST_MAX = 8;
export const CLIP_THEN_MAX_PASSES = 8;
export const CLIP_NAME_MAX = 128;
export const LEDGER_CONFIRM_MS = 1500;
export const TRACK_NAMES_TIMEOUT_MS = 300;
/** Re-arm band for continuous controls; 0/1 controls re-arm on the real release. */
export const CONTINUOUS_REARM_BAND = 0.1;
const SONG_TIME_FRESH_MS = 300;
/** How long a non-loop clip's end waits for a transport stop report. */
export const NATURAL_END_SETTLE_MS = 200;

const TARGET_KEYS = new Set([
  "type", "trackIndex", "trackKind", "launchMode", "track", "clip", "clips", "then", "threshold",
  "label", "relinkStatus", "relinkConfidence", "signature",
]);
/**
 * Generic mapping fields an editor may attach to any target. They mean
 * nothing for a launch and are dropped instead of rejected.
 */
const IGNORED_KEYS = new Set([
  "curve", "inMin", "inMax", "outMin", "outMax", "smooth", "smoothBpmSync", "smoothBpmSubdivision",
  "drive", "compressor", "targetScale", "neutralPolicy", "neutralValue", "visionSafeLossVersion",
  "takeoverMode", "idleValue", "relinkCandidates",
]);
const TRACK_KEYS = new Set(["trackIndex", "trackName", "trackSessionId"]);
const SLOT_KEYS = new Set(["slotIndex", "clipName", "clipSessionId"]);
const THEN_KEYS = new Set(["action", "passes", "clip"]);
const SESSION_ID = /^\d{1,64}$/;

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, allowed: Set<string>, where: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${where}: unexpected field ${key}`);
  }
}

function boundedIndex(value: unknown, where: string): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 9999) {
    throw new Error(`${where} must be an integer from 0 to 9999`);
  }
  return value as number;
}

function boundedName(value: unknown, where: string): string {
  if (typeof value !== "string" || value.length > CLIP_NAME_MAX) {
    throw new Error(`${where} must be a string of at most ${CLIP_NAME_MAX} characters`);
  }
  return value;
}

function sessionId(value: unknown, where: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !SESSION_ID.test(value)) throw new Error(`${where} must be a numeric string`);
  return value;
}

function validateSlotRef(raw: unknown, where: string): ClipSlotRef {
  if (!isRecord(raw)) throw new Error(`${where} must be an object`);
  onlyKeys(raw, SLOT_KEYS, where);
  const ref: ClipSlotRef = {
    slotIndex: boundedIndex(raw.slotIndex, `${where}.slotIndex`),
    clipName: boundedName(raw.clipName, `${where}.clipName`),
  };
  const id = sessionId(raw.clipSessionId, `${where}.clipSessionId`);
  if (id !== undefined) ref.clipSessionId = id;
  return ref;
}

/**
 * Normalize a Launch Clip target from a client or a file. Unknown fields,
 * out-of-range values and mixed modes are rejected rather than repaired: a
 * malformed launch target must never reach Live.
 */
export function validateClipLaunchTarget(raw: unknown): ClipLaunchTarget {
  if (!isRecord(raw) || raw.type !== "clip_launch") throw new Error("clip_launch target must be an object");
  for (const key of Object.keys(raw)) {
    if (!TARGET_KEYS.has(key) && !IGNORED_KEYS.has(key)) throw new Error(`clip_launch: unexpected field ${key}`);
  }
  if (raw.trackKind !== undefined && raw.trackKind !== "track") throw new Error("clip_launch only targets regular tracks");
  const launchMode = raw.launchMode;
  if (launchMode !== "clip" && launchMode !== "list" && launchMode !== "stop") {
    throw new Error("clip_launch.launchMode must be clip, list or stop");
  }
  if (!isRecord(raw.track)) throw new Error("clip_launch.track must be an object");
  onlyKeys(raw.track, TRACK_KEYS, "clip_launch.track");
  const track: ClipTrackRef = {
    trackIndex: boundedIndex(raw.track.trackIndex, "clip_launch.track.trackIndex"),
    trackName: boundedName(raw.track.trackName, "clip_launch.track.trackName"),
  };
  const trackId = sessionId(raw.track.trackSessionId, "clip_launch.track.trackSessionId");
  if (trackId !== undefined) track.trackSessionId = trackId;

  const target: ClipLaunchTarget = {
    type: "clip_launch",
    trackIndex: track.trackIndex,
    launchMode,
    track,
  };
  if (raw.threshold !== undefined) {
    const threshold = raw.threshold;
    if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < 0.05 || threshold > 0.95) {
      throw new Error("clip_launch.threshold must be between 0.05 and 0.95");
    }
    target.threshold = threshold;
  }
  if (raw.label !== undefined) target.label = boundedName(raw.label, "clip_launch.label");

  if (launchMode === "clip") {
    target.clip = validateSlotRef(raw.clip, "clip_launch.clip");
    if (raw.clips !== undefined) throw new Error("clip_launch.clips belongs to list mode");
  } else if (launchMode === "list") {
    if (!Array.isArray(raw.clips) || raw.clips.length < CLIP_LIST_MIN || raw.clips.length > CLIP_LIST_MAX) {
      throw new Error(`clip_launch.clips must hold ${CLIP_LIST_MIN} to ${CLIP_LIST_MAX} clips`);
    }
    target.clips = raw.clips.map((clip: unknown, index: number) => validateSlotRef(clip, `clip_launch.clips[${index}]`));
    const slots = new Set(target.clips.map((clip) => clip.slotIndex));
    if (slots.size !== target.clips.length) throw new Error("clip_launch.clips must not repeat a slot");
    if (raw.clip !== undefined) throw new Error("clip_launch.clip belongs to clip mode");
  } else if (raw.clip !== undefined || raw.clips !== undefined) {
    throw new Error("stop mode takes no clip");
  }

  if (raw.then !== undefined) {
    if (launchMode !== "clip") throw new Error("clip_launch.then is only available in clip mode");
    if (!isRecord(raw.then)) throw new Error("clip_launch.then must be an object");
    onlyKeys(raw.then, THEN_KEYS, "clip_launch.then");
    const action = raw.then.action;
    if (action !== "none" && action !== "clip" && action !== "stop") {
      throw new Error("clip_launch.then.action must be none, clip or stop");
    }
    const then: ClipThen = { action };
    if (action !== "none") {
      const passes = raw.then.passes;
      if (!Number.isInteger(passes) || passes < 1 || passes > CLIP_THEN_MAX_PASSES) {
        throw new Error(`clip_launch.then.passes must be an integer from 1 to ${CLIP_THEN_MAX_PASSES}`);
      }
      then.passes = passes;
    }
    if (action === "clip") {
      then.clip = validateSlotRef(raw.then.clip, "clip_launch.then.clip");
      if (then.clip.slotIndex === target.clip?.slotIndex) throw new Error("clip_launch.then.clip must be another clip");
    } else if (raw.then.clip !== undefined) {
      throw new Error("clip_launch.then.clip is only used by the clip action");
    }
    target.then = then;
  }
  if (raw.relinkStatus !== undefined) {
    if (!["loaded", "relinked", "review", "ambiguous", "missing"].includes(raw.relinkStatus)) {
      throw new Error("clip_launch.relinkStatus is invalid");
    }
    target.relinkStatus = raw.relinkStatus;
  }
  if (raw.relinkConfidence !== undefined && typeof raw.relinkConfidence === "number"
      && Number.isFinite(raw.relinkConfidence)) {
    target.relinkConfidence = Math.max(0, Math.min(1, raw.relinkConfidence));
  }
  return target;
}

export function isClipLaunchTarget(target: unknown): target is ClipLaunchTarget {
  return isRecord(target) && target.type === "clip_launch";
}

/** Every slot a target can ask for: the clip, the list items and the "then" clip. */
export function referencedSlots(target: ClipLaunchTarget): ClipSlotRef[] {
  const refs: ClipSlotRef[] = [];
  if (target.clip) refs.push(target.clip);
  if (target.clips) refs.push(...target.clips);
  if (target.then?.clip) refs.push(target.then.clip);
  return refs;
}

// ── resolution against the SDK ─────────────────────────────────────────────

function handleId(object: any): string | undefined {
  const id = object?.handle?.id;
  return id === undefined || id === null ? undefined : String(id);
}

export type ResolveStatus = "ok" | "relinked" | "missing" | "ambiguous" | "group";

/** Tracks that are another track's group: launching their slot fires a whole row. */
function groupTrackIds(tracks: any[]): Set<string> {
  const ids = new Set<string>();
  for (const track of tracks) {
    const group = handleId(track?.groupTrack);
    if (group !== undefined) ids.add(group);
  }
  return ids;
}

export function resolveClipTrack(song: any, ref: ClipTrackRef): { status: ResolveStatus; index: number; track: any } {
  const tracks: any[] = Array.isArray(song?.tracks) ? song.tracks : [];
  const groups = groupTrackIds(tracks);
  const finish = (index: number) => {
    const track = tracks[index];
    const id = handleId(track);
    return { index, track, isGroup: id !== undefined && groups.has(id) };
  };
  // Same object in this session and same name: certain.
  if (ref.trackSessionId !== undefined) {
    const index = tracks.findIndex((track) => handleId(track) === ref.trackSessionId && track?.name === ref.trackName);
    if (index >= 0) {
      const found = finish(index);
      return { status: found.isGroup ? "group" : "ok", index, track: found.track };
    }
  }
  // Otherwise only an unambiguous name. Handles are session-scoped and are
  // never trusted on their own.
  const byName: number[] = [];
  tracks.forEach((track, index) => { if (track?.name === ref.trackName) byName.push(index); });
  if (byName.length === 0) return { status: "missing", index: -1, track: null };
  if (byName.length > 1) return { status: "ambiguous", index: -1, track: null };
  const found = finish(byName[0] as number);
  return { status: found.isGroup ? "group" : "relinked", index: found.index, track: found.track };
}

export function resolveClipSlot(track: any, ref: ClipSlotRef): { status: ResolveStatus; index: number; clip: any } {
  const slots: any[] = Array.isArray(track?.clipSlots) ? track.clipSlots : [];
  if (ref.clipSessionId !== undefined) {
    const index = slots.findIndex((slot) => slot?.clip && handleId(slot.clip) === ref.clipSessionId
      && slot.clip.name === ref.clipName);
    if (index >= 0) return { status: "ok", index, clip: slots[index].clip };
  }
  const byName: number[] = [];
  slots.forEach((slot, index) => { if (slot?.clip && slot.clip.name === ref.clipName) byName.push(index); });
  if (byName.length === 0) return { status: "missing", index: -1, clip: null };
  if (byName.length > 1) return { status: "ambiguous", index: -1, clip: null };
  const index = byName[0] as number;
  return { status: "relinked", index, clip: slots[index].clip };
}

function worst(a: ResolveStatus, b: ResolveStatus): ResolveStatus {
  const rank: Record<ResolveStatus, number> = { ok: 0, relinked: 1, missing: 3, ambiguous: 4, group: 2 };
  return rank[b] > rank[a] ? b : a;
}

/**
 * Re-point a stored target at the current set (load, import, preset). Names
 * decide; several equal names block until the user reassociates.
 */
export function relinkClipLaunchTarget(song: any, original: ClipLaunchTarget): ClipLaunchTarget {
  const target: ClipLaunchTarget = JSON.parse(JSON.stringify(original));
  delete target.relinkStatus;
  delete target.relinkConfidence;
  const trackResult = resolveClipTrack(song, target.track);
  let status: ResolveStatus = trackResult.status;
  if (trackResult.status === "ok" || trackResult.status === "relinked") {
    target.track.trackIndex = trackResult.index;
    target.trackIndex = trackResult.index;
    const trackId = handleId(trackResult.track);
    if (trackId !== undefined) target.track.trackSessionId = trackId;
    for (const ref of referencedSlots(target)) {
      const slot = resolveClipSlot(trackResult.track, ref);
      status = worst(status, slot.status);
      if (slot.status === "ok" || slot.status === "relinked") {
        ref.slotIndex = slot.index;
        const clipId = handleId(slot.clip);
        if (clipId !== undefined) ref.clipSessionId = clipId;
      }
    }
  }
  const moved = JSON.stringify(original.track.trackIndex) !== JSON.stringify(target.track.trackIndex)
    || referencedSlots(original).some((ref, i) => ref.slotIndex !== referencedSlots(target)[i]?.slotIndex);
  // Found by name at the same place (the set was reopened) is still "loaded";
  // "relinked" means the destination moved.
  target.relinkStatus = status === "missing" ? "missing"
    : status === "ambiguous" || status === "group" ? "ambiguous"
      : moved ? "relinked" : "loaded";
  target.relinkConfidence = target.relinkStatus === "missing" ? 0 : target.relinkStatus === "ambiguous" ? 0.5 : 1;
  return target;
}

export interface ClipTargetClip {
  slotIndex: number;
  name: string;
  sessionId: string | null;
  kind: "midi" | "audio";
  looping: boolean;
  startMarker: number | null;
  endMarker: number | null;
  loopStart: number | null;
  loopEnd: number | null;
  beatUnits: boolean;
}

export interface ClipTargetTrack {
  trackIndex: number;
  name: string;
  sessionId: string | null;
  clips: ClipTargetClip[];
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clipGeometry(clip: any): ClipGeometry | null {
  const startMarker = finiteOrNull(clip?.startMarker);
  const endMarker = finiteOrNull(clip?.endMarker);
  const loopStart = finiteOrNull(clip?.loopStart);
  const loopEnd = finiteOrNull(clip?.loopEnd);
  if (startMarker === null || endMarker === null || loopStart === null || loopEnd === null) return null;
  return {
    startMarker, endMarker, loopStart, loopEnd,
    looping: Boolean(clip.looping),
    beatUnits: !("warping" in clip) || Boolean(clip.warping),
  };
}

/** Regular, non-group tracks that hold at least one clip, with real names. */
export function listClipTargets(song: any): ClipTargetTrack[] {
  const tracks: any[] = Array.isArray(song?.tracks) ? song.tracks : [];
  const groups = groupTrackIds(tracks);
  const result: ClipTargetTrack[] = [];
  tracks.forEach((track, trackIndex) => {
    const id = handleId(track);
    if (id !== undefined && groups.has(id)) return;
    const clips: ClipTargetClip[] = [];
    const slots: any[] = Array.isArray(track?.clipSlots) ? track.clipSlots : [];
    slots.forEach((slot, slotIndex) => {
      const clip = slot?.clip;
      if (!clip) return;
      const geometry = clipGeometry(clip);
      clips.push({
        slotIndex,
        name: String(clip.name ?? ""),
        sessionId: handleId(clip) ?? null,
        kind: "warping" in clip ? "audio" : "midi",
        looping: Boolean(clip.looping),
        startMarker: geometry?.startMarker ?? null,
        endMarker: geometry?.endMarker ?? null,
        loopStart: geometry?.loopStart ?? null,
        loopEnd: geometry?.loopEnd ?? null,
        beatUnits: geometry?.beatUnits ?? true,
      });
    });
    if (clips.length) result.push({ trackIndex, name: String(track?.name ?? ""), sessionId: id ?? null, clips });
  });
  return result;
}

// ── engine ────────────────────────────────────────────────────────────────

export interface ClipLaunchOwner {
  control: string;
  targetIndex: number;
}

export interface ClipLaunchStatus {
  control: string;
  targetIndex: number;
  state: string;
  reason?: string | undefined;
  /** Index into the list for list mode: the item Live plays now, -1 when none. */
  listIndex?: number | undefined;
  quantization?: { source: "clip" | "global" | "unknown"; label: string | null } | undefined;
  globalQuantization?: ReturnType<ClipLaunchEngine["globalQuantizationStatus"]> | undefined;
  warnings?: string[] | undefined;
  rule?: {
    state: string;
    reason?: string | undefined;
    prediction?: { kind: string; extraBeats: number; landingBeats: number } | undefined;
    refusal?: string | undefined;
  } | undefined;
}

export interface ClipLaunchDeps {
  /** The live mapping table: control name → targets. */
  mappings: () => ReadonlyMap<string, readonly any[]>;
  broadcast: (status: ClipLaunchStatus) => void;
  log?: (message: string) => void;
  now?: () => number;
}

interface Ledger {
  kind: "fire" | "stop";
  slot: number | null;
  at: number;
  acknowledged: boolean;
  owner: ClipLaunchOwner;
  timer: ReturnType<typeof setTimeout> | null;
  continuation: boolean;
}

interface Continuation {
  globalQuantization: number;
  owner: ClipLaunchOwner;
  target: ClipLaunchTarget;
  sourceSlot: number;
  followSlot: number | null;
  action: "clip" | "stop";
  tracker: ContinuationTracker;
  confirmed: boolean;
  /** Live showed the launch itself waiting, so a fired → -1 step means it started. */
  seenFired: boolean;
  positionListen: [number, number] | null;
  last: { songBeat: number | null; wallMs: number };
  sent: boolean;
}

interface TrackState {
  key: string;
  oscIndex: number | null;
  fired: number | null;
  playing: number | null;
  ledger: Ledger | null;
  continuation: Continuation | null;
}

interface ClipProps {
  launchQuantization: number | null;
  launchMode: number | null;
  legato: number | null;
}

function trackKey(ref: ClipTrackRef): string {
  return ref.trackSessionId !== undefined ? `id:${ref.trackSessionId}` : `name:${ref.trackName}`;
}

function sameNames(a: readonly string[] | null, b: readonly string[]): boolean {
  return !!a && a.length === b.length && a.every((name, i) => name === b[i]);
}

export class ClipLaunchEngine {
  private deps: ClipLaunchDeps | null = null;
  private readonly edges = new Map<string, boolean>();
  private readonly tracks = new Map<string, TrackState>();
  private readonly oscIndexToKey = new Map<number, string>();
  private readonly clipProps = new Map<string, ClipProps>();
  private readonly lastStatus = new Map<string, string>();
  private readonly quantizationCancellations = new Map<string, { target: ClipLaunchTarget; reason: string }>();
  private readonly diagnostics: Array<ContinuationDiagnostics & { owner: ClipLaunchOwner; at: number }> = [];
  private verifiedNames: string[] | null = null;
  private pendingNames: Array<(names: string[] | null) => void> = [];
  private chain: Promise<void> = Promise.resolve();
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private wired = false;

  configure(deps: ClipLaunchDeps): void {
    this.deps = deps;
    if (this.wired) return;
    this.wired = true;
    oscTransport.on("clip-track-slot", (event: any) => this.onTrackSlot(event));
    oscTransport.on("clip-position", (event: any) => this.onPosition(event));
    oscTransport.on("clip-property", (event: any) => this.onClipProperty(event));
    oscTransport.on("clip-track-names", (names: string[]) => this.onTrackNames(names));
    oscTransport.on("clip-global-quantization", (value: number) => {
      for (const state of this.tracks.values()) {
        const cont = state.continuation;
        if (cont && !cont.sent && cont.globalQuantization !== value) this.endContinuation(state, "global_quantization_changed");
      }
      this.broadcastAll();
    });
    oscTransport.on("clip-quantization-write", (event: { pending: boolean; error: string | null }) => {
      if (event.error) {
        for (const state of this.tracks.values()) {
          if (state.continuation && !state.continuation.sent) this.endContinuation(state, "quantization_unconfirmed");
        }
      }
      this.broadcastAll();
    });
    oscTransport.on("update", (state: any) => this.onTransport(state));
  }

  private wasPlaying = false;
  private wasConnected = false;

  /** Only a real stop of the transport cancels rules; a push while stopped does not. */
  private onTransport(state: any): void {
    const playing = Boolean(state?.isPlaying);
    const connected = Boolean(state?.connected);
    if (this.wasPlaying && !playing) this.invalidateAll("transport_stopped");
    if (!this.wasConnected && connected && this.tracks.size) this.refresh();
    this.wasPlaying = playing;
    this.wasConnected = connected;
  }

  private now(): number {
    return this.deps?.now?.() ?? Date.now();
  }

  private log(message: string): void {
    this.deps?.log?.(message);
  }

  // ── mapping table ────────────────────────────────────────────────────

  private ownersOf(): Array<{ owner: ClipLaunchOwner; target: ClipLaunchTarget }> {
    const out: Array<{ owner: ClipLaunchOwner; target: ClipLaunchTarget }> = [];
    for (const [control, targets] of this.deps?.mappings() ?? []) {
      (targets ?? []).forEach((target, targetIndex) => {
        if (isClipLaunchTarget(target)) out.push({ owner: { control, targetIndex }, target });
      });
    }
    return out;
  }

  private isCurrent(owner: ClipLaunchOwner, target: ClipLaunchTarget): boolean {
    const targets = this.deps?.mappings().get(owner.control);
    return !!targets && targets[owner.targetIndex] === target;
  }

  /**
   * Re-read the mapping table after any change: drop work owned by targets
   * that are gone or replaced, and listen to exactly the tracks still used.
   */
  refresh(): void {
    const owners = this.ownersOf();
    for (const state of this.tracks.values()) {
      const cont = state.continuation;
      if (cont && !this.isCurrent(cont.owner, cont.target)) this.endContinuation(state, "mapping_changed");
    }
    const live = new Set(owners.map(({ owner }) => `${owner.control}::${owner.targetIndex}`));
    for (const key of [...this.edges.keys()]) {
      const ownerKey = key.split("::").slice(1, 3).join("::");
      if (!live.has(ownerKey)) this.edges.delete(key);
    }
    for (const key of [...this.lastStatus.keys()]) if (!live.has(key)) this.lastStatus.delete(key);
    for (const key of [...this.quantizationCancellations.keys()]) if (!live.has(key)) this.quantizationCancellations.delete(key);
    if (!owners.length) {
      for (const state of this.tracks.values()) this.clearLedger(state);
      this.tracks.clear();
      this.oscIndexToKey.clear();
      oscTransport.setClipLaunchActive(false);
      this.stopWatchdog();
      return;
    }
    oscTransport.setClipLaunchActive(true);
    this.startWatchdog();
    this.syncListeners(owners.map(({ target }) => target));
    this.broadcastAll();
  }

  /** Listen to the tracks in use at their current index; restore the routing table. */
  private syncListeners(targets: ClipLaunchTarget[]): void {
    const song = getExtensionContext()?.application?.song;
    const wanted = new Map<string, number>();
    for (const target of targets) {
      const key = trackKey(target.track);
      if (wanted.has(key)) continue;
      const resolved = song ? resolveClipTrack(song, target.track) : null;
      if (resolved && (resolved.status === "ok" || resolved.status === "relinked")) {
        wanted.set(key, resolved.index);
        for (const ref of referencedSlots(target)) {
          const slot = resolveClipSlot(resolved.track, ref);
          if (slot.status === "ok" || slot.status === "relinked") {
            oscTransport.requestClipProperties(resolved.index, slot.index);
          }
        }
      } else {
        wanted.set(key, -1);
      }
    }
    // Stop what changed first: AbletonOSC keys listeners by index, so a
    // reorder can hand an old index to another track.
    for (const [key, state] of this.tracks) {
      const next = wanted.get(key);
      if (state.oscIndex !== null && state.oscIndex !== next) {
        oscTransport.unlistenTrackSlots(state.oscIndex);
        this.oscIndexToKey.delete(state.oscIndex);
        state.oscIndex = null;
        state.fired = null;
        state.playing = null;
      }
      if (next === undefined) {
        this.endContinuation(state, "mapping_changed");
        this.clearLedger(state);
        this.tracks.delete(key);
      }
    }
    for (const [key, index] of wanted) {
      let state = this.tracks.get(key);
      if (!state) {
        state = { key, oscIndex: null, fired: null, playing: null, ledger: null, continuation: null };
        this.tracks.set(key, state);
      }
      if (index >= 0 && state.oscIndex !== index) {
        state.oscIndex = index;
        this.oscIndexToKey.set(index, key);
        oscTransport.listenTrackSlots(index);
      }
    }
  }

  // ── input ────────────────────────────────────────────────────────────

  /**
   * One value for one Launch Clip target. Activations are serialized so two
   * quick poses reach Live in the order they were made.
   */
  handleInput(input: {
    clientId: string;
    control: string;
    targetIndex: number;
    target: ClipLaunchTarget;
    value: number;
    isDeactivated: boolean;
  }): Promise<void> {
    // Detection loss and disconnects are not releases: nothing changes.
    if (input.isDeactivated || !Number.isFinite(input.value)) return Promise.resolve();
    const threshold = input.target.threshold ?? 0.5;
    const key = `${input.clientId}::${input.control}::${input.targetIndex}`;
    const active = this.edges.get(key) === true;
    if (input.value >= threshold) {
      if (active) return Promise.resolve();
      this.edges.set(key, true);
      const owner = { control: input.control, targetIndex: input.targetIndex };
      return this.enqueue(() => this.activate(owner, input.target));
    }
    const band = isBinaryControl(input.control) ? 0 : CONTINUOUS_REARM_BAND;
    if (active && input.value < threshold - band + 1e-9) this.edges.set(key, false);
    return Promise.resolve();
  }

  /** The Test button: one activation, with the same rules as a gesture. */
  test(owner: ClipLaunchOwner, target: ClipLaunchTarget): Promise<ClipLaunchStatus> {
    return this.enqueue(() => this.activate(owner, target)).then(() => this.statusFor(owner, target));
  }

  private enqueue(job: () => Promise<void>): Promise<void> {
    const run = this.chain.then(job, job);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private report(owner: ClipLaunchOwner, state: string, reason?: string): void {
    const status: ClipLaunchStatus = { control: owner.control, targetIndex: owner.targetIndex, state };
    if (reason !== undefined) status.reason = reason;
    this.emit(status, true);
  }

  private async activate(owner: ClipLaunchOwner, target: ClipLaunchTarget): Promise<void> {
    if (!this.isCurrent(owner, target)) return;
    const song = getExtensionContext()?.application?.song;
    if (!song) return this.report(owner, "unavailable", "no_set");
    if (!oscTransport.state.available || !oscTransport.state.connected) {
      return this.report(owner, "unavailable", "osc_disconnected");
    }
    if (target.relinkStatus === "missing" || target.relinkStatus === "ambiguous" || target.relinkStatus === "review") {
      return this.report(owner, target.relinkStatus === "missing" ? "missing" : "ambiguous", "reassociate");
    }
    const trackResult = resolveClipTrack(song, target.track);
    if (trackResult.status === "missing") return this.report(owner, "missing", "track");
    if (trackResult.status === "ambiguous") return this.report(owner, "ambiguous", "track");
    if (trackResult.status === "group") return this.report(owner, "ambiguous", "group_track");
    if (!(await this.verifyIndices(song))) return this.report(owner, "index_mismatch");
    if (!this.isCurrent(owner, target)) return;
    if (trackResult.status === "relinked") {
      target.track.trackIndex = trackResult.index;
      target.trackIndex = trackResult.index;
      const id = handleId(trackResult.track);
      if (id !== undefined) target.track.trackSessionId = id;
    }
    const key = trackKey(target.track);
    let state = this.tracks.get(key);
    if (!state || state.oscIndex !== trackResult.index) {
      this.syncListeners(this.ownersOf().map(({ target: t }) => t));
      state = this.tracks.get(key);
    }
    if (!state) return this.report(owner, "unavailable", "listener");

    if (target.launchMode === "stop") return this.requestStop(state, trackResult.index, owner);

    const resolveRef = (ref: ClipSlotRef): number | string => {
      const slot = resolveClipSlot(trackResult.track, ref);
      if (slot.status === "missing" || slot.status === "ambiguous") return slot.status;
      if (slot.status === "relinked") {
        ref.slotIndex = slot.index;
        const id = handleId(slot.clip);
        if (id !== undefined) ref.clipSessionId = id;
      }
      return slot.index;
    };

    if (target.launchMode === "clip" && target.clip) {
      const slot = resolveRef(target.clip);
      if (typeof slot === "string") return this.report(owner, slot, "clip");
      return this.requestClip(state, trackResult.index, slot, owner, target, trackResult.track);
    }

    const list: number[] = [];
    for (const ref of target.clips ?? []) {
      const slot = resolveRef(ref);
      if (typeof slot === "string") return this.report(owner, slot, `list_item_${list.length + 1}`);
      list.push(slot);
    }
    // One advance per quantized entry: while an item this list asked for is
    // still waiting in Live (or Live has not acknowledged it yet), further
    // activations do not move the list again.
    const pending = this.pendingSlot(state);
    if (pending !== null && list.includes(pending)) return this.emitTrack(state);
    const current = state.playing !== null ? list.indexOf(state.playing) : -1;
    const next = list[(current + 1) % list.length] as number;
    return this.requestClip(state, trackResult.index, next, owner, target, trackResult.track);
  }

  /** Slot Live has queued, or the one Surface just asked for and Live has not echoed yet. */
  private pendingSlot(state: TrackState): number | null {
    if (state.ledger && !state.ledger.acknowledged && state.ledger.kind === "fire") return state.ledger.slot;
    return state.fired !== null && state.fired >= 0 ? state.fired : null;
  }

  private stopPending(state: TrackState): boolean {
    return (state.ledger?.kind === "stop" && !state.ledger.acknowledged) || state.fired === -2;
  }

  private requestClip(
    state: TrackState,
    trackIndex: number,
    slot: number,
    owner: ClipLaunchOwner,
    target: ClipLaunchTarget,
    track: any,
  ): void {
    const pending = this.pendingSlot(state);
    const stopping = this.stopPending(state);
    if (pending === slot) return this.emitTrack(state);
    if (state.playing === slot && pending === null && !stopping) return this.emitTrack(state);
    const cont = state.continuation;
    if (cont && cont.sourceSlot === slot && state.playing === slot && cont.sent
        && (pending === cont.followSlot || (cont.action === "stop" && stopping))) {
      // The clip is playing and its own return is on the way: an echo of the
      // same pose must not cancel that return by restarting the clip.
      return this.emitTrack(state);
    }
    // A new choice on this track: no older return may follow it.
    this.endContinuation(state, "new_choice");
    this.clearLedger(state);
    oscTransport.fireClipSlot(trackIndex, slot);
    this.setLedger(state, { kind: "fire", slot, owner, continuation: false });
    this.log(`[clip-launch] fire track ${trackIndex} slot ${slot} for ${owner.control}`);
    if (target.launchMode === "clip" && target.then && target.then.action !== "none") {
      this.armContinuation(state, trackIndex, slot, owner, target, track);
    }
    this.emitTrack(state);
  }

  private requestStop(state: TrackState, trackIndex: number, owner: ClipLaunchOwner): void {
    const pending = this.pendingSlot(state);
    if (this.stopPending(state)) return this.emitTrack(state);
    if ((state.playing === null || state.playing < 0) && pending === null) return this.emitTrack(state);
    this.endContinuation(state, "stop");
    this.clearLedger(state);
    oscTransport.stopTrackClips(trackIndex);
    this.setLedger(state, { kind: "stop", slot: null, owner, continuation: false });
    this.log(`[clip-launch] stop track ${trackIndex} for ${owner.control}`);
    this.emitTrack(state);
  }

  private setLedger(state: TrackState, entry: Omit<Ledger, "at" | "acknowledged" | "timer">): void {
    const ledger: Ledger = { ...entry, at: this.now(), acknowledged: false, timer: null };
    ledger.timer = setTimeout(() => {
      if (state.ledger !== ledger || ledger.acknowledged) return;
      state.ledger = null;
      this.report(ledger.owner, "no_confirmation");
    }, LEDGER_CONFIRM_MS);
    (ledger.timer as any)?.unref?.();
    state.ledger = ledger;
  }

  private clearLedger(state: TrackState): void {
    if (state.ledger?.timer) clearTimeout(state.ledger.timer);
    state.ledger = null;
  }

  // ── index check ──────────────────────────────────────────────────────

  /**
   * AbletonOSC addresses tracks by index. Before the first launch after any
   * change in the track list, its list of names must equal the SDK's.
   */
  private async verifyIndices(song: any): Promise<boolean> {
    const names: string[] = (Array.isArray(song?.tracks) ? song.tracks : []).map((track: any) => String(track?.name ?? ""));
    if (sameNames(this.verifiedNames, names)) return true;
    const reply = await new Promise<string[] | null>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingNames = this.pendingNames.filter((waiter) => waiter !== done);
        resolve(null);
      }, TRACK_NAMES_TIMEOUT_MS);
      (timer as any)?.unref?.();
      const done = (value: string[] | null) => { clearTimeout(timer); resolve(value); };
      this.pendingNames.push(done);
      oscTransport.requestTrackNames();
    });
    if (reply && sameNames(reply, names)) {
      this.verifiedNames = names;
      return true;
    }
    this.verifiedNames = null;
    return false;
  }

  private onTrackNames(names: string[]): void {
    const waiters = this.pendingNames;
    this.pendingNames = [];
    for (const waiter of waiters) waiter(names);
  }

  // ── what Live reports ────────────────────────────────────────────────

  private onClipProperty(event: { trackIndex: number; slotIndex: number; property: ClipPropertyName; value: number }): void {
    const id = `${event.trackIndex}:${event.slotIndex}`;
    const props = this.clipProps.get(id) ?? { launchQuantization: null, launchMode: null, legato: null };
    if (event.property === "launch_quantization") props.launchQuantization = event.value;
    else if (event.property === "launch_mode") props.launchMode = event.value;
    else props.legato = event.value;
    this.clipProps.set(id, props);
    const key = this.oscIndexToKey.get(event.trackIndex);
    const state = key ? this.tracks.get(key) : undefined;
    if (state) this.emitTrack(state);
  }

  private onTrackSlot(event: { trackIndex: number; kind: "fired" | "playing"; value: number }): void {
    const key = this.oscIndexToKey.get(event.trackIndex);
    const state = key ? this.tracks.get(key) : undefined;
    if (!state) return;
    const ledger = state.ledger;
    const cont = state.continuation;
    if (event.kind === "fired") {
      const before = state.fired;
      state.fired = event.value;
      if (ledger && !ledger.acknowledged) {
        if ((ledger.kind === "fire" && event.value === ledger.slot) || (ledger.kind === "stop" && event.value === -2)) {
          this.acknowledge(state);
        }
      }
      if (cont) {
        if (!cont.confirmed) {
          if (event.value === cont.sourceSlot) cont.seenFired = true;
          else if (event.value === -1 && before === cont.sourceSlot && state.playing === cont.sourceSlot) {
            // A relaunch of the clip already playing: it restarted now.
            this.confirmContinuation(state);
          } else if (event.value === -2) this.endContinuation(state, "track_stop");
          else if (event.value >= 0) this.endContinuation(state, "new_choice_live");
        } else if (event.value === -2) {
          if (!(cont.sent && cont.action === "stop")) this.endContinuation(state, "track_stop");
        } else if (event.value >= 0 && !(cont.sent && event.value === cont.followSlot)) {
          this.endContinuation(state, "new_choice_live");
        }
      }
    } else {
      const before = state.playing;
      state.playing = event.value;
      if (ledger && !ledger.acknowledged && ledger.kind === "fire" && event.value === ledger.slot) this.acknowledge(state);
      if (ledger && ledger.kind === "fire" && event.value === ledger.slot) this.clearLedger(state);
      if (ledger && ledger.kind === "stop" && event.value < 0) this.clearLedger(state);
      if (cont) {
        if (!cont.confirmed) {
          if (event.value === cont.sourceSlot && before !== cont.sourceSlot) this.confirmContinuation(state);
          else if (event.value >= 0 && event.value !== cont.sourceSlot) this.endContinuation(state, "new_choice_live");
        } else if (event.value !== cont.sourceSlot) {
          if (cont.sent && (event.value === cont.followSlot || (cont.action === "stop" && event.value < 0))) {
            this.finishContinuation(state);
          } else if (event.value < 0 && state.fired !== -2 && !cont.tracker.geometry.looping) {
            this.checkNaturalEnd(state, cont);
          } else {
            this.endContinuation(state, event.value < 0 ? "stopped" : "new_choice_live");
          }
        }
      }
    }
    this.emitTrack(state);
  }

  /**
   * A non-loop clip left the track without a stop button. Live may report a
   * transport stop the same way, and the two pushes can arrive in either
   * order, so the decision waits until the transport has had time to say
   * whether it is still running. A stopped transport cancels; a natural end
   * keeps the rule (and may send a late return).
   */
  private checkNaturalEnd(state: TrackState, cont: Continuation): void {
    const timer = setTimeout(() => {
      if (state.continuation !== cont) return;
      const songMoving = this.now() - oscTransport.lastSongTimeUpdateAt <= SONG_TIME_FRESH_MS;
      if (oscTransport.state.isPlaying && songMoving && oscTransport.state.connected) {
        this.applyDecision(state, cont.tracker.naturalEnd(!oscTransport.globalQuantizationPending));
      } else {
        this.endContinuation(state, "transport_stopped");
      }
      this.emitTrack(state);
    }, NATURAL_END_SETTLE_MS);
    (timer as any)?.unref?.();
  }

  private acknowledge(state: TrackState): void {
    if (!state.ledger) return;
    state.ledger.acknowledged = true;
    if (state.ledger.timer) clearTimeout(state.ledger.timer);
    state.ledger.timer = null;
  }

  // ── "after it starts" ────────────────────────────────────────────────

  private followQuantum(trackIndex: number, followSlot: number | null): number | null {
    const song = oscTransport.globalQuantization;
    const clip = followSlot === null ? null : this.clipProps.get(`${trackIndex}:${followSlot}`)?.launchQuantization ?? null;
    const effective = followSlot === null ? effectiveSongQuantization(null, song) : effectiveSongQuantization(clip, song);
    return quantumBeats(effective, oscTransport.state.signatureNumerator, oscTransport.state.signatureDenominator);
  }

  /** Validate a rule for display and for arming; never launches anything. */
  private ruleCheck(trackIndex: number, sourceSlot: number, target: ClipLaunchTarget, track: any):
    { ok: true; spec: { geometry: ClipGeometry; passes: number; quantum: number | null; bpm: number }; followSlot: number | null }
    | { ok: false; reason: string } {
    const then = target.then;
    if (!then || then.action === "none") return { ok: false, reason: "none" };
    if (oscTransport.globalQuantizationPending) return { ok: false, reason: "quantization_pending" };
    if (oscTransport.globalQuantization === null) return { ok: false, reason: "quantization_unknown" };
    const clip = track?.clipSlots?.[sourceSlot]?.clip;
    const geometry = clipGeometry(clip);
    if (!geometry) return { ok: false, reason: "invalid_markers" };
    const props = this.clipProps.get(`${trackIndex}:${sourceSlot}`);
    if (props?.legato === 1) return { ok: false, reason: "legato" };
    if (props?.launchMode !== null && props?.launchMode !== undefined && props.launchMode !== 0) {
      return { ok: false, reason: "launch_mode" };
    }
    let followSlot: number | null = null;
    if (then.action === "clip" && then.clip) {
      const slot = resolveClipSlot(track, then.clip);
      if (slot.status === "missing" || slot.status === "ambiguous") return { ok: false, reason: `follow_${slot.status}` };
      followSlot = slot.index;
    }
    const quantum = this.followQuantum(trackIndex, followSlot);
    return {
      ok: true,
      followSlot,
      spec: { geometry, passes: then.passes ?? 1, quantum, bpm: oscTransport.state.tempo },
    };
  }

  private armContinuation(
    state: TrackState,
    trackIndex: number,
    sourceSlot: number,
    owner: ClipLaunchOwner,
    target: ClipLaunchTarget,
    track: any,
  ): void {
    this.quantizationCancellations.delete(`${owner.control}::${owner.targetIndex}`);
    const check = this.ruleCheck(trackIndex, sourceSlot, target, track);
    if (!check.ok) {
      this.emitRule(owner, "refused", check.reason);
      return;
    }
    const created = ContinuationTracker.create(check.spec);
    if (!created.ok) {
      this.emitRule(owner, "refused", created.reason);
      return;
    }
    state.continuation = {
      globalQuantization: oscTransport.globalQuantization as number,
      owner,
      target,
      sourceSlot,
      followSlot: check.followSlot,
      action: target.then?.action === "stop" ? "stop" : "clip",
      tracker: created.tracker,
      confirmed: false,
      seenFired: false,
      positionListen: null,
      last: { songBeat: null, wallMs: this.now() },
      sent: false,
    };
    this.emitRule(owner, "waiting");
  }

  private songBeatNow(): number | null {
    const fresh = oscTransport.state.isPlaying
      && this.now() - oscTransport.lastSongTimeUpdateAt <= SONG_TIME_FRESH_MS;
    return fresh ? oscTransport.state.currentSongTimeBeats : null;
  }

  /** Beats Live played since `last`; null when it cannot be measured. */
  private beatsSince(last: { songBeat: number | null; wallMs: number }, songBeat: number | null, wallMs: number): number | null {
    if (last.songBeat !== null && songBeat !== null) return songBeat - last.songBeat;
    const bpm = oscTransport.state.tempo;
    if (!(bpm > 0)) return null;
    return (wallMs - last.wallMs) * bpm / 60000;
  }

  private confirmContinuation(state: TrackState): void {
    const cont = state.continuation;
    if (!cont || cont.confirmed) return;
    cont.confirmed = true;
    cont.last = { songBeat: this.songBeatNow(), wallMs: this.now() };
    if (state.oscIndex !== null) {
      cont.positionListen = [state.oscIndex, cont.sourceSlot];
      oscTransport.listenClipPosition(state.oscIndex, cont.sourceSlot);
    }
    this.emitRule(cont.owner, "armed");
    this.applyDecision(state, cont.tracker.confirm(!oscTransport.globalQuantizationPending));
  }

  private onPosition(event: { trackIndex: number; slotIndex: number; position: number }): void {
    const key = this.oscIndexToKey.get(event.trackIndex);
    const state = key ? this.tracks.get(key) : undefined;
    const cont = state?.continuation;
    if (!state || !cont || !cont.confirmed || !cont.positionListen) return;
    if (cont.positionListen[0] !== event.trackIndex || cont.positionListen[1] !== event.slotIndex) return;
    const songBeat = this.songBeatNow();
    const wallMs = this.now();
    const delta = this.beatsSince(cont.last, songBeat, wallMs);
    cont.last = { songBeat, wallMs };
    this.applyDecision(state, cont.tracker.position(event.position, delta, !oscTransport.globalQuantizationPending));
  }

  private applyDecision(state: TrackState, decision: ContinuationDecision): void {
    const cont = state.continuation;
    if (!cont) return;
    if (decision.kind === "cancel") return this.endContinuation(state, decision.reason);
    if (decision.kind !== "send") return;
    if (oscTransport.globalQuantizationPending) return;
    // The rule must still be valid at the moment it would act.
    if (!this.isCurrent(cont.owner, cont.target)) return this.endContinuation(state, "mapping_changed");
    // Not gated on is_playing: the confirmation that the clip started already
    // proves playback, and that push can arrive before is_playing does.
    if (!oscTransport.state.connected) return this.endContinuation(state, "osc_lost");
    const song = getExtensionContext()?.application?.song;
    const trackResult = song ? resolveClipTrack(song, cont.target.track) : null;
    if (!trackResult || (trackResult.status !== "ok" && trackResult.status !== "relinked")) {
      return this.endContinuation(state, "track_missing");
    }
    cont.sent = true;
    this.clearLedger(state);
    if (cont.action === "stop") {
      oscTransport.stopTrackClips(trackResult.index);
      this.setLedger(state, { kind: "stop", slot: null, owner: cont.owner, continuation: true });
    } else {
      const then = cont.target.then?.clip;
      const slot = then ? resolveClipSlot(trackResult.track, then) : null;
      if (!slot || (slot.status !== "ok" && slot.status !== "relinked")) {
        cont.sent = false;
        return this.endContinuation(state, "follow_missing");
      }
      cont.followSlot = slot.index;
      oscTransport.fireClipSlot(trackResult.index, slot.index);
      this.setLedger(state, { kind: "fire", slot: slot.index, owner: cont.owner, continuation: true });
    }
    const late = decision.late;
    this.log(`[clip-launch] rule ${late ? "late " : ""}${cont.action} after ${cont.tracker.diagnostics.passes} pass(es) on track ${trackResult.index}: ${JSON.stringify(cont.tracker.diagnostics)}`);
    this.emitRule(cont.owner, late ? "late" : "sent");
    this.emitTrack(state);
  }

  private stopPositionListen(cont: Continuation): void {
    if (cont.positionListen) {
      oscTransport.unlistenClipPosition(cont.positionListen[0], cont.positionListen[1]);
      cont.positionListen = null;
    }
  }

  private record(cont: Continuation): void {
    this.diagnostics.push({ ...cont.tracker.diagnostics, owner: cont.owner, at: this.now() });
    while (this.diagnostics.length > 20) this.diagnostics.shift();
  }

  /** The follow-up entered: the rule is done. */
  private finishContinuation(state: TrackState): void {
    const cont = state.continuation;
    if (!cont) return;
    this.stopPositionListen(cont);
    this.record(cont);
    state.continuation = null;
    this.emitRule(cont.owner, "done");
  }

  /** Cancel a rule. A return already handed to Live stays Live's. */
  private endContinuation(state: TrackState, reason: string): void {
    const cont = state.continuation;
    if (!cont) return;
    cont.tracker.invalidate(reason);
    this.stopPositionListen(cont);
    this.record(cont);
    state.continuation = null;
    if (!cont.sent) {
      if (reason === "global_quantization_changed" || reason === "quantization_unconfirmed") {
        this.quantizationCancellations.set(`${cont.owner.control}::${cont.owner.targetIndex}`, { target: cont.target, reason });
      }
      this.emitRule(cont.owner, "cancelled", reason);
    }
  }

  invalidateAll(reason: string): void {
    for (const state of this.tracks.values()) this.endContinuation(state, reason);
  }

  /** Stop, panic or deactivate: drop everything not yet handed to Live. */
  cancelAll(reason: string): void {
    for (const state of this.tracks.values()) {
      this.endContinuation(state, reason);
      this.clearLedger(state);
    }
  }

  private startWatchdog(): void {
    if (this.watchdog) return;
    this.watchdog = setInterval(() => {
      if (oscTransport.state.connected) return;
      // The link is gone: Live's view of every track is unknown, and no rule
      // may act on stale state when it comes back.
      for (const state of this.tracks.values()) {
        this.endContinuation(state, "osc_lost");
        this.clearLedger(state);
        state.fired = null;
        state.playing = null;
      }
      this.verifiedNames = null;
    }, 1000);
    (this.watchdog as any)?.unref?.();
  }

  private stopWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  // ── status ───────────────────────────────────────────────────────────

  private emit(status: ClipLaunchStatus, force = false): void {
    const key = `${status.control}::${status.targetIndex}`;
    const serialized = JSON.stringify(status);
    if (!force && this.lastStatus.get(key) === serialized) return;
    this.lastStatus.set(key, serialized);
    this.deps?.broadcast(status);
  }

  private emitRule(owner: ClipLaunchOwner, state: string, reason?: string): void {
    const targets = this.deps?.mappings().get(owner.control);
    const target = targets?.[owner.targetIndex];
    if (!isClipLaunchTarget(target)) return;
    const status = this.statusFor(owner, target);
    status.rule = { ...(status.rule ?? {}), state, ...(reason !== undefined ? { reason } : {}) };
    this.emit(status, true);
  }

  private emitTrack(state: TrackState): void {
    for (const { owner, target } of this.ownersOf()) {
      if (trackKey(target.track) === state.key) this.emit(this.statusFor(owner, target));
    }
  }

  private broadcastAll(): void {
    for (const { owner, target } of this.ownersOf()) this.emit(this.statusFor(owner, target));
  }

  statusFor(owner: ClipLaunchOwner, target: ClipLaunchTarget): ClipLaunchStatus {
    const status: ClipLaunchStatus = { control: owner.control, targetIndex: owner.targetIndex, state: "idle",
      globalQuantization: this.globalQuantizationStatus() };
    if (!oscTransport.state.available || !oscTransport.state.connected) {
      status.state = "unavailable";
      status.reason = "osc_disconnected";
      return status;
    }
    if (target.relinkStatus === "missing" || target.relinkStatus === "ambiguous" || target.relinkStatus === "review") {
      status.state = target.relinkStatus === "missing" ? "missing" : "ambiguous";
      status.reason = "reassociate";
      return status;
    }
    const song = getExtensionContext()?.application?.song;
    const trackResult = song ? resolveClipTrack(song, target.track) : null;
    if (!trackResult || trackResult.status === "missing") return { ...status, state: "missing", reason: "track" };
    if (trackResult.status === "ambiguous" || trackResult.status === "group") {
      return { ...status, state: "ambiguous", reason: trackResult.status === "group" ? "group_track" : "track" };
    }
    const state = this.tracks.get(trackKey(target.track));
    const fired = state?.fired ?? null;
    const playing = state?.playing ?? null;
    const ledger = state?.ledger ?? null;
    const warnings: string[] = [];

    const quantizationFor = (slotIndex: number | null) => {
      const global = oscTransport.globalQuantization;
      const props = slotIndex === null ? null : this.clipProps.get(`${trackResult.index}:${slotIndex}`);
      const clipValue = props?.launchQuantization ?? null;
      if (slotIndex === null || clipValue === null) {
        return { source: global === null ? "unknown" as const : "global" as const,
          label: global === null ? null : SONG_QUANTIZATION_LABELS[global] ?? null };
      }
      const effective = effectiveSongQuantization(clipValue, global);
      return { source: clipValue === 0 ? "global" as const : "clip" as const,
        label: effective === null ? null : SONG_QUANTIZATION_LABELS[effective] ?? null };
    };

    if (target.launchMode === "stop") {
      status.quantization = quantizationFor(null);
      status.state = fired === -2 || (ledger?.kind === "stop" && !ledger.acknowledged)
        ? (ledger && !ledger.acknowledged ? "requested" : "stopping")
        : playing === null ? "idle" : playing < 0 ? "stopped" : "idle";
      return status;
    }

    const slots: number[] = [];
    for (const ref of target.launchMode === "clip" && target.clip ? [target.clip] : target.clips ?? []) {
      const slot = resolveClipSlot(trackResult.track, ref);
      if (slot.status === "missing" || slot.status === "ambiguous") {
        return { ...status, state: slot.status, reason: target.launchMode === "clip" ? "clip" : `list_item_${slots.length + 1}` };
      }
      slots.push(slot.index);
      const props = this.clipProps.get(`${trackResult.index}:${slot.index}`);
      if (props?.launchMode !== null && props?.launchMode !== undefined && props.launchMode !== 0) {
        if (!warnings.includes("launch_mode")) warnings.push("launch_mode");
      }
      if (props?.legato === 1 && !warnings.includes("legato")) warnings.push("legato");
    }
    const ledgerSlot = ledger && ledger.kind === "fire" && !ledger.acknowledged ? ledger.slot : null;
    const focus = target.launchMode === "clip" ? slots[0] as number
      : (ledgerSlot !== null && slots.includes(ledgerSlot) ? ledgerSlot
        : fired !== null && slots.includes(fired) ? fired
          : playing !== null && slots.includes(playing) ? playing : slots[0] as number);
    status.quantization = quantizationFor(focus);
    if (ledgerSlot !== null && slots.includes(ledgerSlot)) status.state = "requested";
    else if (fired !== null && slots.includes(fired)) status.state = "queued";
    else if (playing !== null && slots.includes(playing)) status.state = "playing";
    if (target.launchMode === "list") status.listIndex = playing !== null ? slots.indexOf(playing) : -1;
    if (warnings.length) status.warnings = warnings;

    if (target.launchMode === "clip" && target.then && target.then.action !== "none") {
      const check = this.ruleCheck(trackResult.index, slots[0] as number, target, trackResult.track);
      if (!check.ok) {
        status.rule = { state: "refused", refusal: check.reason };
      } else {
        const plan = planPasses(check.spec.geometry, check.spec.passes);
        const created = ContinuationTracker.create(check.spec);
        if (!plan.ok) status.rule = { state: "refused", refusal: plan.reason };
        else if (!created.ok) status.rule = { state: "refused", refusal: created.reason };
        else {
          status.rule = {
            state: state?.continuation && state.continuation.owner.control === owner.control
              && state.continuation.owner.targetIndex === owner.targetIndex
              ? (state.continuation.sent ? "sent" : state.continuation.confirmed ? "armed" : "waiting")
              : "ready",
            prediction: predictLanding(plan.total, check.spec.quantum as number, check.spec.geometry.looping),
          };
        }
      }
      const cancelled = this.quantizationCancellations.get(`${owner.control}::${owner.targetIndex}`);
      if (cancelled?.target === target) status.rule = { state: "cancelled", reason: cancelled.reason };
    }
    return status;
  }

  /** Every Launch Clip target with its current state, plus recent rule diagnostics. */
  globalQuantizationStatus() {
    return { value: oscTransport.globalQuantization,
      label: oscTransport.globalQuantization === null ? null : SONG_QUANTIZATION_LABELS[oscTransport.globalQuantization] ?? null,
      pending: oscTransport.globalQuantizationPending,
      available: oscTransport.state.available, connected: oscTransport.state.connected };
  }

  snapshot(): { statuses: ClipLaunchStatus[]; diagnostics: Array<ContinuationDiagnostics & { owner: ClipLaunchOwner; at: number }>; globalQuantization: ReturnType<ClipLaunchEngine["globalQuantizationStatus"]> } {
    return {
      globalQuantization: this.globalQuantizationStatus(),
      statuses: this.ownersOf().map(({ owner, target }) => this.statusFor(owner, target)),
      diagnostics: this.diagnostics.slice(),
    };
  }

  /** Tests and deactivate. */
  reset(): void {
    this.cancelAll("reset");
    this.edges.clear();
    this.tracks.clear();
    this.oscIndexToKey.clear();
    this.clipProps.clear();
    this.lastStatus.clear();
    this.quantizationCancellations.clear();
    this.diagnostics.length = 0;
    this.verifiedNames = null;
    for (const waiter of this.pendingNames) waiter(null);
    this.pendingNames = [];
    this.chain = Promise.resolve();
    this.wasPlaying = false;
    this.wasConnected = false;
    this.stopWatchdog();
  }
}

/** 0/1 controls: pads, buttons, learned poses and detector edges. */
function isBinaryControl(control: string): boolean {
  return /^(?:pad|toggle|button)-|^sensor\.vision\.gesture\.|^sensor\.audio\.(?:transient|kick|snare)$|\.(?:active|fist|pinch|victory|open|gate|transient)$/.test(control);
}

export const clipLaunchEngine = new ClipLaunchEngine();
