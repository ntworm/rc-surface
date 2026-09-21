// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

export type TargetScale = 'auto' | 'linear' | 'geometric';

export type TargetFamily = 'device' | 'tempo' | 'mixer_volume' | 'mixer_pan' | 'mixer_send';

export interface TargetScaleDescriptor {
  requested?: TargetScale;
  min: number;
  max: number;
  name?: string;
  isQuantized?: boolean;
  family?: TargetFamily;
}

export function resolveTargetScale(
  descriptor: TargetScaleDescriptor,
): Exclude<TargetScale, 'auto'> {
  const requested = descriptor.requested ?? 'auto';
  const positive = descriptor.min > 0 && descriptor.max > 0;
  if (descriptor.isQuantized) return 'linear';
  if (requested === 'linear') return 'linear';
  if (requested === 'geometric') return positive ? 'geometric' : 'linear';
  if (descriptor.family && descriptor.family !== 'device') return 'linear';
  if (!positive) return 'linear';
  const targetName = descriptor.name ?? '';
  if (/(?:frequency|freq|cutoff|hz)/i.test(targetName)) return 'geometric';
  const low = Math.min(descriptor.min, descriptor.max);
  const high = Math.max(descriptor.min, descriptor.max);
  return high / low >= 100 ? 'geometric' : 'linear';
}

export function scaleTargetValue(
  normalized: number,
  min: number,
  max: number,
  isQuantized = false,
  scale: TargetScale = 'linear',
  name = '',
  family: TargetFamily = 'device',
): number {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : safeMin;
  const unit = Number.isFinite(normalized) ? Math.max(0, Math.min(1, normalized)) : 0;
  const low = Math.min(safeMin, safeMax);
  const high = Math.max(safeMin, safeMax);
  const resolvedScale = resolveTargetScale({
    requested: scale,
    min: safeMin,
    max: safeMax,
    name,
    isQuantized,
    family,
  });
  const useGeometric = resolvedScale === 'geometric';
  let scaled = useGeometric
    ? safeMin * Math.pow(safeMax / safeMin, unit)
    : safeMin + unit * (safeMax - safeMin);
  scaled = Math.max(low, Math.min(high, scaled));
  if (isQuantized) scaled = Math.max(low, Math.min(high, Math.round(scaled)));
  return scaled;
}

export function unscaleTargetValue(
  value: number,
  min: number,
  max: number,
  isQuantized = false,
  scale: TargetScale = 'linear',
  name = '',
  family: TargetFamily = 'device',
): number {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : safeMin;
  const low = Math.min(safeMin, safeMax);
  const high = Math.max(safeMin, safeMax);
  const safeValue = Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : safeMin;
  if (Math.abs(safeMax - safeMin) < Number.EPSILON) return 0;
  const resolvedScale = resolveTargetScale({
    requested: scale,
    min: safeMin,
    max: safeMax,
    name,
    isQuantized,
    family,
  });
  if (resolvedScale === 'geometric') {
    return Math.max(0, Math.min(1, Math.log(safeValue / safeMin) / Math.log(safeMax / safeMin)));
  }
  return Math.max(0, Math.min(1, (safeValue - safeMin) / (safeMax - safeMin)));
}
