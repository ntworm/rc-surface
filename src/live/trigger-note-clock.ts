// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0

export type NoteTiming = 'immediate' | 'beat' | 'bar';
export type NoteGate = 'hold' | 'pulse';
export type NoteDurationMode = 'ms' | 'grid';
export const NOTE_DURATION_BARS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4] as const;

export interface TriggerClockSnapshot {
  valid: boolean;
  playing: boolean;
  beat: number;
  bpm: number;
  beatsPerBar: number;
  epoch: number;
  reason?: string;
}

export function nextTriggerBeat(beat: number, timing: 'beat' | 'bar', beatsPerBar: number): number {
  const grid = timing === 'bar' ? Math.max(0.25, beatsPerBar) : 1;
  return (Math.floor(beat / grid + 1e-9) + 1) * grid;
}

export function resolveGridDurationMs(
  bars: number,
  clock: Pick<TriggerClockSnapshot, 'valid' | 'bpm' | 'beatsPerBar'>,
): number | null {
  if (!clock.valid || !NOTE_DURATION_BARS.includes(bars as typeof NOTE_DURATION_BARS[number])
    || !Number.isFinite(clock.bpm) || clock.bpm <= 0
    || !Number.isFinite(clock.beatsPerBar) || clock.beatsPerBar <= 0) return null;
  const duration = bars * clock.beatsPerBar * 60_000 / clock.bpm;
  return duration >= 20 && duration <= 120_000 ? duration : null;
}

export function resolveTriggerNoteOptions(target: {
  noteTiming?: unknown;
  noteGate?: unknown;
  noteDurationMs?: unknown;
  noteDurationMode?: unknown;
  noteDurationBars?: unknown;
}): { timing: NoteTiming; gate: NoteGate; durationMs: number; durationMode: NoteDurationMode; durationBars?: number; valid: boolean; error?: string } {
  const rawTiming = target.noteTiming ?? 'immediate';
  const rawGate = target.noteGate ?? 'hold';
  const rawDuration = target.noteDurationMs ?? 80;
  const rawMode = target.noteDurationMode ?? 'ms';
  const rawBars = target.noteDurationBars ?? 0.25;

  if (rawTiming !== 'immediate' && rawTiming !== 'beat' && rawTiming !== 'bar') {
    return {
      timing: 'immediate',
      gate: 'hold',
      durationMs: 80,
      durationMode: 'ms',
      valid: false,
      error: `Invalid noteTiming: ${String(rawTiming)}`,
    };
  }
  if (rawGate !== 'hold' && rawGate !== 'pulse') {
    return {
      timing: rawTiming,
      gate: 'hold',
      durationMs: 80,
      durationMode: 'ms',
      valid: false,
      error: `Invalid noteGate: ${String(rawGate)}`,
    };
  }
  if (rawMode !== 'ms' && rawMode !== 'grid') {
    return { timing: rawTiming, gate: rawGate, durationMs: 80, durationMode: 'ms', valid: false,
      error: `Invalid noteDurationMode: ${String(rawMode)}` };
  }
  if (rawMode === 'grid' && (rawGate !== 'pulse' || !NOTE_DURATION_BARS.includes(rawBars as typeof NOTE_DURATION_BARS[number]))) {
    return { timing: rawTiming, gate: rawGate, durationMs: 80, durationMode: 'grid', valid: false,
      error: `Invalid noteDurationBars or gate: ${String(rawBars)}. Grid requires pulse.` };
  }
  if (
    typeof rawDuration !== 'number'
    || !Number.isInteger(rawDuration)
    || rawDuration < 20
    || rawDuration > 2000
  ) {
    return {
      timing: rawTiming,
      gate: rawGate,
      durationMs: 80,
      durationMode: rawMode,
      valid: false,
      error: `Invalid noteDurationMs: ${String(rawDuration)}. Must be an integer between 20 and 2000 ms.`,
    };
  }
  if (rawTiming !== 'immediate' && rawGate === 'hold') {
    return {
      timing: rawTiming,
      gate: rawGate,
      durationMs: rawDuration,
      durationMode: rawMode,
      valid: false,
      error: `Synchronized timing (${rawTiming}) cannot be combined with hold gate; use pulse.`,
    };
  }
  return { timing: rawTiming, gate: rawGate, durationMs: rawDuration,
    durationMode: rawMode, ...(rawMode === 'grid' ? { durationBars: rawBars as number } : {}), valid: true };
}

const defaultNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

export class TriggerNoteClock {
  private now: () => number;
  private epoch: number = 0;
  private playing: boolean = false;
  private connected: boolean = false;
  private observedThisConnection: boolean = false;
  private anchorBeat: number = -1;
  private anchorTimeMs: number = 0;
  private lastObservedTimeMs: number = 0;
  private bpm: number = 120;
  private numerator: number = 4;
  private denominator: number = 4;
  private invalidatedReason: string | null = null;

  constructor(now: () => number = defaultNow) {
    this.now = now;
  }

