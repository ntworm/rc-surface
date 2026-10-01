// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0

// "After it starts" rules for Launch Clip. Pure: no timers, no I/O. The
// engine feeds it what Live reports (the clip started, its playing position)
// and it answers whether the follow-up request must go out now.
//
// The follow-up is still quantized by Live. This module only decides WHEN to
// hand it over: inside the last quantum before the end of pass N, so Live's
// next boundary is meant to be the end of that pass. Whether Live 12 lands it
// there is a hypothesis to validate in the set, not something this code can
// promise. Native Follow Actions are a different mechanism this code neither
// reads nor writes.

/** Live Song.clip_trigger_quantization labels, index = value. */
export const SONG_QUANTIZATION_LABELS = [
  "None", "8 Bars", "4 Bars", "2 Bars", "1 Bar", "1/2", "1/2T",
  "1/4", "1/4T", "1/8", "1/8T", "1/16", "1/16T", "1/32",
] as const;

/** Beats of the fractional settings, in Live's quarter-note beat time. */
const FRACTION_BEATS: Record<number, number> = {
  5: 2, 6: 4 / 3, 7: 1, 8: 2 / 3, 9: 0.5, 10: 1 / 3, 11: 0.25, 12: 1 / 6, 13: 0.125,
};
const BAR_MULTIPLES: Record<number, number> = { 1: 8, 2: 4, 3: 2, 4: 1 };

export const SEND_MARGIN_BEATS = 0.25;
export const MIN_WINDOW_MS = 250;
export const MAX_PASSES = 8;
export const MIN_LOOP_BEATS = 1;
export const WRAP_TOLERANCE_BEATS = 0.5;
export const WRAP_TOLERANCE_RATIO = 0.1;
const POSITION_EPSILON = 1e-6;

/**
 * Clip launch quantization (0 Global, 1 None, 2..14 = 8 Bars..1/32) resolved
 * against the song setting, as a Song.clip_trigger_quantization value.
 */
export function effectiveSongQuantization(
  clipLaunchQuantization: number | null | undefined,
  songQuantization: number | null | undefined,
): number | null {
  const song = Number.isInteger(songQuantization) && (songQuantization as number) >= 0
    && (songQuantization as number) < SONG_QUANTIZATION_LABELS.length ? songQuantization as number : null;
  if (clipLaunchQuantization === null || clipLaunchQuantization === undefined) return song;
  if (!Number.isInteger(clipLaunchQuantization) || clipLaunchQuantization < 0
    || clipLaunchQuantization > SONG_QUANTIZATION_LABELS.length) return null;
  if (clipLaunchQuantization === 0) return song;
  return clipLaunchQuantization - 1;
}

/** One quantum in beats, or null for None/unknown. */
export function quantumBeats(songQuantization: number | null, numerator: number, denominator: number): number | null {
  if (songQuantization === null || !Number.isInteger(songQuantization)) return null;
  const bars = BAR_MULTIPLES[songQuantization];
  if (bars !== undefined) {
    if (!(numerator > 0) || !(denominator > 0)) return null;
    return bars * numerator * (4 / denominator);
  }
  return FRACTION_BEATS[songQuantization] ?? null;
}

export interface ClipGeometry {
  startMarker: number;
  endMarker: number;
  loopStart: number;
  loopEnd: number;
  looping: boolean;
  /** False for unwarped audio, whose playing position is in seconds. */
  beatUnits: boolean;
}

export type PassPlan =
  | { ok: true; first: number; loop: number | null; total: number; passes: number }
  | { ok: false; reason: "unwarped_audio" | "invalid_markers" | "loop_too_short" | "non_loop_passes" | "invalid_passes" };

/**
 * Play time of N passes. A looped clip starts at the start marker, runs to
 * the loop end and then repeats loop start → loop end, so the first pass is
 * `loopEnd − startMarker` (longer with a pre-roll, shorter when the start
 * marker sits inside the loop) and every later pass is the loop length.
 */
export function planPasses(geometry: ClipGeometry, passes: number): PassPlan {
  if (!Number.isInteger(passes) || passes < 1 || passes > MAX_PASSES) return { ok: false, reason: "invalid_passes" };
  if (!geometry.beatUnits) return { ok: false, reason: "unwarped_audio" };
  const { startMarker: s, endMarker: f, loopStart: a, loopEnd: e } = geometry;
  if (![s, f, a, e].every(Number.isFinite)) return { ok: false, reason: "invalid_markers" };
  if (geometry.looping) {
    if (e <= s || e <= a) return { ok: false, reason: "invalid_markers" };
    const loop = e - a;
    if (loop < MIN_LOOP_BEATS) return { ok: false, reason: "loop_too_short" };
    const first = e - s;
    return { ok: true, first, loop, total: first + (passes - 1) * loop, passes };
  }
  if (passes !== 1) return { ok: false, reason: "non_loop_passes" };
  if (f <= s) return { ok: false, reason: "invalid_markers" };
  return { ok: true, first: f - s, loop: null, total: f - s, passes };
}

