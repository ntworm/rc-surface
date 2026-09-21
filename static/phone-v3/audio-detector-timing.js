// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
(function (root) {
  'use strict';
  // Beats are quarter notes, not note denominators: 1/16 = 0.25 beats.
  const KEYS = Object.freeze({ releaseMs: 'releaseBeats', toneMs: 'toneBeats', textureMs: 'textureBeats', bandsMs: 'bandsBeats' });
  const DIVISIONS = Object.freeze([128, 64, 32, 16, 8, 4, 2, 1].flatMap((denominator) =>
    [[1, ''], [2 / 3, ' T'], [3 / 2, ' D']].map(([factor, suffix]) => Object.freeze({
      beats: 4 / denominator * factor, label: '1/' + denominator + suffix,
    }))
  ).sort((a, b) => a.beats - b.beats));
  const NOTES = Object.freeze(DIVISIONS.map((entry) => entry.beats));
  const WITH_OFF = Object.freeze([0, ...NOTES]);
  const tempo = (bpm) => Number.isFinite(Number(bpm)) && Number(bpm) > 0
    ? Math.max(1, Math.min(1000, Number(bpm))) : 120;
  const steps = (key) => key === 'releaseMs' ? NOTES : WITH_OFF;
  // Only labels round. The DSP needs 1/128 T at high BPM below 10ms.
  const milliseconds = (beats, bpm) => beats * 60000 / tempo(bpm);
  const matching = (choices, beats) => typeof beats === 'number' && Number.isFinite(beats)
    ? choices.find((candidate) => Math.abs(candidate - beats) <= 1e-12) : undefined;

  function preferences(settings = {}, bpm = 120) {
    const result = {};
    for (const [key, preference] of Object.entries(KEYS)) {
      const choices = steps(key);
      const saved = settings?.[preference];
      const canonical = matching(choices, saved);
      if (canonical !== undefined) {
        result[preference] = canonical;
        continue;
      }
      // Migrate old millisecond-only preferences once. Do not silently turn
      // a nonzero smoothing time off just because it is shorter than a step.
      const raw = settings?.[key];
      const ms = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
        ? raw : key === 'releaseMs' ? 45 : 0;
      const candidates = key !== 'releaseMs' && ms <= 0 ? [0] : NOTES;
      result[preference] = candidates.reduce((best, candidate) =>
        Math.abs(milliseconds(candidate, bpm) - ms) < Math.abs(milliseconds(best, bpm) - ms) ? candidate : best);
    }
    return result;
  }

  function resolve(settings, clock = {}) {
    const result = { ...settings };
    if (clock.syncMode !== 'sync') return result;
    const selected = preferences(settings, clock.bpm);
    for (const [key, preference] of Object.entries(KEYS)) result[key] = milliseconds(selected[preference], clock.bpm);
    return result;
  }

  function label(beats, bpm) {
    if (beats === 0) return 'OFF';
    const canonical = matching(NOTES, beats);
    const division = DIVISIONS.find((entry) => entry.beats === canonical);
    return division ? division.label + ' · ' + Math.round(milliseconds(canonical, bpm)) + ' ms' : '--';
  }

  root.AudioDetectorTiming = Object.freeze({ KEYS, steps, preferences, resolve, label, divisions: () => DIVISIONS });
})(typeof window !== 'undefined' ? window : globalThis);
