// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
(function (root) {
  'use strict';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
  const distance = (a, b) => ((a - b + 540) % 360) - 180;

  // Collect only producer events, never copies of a last-known UI value.
  // A suspended source starts a fresh window; bounded storage has no backlog.
  function createCollector(kind) {
    const duration = kind === 'sensors' ? 1000 : kind === 'audio' ? 5000 : 4000;
    const fields = kind === 'sensors' ? ['alpha', 'beta', 'gamma']
      : kind === 'audio' ? ['rms'] : ['light', 'clipped'];
    let samples = [];
    let first = null;
    let last = null;
    return {
      duration,
      add(sample, time) {
        const pending = { done: false, progress: first === null ? 0 : clamp((last - first) / duration, 0, 0.99) };
        if (!Number.isFinite(time) || (last !== null && time <= last)
          || !sample || fields.some((key) => !Number.isFinite(sample[key]))) return pending;
        if (kind === 'audio' && (sample.rms < 0 || sample.rms > 1)) return pending;
        if (kind === 'video' && (typeof sample.hand !== 'boolean'
          || sample.light < 0 || sample.light > 1 || sample.clipped < 0 || sample.clipped > 1)) return pending;
        if (last === null || time - last > (kind === 'video' ? 500 : 250)) {
          first = time;
          samples = [];
        }
        last = time;
        samples.push(sample);
        if (samples.length > 1024) samples.shift();
        if (time - first < duration || samples.length < (kind === 'sensors' ? 15 : 30)) {
          return { done: false, progress: clamp((time - first) / duration, 0, 0.99) };
        }
        const fail = (error) => ({ done: true, ok: false, error });
        if (kind === 'sensors') {
          const alpha = (Math.atan2(mean(samples.map(s => Math.sin(s.alpha * Math.PI / 180))),
            mean(samples.map(s => Math.cos(s.alpha * Math.PI / 180)))) * 180 / Math.PI + 360) % 360;
          const value = { alpha, beta: mean(samples.map(s => s.beta)), gamma: mean(samples.map(s => s.gamma)) };
          if (samples.some(s => Math.abs(distance(s.alpha, alpha)) > 2
            || Math.abs(s.beta - value.beta) > 2 || Math.abs(s.gamma - value.gamma) > 2)) return fail('moving');
          return { done: true, ok: true, value };
        }
        if (kind === 'audio') {
          const levels = samples.map(s => s.rms).sort((a, b) => a - b);
          const p95 = levels[Math.floor((levels.length - 1) * 0.95)];
          if (p95 < 0.003 || levels.filter(v => v >= 0.003).length / levels.length < 0.5) return fail('quiet');
          if (p95 >= 0.95) return fail('clipping');
          return { done: true, ok: true, value: { gain: clamp(0.75 / p95, 0.25, 8) } };
        }
        if (mean(samples.map(s => s.light)) < 0.12) return fail('dark');
        if (mean(samples.map(s => s.light)) > 0.85 || mean(samples.map(s => s.clipped)) > 0.3) return fail('bright');
        if (samples.filter(s => s.hand).length / samples.length < 0.8) return fail('hand');
        return { done: true, ok: true, value: {} };
      },
    };
  }

  // Only change advertised automatic modes with a readable previous setting.
  // No guessed camera controls, manual exposure value, or MediaPipe tuning.
  async function prepareCamera(track) {
    const unchanged = { changed: false, restore: async () => {} };
    if (!track?.getCapabilities || !track.getSettings || !track.applyConstraints) return unchanged;
    let caps, before;
    try { caps = track.getCapabilities(); before = track.getSettings(); } catch { return unchanged; }
    const patch = {};
    for (const key of ['exposureMode', 'focusMode']) {
      if (caps[key]?.includes('continuous') && typeof before[key] === 'string' && before[key] !== 'continuous') {
        patch[key] = 'continuous';
      }
    }
    if (!Object.keys(patch).length) return unchanged;
    const restore = async () => {
      if (track.readyState === 'ended') return;
      const current = track.getSettings();
      // Do not overwrite a subsequent manual setting made outside calibration.
      const owned = Object.fromEntries(Object.keys(patch).filter(key => current[key] === patch[key])
        .map(key => [key, before[key]]));
      if (Object.keys(owned).length) await track.applyConstraints({ advanced: [owned] });
    };
    try {
      await track.applyConstraints({ advanced: [patch] });
      const after = track.getSettings();
      if (Object.keys(patch).every(key => after[key] === patch[key])) return { changed: true, restore };
      await restore();
      return unchanged;
    } catch {
      // Partial browser application must also be undone; propagate rollback failure.
      await restore();
      return unchanged;
    }
  }

  function frameLight(video, context) {
    if (!video || video.readyState < 2 || !video.videoWidth) return null;
    context.drawImage(video, 0, 0, 32, 24);
    const { data } = context.getImageData(0, 0, 32, 24);
    let total = 0, clipped = 0;
    for (let i = 0; i < data.length; i += 4) {
      const luma = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      total += luma;
      if (luma > 0.97) clipped++;
    }
    return { light: total / (data.length / 4), clipped: clipped / (data.length / 4) };
  }
  root.CalibrationCore = { createCollector, prepareCamera, frameLight };
})(typeof window !== 'undefined' ? window : globalThis);
