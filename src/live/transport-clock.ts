// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
// Product bandwidth for editable control-rate automation, not an SDK throughput
// guarantee. Keep browser policy in controls.js in parity (covered by tests).
// Source: internal/LIVE-WRITE-CEILING-1.0.md, rule `maxHz(shape) = floor(teto_efetivo / minPointsPerCycle(shape))`.
// Measured 2026-09 on Windows 11; write-ceiling P04 (Live 12.4.5 + Automation Arm) pendente, fallback aplicado:
// teto_efetivo ~ 50 escritas/s, min pontos por ciclo = sine 10 / triangle 16 / ramp_up 16 / ramp_down 16 / square 4.
export const LFO_SHAPE_MAX_HZ = { sine: 4, triangle: 3, ramp_up: 3, ramp_down: 3, square: 12 } as const;
export function getLfoMaxHz(shape = 'sine'): number {
  return Object.hasOwn(LFO_SHAPE_MAX_HZ, shape)
    ? LFO_SHAPE_MAX_HZ[shape as keyof typeof LFO_SHAPE_MAX_HZ] : LFO_SHAPE_MAX_HZ.sine;
}
// Beat durations, slow to fast: straight, dotted and triplet subdivisions.
// 32 / 16 / 8 beats (8 / 4 / 2 bars at 4/4) added so SYNC can hold very long
// LFO cycles, and AUTO snaps to them at low rate / slow tempos.
export const LFO_SUBDIVISIONS = [
  32, 16, 8,
  4, 3, 8 / 3, 2, 1.5, 4 / 3, 1, 0.75, 2 / 3, 0.5,
  0.375, 1 / 3, 0.25, 0.1875, 1 / 6, 0.125, 0.09375, 1 / 12,
  0.0625, 0.046875, 1 / 24, 0.03125,
] as const;

export function getLfoSubdivision(rate: number, tempo: number, pinned?: number, shape = 'sine'): number {
  const maxHz = getLfoMaxHz(shape);
  const beatsPerSecond = (Number.isFinite(tempo) && tempo > 0 ? tempo : 120) / 60;
  const allowed = LFO_SUBDIVISIONS
    .filter(subdiv => beatsPerSecond / subdiv <= maxHz);
  const safeRate = Number.isFinite(rate) ? Math.max(0, Math.min(1, rate)) : 0;
  let subdiv = pinned !== undefined && Number.isFinite(pinned) && pinned > 0
    ? pinned : (allowed[Math.floor(safeRate * (allowed.length - 0.01))] ?? 4);
  // Slow down by octaves: preserve beat locking, including old fast presets.
  while (beatsPerSecond / subdiv > maxHz) subdiv *= 2;
  return subdiv;
}

// Bound the shortest swing half-step, including ratchets. SYNC slows by octaves.
export const STUTTER_SUBDIVISIONS = [1, 0.5, 0.25, 0.125, 0.0625, 0.03125];
export function getStutterSubdivisions(bps: number, ratchet: number, swing: number): number[] {
  const minimum = bps * ratchet / (15 * (1 - swing));
  const allowed = STUTTER_SUBDIVISIONS.filter(subdivision => subdivision >= minimum);
  if (allowed.length) return allowed;
  let slowest = 1;
  while (slowest < minimum) slowest *= 2;
  return [slowest];
}
export function getStutterTiming(rate: number, count: number, tempo: number, sync: boolean, pinned?: number, swing = 0) {
  const ratchet = [1, 2, 3, 4][Math.floor(Math.max(0, Math.min(1, count)) * 3.99)] ?? 1;
  const bps = (Number.isFinite(tempo) && tempo > 0 ? tempo : 120) / 60;
  const safeRate = Number.isFinite(rate) ? Math.max(0, Math.min(1, rate)) : 0;
  const safeSwing = Math.max(0, Math.min(.66, swing));
  const allowed = getStutterSubdivisions(bps, ratchet, safeSwing);
  let subdivision = pinned !== undefined && Number.isFinite(pinned) && pinned > 0
    ? pinned : allowed[Math.floor(safeRate * (allowed.length - .01))]!;
  const shortRatio = 1 - safeSwing;
  if (sync) while (bps * ratchet / subdivision / shortRatio > 15) subdivision *= 2;
  const frequency = sync ? bps * ratchet / subdivision : ratchet + safeRate * (15 - ratchet);
  return { subdivision, ratchet, frequency };
}

export function computeBeatPosition(
  currentSongTimeBeats: number,
  numerator: number
): { beat: number; bar: number; phase: number } {
  const validNumerator = (Number.isInteger(numerator) && numerator > 0) ? numerator : 4;
  const normalizedBeats = Math.max(0, currentSongTimeBeats);
  const beat = Math.floor(normalizedBeats) % validNumerator + 1;
  const bar = Math.floor(normalizedBeats / validNumerator) + 1;
  const phase = normalizedBeats % 1;
  return { beat, bar, phase };
}

export function computeSyncedLfoValue(
  shape: string,
  beats: number,
  frequencyBeats: number,
  phaseOffsetBeats: number
): number {
  // Guard against division-by-zero / NaN / negative frequency: any
  // non-finite or non-positive frequencyBeats collapses to phase 0 so
  // callers never see NaN/Infinity propagated into the LFO output.
  const safeFreq = Number.isFinite(frequencyBeats) && frequencyBeats > 0
    ? frequencyBeats
    : 1;
  const offsetBeats = beats + phaseOffsetBeats;
  const rawPhase = (offsetBeats / safeFreq) % 1;
  const phase = (rawPhase + 1) % 1; // Normalize to [0, 1)

  switch (shape) {
    case 'triangle':
      return phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
    case 'ramp_up':
      return 2 * phase - 1;
    case 'ramp_down':
      return 1 - 2 * phase;
    case 'square':
      return phase < 0.5 ? 1 : -1;
    case 'sine':
    default:
      return Math.sin(phase * 2 * Math.PI);
  }
}

export function computeSyncedStutterValue(
  beats: number,
  stepBeats: number,
  phaseOffsetBeats: number,
  swing: number, // 0 to 0.66
  ratchet: number // 1, 2, 3, 4
): boolean {
  const offsetBeats = beats + phaseOffsetBeats;
  const cycleBeats = 2 * stepBeats;
  const cycleTime = ((offsetBeats % cycleBeats) + cycleBeats) % cycleBeats;

  // Clamp swing to safe range
  const clampedSwing = Math.max(0, Math.min(0.66, swing));
  const split = stepBeats * (1 + clampedSwing);

  let t = 0;
  if (cycleTime < split) {
    t = cycleTime / split;
  } else {
    t = (cycleTime - split) / (cycleBeats - split);
  }

  // With t from [0, 1), check ratchet gating (gate is open for first 50% of the ratchet sub-step)
  const ratchetPhase = (t * ratchet) % 1;
  return ratchetPhase < 0.5;
}
