// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load() {
  const context = vm.createContext({});
  for (const file of ['audio-descriptors.js', 'audio-detector-timing.js']) {
    const url = new URL(file, import.meta.url);
    if (fs.existsSync(url)) vm.runInContext(fs.readFileSync(url, 'utf8'), context);
  }
  assert.ok(context.AudioDetectorTiming, 'descriptor timing must have its own SYNC resolver');
  return context;
}

test('note divisions resolve at Live tempo without overwriting FREE milliseconds', () => {
  const { AudioDetectorTiming: timing } = load();
  const settings = { releaseMs: 65, toneMs: 75, textureMs: 55, bandsMs: 0,
    releaseBeats: 4, toneBeats: 1, textureBeats: .5, bandsBeats: 0 };
  const synced = timing.resolve(settings, { syncMode: 'sync', bpm: 120 });
  assert.equal(synced.releaseMs, 2000);
  assert.equal(synced.toneMs, 500);
  assert.equal(synced.textureMs, 250);
  assert.equal(synced.bandsMs, 0);
  assert.equal(timing.resolve(settings, { syncMode: 'sync', bpm: 30 }).releaseMs, 8000);
  assert.equal(timing.resolve(settings, { syncMode: 'sync', bpm: 60 }).toneMs, 1000);
  assert.equal(timing.resolve(settings, { syncMode: 'free', bpm: 60 }).releaseMs, 65);
  assert.equal(settings.toneMs, 75);
  assert.equal(timing.label(.25, 120), '1/16 · 125 ms');
  assert.equal(timing.label(1, 120), '1/4 · 500 ms');
  assert.equal(timing.label(4, 120), '1/1 · 2000 ms');
  assert.equal(timing.label(0, 120), 'OFF');
});

test('old preferences gain valid musical choices while silence bypass stays OFF', () => {
  const { AudioDetectorTiming: timing } = load();
  const prefs = timing.preferences({ releaseMs: 65, toneMs: 200, textureMs: 0, bandsMs: 0 }, 120);
  assert.equal(prefs.releaseBeats, .125);
  assert.equal(prefs.toneBeats, .375);
  assert.equal(prefs.textureBeats, 0);
  assert.equal(prefs.bandsBeats, 0);
  assert.equal(timing.preferences({ releaseBeats: 0, releaseMs: 65 }).releaseBeats, .125);
  assert.equal(timing.preferences({ toneBeats: .37, toneMs: 0 }).toneBeats, 0);
  assert.equal(timing.resolve({ ...prefs, releaseMs: 65 }, { syncMode: 'sync', bpm: NaN }).releaseMs, 62.5);
});

test('new or invalid saved times migrate from the 45ms FREE default, not artificial zero', () => {
  const { AudioDetectorTiming: timing } = load();
  for (const patch of [null, undefined, {}, { releaseMs: NaN }, { releaseMs: Infinity }]) {
    assert.equal(timing.preferences(patch, 120).releaseBeats, .09375);
  }
});

test('straight, triplet and dotted times retain sub-millisecond precision through DSP', () => {
  const { AudioDetectorTiming: timing, AudioDescriptors: dsp } = load();
  const cases = [
    { beats: .03125, bpm: 120, ms: 15.625, label: '1/128 · 16 ms' },
    { beats: 1 / 48, bpm: 240, ms: 5.208333333333333, label: '1/128 T · 5 ms' },
    { beats: .046875, bpm: 120, ms: 23.4375, label: '1/128 D · 23 ms' },
    { beats: 1 / 48, bpm: 1000, ms: 1.25, label: '1/128 T · 1 ms' },
    { beats: 6, bpm: 1, ms: 360000, label: '1/1 D · 360000 ms' },
  ];
  for (const { beats, bpm, ms, label } of cases) {
    const settings = { releaseMs: 45, toneMs: 0, releaseBeats: beats, toneBeats: beats };
    const resolved = timing.resolve(settings, { syncMode: 'sync', bpm });
    const normalized = dsp.normalizeSettings(resolved);
    assert.ok(Math.abs(normalized.releaseMs - ms) < 1e-9, `release ${label}`);
    assert.ok(Math.abs(normalized.toneMs - ms) < 1e-9, `smooth ${label}`);
    assert.equal(timing.label(beats, bpm), label);
    assert.equal(settings.releaseMs, 45);
    assert.equal(timing.resolve(settings, { syncMode: 'free', bpm }).releaseMs, 45);
  }
});

