// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
//
// host-modulators.ts — the LFO / stutter motor.
//
// The phone sends a modulator's *configuration* once (shape, rate, depth,
// sync) and then goes quiet; the host generates the signal from there. That
// keeps LFO samples off the radio link entirely, and it keeps the modulation
// running when the phone's browser throttles its timers in the background.
//
// Phase uses elapsed timestamps, not a nominal tick count. Rate changes only
// affect future time; FREE LFO rate morphs integrate the frequency ramp.
//
// Depends on the mapping engine one way only: this module calls applyMapping,
// nothing in mappings.ts calls back into here.
import { getExtensionContext } from "../context.js";
import { trackedClients, appendHistory, pushClientUpdate } from "../server/ws.js";
import { playheadActive, playheadStartTime, playheadBaseTimeMs } from "./state.js";
import { oscTransport } from "./osc-transport.js";
import { computeSyncedLfoValue, computeSyncedStutterValue, getLfoSubdivision, getLfoMaxHz, getStutterTiming, LFO_SUBDIVISIONS } from "./transport-clock.js";
import { applyMapping } from "./mappings.js";

export type HostModulatorKind = "lfo" | "stutter";
export type HostModulatorSyncMode = "sync" | "free";

interface HostModulatorMorph {
  startTime: number;
  endTime: number;
  startRate: number;
  targetRate: number;
  startDepth: number;
  targetDepth: number;
  startCount: number;
  targetCount: number;
  deactivateAtEnd: boolean;
}

export interface HostModulatorState {
  clientId: string;
  name: string;
  kind: HostModulatorKind;
  active: boolean;
  rate: number;
  depth: number;
  count: number;
  syncMode: HostModulatorSyncMode;
  clockSource?: "osc" | "sdk" | "free";
  phase: number;
  // Timestamp of the phase stored above; initialized on the first tick.
  phaseZeroMs?: number;
  /** Phase at the last beat sample; rate changes only own future beats. */
  syncAnchor?: {
    beat: number;
    cycles: number;
    subdivision: number;
    phaseOffset: number;
    clockSource: "osc" | "sdk";
    timestamp: number;
  };
  lastTime: number | null;
  morph?: HostModulatorMorph;
  syncSubdivisionBeats?: number;
  phaseOffsetBeats?: number;
  swing?: number;
  shape?: "sine" | "triangle" | "ramp_up" | "ramp_down" | "square";
  /**
   * Pad mode D. The phone sends the shape; the start is stamped here because
   * the two clocks are unrelated. While these are set, every generated value
   * is scaled by the attack-release envelope.
   */
  burstStartMs?: number;
  burstDurationMs?: number;
  burstAttackMs?: number;
  /** Last value submitted to mappings (not an SDK delivery acknowledgement). */
  lastWrittenValue?: number;
}

/**
 * Smallest change worth a write to Live.
 *
 * Suppress near-identical submissions, including unchanged stutter gates.
 * This is a normalized-value approximation, not a perceptual guarantee.
 * Generator cadence does not prove SDK delivery or automation recording rate.
 */
const HOST_MODULATOR_WRITE_EPSILON = 0.0005;

/**
 * Whether this tick's value is worth sending to Live, updating the
 * bookkeeping when it is. The first value after activation always writes.
 */
function shouldWriteHostValue(state: HostModulatorState, value: number): boolean {
  const previous = state.lastWrittenValue;
  if (previous !== undefined && Math.abs(value - previous) < HOST_MODULATOR_WRITE_EPSILON) {
    return false;
  }
  state.lastWrittenValue = value;
  return true;
}

export const hostModulators = new Map<string, HostModulatorState>();

let hostModulatorInterval: NodeJS.Timeout | null = null;
// Requested generator cadence only. Event-loop stalls and SDK completion can
// reduce delivered samples; the LFO bandwidth policy is separate from this loop.
const HOST_MODULATOR_INTERVAL_MS = 4;

/**
 * Position inside an attack-release burst as 0..1, or 1 when none is running.
 * The same shape the pads use, so one press feels the same on every control.
 */
