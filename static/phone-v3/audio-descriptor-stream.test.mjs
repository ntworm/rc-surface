// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load(rate = 48000, settings) {
  const context = vm.createContext({});
  for (const file of ['audio-descriptors.js', 'audio-spectral-descriptors.js', 'audio-descriptor-stream.js']) {
    if (!fs.existsSync(new URL(file, import.meta.url))) continue;
    vm.runInContext(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), context);
  }
  return context.AudioDescriptorStream.create(rate, settings);
}

for (const rate of [44100, 48000, 96000, 192000]) {
  test('continuous stream consumes every sample with bounded cadence at ' + rate, () => {
    const stream = load(rate);
    assert.ok(rate / stream.size <= 120);
    const input = new Float32Array(128);
    const frames = [];
    let samples = 0;
    for (let block = 0; block < 40; block += 1) {
      samples += 128;
      const output = stream.push(input, samples / rate * 1000);
      if (output) frames.push(output);
    }
    assert.equal(frames.length, Math.floor(samples / stream.size));
    assert.ok(frames.every((f) => Object.values(f).every((v) => v === 0)));
  });
}

test('attacks at every offset including the old rAF gap survive continuous capture', () => {
  const stream = load();
  for (let offset = 0; offset < stream.size; offset += 1) {
    stream.reset();
    let last;
    // One window of silence first: the very first frame after a reset is the
    // reference, so capture start cannot flash every detector.
    for (let block = 0; block < stream.size; block += 128) stream.push(new Float32Array(128), (block + 128) / 48);
    for (let block = 0; block < stream.size; block += 128) {
      const input = new Float32Array(128);
      if (offset >= block && offset < block + 128) input[offset - block] = 1;
      last = stream.push(input, (stream.size + block + 128) / 48);
    }
    assert.ok(last.transient > 0, 'missing impulse at ' + offset);
    assert.ok(Object.values(last).every((v) => Number.isFinite(v) && v >= 0 && v <= 1));
  }
});

for (const rate of [44100, 48000, 96000, 192000]) {
  test('overlapping timbre window measures off-bin tone without delaying attacks at ' + rate, () => {
    const stream = load(rate);
    let latest;
    for (let start = 0; start < stream.size * 6; start += 128) {
      const input = Float32Array.from({ length: 128 }, (_, i) => 0.4 * Math.sin(2 * Math.PI * 997 * (start + i) / rate));
      const frame = stream.push(input, (start + 128) / rate * 1000);
      if (frame) latest = frame;
      if (start + 128 === stream.size) assert.ok(latest.transient > 0, 'attack must not wait for the timbre window');
    }
    assert.ok(Math.abs(latest.centroid * 20000 - 997) < 40, 'centroid should describe the actual tone');
    // Mid band is K-weighted loudness in LU mapped to 0..1; a sustained sine
    // sits inside the analysis band and reports a stable, finite unit value.
    assert.ok(Number.isFinite(latest.mid) && latest.mid > 0 && latest.mid <= 1,
      `mid band must be in (0, 1], got ${latest.mid}`);
    assert.ok(latest.flatness < 0.02, 'off-bin sine must not masquerade as noise');
    assert.ok(latest.flux < 0.01, 'phase movement is not a timbre change');
    assert.equal(Object.keys(latest).length, 12);
    stream.reset();
    for (let i = 0; i < stream.size * 2; i += 128) latest = stream.push(new Float32Array(128), i / rate * 1000) || latest;
    assert.ok(Object.values(latest).every((v) => v === 0));
  });
}