  public observePosition(beat: number, bpm: number, numerator: number, denominator: number = 4): void {
    const currentTime = this.now();

    if (this.observedThisConnection && (this.numerator !== numerator || this.denominator !== denominator)) {
      this.epoch += 1;
    }
    this.numerator = numerator;
    this.denominator = denominator;

    if (this.observedThisConnection && this.anchorBeat >= 0) {
      const elapsedSec = Math.max(0, (currentTime - this.anchorTimeMs) / 1000);
      const beatsAdvanced = this.playing ? elapsedSec * (this.bpm / 60) : 0;
      const expectedBeat = this.anchorBeat + beatsAdvanced;
      const deviation = Math.abs(beat - expectedBeat);

      if (deviation > 0.25) {
        this.epoch += 1;
      }
    }

    this.anchorBeat = beat;
    this.anchorTimeMs = currentTime;
    this.lastObservedTimeMs = currentTime;
    this.bpm = bpm;
    this.observedThisConnection = true;
    this.invalidatedReason = null;
  }

  public updateTransport(
    playing: boolean,
    connected: boolean,
    bpm: number,
    numerator: number,
    denominator: number
  ): void {
    const currentTime = this.now();

    if (this.connected !== connected) {
      this.epoch += 1;
      this.connected = connected;
      this.observedThisConnection = false;
      this.anchorBeat = -1;
      this.invalidatedReason = connected ? 'unobserved' : 'disconnected';
    }

    if (this.playing !== playing) {
      this.epoch += 1;
      this.playing = playing;
      if (!playing) {
        this.invalidatedReason = 'stopped';
      } else {
        if (this.anchorBeat >= 0) {
          this.anchorTimeMs = currentTime;
        }
        this.invalidatedReason = null;
      }
    }

    if (this.observedThisConnection && (this.numerator !== numerator || this.denominator !== denominator)) {
      this.epoch += 1;
    }
    this.numerator = numerator;
    this.denominator = denominator;

    if (bpm !== this.bpm) {
      if (this.observedThisConnection && this.anchorBeat >= 0) {
        const elapsedSec = Math.max(0, (currentTime - this.anchorTimeMs) / 1000);
        const advanced = this.playing ? elapsedSec * (this.bpm / 60) : 0;
        this.anchorBeat += advanced;
        this.anchorTimeMs = currentTime;
      }
      this.bpm = bpm;
    }
  }

  public invalidate(reason: string): void {
    this.invalidatedReason = reason;
    this.epoch += 1;
  }

  public snapshot({ allowStopped = false }: { allowStopped?: boolean } = {}): TriggerClockSnapshot {
    const currentTime = this.now();
    const beatsPerBar = this.numerator > 0 && this.denominator > 0 ? (this.numerator * 4) / this.denominator : 4;

    if (!this.connected) {
      return { valid: false, playing: false, beat: 0, bpm: this.bpm, beatsPerBar, epoch: this.epoch, reason: 'disconnected' };
    }
    if (!this.playing && !allowStopped) {
      return { valid: false, playing: false, beat: 0, bpm: this.bpm, beatsPerBar, epoch: this.epoch, reason: 'stopped' };
    }
    if (!this.observedThisConnection) {
      return { valid: false, playing: this.playing, beat: 0, bpm: this.bpm, beatsPerBar, epoch: this.epoch, reason: 'unobserved' };
    }

    const ageMs = currentTime - this.lastObservedTimeMs;
    // A stopped position is stationary, so its age cannot invalidate duration
    // metadata. Connection resets discard it; tempo/meter updates stay live.
    if (ageMs > 1000 && (this.playing || !allowStopped)) {
      return { valid: false, playing: this.playing, beat: 0, bpm: this.bpm, beatsPerBar, epoch: this.epoch, reason: 'stale' };
    }
    if (!Number.isFinite(this.bpm) || this.bpm <= 0) {
      return { valid: false, playing: this.playing, beat: 0, bpm: this.bpm, beatsPerBar, epoch: this.epoch, reason: 'invalid_bpm' };
    }
    if (!Number.isFinite(this.numerator) || !Number.isFinite(this.denominator) || this.numerator <= 0 || this.denominator <= 0) {
      return { valid: false, playing: this.playing, beat: 0, bpm: this.bpm, beatsPerBar, epoch: this.epoch, reason: 'invalid_signature' };
    }
    if (this.invalidatedReason && !(allowStopped && this.invalidatedReason === 'stopped')) {
      return { valid: false, playing: this.playing, beat: 0, bpm: this.bpm, beatsPerBar, epoch: this.epoch, reason: this.invalidatedReason };
    }

    const elapsedSec = Math.max(0, (currentTime - this.anchorTimeMs) / 1000);
    const currentBeat = this.anchorBeat + (this.playing ? elapsedSec * (this.bpm / 60) : 0);

    if (currentBeat < 0) {
      return { valid: false, playing: this.playing, beat: currentBeat, bpm: this.bpm, beatsPerBar, epoch: this.epoch, reason: 'count_in' };
    }

    return { valid: true, playing: this.playing, beat: currentBeat, bpm: this.bpm, beatsPerBar, epoch: this.epoch };
  }
}