function burstEnvelope(state: HostModulatorState, now: number): number {
  const start = state.burstStartMs;
  const total = state.burstDurationMs;
  if (start === undefined || total === undefined || !(total > 0)) return 1;
  const elapsed = now - start;
  if (elapsed <= 0) return 0;
  if (elapsed >= total) return 0;
  const attack = Math.min(
    state.burstAttackMs !== undefined && state.burstAttackMs > 0
      ? state.burstAttackMs
      : total * 0.135,
    total * 0.9,
  );
  if (elapsed < attack) return elapsed / attack;
  const release = total - attack;
  return release > 0 ? Math.max(0, 1 - (elapsed - attack) / release) : 0;
}

function clamp01(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function clampMorphMs(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(30_000, value))
    : 0;
}

function applyHostModulatorMorph(state: HostModulatorState, now: number): boolean {
  const morph = state.morph;
  if (!morph) return true;

  const duration = Math.max(1, morph.endTime - morph.startTime);
  const progress = Math.max(0, Math.min(1, (now - morph.startTime) / duration));
  state.rate = morph.startRate + (morph.targetRate - morph.startRate) * progress;
  state.depth = morph.startDepth + (morph.targetDepth - morph.startDepth) * progress;
  state.count = morph.startCount + (morph.targetCount - morph.startCount) * progress;

  if (progress < 1) return true;

  state.rate = morph.targetRate;
  state.depth = morph.targetDepth;
  state.count = morph.targetCount;
  delete state.morph;

  if (!morph.deactivateAtEnd) return true;
  state.active = false;
  return false;
}

function hostModulatorKey(clientId: string, name: string): string {
  return `${clientId}::${name}`;
}

function isHostModulatorName(kind: HostModulatorKind, name: string): boolean {
  if (kind === "lfo") return /^toggle-\d+$/.test(name);
  return /^button-\d+$/.test(name);
}

export function startHostModulatorLoop(): void {
  if (hostModulatorInterval !== null) return;
  hostModulatorInterval = setInterval(() => {
    void tickHostModulators(Date.now());
  }, HOST_MODULATOR_INTERVAL_MS);
}

export function stopHostModulatorLoop(): void {
  if (hostModulatorInterval === null) return;
  clearInterval(hostModulatorInterval);
  hostModulatorInterval = null;
}

export function isHostModulatorLoopRunning(): boolean {
  return hostModulatorInterval !== null;
}

function maybeStopHostModulatorLoop(): void {
  if (hostModulators.size === 0) stopHostModulatorLoop();
}

function getHostModulatorFrequencyHz(state: HostModulatorState, tempo: number): number {
  if (state.kind === "lfo") {
    if (state.syncMode === "sync") {
      return (tempo / 60) / getLfoSubdivision(state.rate, tempo, state.syncSubdivisionBeats, state.shape);
    }
    return 0.1 + state.rate * (getLfoMaxHz(state.shape) - 0.1);
  }

  return getStutterTiming(state.rate, state.count, tempo, state.syncMode === "sync",
    state.syncSubdivisionBeats, state.swing).frequency;
}

function advanceFreePhase(state: HostModulatorState, now: number, tempo: number): void {
  const from = state.phaseZeroMs ?? now;
  const elapsedMs = Math.max(0, now - from);
  let cycles = getHostModulatorFrequencyHz(state, tempo) * elapsedMs / 1000;
  const morph = state.morph;
  if (state.kind === "lfo" && state.syncMode === "free" && morph) {
    // Integral of clamped linear progress. Includes time beyond the end of
    // a morph when a tick is delayed, without applying the final rate early.
    const duration = Math.max(1, morph.endTime - morph.startTime);
    const progressIntegral = (time: number): number => {
      const x = Math.max(0, time - morph.startTime);
      return x < duration ? x * x / (2 * duration) : x - duration / 2;
    };
    const rateMs = morph.startRate * elapsedMs + (morph.targetRate - morph.startRate)
      * (progressIntegral(Math.max(from, now)) - progressIntegral(from));
    cycles = (0.1 * elapsedMs + (getLfoMaxHz(state.shape) - 0.1) * rateMs) / 1000;
  }
  const turn = 2 * Math.PI;
  state.phase = ((state.phase + cycles * turn) % turn + turn) % turn;
  state.phaseZeroMs = Math.max(from, now);
}

function getHostSyncedBeats(state: HostModulatorState, now: number, tempo: number): number | null {
  if (state.syncMode !== "sync") return null;
  const source = state.clockSource || "osc";
  if (source === "osc" && oscTransport.state.available && oscTransport.state.connected && oscTransport.state.isPlaying) {
    return oscTransport.state.currentSongTimeBeats
      + ((now - oscTransport.lastSongTimeUpdateAt) / 1000) * (tempo / 60);
  }
  if (source === "sdk" && playheadActive) {
    return ((playheadBaseTimeMs + (now - playheadStartTime)) / 1000) * (tempo / 60);
  }
  return null;
}