test('seeded noise reads as flat in dB while a tone reads as tonal, and K-weighted bands stay in [0, 1]', () => {
  const stream = load();
  let seed = 19;
  let frame;
  const flatness = [];
  const mids = [];
  for (let block = 0; block < 400; block++) {
    const input = Float32Array.from({ length: 128 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (seed / 4294967296 * 2 - 1) * .4;
    });
    frame = stream.push(input, (block + 1) * 128 / 48);
    if (frame && block > 10) {
      flatness.push(frame.flatness);
      mids.push(frame.mid);
    }
  }
  const mean = (values) => values.reduce((sum, x) => sum + x, 0) / values.length;
  // dB-mapped Wiener entropy: white noise is essentially flat (0 dB span) so
  // unit(1 + flatDb/60) ≈ 1. The old linear-domain test expected ~0.5.
  assert.ok(mean(flatness) > 0.85, 'noise-like power spectrum is broadband (dB flatness ≥ 0.85)');
  // K-weighted LU must stay inside the unit range for any sustained broadband input.
  assert.ok(mids.every((v) => Number.isFinite(v) && v >= 0 && v <= 1),
    'K-weighted mid band must stay in [0, 1]');
  // White noise of amplitude .4 produces a stable, mid-range unit value
  // (broadband K-weighted power sits between the floor and the ceiling).
  const meanMid = mean(mids);
  assert.ok(meanMid > 0.1 && meanMid < 0.9,
    `sustained white noise must read a mid-range K-weighted unit value, got ${meanMid.toFixed(3)}`);
});

test('stream spectrum distinguishes low and high attacks and resets its tail', () => {
  const stream = load();
  function tone(hz) {
    stream.reset();
    let frame;
    for (let start = 0; start < stream.size; start += 128) stream.push(new Float32Array(128), (start + 128) / 48);
    for (let start = stream.size; start < stream.size * 2; start += 128) {
      const input = Float32Array.from({ length: 128 }, (_, i) => 0.4 * Math.sin(2 * Math.PI * hz * (start + i) / 48000));
      frame = stream.push(input, (start + 128) / 48);
    }
    return frame;
  }
  const low = tone(93.75);
  const high = tone(3000);
  assert.ok(low.kick > low.snare);
  assert.ok(high.snare > high.kick);
  assert.ok(high.brightness > low.brightness);
  stream.reset();
  let silence;
  for (let i = 0; i < stream.size * 2; i += 128) silence = stream.push(new Float32Array(128), i / 48) || silence;
  assert.ok(Object.values(silence).every((v) => v === 0));
});

for (const rate of [48000, 96000]) {
  test('timbre descriptors stay zero until one complete window exists at ' + rate, () => {
    const stream = load(rate);
    const timbre = ['centroid', 'flux', 'flatness', 'spread', 'rolloff', 'low', 'mid', 'high'];
    const hops = [];
    for (let start = 0; start < stream.size * 2; start += 128) {
      const input = Float32Array.from({ length: 128 },
        (_, i) => 0.4 * Math.sin(2 * Math.PI * 997 * (start + i) / rate));
      const frame = stream.push(input, (start + 128) / rate * 1000);
      if (frame) hops.push(frame);
    }
    assert.equal(hops.length, 2);
    // A half-filled Hann buffer would describe zero padding, not the signal.
    for (const field of timbre) assert.equal(hops[0][field], 0, field + ' must wait for a full window');
    assert.ok(hops[0].transient >= 0, 'attacks still report during the timbre warmup');
    assert.ok(hops[1].mid > 0.2, 'the completed window reports the real band energy');
  });
}

function burstPeaks(stream, hz, { amplitude = 0.6, quietMs = 200, burstMs = 60, rate = 48000 } = {}) {
  const peaks = { transient: 0, kick: 0, snare: 0 };
  let sample = 0;
  const feed = (blocks, tone) => {
    for (let block = 0; block < blocks; block += 1) {
      const input = Float32Array.from({ length: 128 },
        (_, i) => tone ? amplitude * Math.sin(2 * Math.PI * hz * (sample + i) / rate) : 0);
      sample += 128;
      const frame = stream.push(input, sample / rate * 1000);
      if (frame && tone) for (const key of Object.keys(peaks)) peaks[key] = Math.max(peaks[key], frame[key]);
    }
  };
  feed(Math.round(quietMs * rate / 1000 / 128), false);
  feed(Math.round(burstMs * rate / 1000 / 128), true);
  return peaks;
}

test('attacks are detected inside their own band, not shared from one broadband onset', () => {
  const low = burstPeaks(load(48000), 80);
  const high = burstPeaks(load(48000), 5000);
  assert.ok(low.transient > 0.5, 'a burst is still an attack: ' + low.transient);
  assert.ok(high.transient > 0.5, 'a burst is still an attack: ' + high.transient);
  assert.ok(low.kick > 0.6, 'an 80 Hz burst must drive Kick, got ' + low.kick);
  assert.ok(low.snare < 0.2, 'an 80 Hz burst must leave Snare alone, got ' + low.snare);
  assert.ok(high.snare > 0.6, 'a 5 kHz burst must drive Snare, got ' + high.snare);
  assert.ok(high.kick < 0.2, 'a 5 kHz burst must leave Kick alone, got ' + high.kick);
});

