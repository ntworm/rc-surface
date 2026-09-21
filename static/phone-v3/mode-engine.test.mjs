// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

function loadEngine() {
  const file = path.join(import.meta.dirname, 'mode-engine.js');
  const source = fs.readFileSync(file, 'utf8');
  const context = { globalThis: {}, window: {} };
  context.globalThis = context;
  context.window = context;
  vm.runInNewContext(source, context, { filename: file });
  return context.AbletonRcModes;
}

function plain(value) {
  return value === null ? null : JSON.parse(JSON.stringify(value));
}

test('mode A starts at zero, follows upward drag, and releases to zero', () => {
  const modes = loadEngine();
  const state = modes.createScalarGestureState();

  assert.deepEqual(
    plain(modes.beginScalarGesture(state, { mode: 'A', pointerId: 1, y: 100, rangePx: 100, now: 0 })),
    { value: 0, phase: 'start', active: true },
  );
  assert.deepEqual(
    plain(modes.moveScalarGesture(state, { pointerId: 1, y: 40, now: 16 })),
    { value: 0.6, phase: 'move', active: true },
  );
  assert.deepEqual(
    plain(modes.endScalarGesture(state, { pointerId: 1, now: 32 })),
    { value: 0, phase: 'release', active: false },
  );
  assert.equal(state.value, 0);
});

test('pad range keeps landscape pads immediate without the old 0.5 jump', () => {
  const modes = loadEngine();

  assert.equal(modes.calculatePadRangePx(80), 150);
  assert.equal(modes.calculatePadRangePx(96), 150);
  assert.equal(modes.calculatePadRangePx(130), 150);
  assert.equal(modes.calculatePadRangePx(220), 150);
});

test('scalar gestures preserve fine movement resolution', () => {
  const modes = loadEngine();
  const state = modes.createScalarGestureState();

  modes.beginScalarGesture(state, { mode: 'A', pointerId: 1, y: 100, rangePx: 240, now: 0 });
  assert.deepEqual(
    plain(modes.moveScalarGesture(state, { pointerId: 1, y: 70.37, now: 16 })),
    { value: 0.1235, phase: 'move', active: true },
  );
});

test('mode B edits from the saved value and keeps the new value on release', () => {
  const modes = loadEngine();
  const state = modes.createScalarGestureState();

  modes.beginScalarGesture(state, { mode: 'B', pointerId: 1, y: 100, rangePx: 100, now: 0 });
  assert.deepEqual(
    plain(modes.moveScalarGesture(state, { pointerId: 1, y: 30, now: 16 })),
    { value: 0.7, phase: 'move', active: true },
  );
  assert.equal(modes.endScalarGesture(state, { pointerId: 1, now: 32 }), null);
  assert.equal(state.value, 0.7);

  assert.deepEqual(
    plain(modes.beginScalarGesture(state, { mode: 'B', pointerId: 2, y: 100, rangePx: 100, now: 100 })),
    { value: 0.7, phase: 'start', active: true },
  );
  assert.deepEqual(
    plain(modes.moveScalarGesture(state, { pointerId: 2, y: 130, now: 116 })),
    { value: 0.4, phase: 'move', active: true },
  );
  modes.endScalarGesture(state, { pointerId: 2, now: 132 });
  assert.equal(state.value, 0.4);
});