function advanceHostLfoPhase(state: HostModulatorState, now: number, tempo: number): void {
  const beats = getHostSyncedBeats(state, now, tempo);
  if (beats === null) {
    advanceFreePhase(state, now, tempo);
    // Paused/internal-clock fallback continues the wave; Play re-locks it.
    delete state.syncAnchor;
    return;
  }

  const subdivision = getLfoSubdivision(state.rate, tempo, state.syncSubdivisionBeats, state.shape);
  const phaseOffset = state.phaseOffsetBeats ?? 0;
  const clockSource = state.clockSource === "sdk" ? "sdk" : "osc";
  const anchor = state.syncAnchor;
  let cycles = (beats + phaseOffset) / subdivision;
  if (anchor && anchor.clockSource === clockSource) {
    const beatDelta = beats - anchor.beat;
    const expectedDelta = Math.max(0, now - anchor.timestamp) / 1000 * (tempo / 60);
    // A seek/loop aligns to the new song beat. Small OSC corrections are
    // retained as beat corrections, without discarding the rate-change anchor.
    const seek = beatDelta < -0.25
      || Math.abs(beatDelta - expectedDelta) > Math.max(0.25, Math.abs(expectedDelta) * 0.5);
    if (!seek) {
      cycles = anchor.cycles + beatDelta / anchor.subdivision
        + (phaseOffset - anchor.phaseOffset) / subdivision;
    }
  }
  cycles = ((cycles % 1) + 1) % 1;
  state.phase = cycles * 2 * Math.PI;
  state.phaseZeroMs = now;
  state.syncAnchor = { beat: beats, cycles, subdivision, phaseOffset, clockSource, timestamp: now };
}

async function applyHostGeneratedControl(
  clientId: string,
  name: string,
  value: number,
  timestamp: number,
  isDeactivated?: boolean,
): Promise<void> {
  const client = trackedClients.get(clientId);
  if (client) {
    appendHistory(client, name, value, timestamp);
    const lastData = client.lastData && typeof client.lastData === "object"
      ? client.lastData
      : { controls: [] };
    const controls = Array.isArray(lastData["controls"]) ? lastData["controls"] as any[] : [];
    const existing = controls.find((ctrl) => ctrl && ctrl.name === name);
    if (existing) {
      existing.value = value;
    } else {
      controls.push({ name, value });
    }
    lastData["controls"] = controls;
    client.lastData = lastData;
  }
  await applyMapping(clientId, name, value, isDeactivated);
  if (client) pushClientUpdate(client);
}

