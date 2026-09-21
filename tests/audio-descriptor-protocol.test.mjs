// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { boundImmediateControls } from '../src/server/ws-bounds.ts';
const names = ['transient', 'kick', 'snare', 'brightness', 'centroid', 'flux', 'flatness', 'spread', 'rolloff', 'low', 'mid', 'high'];
const batch = () => names.map((name, i) => ({ name: 'sensor.audio.' + name, value: i / 12, lost: false }));
test('complete spectral batch and cached four-descriptor clients remain valid', () => {
  assert.deepEqual(boundImmediateControls(batch()), batch());
  assert.deepEqual(boundImmediateControls(batch().slice(0, 4)), batch().slice(0, 4));
  assert.ok(boundImmediateControls(batch().reverse()));
});
test('expanded high-rate path rejects partial, duplicate, foreign and invalid descriptor frames atomically', () => {
  for (const input of [batch().slice(0, 8), [...batch(), batch()[0]], [batch()[1], ...batch().slice(1)],
    batch().map((v, i) => i === 6 ? { ...v, value: NaN } : v),
    batch().map((v, i) => i === 9 ? { ...v, value: 1.1 } : v),
    batch().map((v, i) => i === 2 ? { ...v, lost: 'false' } : v),
    batch().map((v, i) => i === 5 ? { ...v, name: 'sensor.audio.rms' } : v),
    batch().slice(4, 8)]) assert.equal(boundImmediateControls(input), null);
});
