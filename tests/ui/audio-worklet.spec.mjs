// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';

test('real AudioWorklet loads local modules and detects audio with rAF disabled', async ({ page }) => {
  await page.goto('/?lang=en');
  const result = await page.evaluate(async () => {
    const feed = new AudioContext();
    await feed.resume();
    const tone = new OscillatorNode(feed, { frequency: 93.75 });
    const gain = new GainNode(feed, { gain: 0.4 });
    const destination = feed.createMediaStreamDestination();
    tone.connect(gain).connect(destination);
    tone.start();
    navigator.mediaDevices.getUserMedia = async () => destination.stream;
    const originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 1;
    const processor = new window.AudioProcessor();
    let timer;
    // The tone's onset is a broadband transient that saturates every attack
    // detector for a frame or two; on a slow CI host the first frame with
    // energy can still be that onset, where snare reads ~1.0 alongside kick.
    // Wait for a settled frame where the low-band kick dominates, which is the
    // property under test; the timeout is the real failure.
    const observed = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('No settled descriptor frame')), 8000);
      processor.onDescriptorUpdate = (value) => {
        if (value.kick > 0.01 && value.low > 0.1 && value.kick > value.snare && value.low > value.mid) resolve(value);
      };
    });
    try {
      await processor.start();
      const values = await observed;
      return { mode: processor.descriptorMode, values };
    } finally {
      clearTimeout(timer);
      processor.stop();
      window.requestAnimationFrame = originalRaf;
      tone.stop(); await feed.close();
    }
  });
  expect(result.mode).toBe('worklet');
  expect(result.values.kick).toBeGreaterThan(result.values.snare);
  expect(Object.keys(result.values)).toHaveLength(12);
  expect(result.values.low).toBeGreaterThan(result.values.mid);
});

test('real Blackman analyser calibration produces a K-weighted LU band reading above the floor for a known off-bin sine', async ({ page }) => {
  await page.goto('/?lang=en');
  const values = await page.evaluate(async () => {
    const context = new OfflineAudioContext(1, 48000, 48000);
    const tone = new OscillatorNode(context, { frequency: 997 });
    const gain = new GainNode(context, { gain: .4 });
    const analyser = new AnalyserNode(context, { fftSize: 1024, smoothingTimeConstant: 0 });
    const silent = new GainNode(context, { gain: 0 });
    tone.connect(gain).connect(analyser).connect(silent).connect(context.destination);
    tone.start();
    await context.startRendering();
    const frequencyDb = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(frequencyDb);
    return window.AudioSpectralDescriptors.createProcessor().process({
      frequencyDb, sampleRate: 48000, fftSize: 1024, powerCorrection: 1 / .3046,
    });
  });
  // centroid still maps the spectral peak; K-weighting does not change it.
  expect(Math.abs(values.centroid * 20000 - 997)).toBeLessThan(40);
  // With K-weighted BS.1770 LU mapped to [0,1] via FLOOR_LU=-50 / RANGE_DB=45,
  // a 997 Hz sine at 0.4 gain lands well above the floor (where pre-K RMS
  // would have given A/sqrt(2) ~= 0.283). Empirical value across runs:
  // 0.58..0.87 depending on bin leak / windowing alignment.
  expect(values.mid).toBeGreaterThan(0.40);
  expect(values.mid).toBeLessThan(0.95);
  expect(values.flatness).toBeLessThan(.02);
});

test('unavailable worklet is an explicit working compatibility fallback', async ({ page }) => {
  await page.goto('/?lang=en');
  const mode = await page.evaluate(async () => {
    const feed = new AudioContext();
    const destination = feed.createMediaStreamDestination();
    navigator.mediaDevices.getUserMedia = async () => destination.stream;
    const OriginalNode = window.AudioWorkletNode;
    window.AudioWorkletNode = undefined;
    const processor = new window.AudioProcessor();
    try { await processor.start(); return processor.descriptorMode; }
    finally { processor.stop(); window.AudioWorkletNode = OriginalNode; await feed.close(); }
  });
  expect(mode).toBe('compatibility');
});