export function updateHostModulator(clientId: string, payload: Record<string, any>): void {
  if (!clientId || !payload || typeof payload !== "object") return;
  const kind = payload["kind"];
  const name = payload["name"];
  if ((kind !== "lfo" && kind !== "stutter") || typeof name !== "string") return;
  if (!isHostModulatorName(kind, name)) return;

  const key = hostModulatorKey(clientId, name);
  const active = !!payload["active"];
  const existing = hostModulators.get(key);
  const morphMs = clampMorphMs(payload["morphMs"]);
  const morphStart = Date.now();
  if (existing) {
    // Settle the old frequency before accepting the new configuration.
    if (existing.phaseZeroMs !== undefined) {
      const tempo = getExtensionContext()?.application.song?.tempo ?? 120;
      if (existing.kind === "lfo") advanceHostLfoPhase(existing, morphStart, tempo);
      else advanceFreePhase(existing, morphStart, tempo);
    }
    applyHostModulatorMorph(existing, morphStart);
  }

  const targetRate = clamp01(payload["rate"], existing?.rate ?? (kind === "lfo" ? 0.5 : 0.1));
  const targetDepth = clamp01(payload["depth"], existing?.depth ?? 0.5);
  const targetCount = clamp01(payload["count"], existing?.count ?? 0);
  const syncMode = payload["syncMode"] === "free" ? "free" : "sync";
  const burstDurationMs = typeof payload["burstDurationMs"] === "number"
    && payload["burstDurationMs"] > 0 ? payload["burstDurationMs"] : undefined;
  const burstAttackMs = typeof payload["burstAttackMs"] === "number"
    && payload["burstAttackMs"] > 0 ? payload["burstAttackMs"] : undefined;

  if (!active) {
    if (existing && morphMs > 0) {
      existing.syncMode = syncMode;
      existing.morph = {
        startTime: morphStart,
        endTime: morphStart + morphMs,
        startRate: existing.rate,
        targetRate,
        startDepth: existing.depth,
        targetDepth,
        startCount: existing.count,
        targetCount,
        deactivateAtEnd: true,
      };
      if (existing.kind === "lfo" && existing.phaseZeroMs !== undefined) {
        advanceHostLfoPhase(existing, morphStart, getExtensionContext()?.application.song?.tempo ?? 120);
      }
      startHostModulatorLoop();
      return;
    }
    hostModulators.delete(key);
    void applyHostGeneratedControl(clientId, name, 0, Date.now(), true);
    maybeStopHostModulatorLoop();
    return;
  }

  const state: HostModulatorState = existing ?? {
    clientId,
    name,
    kind,
    active: true,
    rate: targetRate,
    depth: targetDepth,
    count: targetCount,
    syncMode,
    // FREE LFO starts at the bottom of the sine (-π/2); stutter starts
    // with its gate open (0). SYNC first aligns to the song beat.
    phase: kind === "lfo" ? -Math.PI / 2 : 0,
    lastTime: null,
  };
  state.active = true;
  state.syncMode = syncMode;

  // Stamped here, not taken from the phone: the two clocks are unrelated. A
  // repeat of the same configuration while a burst is already running must not
  // restart it, or a coalesced re-send would stretch the envelope.
  if (burstDurationMs === undefined) {
    delete state.burstStartMs;
    delete state.burstDurationMs;
    delete state.burstAttackMs;
  } else if (state.burstDurationMs === undefined || state.burstStartMs === undefined) {
    state.burstStartMs = Date.now();
    state.burstDurationMs = burstDurationMs;
    if (burstAttackMs === undefined) {
      delete state.burstAttackMs;
    } else {
      state.burstAttackMs = burstAttackMs;
    }
  }

  const allowedSubdivisions = new Set<number>(kind === "lfo"
    ? LFO_SUBDIVISIONS : [4, 2, 1, 0.5, 0.25, 0.125, 0.0625, 0.03125]);
  // Explicit Auto survives JSON; omission remains a partial-update no-op.
  if (payload["syncSubdivisionBeats"] === null) {
    delete state.syncSubdivisionBeats;
  } else if (payload["syncSubdivisionBeats"] !== undefined) {
    const val = Number(payload["syncSubdivisionBeats"]);
    if (allowedSubdivisions.has(val)) {
      state.syncSubdivisionBeats = val;
    }
  }
  if (payload["phaseOffsetBeats"] !== undefined) {
    const val = Number(payload["phaseOffsetBeats"]);
    if (Number.isFinite(val)) {
      state.phaseOffsetBeats = Math.max(-16, Math.min(16, val));
    }
  }
  if (payload["swing"] !== undefined) {
    const val = Number(payload["swing"]);
    if (Number.isFinite(val)) {
      state.swing = Math.max(0, Math.min(0.66, val));
    }
  }
  const allowedShapes = new Set(["sine", "triangle", "ramp_up", "ramp_down", "square"]);
  if (payload["shape"] !== undefined) {
    const val = String(payload["shape"]);
    if (allowedShapes.has(val)) {
      state.shape = val as any;
    }
  }

  if (payload["clockSource"] !== undefined) {
    const val = String(payload["clockSource"]);
    if (val === "osc" || val === "sdk" || val === "free") {
      state.clockSource = val;
    }
  }

  if (morphMs > 0) {
    state.morph = {
      startTime: morphStart,
      endTime: morphStart + morphMs,
      startRate: state.rate,
      targetRate,
      startDepth: state.depth,
      targetDepth,
      startCount: state.count,
      targetCount,
      deactivateAtEnd: false,
    };
  } else {
    state.rate = targetRate;
    state.depth = targetDepth;
    state.count = targetCount;
    delete state.morph;
  }

  if (state.kind === "lfo" && state.phaseZeroMs !== undefined) {
    // Rebase at the same configuration timestamp: the old rate has already
    // settled above, while the new pin/rate and explicit phase own the future.
    advanceHostLfoPhase(state, morphStart, getExtensionContext()?.application.song?.tempo ?? 120);
  }

  hostModulators.set(key, state);
  startHostModulatorLoop();
}

