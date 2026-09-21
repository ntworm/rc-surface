// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function processor() {
  const context = vm.createContext({});
  const file = new URL('audio-spectral-descriptors.js', import.meta.url);
  if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  assert.equal(typeof context.AudioSpectralDescriptors?.createProcessor, 'function', 'spectral processor must exist');
  return context.AudioSpectralDescriptors.createProcessor();
}
function frame(entries, gain = 1, options = {}) {
  const frequencyDb = new Float32Array(240).fill(-Infinity);
  for (const [bin, power] of entries) frequencyDb[bin] = 10 * Math.log10(power * gain * gain);
  const { elapsedMs = 0 } = options;
  return { frequencyDb, sampleRate: 48000, fftSize: 480, elapsedMs };
}
const near = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

test('centroid/spread use magnitude weights while rolloff uses cumulative 95 percent power', () => {
  const p = processor();
  const equal = p.process(frame([[10, 1], [30, 1]]));
  near(equal.centroid, 0.1); near(equal.spread, 0.1); near(equal.rolloff, 0.15);
  const weighted = p.process(frame([[10, 9], [30, 1]]));
  near(weighted.centroid, 0.075); near(weighted.spread, Math.sqrt(750000) / 10000);
  near(weighted.rolloff, 0.15);
  near(p.process(frame([[10, 99], [30, 1]])).rolloff, 0.05);
});
test('flatness distinguishes flat power distribution from a sparse tonal spectrum independently of gain', () => {
  const p = processor();
  const flat = Array.from({ length: 200 }, (_, i) => [i + 1, 0.0001]);
  near(p.process(frame(flat)).flatness, 1);
  near(p.process(frame(flat, 0.02)).flatness, 1);
  assert.equal(p.process(frame([[10, 0.1]])).flatness, 0);
});
test('normalized magnitude flux ignores gain but detects a complete spectrum relocation', () => {
  const p = processor();
  assert.equal(p.process(frame([[10, 0.09], [30, 0.01]])).flux, 0);
  near(p.process(frame([[10, 0.09], [30, 0.01]], 0.1)).flux, 0);
  near(p.process(frame([[100, 0.04]])).flux, 1);
  p.reset();
  assert.equal(p.process(frame([[100, 0.04]])).flux, 0);
});
test('band energies use disjoint K-weighted boundaries in BS.1770 LU (was: one-sided RMS)', () => {
  const p = processor();
  // 100 Hz only -> mid = high = 0, low > 0. Boundary [20, 250).
  const low100 = p.process(frame([[1, 0.02]]));
  assert.equal(low100.mid, 0, '100 Hz must not enter mid');
  assert.equal(low100.high, 0, '100 Hz must not enter high');
  assert.ok(low100.low > 0, '100 Hz must enter low');
  // 1 kHz only -> low = high = 0, mid > 0. Boundary [250, 2000).
  const mid1k = p.process(frame([[10, 0.02]]));
  assert.equal(mid1k.low, 0, '1 kHz must not enter low');
  assert.equal(mid1k.high, 0, '1 kHz must not enter high');
  assert.ok(mid1k.mid > 0, '1 kHz must enter mid');
  // 5 kHz only -> low = mid = 0, high > 0. Boundary [2000, 20000].
  const high5k = p.process(frame([[50, 0.02]]));
  assert.equal(high5k.low, 0, '5 kHz must not enter low');
  assert.equal(high5k.mid, 0, '5 kHz must not enter mid');
  assert.ok(high5k.high > 0, '5 kHz must enter high');
  // Disjoint boundary: 250 Hz -> low, 251 Hz -> mid.
  const at250 = p.process(frame([[2, 0.02], [3, 0]]));
  assert.ok(at250.low > 0, '250 Hz is in low');
  assert.equal(at250.mid, 0, '250 Hz is not in mid');
});
test('silence, DC, malformed geometry and invalid powers cannot create descriptors or retain flux', () => {
  const p = processor();
  for (const input of [frame([]), frame([[0, 1]]), { ...frame([[10, 1]]), sampleRate: 0 },
    { ...frame([[10, 1]]), fftSize: NaN }, { frequencyDb: [NaN, Infinity], sampleRate: 48000, fftSize: 4 }]) {
    p.process(frame([[10, 1]]));
    const result = p.process(input);
    assert.equal(Object.keys(result).length, 8);
    assert.ok(Object.values(result).every((v) => v === 0));
  }
  assert.equal(p.process(frame([[30, 1]])).flux, 0);
});