export interface LandingPrediction {
  /** Beats after the clip's start where the follow-up should enter. */
  landingBeats: number;
  /** Beats between the end of pass N and that entry. */
  extraBeats: number;
  /** exact: no gap; repeat: the looped clip keeps playing; silence: a non-loop clip has ended. */
  kind: "exact" | "repeat" | "silence";
}

/** Assumes the clip itself started on the follow-up's quantization grid. */
export function predictLanding(totalBeats: number, quantum: number, looping: boolean): LandingPrediction {
  const steps = Math.ceil(totalBeats / quantum - 1e-9);
  const landingBeats = Math.max(1, steps) * quantum;
  let extraBeats = landingBeats - totalBeats;
  if (Math.abs(extraBeats) < 1e-6) extraBeats = 0;
  return { landingBeats, extraBeats, kind: extraBeats === 0 ? "exact" : looping ? "repeat" : "silence" };
}

export type ArmRefusal =
  | Extract<PassPlan, { ok: false }>["reason"]
  | "quantization_none"
  | "window_too_short";

export interface ContinuationSpec {
  geometry: ClipGeometry;
  passes: number;
  /** Quantum of the follow-up request, in beats; null when Live uses None. */
  quantum: number | null;
  bpm: number;
}

export type ContinuationDecision =
  | { kind: "none" }
  | { kind: "send"; late: boolean }
  | { kind: "cancel"; reason: string };

export interface ContinuationDiagnostics {
  startMarker: number;
  loopStart: number;
  loopEnd: number;
  endMarker: number;
  looping: boolean;
  passes: number;
  firstPass: number;
  loopLength: number | null;
  total: number;
  quantum: number;
  bpm: number;
  prediction: LandingPrediction;
  pushes: number;
  wraps: number;
  maxGapBeats: number;
  elapsedAtSend: number | null;
  wrapsAtSend: number | null;
  late: boolean;
  outcome: "waiting" | "armed" | "sent" | "cancelled";
  reason: string | null;
  lastElapsed: number | null;
}

const NONE: ContinuationDecision = { kind: "none" };

export class ContinuationTracker {
  private state: "waiting" | "armed" | "sent" | "cancelled" = "waiting";
  private wraps = 0;
  private lastPos = 0;
  private elapsed = 0;
  readonly diagnostics: ContinuationDiagnostics;

  private constructor(
    readonly geometry: ClipGeometry,
    readonly plan: Extract<PassPlan, { ok: true }>,
    readonly quantum: number,
    bpm: number,
  ) {
    this.diagnostics = {
      startMarker: geometry.startMarker,
      loopStart: geometry.loopStart,
      loopEnd: geometry.loopEnd,
      endMarker: geometry.endMarker,
      looping: geometry.looping,
      passes: plan.passes,
      firstPass: plan.first,
      loopLength: plan.loop,
      total: plan.total,
      quantum,
      bpm,
      prediction: predictLanding(plan.total, quantum, geometry.looping),
      pushes: 0,
      wraps: 0,
      maxGapBeats: 0,
      elapsedAtSend: null,
      wrapsAtSend: null,
      late: false,
      outcome: "waiting",
      reason: null,
      lastElapsed: null,
    };
  }

  /** Validate a rule before it can wait for its clip. */
  static create(spec: ContinuationSpec): { ok: true; tracker: ContinuationTracker } | { ok: false; reason: ArmRefusal } {
    const plan = planPasses(spec.geometry, spec.passes);
    if (!plan.ok) return { ok: false, reason: plan.reason };
    if (spec.quantum === null || !(spec.quantum > 0)) return { ok: false, reason: "quantization_none" };
    const bpm = Number.isFinite(spec.bpm) && spec.bpm > 0 ? spec.bpm : 120;
    const windowMs = (spec.quantum - SEND_MARGIN_BEATS) * 60000 / bpm;
    if (!(windowMs >= MIN_WINDOW_MS)) return { ok: false, reason: "window_too_short" };
    return { ok: true, tracker: new ContinuationTracker(spec.geometry, plan, spec.quantum, bpm) };
  }

