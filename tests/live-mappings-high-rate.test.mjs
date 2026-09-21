// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import test from "node:test";
import assert from "node:assert/strict";

import {
  activeSmooths,
  applyMapping,
  controlMappings,
  eventModesState,
  lastMappedValues,
} from "../src/live/mappings.ts";
import { clearExtensionContext, setExtensionContext } from "../src/context.ts";
import { continuousTargetActuator } from '../src/live/continuous-target-actuator.ts';

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function waitUntil(predicate, message) {
  const started = Date.now();
  while (Date.now() - started < 500) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(message);
}

test("high-rate mapping applies the latest pending value after an in-flight setValue finishes", async () => {
  const pending = [];
  const applied = [];
  const param = {
    min: 0,
    max: 1,
    setValue(value) {
      applied.push(value);
      const d = deferred();
      pending.push(d);
      return d.promise;
    },
  };

  controlMappings.clear();
  lastMappedValues.clear();
  activeSmooths.clear();
  eventModesState.clear();
  setExtensionContext({
    application: {
      song: {
        tempo: 120,
        tracks: [
          {
            devices: [
              {
                parameters: [param],
              },
            ],
          },
        ],
      },
    },
  });
  controlMappings.set("button-1", [
    { type: "device_param", trackIndex: 0, deviceIndex: 0, paramIndex: 0 },
  ]);

  try {
    const firstApply = applyMapping("client-1", "button-1", 0.1);
    await Promise.resolve();

    await applyMapping("client-1", "button-1", 0.9);
    assert.deepEqual(applied, [0.1]);

    pending[0].resolve();
    await waitUntil(
      () => applied.length === 2,
      "expected pending high-rate value to be applied after the first setValue resolved",
    );

    assert.deepEqual(applied, [0.1, 0.9]);
    pending[1].resolve();
    await firstApply;
  } finally {
    for (const d of pending) d.resolve();
    controlMappings.clear();
    lastMappedValues.clear();
    activeSmooths.clear();
    eventModesState.clear();
    clearExtensionContext();
  }
});

test('timed XY/knob/fader frames use one SDK writer and smooth=0 has no hidden ramp', async () => {
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  const applied = [], pending = [];
  const param = { min: 0, max: 1, setValue(value) {
    applied.push(value); const d = deferred(); pending.push(d); return d.promise;
  } };
  const drain = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  setExtensionContext({ application: { song: { tracks: [{ devices: [{ parameters: [param] }] }] } } });
  const target = { type: 'device_param', trackIndex: 0, deviceIndex: 0, paramIndex: 0, smooth: 0 };
  for (const name of ['xy-1.x', 'knob-1', 'fader-1']) controlMappings.set(name, [target]);
  try {
    await applyMapping('realtime-test', 'xy-1.x', 0.1); await drain();
    now += 16; await applyMapping('realtime-test', 'xy-1.x', 0.4); await drain();
    now += 8; void applyMapping('realtime-test', 'xy-1.x', 0.8); await drain();
    assert.deepEqual(applied, [0.1], 'cadence must never switch to a second concurrent writer');
    pending[0].resolve(); await drain();
    assert.deepEqual(applied, [0.1, 0.8], 'newest position follows SDK completion without timer/ramp');
    pending[1].resolve(); await drain();
    for (const name of ['knob-1', 'fader-1']) {
      now += 33; await applyMapping('realtime-test', name, 0.6); await drain();
      assert.equal(applied.at(-1), 0.6); pending.at(-1).resolve(); await drain();
    }
  } finally {
    for (const d of pending) d.resolve();
    continuousTargetActuator.stop(); controlMappings.clear(); clearExtensionContext(); Date.now = originalNow;
  }
});

test('continuous LFO output keeps only newest position while a slow SDK write is pending', async () => {
  const pending = [], applied = [];
  const param = { min: 0, max: 1, setValue(value) { applied.push(value); const d = deferred(); pending.push(d); return d.promise; } };
  setExtensionContext({ application: { song: { tracks: [{ devices: [{ parameters: [param] }] }] } } });
  controlMappings.set('toggle-1', [{ type: 'device_param', trackIndex: 0, deviceIndex: 0, paramIndex: 0 }]);
  const drain = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  try {
    void applyMapping('lfo-latency', 'toggle-1', 0.1); await drain();
    for (const value of [0.2, 0.4, 0.7, 0.9]) { void applyMapping('lfo-latency', 'toggle-1', value); await drain(); }
    assert.deepEqual(applied, [0.1]);
    pending[0].resolve(); await drain();
    assert.deepEqual(applied, [0.1, 0.9], 'do not play an old LFO trajectory after the SDK catches up');
  } finally {
    controlMappings.clear();
    for (const d of pending) d.resolve();
    await drain(); continuousTargetActuator.cancel(); clearExtensionContext();
  }
});
