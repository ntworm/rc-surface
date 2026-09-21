// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLatencyFixture } from './generate-native-latency-fixture.mjs';
import { decodeWav, measureOnsets } from './measure-native-audio-latency.mjs';
test('bench fixture has 220 separated 1ms pulses and a quiet DC carrier on the other channel', () => {
  const fixture = decodeWav(createLatencyFixture());
  assert.equal(fixture.sampleRate, 48000); assert.equal(fixture.channels.length, 2);
  const [reference, carrier] = fixture.channels;
  assert.equal(reference[0], 0); assert.equal(reference[48000], .5);
  assert.equal(reference[48047], .5); assert.equal(reference[48048], 0);
  assert.equal(carrier[48000], .0625);
  const r = measureOnsets({ reference, response: reference.slice(), sampleRate: 48000, threshold: .25, minGapMs: 250 });
  assert.equal(r.count, 220); assert.equal(r.misses, 0);
  assert.equal(createLatencyFixture().equals(createLatencyFixture()), true);
  for (const sampleRate of [0, NaN, '48000', 1000000]) assert.throws(() => createLatencyFixture({ sampleRate }));
});