export async function tickHostModulators(now: number = Date.now()): Promise<void> {
  if (hostModulators.size === 0) {
    maybeStopHostModulatorLoop();
    return;
  }

  const song = getExtensionContext()?.application.song;
  const tempo = typeof song?.tempo === "number" ? song.tempo : 120;
  const applies: Promise<void>[] = [];

  for (const [key, state] of hostModulators.entries()) {
    // Settle the previous subdivision before sampling a SYNC rate morph;
    // FREE LFO morphs integrate their ramp across the complete elapsed interval.
    if (state.kind === "lfo") advanceHostLfoPhase(state, now, tempo);
    else advanceFreePhase(state, now, tempo);
    if (!applyHostModulatorMorph(state, now)) {
      hostModulators.delete(key);
      applies.push(applyHostGeneratedControl(state.clientId, state.name, 0, now, true));
      continue;
    }
    if (state.kind === "lfo" && state.syncAnchor) advanceHostLfoPhase(state, now, tempo);

    state.lastTime = now;

    const beats = getHostSyncedBeats(state, now, tempo);
    if (beats !== null) {
      if (state.kind === "lfo") {
        const shape = state.shape || "sine";
        const lfoVal = computeSyncedLfoValue(shape, state.phase / (2 * Math.PI), 1, 0);
        // In pad mode D the depth opens and closes; centre is where an
        // LFO is doing nothing, so a closed envelope lands there.
        const value = 0.5 + lfoVal * 0.5 * state.depth * burstEnvelope(state, now);

        if (shouldWriteHostValue(state, value)) {
          applies.push(applyHostGeneratedControl(state.clientId, state.name, value, now));
        }
      } else {
        const { subdivision: subdiv, ratchet } = getStutterTiming(state.rate, state.count, tempo, true,
          state.syncSubdivisionBeats, state.swing);
        const phaseOffset = state.phaseOffsetBeats ?? 0;
        const swing = state.swing ?? 0;

        const isGateOpen = computeSyncedStutterValue(beats, subdiv, phaseOffset, swing, ratchet);
        const value = (isGateOpen ? state.depth : 0) * burstEnvelope(state, now);

        state.phase = ((beats + phaseOffset) / (subdiv / ratchet) * 2 * Math.PI) % (2 * Math.PI);
        if (shouldWriteHostValue(state, value)) {
          applies.push(applyHostGeneratedControl(state.clientId, state.name, value, now));
        }
      }
    } else {
      if (state.kind === "lfo") {
        const shape = state.shape || "sine";
        const normalizedPhase = state.phase / (2 * Math.PI);
        const lfoVal = computeSyncedLfoValue(shape, normalizedPhase, 1.0, 0.0);
        const value = 0.5 + lfoVal * 0.5 * state.depth * burstEnvelope(state, now);
        if (shouldWriteHostValue(state, value)) {
          applies.push(applyHostGeneratedControl(state.clientId, state.name, value, now));
        }
      } else {
        const value = (state.phase < Math.PI ? state.depth : 0) * burstEnvelope(state, now);
        if (shouldWriteHostValue(state, value)) {
          applies.push(applyHostGeneratedControl(state.clientId, state.name, value, now));
        }
      }
    }
  }

  await Promise.all(applies);
  maybeStopHostModulatorLoop();
}

/**
 * Shut every modulator down and park its target at 0.
 *
 * Used when the mapping set is replaced wholesale (clearing all mappings,
 * loading a preset): a modulator left running would keep driving a target key
 * that the new set no longer defines, which reads as a parameter moving on its
 * own with nothing on screen to explain it.
 */
export async function stopAllHostModulators(): Promise<void> {
  for (const [key, state] of [...hostModulators.entries()]) {
    hostModulators.delete(key);
    try {
      await applyHostGeneratedControl(state.clientId, state.name, 0, Date.now(), true);
    } catch {
      // A target that no longer resolves is exactly what we are clearing.
    }
  }
  maybeStopHostModulatorLoop();
}

export function clearHostModulatorsForClient(clientId: string): void {
  for (const [key, state] of [...hostModulators.entries()]) {
    if (state.clientId !== clientId) continue;
    hostModulators.delete(key);
    void applyHostGeneratedControl(clientId, state.name, 0, Date.now(), true);
  }
  maybeStopHostModulatorLoop();
}