function bedThenBurst(stream, hz, { bed = 0.12, hit = 0.6, quietMs = 400, burstMs = 60, rate = 48000 } = {}) {
  // A real hit lands on top of whatever is already playing. Only the band that
  // actually changed may claim the attack.
  let seed = 12345;
  const noise = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 1073741824 - 1; };
  const peaks = { transient: 0, kick: 0, snare: 0 };
  let sample = 0;
  const feed = (blocks, tone) => {
    for (let block = 0; block < blocks; block += 1) {
      const input = Float32Array.from({ length: 128 }, (_, i) => bed * noise()
        + (tone ? hit * Math.sin(2 * Math.PI * hz * (sample + i) / rate) : 0));
      sample += 128;
      const frame = stream.push(input, sample / rate * 1000);
      if (frame && tone) for (const key of Object.keys(peaks)) peaks[key] = Math.max(peaks[key], frame[key]);
    }
  };
  feed(Math.round(quietMs * rate / 1000 / 128), false);
  feed(Math.round(burstMs * rate / 1000 / 128), true);
  return peaks;
}

test('a hit over a broadband bed is claimed by the band that changed', () => {
  const low = bedThenBurst(load(48000), 80);
  const high = bedThenBurst(load(48000), 5000);
  assert.ok(low.kick > 0.5, 'low hit must drive Kick, got ' + low.kick.toFixed(3));
  assert.ok(low.kick > low.snare * 2.5,
    'low hit must not read as a snare: kick ' + low.kick.toFixed(3) + ' vs snare ' + low.snare.toFixed(3));
  assert.ok(high.snare > 0.5, 'high hit must drive Snare, got ' + high.snare.toFixed(3));
  assert.ok(high.snare > high.kick * 2.5,
    'high hit must not read as a kick: snare ' + high.snare.toFixed(3) + ' vs kick ' + high.kick.toFixed(3));
});

function hitOverBed(stream, make, { bed = 0.15, quietMs = 400, burstMs = 60, rate = 48000 } = {}) {
  let seed = 4242;
  const noise = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 1073741824 - 1; };
  const peaks = { transient: 0, kick: 0, snare: 0 };
  let sample = 0;
  const feed = (ms, hit) => {
    for (let block = 0; block < Math.round(ms * rate / 1000 / 128); block += 1) {
      const input = Float32Array.from({ length: 128 },
        (_, i) => bed * noise() + (hit ? make(sample + i, noise) : 0));
      sample += 128;
      const frame = stream.push(input, sample / rate * 1000);
      if (frame && hit) for (const key of Object.keys(peaks)) peaks[key] = Math.max(peaks[key], frame[key]);
    }
  };
  feed(quietMs, false);
  feed(burstMs, true);
  return peaks;
}
// A hit that starts on a step is a click, and a click is broadband by
// definition. Ramp it in so the test measures the band, not the edge.
const sineAt = (hz, amplitude, rate = 48000) => {
  let played = 0;
  const rampSamples = rate * 0.005;
  return (i) => {
    const gain = Math.min(1, played / rampSamples);
    played += 1;
    return amplitude * gain * Math.sin(2 * Math.PI * hz * i / rate);
  };
};

test('over a live mix, the band that gained energy is the one that fires', () => {
  // Same bed, same level, different place in the spectrum. Before this change
  // both hits raised Kick and Snare together, because one broadband onset was
  // simply weighted by each band's share of the mix.
  const hat = hitOverBed(load(48000), sineAt(6000, 0.5));
  const thump = hitOverBed(load(48000), sineAt(60, 0.5));
  assert.ok(hat.snare > hat.kick * 2,
    'crack: snare ' + hat.snare.toFixed(3) + ' must beat kick ' + hat.kick.toFixed(3));
  assert.ok(thump.kick > thump.snare * 2,
    'thump: kick ' + thump.kick.toFixed(3) + ' must beat snare ' + thump.snare.toFixed(3));
  assert.ok(hat.snare > 0.5 && thump.kick > 0.5, 'both hits must register');
});