test('mode C toggles on, allows drag editing while held, and toggles off on tap', () => {
  const modes = loadEngine();
  const state = modes.createScalarGestureState();

  assert.deepEqual(
    plain(modes.beginScalarGesture(state, { mode: 'C', pointerId: 1, y: 100, rangePx: 100, now: 0 })),
    { value: 1, phase: 'toggle-on', active: true },
  );
  assert.deepEqual(
    plain(modes.moveScalarGesture(state, { pointerId: 1, y: 140, now: 16 })),
    { value: 0.6, phase: 'move', active: true },
  );
  assert.equal(modes.endScalarGesture(state, { pointerId: 1, now: 32 }), null);
  assert.equal(state.value, 0.6);
  assert.equal(state.on, true);

  assert.equal(
    modes.beginScalarGesture(state, { mode: 'C', pointerId: 2, y: 100, rangePx: 100, now: 100 }),
    null,
  );
  assert.deepEqual(
    plain(modes.endScalarGesture(state, { pointerId: 2, now: 120 })),
    { value: 0, phase: 'toggle-off', active: false },
  );
  assert.equal(state.value, 0);
  assert.equal(state.on, false);

  assert.deepEqual(
    plain(modes.beginScalarGesture(state, { mode: 'C', pointerId: 3, y: 100, rangePx: 100, now: 180 })),
    { value: 0.6, phase: 'toggle-on', active: true },
  );
});

test('mode D runs a short attack-release burst that returns to zero', () => {
  const modes = loadEngine();
  const state = modes.createScalarGestureState();

  assert.deepEqual(
    plain(modes.beginScalarGesture(state, {
      mode: 'D',
      pointerId: 1,
      y: 100,
      rangePx: 100,
      now: 0,
      burstDurationMs: 400,
      burstAttackMs: 80,
    })),
    { value: 0, phase: 'burst-start', active: true },
  );
  assert.deepEqual(
    plain(modes.tickBurstGesture(state, { now: 80 })),
    { value: 1, phase: 'burst', active: true },
  );
  assert.deepEqual(
    plain(modes.tickBurstGesture(state, { now: 240 })),
    { value: 0.5, phase: 'burst', active: true },
  );
  assert.deepEqual(
    plain(modes.tickBurstGesture(state, { now: 400 })),
    { value: 0, phase: 'burst-end', active: false },
  );
  assert.equal(state.value, 0);
});

// ---------------------------------------------------------------------------
// The burst length has to survive the engine.

function burstDe(durationMs, attackMs) {
  const Modes = loadEngine();
  const state = Modes.createScalarGestureState();
  Modes.beginScalarGesture(state, {
    mode: 'D', pointerId: 1, y: 0, rangePx: 140, now: 0,
    burstDurationMs: durationMs, burstAttackMs: attackMs,
  });
  return state.burst;
}

test('a synced burst keeps the length it was given', () => {
  // The engine floored every burst at 80 ms. A subdivision is a musical value
  // and at a fast tempo it is legitimately shorter than that: one beat at 999
  // BPM is 60 ms, half a beat is 30. All of them arrived as 80, so the seven
  // lengths the settings offer collapsed to the same burst and changing the
  // tempo stopped changing anything.
  assert.equal(burstDe(60, 8).durationMs, 60);
  assert.equal(burstDe(500, 68).durationMs, 500);
  // 1/8 and 1/16 at 120 BPM: two different settings must stay two lengths.
  assert.notEqual(burstDe(62.5, 8).durationMs, burstDe(31.25, 4).durationMs);
});

test('the burst floor is one emission frame, not a round number', () => {
  // Phones restate their controls at 30 Hz, so a burst shorter than one frame
  // cannot be transmitted whatever the envelope does. That is the only floor
  // with a reason behind it.
  const frame = 1000 / 30;
  assert.ok(burstDe(1, 1).durationMs >= frame - 0.001,
    'a degenerate length must still be emittable');
  assert.ok(burstDe(1, 1).durationMs < 80,
    'the floor must not silently restore the old 80 ms');
  // Nonsense stays guarded rather than reaching the envelope as NaN.
  assert.ok(Number.isFinite(burstDe(Number.NaN, Number.NaN).durationMs));
  assert.ok(Number.isFinite(burstDe(-5, -5).durationMs));
});

test('the attack stays inside the burst it belongs to', () => {
  const curto = burstDe(60, 40);
  assert.ok(curto.attackMs < curto.durationMs, 'attack must leave room for release');
  assert.ok(curto.attackMs > 0);
});
