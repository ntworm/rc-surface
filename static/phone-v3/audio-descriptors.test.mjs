// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const SAMPLE_RATE = 48000;
const FFT_SIZE = 512;

function loadDescriptors() {
  const sourcePath = path.join(import.meta.dirname, 'audio-descriptors.js');
  const context = { window: null };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  return context.AudioDescriptors;
}

function spectrumWithBand(fromHz, toHz, activeDb = -6) {
  const bins = new Float32Array(FFT_SIZE / 2);
  bins.fill(-160);
  const hzPerBin = SAMPLE_RATE / FFT_SIZE;
  for (let i = 0; i < bins.length; i += 1) {
    const hz = i * hzPerBin;
    if (hz >= fromHz && hz <= toHz) bins[i] = activeDb;
  }
  return bins;
}

function impulse(amplitude = 1) {
  const samples = new Float32Array(FFT_SIZE);
  samples[0] = amplitude;
  return samples;
}

function process(processor, timeDomain, frequencyDb, frameTimeMs = 0) {
  return processor.process({
    timeDomain,
    frequencyDb,
    sampleRate: SAMPLE_RATE,
    fftSize: FFT_SIZE,
    frameTimeMs,
  });
}

test('silence resolves every public descriptor to zero', () => {
  const descriptors = loadDescriptors();
  const processor = descriptors.createProcessor();
  const result = process(
    processor,
    new Float32Array(FFT_SIZE),
    spectrumWithBand(0, 0, -160),
  );

  assert.deepEqual({ ...result }, {
    transient: 0,
    kick: 0,
    snare: 0,
    brightness: 0,
  });
});

test('an impulse rises on the same call and releases over the 45 ms tail', () => {
  const descriptors = loadDescriptors();
  const processor = descriptors.createProcessor();
  const active = process(processor, impulse(), spectrumWithBand(40, 180), 100);
  assert.ok(active.transient > 0, 'the first non-silent call must already contain the attack');

  const residual = new Float32Array(FFT_SIZE);
  residual.fill(0.0001);
  const release = process(processor, residual, spectrumWithBand(40, 180, -100), 145);
  assert.ok(release.transient > 0, 'a non-silent frame retains the short release tail');
  assert.ok(release.transient < active.transient * 0.5,
    `one 45 ms time constant should decay below half, got ${release.transient}/${active.transient}`);
});

test('digital silence keeps only the short pulse tail, then resolves to zero', () => {
  const descriptors = loadDescriptors();
  const processor = descriptors.createProcessor();
  const active = process(processor, impulse(), spectrumWithBand(40, 180), 100);
  const silentTime = new Float32Array(FFT_SIZE);
  const silentSpectrum = spectrumWithBand(0, 0, -160);
  const oneTau = process(processor, silentTime, silentSpectrum, 145);
  assert.ok(oneTau.transient > 0 && oneTau.transient < active.transient,
    'silence must not cut a pulse before its 45 ms release can be mapped');
  const settled = process(processor, silentTime, silentSpectrum, 400);
  assert.deepEqual({ ...settled }, {
    transient: 0,
    kick: 0,
    snare: 0,
    brightness: 0,
  });
});

test('a low-band onset scores kick over snare', () => {
  const descriptors = loadDescriptors();
  const result = process(
    descriptors.createProcessor(),
    impulse(),
    spectrumWithBand(40, 180),
  );
  assert.ok(result.kick > result.snare, `kick=${result.kick}, snare=${result.snare}`);
});

test('a low-frequency onset retains kick energy at a 96 kHz capture rate', () => {
  const spectrum = new Float32Array(FFT_SIZE / 2).fill(-160);
  // At 96 kHz the first non-DC bin spans 93.75..281.25 Hz. Its energy
  // overlaps the kick range even though its center is outside 40..180 Hz.
  spectrum[1] = -6;
  const result = loadDescriptors().createProcessor().process({
    timeDomain: impulse(), frequencyDb: spectrum,
    sampleRate: 96000, fftSize: FFT_SIZE, frameTimeMs: 0,
  });
  assert.ok(result.kick > 0.1, 'fractional low-band energy must survive high sample rates');
  assert.ok(result.kick > result.snare);
});

test('a broadband high-band onset scores snare over kick', () => {
  const descriptors = loadDescriptors();
  const result = process(
    descriptors.createProcessor(),
    impulse(),
    spectrumWithBand(1500, 8000),
  );
  assert.ok(result.snare > result.kick, `snare=${result.snare}, kick=${result.kick}`);
});

test('spectral centroid maps higher spectra to greater brightness', () => {
  const descriptors = loadDescriptors();
  const tone = new Float32Array(FFT_SIZE);
  tone.fill(0.1);
  const low = process(descriptors.createProcessor(), tone, spectrumWithBand(100, 300));
  const high = process(descriptors.createProcessor(), tone, spectrumWithBand(6000, 9000));
  assert.ok(high.brightness > low.brightness,
    `high=${high.brightness}, low=${low.brightness}`);
});

test('all outputs remain finite and normalized for hostile numeric input', () => {
  const descriptors = loadDescriptors();
  const time = new Float32Array([NaN, Infinity, -Infinity, 1e9]);
  const spectrum = new Float32Array([NaN, Infinity, -Infinity, 200, -200]);
  const result = descriptors.createProcessor().process({
    timeDomain: time,
    frequencyDb: spectrum,
    sampleRate: 0,
    fftSize: -1,
    frameTimeMs: NaN,
  });
  for (const [name, value] of Object.entries(result)) {
    assert.ok(Number.isFinite(value), `${name} must be finite`);
    assert.ok(value >= 0 && value <= 1, `${name}=${value} must stay in 0..1`);
  }
});

test('descriptor output has no pitch, gate or note-decision settings input', () => {
  const descriptors = loadDescriptors();
  const frame = {
    timeDomain: impulse(),
    frequencyDb: spectrumWithBand(40, 180),
    sampleRate: SAMPLE_RATE,
    fftSize: FFT_SIZE,
    frameTimeMs: 10,
  };
  const baseline = descriptors.createProcessor().process(frame);
  const withIrrelevantSettings = descriptors.createProcessor().process({
    ...frame,
    gateThreshold: 1,
    clarityFloor: 1,
    minNoteMs: 500,
    scaleRoot: 11,
    velocity: 1,
  });
  assert.deepEqual({ ...withIrrelevantSettings }, { ...baseline });
});
