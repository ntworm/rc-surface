// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFastDetector } from './native-audio-reference.mjs';

test('native fast attack starts without an FFT window and resets exactly', () => {
  const detector = createFastDetector({ sampleRate: 48000 });
  for (let n = 0; n < 1000; n++) assert.equal(detector.push(0, 0), 0);
  const first = detector.push(1, 1);
  // From Ef=0.02061781867, Es=0.00069420337 and knee=0.2295.
  assert.ok(Math.abs(first - .5975487040097555) < 1e-12, 'first sample, not a delayed frame');
  const tail = detector.push(0, 0);
  assert.ok(tail < first && tail > first * .999, '45ms release does not drop immediately');
  detector.reset();
  assert.equal(detector.push(1, 1), first);
});

test('stereo power keeps antiphase and one-channel energy, sustained tone stops retriggering', () => {
  const a = createFastDetector({ sampleRate: 48000 });
  const b = createFastDetector({ sampleRate: 48000 });
  const c = createFastDetector({ sampleRate: 48000 });
  for (let n = 0; n < 48000; n++) {
    const x = n < 100 ? 0 : .5;
    assert.equal(a.push(x, x), b.push(x, -x));
    const single = c.push(x, 0);
    if (n === 100) assert.ok(single > .59 && single < .60);
    if (n === 47999) assert.ok(single < 1e-6);
  }
});

test('sample rates, release, sensitivity and curve affect the actual sample recurrence', () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    const quick = createFastDetector({ sampleRate, settings: { releaseMs: 1.25 } });
    const slow = createFastDetector({ sampleRate, settings: { releaseMs: 500 } });
    let q, s;
    for (let n = 0; n < sampleRate / 2; n++) {
      q = quick.push(n < 100 ? 1 : 0, n < 100 ? 1 : 0);
      s = slow.push(n < 100 ? 1 : 0, n < 100 ? 1 : 0);
    }
    assert.ok(s > .2 && q < 1e-6);
  }
  const first = (settings) => createFastDetector({ sampleRate: 48000, settings }).push(1, 1);
  assert.ok(first({ sensitivity: 1 }) > first({ sensitivity: 0 }));
  assert.ok(Math.abs(first({ curve: 2 }) - first({ curve: 1 }) ** 2) < 1e-12);
  const quiet = createFastDetector({ sampleRate: 48000 });
  assert.equal(quiet.push(1e-6, -1e-6), 0);
});

test('bad reference inputs fail explicitly and do not poison the next sample', () => {
  for (const sampleRate of [0, NaN, Infinity, '48000', 7999, 384001]) {
    assert.throws(() => createFastDetector({ sampleRate }));
  }
  for (const settings of [{ releaseMs: 0 }, { releaseMs: Infinity }, { curve: 4 }, { sensitivity: -1 }, { pitch: 1 }]) {
    assert.throws(() => createFastDetector({ sampleRate: 48000, settings }));
  }
  const d = createFastDetector({ sampleRate: 48000 });
  assert.throws(() => d.push(NaN, 0));
  assert.throws(() => d.push(0, Infinity));
  assert.equal(d.push(0, 0), 0);
});