// ─── Loudness per band + dB flatness ───────────────────────────────────────

const { kWeightingPower, LOUDNESS } = (() => {
  const context = vm.createContext({});
  const file = new URL('audio-spectral-descriptors.js', import.meta.url);
  if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  return context.AudioSpectralDescriptors;
})();

test('K-weighting table: 1 kHz near 0 dB, 10 kHz boosted, 30 Hz attenuated', () => {
  const k1k = kWeightingPower(1000);
  const k10k = kWeightingPower(10000);
  const k30 = kWeightingPower(30);
  // The shelf transition starts below 1 kHz, so |H_K(1 kHz)|^2 is ~+0.7 dB
  // (≈ 1.17), not exactly 0 dB. ±2 dB covers the actual BS.1770-4 response.
  const k1kDb = 10 * Math.log10(k1k);
  assert.ok(Math.abs(k1kDb) < 2, `|H_K(1kHz)|^2 must be within ±2 dB of 0 dB, got ${k1kDb.toFixed(2)} dB`);
  assert.ok(k10k >= 2.2, `|H_K(10kHz)|^2 must be ≥ 2.2 (~+4 dB shelf), got ${k10k}`);
  assert.ok(k30 <= 0.25, `|H_K(30Hz)|^2 must be ≤ 0.25 (high-pass attenuation), got ${k30}`);
});
test('LOUDNESS constants are frozen and documented', () => {
  assert.equal(typeof LOUDNESS, 'object');
  assert.equal(LOUDNESS.RANGE_DB, 45);
  assert.equal(LOUDNESS.CEIL_LU, -5);
  assert.equal(LOUDNESS.TAU_MS, 400);
  assert.ok(Object.isFrozen(LOUDNESS));
});
test('pink noise K-weighted produces balanced bands within ±0.08 after convergence', () => {
  // K-balanced spectrum: equal total K-weighted power per band.
  // Test passes the spirit of "pink noise at -20 dBFS" by being perceptually flat.
  const frequencyDb = new Float32Array(240).fill(-Infinity);
  const step = 100; // 48000/480
  const N = { low: 0, mid: 0, high: 0 };
  for (let i = 1; i < 240; i++) {
    const hz = i * step;
    if (hz < 250) N.low += 1;
    else if (hz < 2000) N.mid += 1;
    else if (hz <= 20000) N.high += 1;
  }
  const P_TARGET = 0.01;
  for (let i = 1; i < 240; i++) {
    const hz = i * step;
    let band;
    if (hz < 250) band = 'low';
    else if (hz < 2000) band = 'mid';
    else if (hz <= 20000) band = 'high';
    if (!band) continue;
    const kw = kWeightingPower(hz);
    if (kw <= 0) continue;
    frequencyDb[i] = 10 * Math.log10(P_TARGET / (N[band] * kw));
  }
  const p = processor();
  let result;
  for (let i = 0; i < 200; i++) result = p.process({ frequencyDb, sampleRate: 48000, fftSize: 480, elapsedMs: 10 });
  assert.ok(Math.abs(result.low - result.mid) <= 0.08, `|low - mid|=${Math.abs(result.low - result.mid)} > 0.08`);
  assert.ok(Math.abs(result.mid - result.high) <= 0.08, `|mid - high|=${Math.abs(result.mid - result.high)} > 0.08`);
});
test('log mapping: ×4 power raises each band by 6/RANGE_DB after convergence', () => {
  const spectrum = (scale) => {
    const frequencyDb = new Float32Array(240).fill(-Infinity);
    // Three tones at 100 Hz, 1 kHz, 5 kHz.
    frequencyDb[1] = 10 * Math.log10(0.01 * scale); // 100 Hz
    frequencyDb[10] = 10 * Math.log10(0.01 * scale); // 1 kHz
    frequencyDb[50] = 10 * Math.log10(0.01 * scale); // 5 kHz
    return frequencyDb;
  };
  const p1 = processor();
  let r1;
  for (let i = 0; i < 200; i++) r1 = p1.process({ frequencyDb: spectrum(1), sampleRate: 48000, fftSize: 480, elapsedMs: 10 });
  const p2 = processor();
  let r2;
  for (let i = 0; i < 200; i++) r2 = p2.process({ frequencyDb: spectrum(4), sampleRate: 48000, fftSize: 480, elapsedMs: 10 });
  const expected = 6 / LOUDNESS.RANGE_DB; // +6 dB in LU, mapped to unit
  assert.ok(Math.abs(r2.low - r1.low - expected) < 0.005,
    `low band: ${r2.low - r1.low} vs expected ${expected}`);
  assert.ok(Math.abs(r2.mid - r1.mid - expected) < 0.005,
    `mid band: ${r2.mid - r1.mid} vs expected ${expected}`);
  assert.ok(Math.abs(r2.high - r1.high - expected) < 0.005,
    `high band: ${r2.high - r1.high} vs expected ${expected}`);
});
test('K-weighting: 1 kHz vs 100 Hz same amplitude, mid exceeds low', () => {
  const p = processor();
  const tone = (bin) => {
    const frequencyDb = new Float32Array(240).fill(-Infinity);
    frequencyDb[bin] = 10 * Math.log10(0.01);
    return frequencyDb;
  };
  let r100;
  for (let i = 0; i < 200; i++) r100 = p.process({ frequencyDb: tone(1), sampleRate: 48000, fftSize: 480, elapsedMs: 10 });
  p.reset();
  let r1k;
  for (let i = 0; i < 200; i++) r1k = p.process({ frequencyDb: tone(10), sampleRate: 48000, fftSize: 480, elapsedMs: 10 });
  // 100 Hz: only low is non-zero. 1 kHz: only mid is non-zero.
  assert.equal(r100.mid, 0, '100 Hz does not land in mid');
  assert.equal(r1k.low, 0, '1 kHz does not land in low');
  // K-weighting boosts mid (K(1k) ≈ 1) over low (K(100) ≈ 0.39).
  // Difference in unit value = 10·log10(K(1k)/K(100))/RANGE_DB.
  const expectedDiff = 10 * Math.log10(kWeightingPower(1000) / kWeightingPower(100)) / LOUDNESS.RANGE_DB;
  const observedDiff = r1k.mid - r100.low;
  assert.ok(Math.abs(observedDiff - expectedDiff) < 0.01,
    `mid(1k) - low(100) = ${observedDiff} vs expected ${expectedDiff}`);
});
test('integration is frame-rate independent: 10 ms and 50 ms frames converge identically', () => {
  const signalFrame = (elapsedMs) => {
    const frequencyDb = new Float32Array(240).fill(-Infinity);
    frequencyDb[10] = 10 * Math.log10(0.02); // 1 kHz tone, -17 dBFS per bin
    return { frequencyDb, sampleRate: 48000, fftSize: 480, elapsedMs };
  };
  const silentFrame = (elapsedMs) => {
    const frequencyDb = new Float32Array(240).fill(-Infinity);
    return { frequencyDb, sampleRate: 48000, fftSize: 480, elapsedMs };
  };
  // Long run at 10 ms frames.
  const long10 = processor();
  for (let i = 0; i < 10; i++) long10.process(silentFrame(10));
  let rLong10;
  for (let i = 0; i < 500; i++) rLong10 = long10.process(signalFrame(10));
  // Long run at 50 ms frames.
  const long50 = processor();
  for (let i = 0; i < 10; i++) long50.process(silentFrame(10));
  let rLong50;
  for (let i = 0; i < 100; i++) rLong50 = long50.process(signalFrame(50));
  // Both must reach the same asymptote.
  assert.ok(Math.abs(rLong10.mid - rLong50.mid) < 0.01,
    `frame-rate independence: 10 ms=${rLong10.mid}, 50 ms=${rLong50.mid}`);
  // 400 ms simulated time at 10 ms frames = 40 frames.
  const tau10 = processor();
  for (let i = 0; i < 10; i++) tau10.process(silentFrame(10));
  let rTau10;
  for (let i = 0; i < 40; i++) rTau10 = tau10.process(signalFrame(10));
  // 400 ms simulated time at 50 ms frames = 8 frames.
  const tau50 = processor();
  for (let i = 0; i < 10; i++) tau50.process(silentFrame(10));
  let rTau50;
  for (let i = 0; i < 8; i++) rTau50 = tau50.process(signalFrame(50));
  assert.ok(Math.abs(rTau10.mid - rTau50.mid) < 0.01,
    `frame-rate independence at 1 τ: 10 ms=${rTau10.mid}, 50 ms=${rTau50.mid}`);
  // Time constant: in LU domain, 1 τ is exactly -1.993 dB below asymptote.
  // In unit value: value(τ) = value(∞) - 1.993 / RANGE_DB.
  const offset = 1.993 / LOUDNESS.RANGE_DB;
  assert.ok(Math.abs(rLong10.mid - rTau10.mid - offset) < 0.02,
    `time constant match: offset = ${rLong10.mid - rTau10.mid} vs expected ${offset}`);
  // 2 s simulated time (200 frames at 10 ms) must be ≥ 99% of asymptote in unit value.
  const twoSec = processor();
  for (let i = 0; i < 10; i++) twoSec.process(silentFrame(10));
  let r2s;
  for (let i = 0; i < 200; i++) r2s = twoSec.process(signalFrame(10));
  assert.ok(r2s.mid >= rLong10.mid * 0.99,
    `2 s converges: ${r2s.mid} vs ${rLong10.mid}`);
});
test('flatness in dB: white noise ≥ 0.85, pure sine ≤ 0.15, zero-power bin does not zero the frame', () => {
  const p = processor();
  // White noise: random power per bin.
  const white = new Float32Array(240).fill(-Infinity);
  let seed = 1;
  for (let i = 1; i < 200; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const r = (seed / 0x7fffffff) * 0.01 + 0.001;
    white[i] = 10 * Math.log10(r);
  }
  const whiteResult = p.process({ frequencyDb: white, sampleRate: 48000, fftSize: 480 });
  assert.ok(whiteResult.flatness >= 0.85, `white noise flatness ${whiteResult.flatness} should be ≥ 0.85`);
  // Pure sine: all power in one bin.
  const sine = new Float32Array(240).fill(-Infinity);
  sine[10] = 10 * Math.log10(0.1);
  const sineResult = p.process({ frequencyDb: sine, sampleRate: 48000, fftSize: 480 });
  assert.ok(sineResult.flatness <= 0.15, `pure sine flatness ${sineResult.flatness} should be ≤ 0.15`);
  // Zero-power bin must not zero the frame.
  const whiteWithZero = new Float32Array(white);
  whiteWithZero[50] = -Infinity;
  const withZeroResult = p.process({ frequencyDb: whiteWithZero, sampleRate: 48000, fftSize: 480 });
  assert.ok(Math.abs(withZeroResult.flatness - whiteResult.flatness) < 0.01,
    `zero-power bin must not zero the frame: ${withZeroResult.flatness} vs ${whiteResult.flatness}`);
});