test('transient keeps dynamics instead of pinning at full scale', () => {
  const soft = hitOverBed(load(48000), sineAt(300, 0.12));
  const loud = hitOverBed(load(48000), sineAt(300, 0.9));
  assert.ok(soft.transient > 0.05, 'a soft hit must still register, got ' + soft.transient.toFixed(3));
  assert.ok(soft.transient < 0.75, 'a soft hit must not read as full scale, got ' + soft.transient.toFixed(3));
  assert.ok(loud.transient - soft.transient > 0.2,
    'loud ' + loud.transient.toFixed(3) + ' must stand above soft ' + soft.transient.toFixed(3));
});


function feedTone(stream, { hz = 300, amplitude = 0.5, quietMs = 400, toneMs = 40, tailMs = 0, rate = 48000 } = {}) {
  let sample = 0;
  const frames = [];
  const feed = (ms, on) => {
    for (let block = 0; block < Math.round(ms * rate / 1000 / 128); block += 1) {
      const input = Float32Array.from({ length: 128 },
        (_, i) => on ? amplitude * Math.sin(2 * Math.PI * hz * (sample + i) / rate) : 0.02 * Math.sin(i));
      sample += 128;
      const frame = stream.push(input, sample / rate * 1000);
      if (frame) frames.push({ at: sample / rate * 1000, ...frame });
    }
  };
  feed(quietMs, false);
  feed(toneMs, true);
  if (tailMs) feed(tailMs, false);
  return frames;
}

test('release sets how long an attack takes to fall away', () => {
  const decay = (releaseMs) => {
    const frames = feedTone(load(48000, { releaseMs }), { tailMs: 300 });
    const peakIndex = frames.reduce((best, frame, index) => frame.transient > frames[best].transient ? index : best, 0);
    const peak = frames[peakIndex];
    const after = frames.find((frame) => frame.at >= peak.at + 150);
    return { peak: peak.transient, after: after.transient };
  };
  const fast = decay(10);
  const slow = decay(400);
  assert.ok(fast.peak > 0.4 && slow.peak > 0.4, 'both settings must still detect the hit');
  assert.ok(fast.after < 0.02, 'a 10 ms release is gone 150 ms later, got ' + fast.after.toFixed(3));
  assert.ok(slow.after > fast.after * 5,
    'a 400 ms release must still be audible: ' + slow.after.toFixed(3) + ' vs ' + fast.after.toFixed(3));
});

test('curve reshapes the middle of the range without moving its ends', () => {
  // A modest hit over a mix: exactly where a response curve is supposed to
  // matter. A hit that already saturates would prove nothing.
  const peakOf = (curve) => hitOverBed(load(48000, { curve }), sineAt(300, 0.09)).transient;
  const soft = peakOf(0.5);
  const hard = peakOf(2);
  assert.ok(soft > hard * 1.5, 'a log-ish curve must lift a moderate hit: ' + soft.toFixed(3) + ' vs ' + hard.toFixed(3));
  assert.ok(soft <= 1 && hard >= 0, 'the ends of the range stay put');
  const steady = hitOverBed(load(48000), () => 0).transient;
  assert.ok(steady < 0.35, 'steady material must not read as an attack, got ' + steady.toFixed(3));
});

test('sensitivity decides how small a change already counts', () => {
  const peakOf = (sensitivity) => hitOverBed(load(48000, { sensitivity }), sineAt(300, 0.07)).transient;
  const shy = peakOf(0.05);
  const eager = peakOf(0.95);
  assert.ok(eager > shy * 2, 'high sensitivity must react far more: ' + eager.toFixed(3) + ' vs ' + shy.toFixed(3));
});

