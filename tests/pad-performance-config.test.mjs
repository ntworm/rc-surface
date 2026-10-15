// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePerformanceSettings } from '../src/live/project-config.ts';

const ranges = {
  padRange: [40, 400], padTouchValue: [0, 1], padToggleValue: [.01, 1],
  burstSubdivision: [.03125, 32], burstDurationMs: [34, 10000],
  burstAttackRatio: [.05, .5], burstPeak: [.15, 1],
};
const profile = pads => ({ version: 2, slots: {}, pads });

test('performance v2 supports sparse pad overrides without changing version or requiring pads in old profiles', () => {
  const legacy = { version: 2, slots: {} };
  assert.equal(validatePerformanceSettings(legacy), legacy);
  const value = profile({ 'pad-1': {}, 'pad-12': {
    mode: 'D', syncMode: 'free', padCurve: 'fine', padLatchTapReset: false,
    ...Object.fromEntries(Object.entries(ranges).map(([key, [min]]) => [key, min])),
  } });
  assert.deepEqual(validatePerformanceSettings(JSON.parse(JSON.stringify(value))), value);
  for (const [key, [, max]] of Object.entries(ranges)) {
    assert.equal(validatePerformanceSettings(profile({ 'pad-1': { [key]: max } })).pads['pad-1'][key], max);
  }
});

test('pad host validation rejects invalid slot identities, shapes, enums, booleans and unknown fields', () => {
  for (const pads of [null, [], 'pads', { 'pad-0': {} }, { 'pad-13': {} }, { 'pad-01': {} }, { 'toggle-1': {} },
    { 'pad-1': [] }, { 'pad-1': null }, { 'pad-1': { padCurve: 'square' } },
    { 'pad-1': { padLatchTapReset: 'true' } }, { 'pad-1': { mode: 'Global' } },
    { 'pad-1': { syncMode: 'auto' } }, { 'pad-1': { gain: .5 } }]) {
    assert.throws(() => validatePerformanceSettings(profile(pads)), /Invalid pad/);
  }
});

test('pad host validation rejects every non-finite, non-numeric and out-of-bounds numeric override', () => {
  for (const [key, [min, max]] of Object.entries(ranges)) {
    for (const value of [min - .001, max + .001, NaN, Infinity, -Infinity, '1', null, true]) {
      assert.throws(() => validatePerformanceSettings(profile({ 'pad-1': { [key]: value } })), /Invalid pad/, key);
    }
  }
});