  get outcome(): ContinuationDiagnostics["outcome"] {
    return this.state;
  }

  /** Live reported the clip playing after the request that launched it. */
  confirm(allowSend = true): ContinuationDecision {
    if (this.state !== "waiting") return NONE;
    this.state = "armed";
    this.diagnostics.outcome = "armed";
    this.lastPos = this.geometry.startMarker;
    this.elapsed = 0;
    if (allowSend && this.plan.total <= this.quantum + POSITION_EPSILON) return this.send(false);
    return NONE;
  }

  /**
   * One playing_position push. `beatsSincePrevious` is the musical time Live
   * reported between the previous event (the confirmation or the previous
   * push) and this one; null when it cannot be known. The pass count comes
   * from positions only, and every step must prove that at most one wrap
   * happened; otherwise the rule is cancelled instead of guessing.
   */
  position(pos: number, beatsSincePrevious: number | null, allowSend = true): ContinuationDecision {
    if (this.state === "waiting" || this.state === "cancelled") return NONE;
    this.diagnostics.pushes += 1;
    if (!Number.isFinite(pos)) return this.fail("inconsistent_position");
    if (beatsSincePrevious === null || !Number.isFinite(beatsSincePrevious)) return this.fail("insufficient_pushes");
    if (beatsSincePrevious < -WRAP_TOLERANCE_BEATS) return this.fail("transport_jump");
    const delta = Math.max(0, beatsSincePrevious);
    this.diagnostics.maxGapBeats = Math.max(this.diagnostics.maxGapBeats, delta);
    const tolerance = WRAP_TOLERANCE_BEATS + WRAP_TOLERANCE_RATIO * delta;
    const loop = this.plan.loop;
    if (loop !== null && delta >= loop - tolerance) return this.fail("insufficient_pushes");

    const prev = this.lastPos;
    const straight = pos - prev;
    const straightOk = straight >= -POSITION_EPSILON && Math.abs(straight - delta) <= tolerance;
    let wrapOk = false;
    if (loop !== null && pos < prev) {
      const { loopStart: a, loopEnd: e } = this.geometry;
      const wrapAdvance = (e - prev) + (pos - a);
      wrapOk = prev <= e + POSITION_EPSILON && pos >= a - POSITION_EPSILON
        && Math.abs(wrapAdvance - delta) <= tolerance;
    }
    if (straightOk && wrapOk) return this.fail("insufficient_pushes");
    if (!straightOk && !wrapOk) return this.fail("inconsistent_position");
    if (wrapOk) this.wraps += 1;
    this.diagnostics.wraps = this.wraps;
    this.lastPos = pos;
    const { startMarker: s, loopStart: a } = this.geometry;
    this.elapsed = this.wraps === 0 ? pos - s : this.plan.first + (this.wraps - 1) * (loop ?? 0) + (pos - a);
    this.diagnostics.lastElapsed = this.elapsed;

    if (this.state !== "armed" || !allowSend) return NONE;
    if (this.elapsed >= this.plan.total - POSITION_EPSILON) return this.send(true);
    if (this.elapsed >= this.plan.total - this.quantum + SEND_MARGIN_BEATS) return this.send(false);
    return NONE;
  }

  /**
   * A non-loop clip ran out on its own (no stop button, transport still
   * playing). The rule is still valid; if the window was missed, the
   * follow-up goes out now as a late return.
   */
  naturalEnd(allowSend = true): ContinuationDecision {
    if (this.state !== "armed") return NONE;
    if (this.geometry.looping) return this.fail("stopped");
    this.elapsed = this.plan.total;
    return allowSend ? this.send(true) : NONE;
  }

  /** A new choice, a stop or a cancellation: no old return may follow. */
  invalidate(reason: string): ContinuationDecision {
    if (this.state === "waiting" || this.state === "armed") return this.fail(reason);
    return NONE;
  }

  private send(late: boolean): ContinuationDecision {
    this.state = "sent";
    this.diagnostics.outcome = "sent";
    this.diagnostics.late = late;
    this.diagnostics.elapsedAtSend = this.elapsed;
    this.diagnostics.wrapsAtSend = this.wraps;
    return { kind: "send", late };
  }

  private fail(reason: string): ContinuationDecision {
    if (this.state === "sent") {
      // Already handed to Live: the reason is kept for diagnostics only.
      if (this.diagnostics.reason === null) this.diagnostics.reason = `after_send:${reason}`;
      return NONE;
    }
    this.state = "cancelled";
    this.diagnostics.outcome = "cancelled";
    this.diagnostics.reason = reason;
    return { kind: "cancel", reason };
  }
}
