// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from "node:test";
import assert from "node:assert/strict";

import { ContinuousTargetActuator } from "../src/live/continuous-target-actuator.ts";

test('cancel before the scheduled microtask prevents a not-yet-sent SDK write', async () => {
  const actuator = new ContinuousTargetActuator();
  const writes = [];
  const write = async (value) => { writes.push(value); };
  actuator.request({ targetKey: 'gain', value: 1, write, immediate: true });
  actuator.cancel();
  actuator.request({ targetKey: 'gain', value: 0.25, write, immediate: true });
  await actuator.settle();
  assert.deepEqual(writes, [0.25]);
  actuator.stop();
});

function fakeClock(start = 0) {
  let value = start;
  return {
    now: () => value,
    advance(ms) { value += ms; },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function drainMicrotasks() {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

test("immediate descriptors keep only the newest destination and pump after a slow write without a timer", async () => {
  const clock = fakeClock();
  const actuator = new ContinuousTargetActuator({ now: clock.now });
  const first = deferred();
  const writes = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  const write = async (value) => {
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    writes.push(value);
    if (writes.length === 1) await first.promise;
    concurrent -= 1;
  };
  const request = (value) => actuator.request({
    targetKey: "cutoff", value, write, immediate: true, sourceTimeMs: clock.now(),
  });
  try {
    request(1);
    await drainMicrotasks();
    for (const value of [0.8, 0.6, 0.4, 0.4]) {
      clock.advance(33);
      request(value);
    }
    const otherWrites = [];
    actuator.request({ targetKey: "resonance", value: 0.25, immediate: true,
      write: async (value) => { otherWrites.push(value); } });
    await drainMicrotasks();
    assert.deepEqual(otherWrites, [0.25], "a blocked parameter must not block another target");
    assert.deepEqual(writes, [1]);
    first.resolve();
    await drainMicrotasks();
    assert.deepEqual(writes, [1, 0.4], "no obsolete tail, implicit ramp, or 20 ms tick wait");
    assert.equal(maxConcurrent, 1);
    clock.advance(33);
    request(0.4);
    await drainMicrotasks();
    assert.deepEqual(writes, [1, 0.4], "a snapshot repeating the value must not write again");
  } finally {
    first.resolve();
    actuator.stop();
  }
});

test("immediate release replaces a pending descriptor tail without replaying it", async () => {
  const clock = fakeClock();
  const actuator = new ContinuousTargetActuator({ now: clock.now });
  const first = deferred();
  const writes = [];
  const write = async (value) => { writes.push(value); if (writes.length === 1) await first.promise; };
  const request = (value) => actuator.request({
    targetKey: "cutoff", value, write, immediate: true, sourceTimeMs: clock.now(),
  });
  try {
    request(1);
    await drainMicrotasks();
    clock.advance(33); request(0.8);
    clock.advance(33); request(0.4);
    clock.advance(33); request(0);
    first.resolve();
    await drainMicrotasks();
    assert.deepEqual(writes, [1, 0]);
  } finally {
    first.resolve();
    actuator.stop();
  }
});

test("descriptor snapshots do not restart explicit user smoothing", async () => {
  const clock = fakeClock();
  const actuator = new ContinuousTargetActuator({ now: clock.now });
  const writes = [];
  const write = async (value) => { writes.push(value); };
  const request = (value) => actuator.request({
    targetKey: "cutoff", value, write, immediate: true, smoothFactor: 0.5, sourceTimeMs: clock.now(),
  });
  try {
    request(0); await actuator.tick();
    clock.advance(33); request(1); await actuator.tick();
    clock.advance(75); request(1); await actuator.tick();
    assert.ok(Math.abs(writes.at(-1) - 0.5) < 1e-9, "explicit 150 ms ramp must still be halfway");
    clock.advance(75); await actuator.tick();
    assert.equal(writes.at(-1), 1);
  } finally { actuator.stop(); }
});

test("cancelling an immediate lane prevents its pending value from pumping after the old write", async () => {
  const actuator = new ContinuousTargetActuator();
  const first = deferred();
  const writes = [];
  const write = async (value) => { writes.push(value); await first.promise; };
  try {
    actuator.request({ targetKey: "cutoff", value: 1, write, immediate: true });
    await drainMicrotasks();
    actuator.request({ targetKey: "cutoff", value: 0, write, immediate: true });
    actuator.cancel("cutoff");
    first.resolve();
    await drainMicrotasks();
    assert.deepEqual(writes, [1]);
  } finally { first.resolve(); actuator.stop(); }
});

test("continuous lane dezipppers a jump and reaches the exact newest destination", async () => {
  const clock = fakeClock();
  const writes = [];
  const actuator = new ContinuousTargetActuator({ now: clock.now, minWriteIntervalMs: 20 });
  const write = async (value) => { writes.push(value); };

  actuator.request({ targetKey: "device_param::0::0::0", value: 0, write, sourceTimeMs: clock.now() });
  await actuator.tick();
  clock.advance(33);
  actuator.request({ targetKey: "device_param::0::0::0", value: 1, write, sourceTimeMs: clock.now() });
  clock.advance(20);
  await actuator.tick();

  assert.ok(writes.some((value) => value > 0 && value < 1), `expected an interpolated write, got ${writes}`);
  clock.advance(20);
  await actuator.tick();
  await actuator.settle("device_param::0::0::0");
  assert.equal(writes.at(-1), 1);
  actuator.stop();
});

test("one physical target is one single-flight lane even when requests come from two clients", async () => {
  const clock = fakeClock();
  const pending = [];
  const writes = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  const actuator = new ContinuousTargetActuator({ now: clock.now, minWriteIntervalMs: 20 });
  const write = (value) => {
    writes.push(value);
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    const job = deferred();
    pending.push(job);
    return job.promise.finally(() => { concurrent -= 1; });
  };

  actuator.request({ targetKey: "mixer_volume::0", value: 0.1, write, sourceTimeMs: clock.now() });
  const firstTick = actuator.tick();
  clock.advance(25);
  actuator.request({ targetKey: "mixer_volume::0", value: 0.6, write, sourceTimeMs: clock.now() });
  actuator.request({ targetKey: "mixer_volume::0", value: 0.9, write, sourceTimeMs: clock.now() });
  await Promise.resolve();

  assert.equal(maxConcurrent, 1);
  assert.deepEqual(writes, [0.1]);
  pending[0].resolve();
  await firstTick;
  clock.advance(50);
  const finalTick = actuator.tick();
  await Promise.resolve();
  assert.equal(maxConcurrent, 1);
  assert.equal(writes.at(-1), 0.9);
  pending[1].resolve();
  await finalTick;
  await actuator.settle("mixer_volume::0");
  actuator.stop();
});

test("slow writes discard stale destinations while monotonic input stays monotonic", async () => {
  const clock = fakeClock();
  const writes = [];
  const pending = [];
  const actuator = new ContinuousTargetActuator({ now: clock.now, minWriteIntervalMs: 20 });
  const write = (value) => {
    writes.push(value);
    const job = deferred();
    pending.push(job);
    return job.promise;
  };

  actuator.request({ targetKey: "tempo", value: 0, write, sourceTimeMs: clock.now() });
  const firstTick = actuator.tick();
  await Promise.resolve();
  clock.advance(25);
  actuator.request({ targetKey: "tempo", value: 0.25, write, sourceTimeMs: clock.now() });
  actuator.request({ targetKey: "tempo", value: 0.5, write, sourceTimeMs: clock.now() });
  actuator.request({ targetKey: "tempo", value: 1, write, sourceTimeMs: clock.now() });
  pending[0].resolve();
  await firstTick;
  clock.advance(50);
  const finalTick = actuator.tick();
  await Promise.resolve();
  pending[1].resolve();
  await finalTick;

  assert.equal(writes.at(-1), 1);
  assert.ok(writes.every((value, index) => index === 0 || value >= writes[index - 1]));
  assert.equal(writes.includes(0.25), false);
  assert.equal(writes.includes(0.5), false);
  actuator.stop();
});

test("user smoothing lengthens the ramp but safe release can still be redirected", async () => {
  const clock = fakeClock();
  const writes = [];
  const actuator = new ContinuousTargetActuator({ now: clock.now, minWriteIntervalMs: 20 });
  const write = async (value) => { writes.push(value); };

  actuator.request({ targetKey: "device_param::0::0::0", value: 0, write, sourceTimeMs: 0 });
  await actuator.tick();
  clock.advance(20);
  actuator.request({ targetKey: "device_param::0::0::0", value: 1, write, smoothFactor: 0.9, sourceTimeMs: 20 });
  clock.advance(100);
  await actuator.tick();
  assert.ok(writes.at(-1) > 0 && writes.at(-1) < 0.5);

  actuator.release("device_param::0::0::0", 0, write, 0.9);
  clock.advance(1000);
  await actuator.tick();
  await actuator.settle("device_param::0::0::0");
  assert.equal(writes.at(-1), 0);
  actuator.stop();
});