test('each subdivision is independently selectable, labelled and restored canonically', () => {
  const { AudioDetectorTiming: timing } = load();
  const divisions = timing.divisions();
  assert.equal(divisions.length, 24);
  for (let i = 0; i < divisions.length; i++) {
    const { beats, label } = divisions[i];
    assert.ok(i === 0 || beats > divisions[i - 1].beats);
    assert.match(label, /^1\/(?:128|64|32|16|8|4|2|1)(?: T| D)?$/);
    assert.equal(timing.preferences({ releaseBeats: beats + 1e-14 }).releaseBeats, beats);
    assert.ok(timing.label(beats, 120).startsWith(label + ' · '));
  }
  for (const old of [.25, .5, 1, 2, 4]) {
    assert.equal(timing.preferences({ releaseBeats: old }).releaseBeats, old);
  }
  assert.equal(timing.steps('toneMs')[0], 0);
  assert.equal(timing.steps('releaseMs').includes(0), false);
  assert.equal(timing.label(0, 120), 'OFF');
  assert.equal(timing.label(NaN, 120), '--');
  assert.equal(timing.label(.37, 120), '--');
  assert.equal(timing.preferences({ releaseBeats: '0.03125', releaseMs: 65 }).releaseBeats, .125);
});

test('nonfinite clock and malformed saved values never create invalid DSP coefficients', () => {
  const { AudioDetectorTiming: timing, AudioDescriptors: dsp } = load();
  for (const bpm of [NaN, Infinity, 0, -10, undefined, null]) {
    const resolved = timing.resolve({ releaseBeats: .03125, bandsBeats: 0 }, { syncMode: 'sync', bpm });
    assert.equal(resolved.releaseMs, 15.625);
    assert.equal(resolved.bandsMs, 0);
  }
  const tooFast = timing.resolve({ releaseBeats: 1 / 48 }, { syncMode: 'sync', bpm: 2000 });
  assert.equal(tooFast.releaseMs, 1.25);
  for (const value of [NaN, Infinity, undefined, null]) {
    const selected = timing.preferences({ releaseMs: value, releaseBeats: value });
    assert.ok(timing.steps('releaseMs').includes(selected.releaseBeats));
  }
  for (const releaseMs of [-1, 0, NaN, Infinity, 1e9]) {
    const normalized = dsp.normalizeSettings({ releaseMs });
    assert.ok(normalized.releaseMs > 0 && normalized.releaseMs <= 360000);
  }
});

test('synchronized short smoothing changes the actual response, with OFF still immediate', () => {
  const { AudioDetectorTiming: timing, AudioDescriptors: dsp } = load();
  const settings = dsp.normalizeSettings(timing.resolve({ toneBeats: .03125 }, { syncMode: 'sync', bpm: 120 }));
  const smoother = dsp.createSmoother();
  smoother.apply({ brightness: 0 }, 15.625, settings);
  assert.ok(Math.abs(smoother.apply({ brightness: 1 }, 15.625, settings).brightness - .6321205588285577) < 1e-12);
  assert.equal(smoother.apply({ brightness: .7 }, 1, dsp.normalizeSettings({ toneMs: 0 })).brightness, .7);
});

test('DSP honours long musical times rather than silently clipping at 200 or 500 ms', () => {
  const { AudioDescriptors: dsp } = load();
  const settings = dsp.normalizeSettings({ releaseMs: 8000, toneMs: 2000, textureMs: 2000, bandsMs: 2000 });
  assert.equal(settings.releaseMs, 8000);
  assert.equal(settings.toneMs, 2000);
  const smoother = dsp.createSmoother();
  smoother.apply({ brightness: 0, flux: 0, high: 0 }, 125, settings);
  const frame = smoother.apply({ brightness: 1, flux: 1, high: 1 }, 125, settings);
  for (const key of ['brightness', 'flux', 'high']) assert.ok(Math.abs(frame[key] - .060586937) < 1e-8, key);
  const immediate = smoother.apply({ high: .8 }, 125, dsp.normalizeSettings({ bandsMs: 0 }));
  assert.equal(immediate.high, .8);
});