test('group smoothing calms a curve without moving where it settles', () => {
  // Noise makes the band readings genuinely jump frame to frame; that is what
  // a smoothing control is for. Both raw and smoothed series need a long
  // warmup so the integrator (τ = 400 ms) and the smoother (τ = 150 ms) have
  // both settled before we measure wobble.
  const seriesOf = (bandsMs) => {
    const stream = load(48000, { bandsMs });
    let seed = 20260905;
    const noise = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 1073741824 - 1; };
    const series = [];
    for (let block = 0; block < 800; block += 1) {
      const input = Float32Array.from({ length: 128 }, () => 0.25 * noise());
      const frame = stream.push(input, (block + 1) * 128 / 48);
      // Skip the warmup: τ=150 ms ≈ 56 blocks at this hop; τ=400 ms ≈ 150 blocks.
      if (frame && block > 300) series.push(frame.mid);
    }
    return series;
  };
  const raw = seriesOf(0);
  const smooth = seriesOf(150);
  const wobble = (series) => {
    let sum = 0;
    for (let i = 1; i < series.length; i += 1) sum += Math.abs(series[i] - series[i - 1]);
    return sum / Math.max(1, series.length - 1);
  };
  assert.ok(wobble(smooth) < wobble(raw),
    'smoothing must calm the curve after warmup: ' + wobble(smooth).toFixed(4) + ' vs ' + wobble(raw).toFixed(4));
  const mean = (series) => series.reduce((sum, value) => sum + value, 0) / series.length;
  assert.ok(Math.abs(mean(smooth) - mean(raw)) < 0.05,
    'the level it settles at must not move: ' + mean(smooth).toFixed(3) + ' vs ' + mean(raw).toFixed(3));
});

test('window picks the analysis size and never breaks the message ceiling', () => {
  for (const [window, size] of [[1, 512], [2, 1024], [4, 2048]]) {
    const stream = load(48000, { window });
    assert.equal(stream.size, size);
    assert.ok(48000 / stream.size <= 120, 'the protocol ceiling holds at window ' + window);
  }
  assert.equal(load(48000, { window: 3 }).size, load(48000).size, 'an unsupported window keeps the default');
});

test('settings are clamped, never trusted', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(new URL('audio-descriptors.js', import.meta.url), 'utf8'), context);
  const { normalizeSettings, DEFAULT_SETTINGS } = context.AudioDescriptors;
  const wild = normalizeSettings({ sensitivity: 9, releaseMs: -4, curve: 99, window: 3, toneMs: 999999, textureMs: NaN, bandsMs: '80' });
  assert.equal(wild.sensitivity, 1);
  assert.equal(wild.releaseMs, 1.25); // DSP accepts 1/128 T at the supported 1000 BPM ceiling.
  assert.equal(wild.curve, 3);
  assert.equal(wild.window, DEFAULT_SETTINGS.window);
  assert.equal(wild.toneMs, 360000); // 1/1 D at the supported 1 BPM floor.
  assert.equal(wild.textureMs, DEFAULT_SETTINGS.textureMs);
  assert.equal(wild.bandsMs, 80);
  assert.deepEqual(Object.keys(normalizeSettings(null)).sort(), Object.keys(DEFAULT_SETTINGS).sort());
});

test('bands gain acts as a dB offset on the K-weighted loudness scale', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(new URL('audio-spectral-descriptors.js', import.meta.url), 'utf8'), context);
  const { LOUDNESS } = context.AudioSpectralDescriptors;
  // Direct GroupShaper test: gain=2 must add +6 dB in LU; gain=0.5 must add −6 dB.
  // We bypass the full stream and apply the shaper to synthetic band values.
  const { createSmoother } = loadDescriptorsModule();
  const shaper = createSmoother();
  const baseValues = { low: 0.5, mid: 0.5, high: 0.5,
    transient: 0, kick: 0, snare: 0, brightness: 0,
    centroid: 0.3, flux: 0.2, flatness: 0.4, spread: 0.25, rolloff: 0.35 };
  const settings = { attacksGain: 1, toneGain: 1, textureGain: 1, bandsGain: 1 };
  // gain = 1 → no change.
  shaper.apply({ ...baseValues }, 0, settings);
  // gain = 2 → +6 dB offset on bands group.
  const loud = { ...baseValues };
  shaper.apply(loud, 0, { ...settings, bandsGain: 2 });
  const expectedUp = 20 * Math.log10(2) / LOUDNESS.RANGE_DB;
  assert.ok(Math.abs(loud.mid - (baseValues.mid + expectedUp)) < 1e-6,
    `bandsGain=2 must add +${expectedUp.toFixed(4)} to mid, got ${(loud.mid - baseValues.mid).toFixed(6)}`);
  // gain = 0.5 → −6 dB offset on bands group.
  const quiet = { ...baseValues };
  shaper.apply(quiet, 0, { ...settings, bandsGain: 0.5 });
  const expectedDown = 20 * Math.log10(0.5) / LOUDNESS.RANGE_DB;
  assert.ok(Math.abs(quiet.mid - (baseValues.mid + expectedDown)) < 1e-6,
    `bandsGain=0.5 must add ${expectedDown.toFixed(4)} to mid, got ${(quiet.mid - baseValues.mid).toFixed(6)}`);
  // Clamping: gain=8 (+18 dB) saturates near 1.
  const maxed = { ...baseValues };
  shaper.apply(maxed, 0, { ...settings, bandsGain: 8 });
  assert.ok(maxed.mid <= 1, `gain=8 must clamp to ≤1, got ${maxed.mid}`);
  // Other groups still use multiplicative gain.
  const tGain = { ...baseValues };
  shaper.apply(tGain, 0, { ...settings, textureGain: 4 });
  assert.ok(Math.abs(tGain.flux - Math.min(1, baseValues.flux * 4)) < 1e-6,
    `textureGain must scale multiplicatively, got ${tGain.flux} vs ${baseValues.flux * 4}`);
});

