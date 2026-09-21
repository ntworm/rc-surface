// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Test/reference only. Never import this per-sample JS into a musical path.
const finite = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
export function createFastDetector({ sampleRate, settings = {} }) {
  if (!finite(sampleRate, 8000, 384000) || !settings || typeof settings !== 'object') throw Error('invalid_reference_settings');
  const limits = { sensitivity: [0, 1], releaseMs: [1.25, 360000], curve: [.3, 3] };
  for (const [key, value] of Object.entries(settings)) {
    if (!Object.hasOwn(limits, key) || !finite(value, ...limits[key])) throw Error('invalid_reference_settings');
  }
  const { sensitivity = .65, releaseMs = 45, curve = 1 } = settings;
  const af = Math.exp(-1 / (sampleRate * .001));
  const as = Math.exp(-1 / (sampleRate * .030));
  const ar = Math.exp(-1 / (sampleRate * releaseMs / 1000));
  const knee = .6 - .57 * sensitivity;
  let ef = 0, es = 0, previous = 0;
  return Object.freeze({
    push(left, right) {
      if (!Number.isFinite(left) || !Number.isFinite(right) || Math.abs(left) > 32 || Math.abs(right) > 32) {
        throw Error('invalid_reference_sample');
      }
      const energy = (left * left + right * right) / 2;
      ef = af * ef + (1 - af) * energy;
      es = as * es + (1 - as) * energy;
      const f = Math.sqrt(Math.max(0, ef)), s = Math.sqrt(Math.max(0, es));
      const contrast = Math.max(0, (f - s) / (f + s + 1e-8));
      const u = f < 1e-4 ? 0 : Math.min(1, Math.max(0, (contrast - knee) / (1 - knee)));
      const shaped = Math.pow(u, curve);
      previous = shaped >= previous ? shaped : shaped + (previous - shaped) * ar;
      return previous;
    },
    reset() { ef = 0; es = 0; previous = 0; },
  });
}