function loadDescriptorsModule() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(new URL('audio-descriptors.js', import.meta.url), 'utf8'), context);
  return context.AudioDescriptors;
}

test('group gain scales what a group sends without touching physical readouts', () => {
  const bandsOf = (settings) => {
    const stream = load(48000, settings);
    let seed = 77777;
    const noise = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 1073741824 - 1; };
    let last = null;
    for (let block = 0; block < 200; block += 1) {
      const input = Float32Array.from({ length: 128 }, () => 0.05 * noise());
      last = stream.push(input, (block + 1) * 128 / 48) || last;
    }
    return last;
  };
  const plain = bandsOf({});
  // The bands group is now driven by K-weighted LU; a small noise floor reads
  // at a low unit value that is amplified by an additive dB offset, not by
  // a multiplicative factor. The physical readouts (centroid, rolloff, spread)
  // are still measurements and must not be touched by any group gain.
  const loud = bandsOf({ bandsGain: 4 });
  assert.ok(plain.mid >= 0 && plain.mid <= 1, 'baseline must read in [0,1]');
  assert.ok(loud.mid >= plain.mid - 0.01, 'bandsGain=4 must not attenuate the band');
  // Centroid, rolloff and spread are physical readings in Hz. Scaling them
  // would print a frequency the signal does not have.
  assert.equal(loud.centroid, plain.centroid, 'centroid is a measurement, not a level');
  assert.equal(loud.rolloff, plain.rolloff, 'rolloff is a measurement, not a level');
  assert.equal(loud.spread, plain.spread, 'spread is a measurement, not a level');
  const quiet = bandsOf({ bandsGain: 0.25 });
  assert.ok(quiet.mid <= plain.mid + 0.01, 'gain below 1 must not amplify');
  assert.equal(bandsOf({ bandsGain: 99 }).mid <= 1, true, 'gain can never leave 0..1');
});

test('stream forwards elapsedMs > 0 to the spectral processor so integration advances', () => {
  // The worklet (and the compatibility analyser) must tell the spectral
  // processor how much simulated time elapsed between frames. The processor
  // then integrates K-weighted band power with τ = 400 ms. Without elapsedMs
  // the bands would stay at the first-frame value forever.
  const stream = load(48000);
  let spectralSeenElapsedMs = -1;
  const originalSpectral = stream.spectral.process.bind(stream.spectral);
  stream.spectral.process = (frame) => {
    spectralSeenElapsedMs = frame.elapsedMs;
    return originalSpectral(frame);
  };
  // Push a few frames so the descriptor stream produces at least one output.
  for (let block = 0; block < stream.size * 2; block += 128) {
    stream.push(new Float32Array(128), (block + 128) / 48);
  }
  assert.ok(spectralSeenElapsedMs > 0,
    `spectral.process must receive elapsedMs > 0 once the stream runs, got ${spectralSeenElapsedMs}`);
});
