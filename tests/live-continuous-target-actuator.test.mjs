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

async function drainMicrotasks(turns = 40) {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve();
}

/** Finish every write a simulated target still owes, oldest first. */
async function releaseAll(pending) {
  while (pending.length > 0) {
    pending.shift().resolve();
    await drainMicrotasks();
  }
}

/**
 * A write with a controlled latency. Every call records how many writes were
 * in flight when it was made, so a test can tell a pipelined write from one
 * that went out alone.
 */
function simulatedTarget(clock, latencyMs) {
  const calls = [];
  const applied = [];
  const pending = [];
  let inFlight = 0;
  let maxConcurrent = 0;
  const write = (value) => {
    calls.push({ value, concurrent: inFlight + 1 });
    inFlight += 1;
    maxConcurrent = Math.max(maxConcurrent, inFlight);
    return new Promise((resolve) => {
      pending.push({
        value,
        dueAtMs: clock.now() + latencyMs,
        resolve: () => { inFlight -= 1; applied.push(value); resolve(); },
      });
    });
  };
  const settle = () => {
    for (const job of pending.filter((entry) => entry.dueAtMs <= clock.now())) {
      pending.splice(pending.indexOf(job), 1);
      job.resolve();
    }
  };
  return {
    calls, applied, pending, write, settle,
    maxConcurrent: () => maxConcurrent,
    value: () => (applied.length > 0 ? applied[applied.length - 1] : null),
  };
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
    assert.deepEqual(writes, [1, 0.8, 0.4],
      "two writes may be in flight, so the newest value of that moment goes out too");
    first.resolve();
    await drainMicrotasks();
    assert.deepEqual(writes, [1, 0.8, 0.4, 0.4],
      "the overlap owes one confirming write, and it carries the destination");
    assert.equal(maxConcurrent, 2, "at most two writes may be in flight for one target");
    clock.advance(33);
    request(0.4);
    await drainMicrotasks();
    assert.deepEqual(writes, [1, 0.8, 0.4, 0.4], "a snapshot repeating the value must not write again");
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
    assert.deepEqual(writes, [1, 0.8, 0, 0],
      "the release replaces the tail and the confirming write lands it last");
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

test("one physical target shares its two-write limit even when requests come from two clients", async () => {
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

  assert.equal(maxConcurrent, 2, "two clients share the two-write limit of one physical target");
  assert.deepEqual(writes, [0.1, 0.9]);
  pending[0].resolve();
  await firstTick;
  clock.advance(50);
  const finalTick = actuator.tick();
  await Promise.resolve();
  assert.equal(maxConcurrent, 2, "the limit belongs to the target, not to each client");
  assert.equal(writes.at(-1), 0.9);
  pending[1].resolve();
  await finalTick;
  await releaseAll(pending);
  await actuator.settle("mixer_volume::0");
  assert.deepEqual(writes, [0.1, 0.9, 0.9],
    "the overlap owes one confirming write, and it carries the destination");
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
  await Promise.resolve();
  await releaseAll(pending);
  await finalTick;
  await actuator.settle("tempo");

  assert.equal(writes.at(-1), 1);
  assert.ok(writes.every((value, index) => index === 0 || value >= writes[index - 1]));
  assert.equal(writes.includes(0.25), false);
  assert.equal(writes.includes(0.5), true,
    "the second write in flight carries the value of that moment, not a stale one");
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

test("an immediate stream keeps two writes in flight and lands the destination last", async () => {
  const clock = fakeClock();
  const latencyMs = 40;
  const actuator = new ContinuousTargetActuator({ now: clock.now, minWriteIntervalMs: 20 });
  const target = simulatedTarget(clock, latencyMs);
  const frames = 80;
  try {
    for (let frame = 1; frame <= frames; frame += 1) {
      clock.advance(5);
      actuator.request({
        targetKey: "cutoff", value: frame / frames, write: target.write,
        immediate: true, sourceTimeMs: clock.now(),
      });
      target.settle();
      await drainMicrotasks();
    }
    while (target.pending.length > 0) {
      clock.advance(latencyMs);
      target.settle();
      await drainMicrotasks();
    }

    // A single-flight actuator completes one write per latency; two in flight
    // complete about twice as many over the same stream.
    const singleFlight = Math.floor((frames * 5) / latencyMs);
    assert.ok(target.calls.length >= singleFlight * 1.5,
      `expected about twice the single-flight writes (${singleFlight}), got ${target.calls.length}`);
    assert.ok(target.calls.length <= singleFlight * 2 + 2,
      `two writes in flight must not become three, got ${target.calls.length}`);
    assert.equal(target.maxConcurrent(), 2, "never three writes in flight for one target");
    const values = target.calls.map((call) => call.value);
    for (let index = 1; index < values.length - 1; index += 1) {
      assert.notEqual(values[index], values[index - 1],
        "a normal dispatch must not repeat the value of the previous one");
    }
    assert.equal(target.calls.at(-1).value, 1, "the last write call carries the destination");
    assert.equal(target.calls.at(-1).concurrent, 1, "the confirming write goes out alone");
    assert.equal(target.value(), 1, "the destination is the last value on the target");
  } finally { actuator.stop(); }
});

test("a write that applies the old value last still ends with the destination", async () => {
  const clock = fakeClock();
  const actuator = new ContinuousTargetActuator({ now: clock.now, minWriteIntervalMs: 20 });
  const applied = [];
  const pending = [];
  const write = (value) => new Promise((resolve) => {
    pending.push(() => { applied.push(value); resolve(); });
  });
  try {
    actuator.request({ targetKey: "cutoff", value: 0.2, write, immediate: true, sourceTimeMs: clock.now() });
    await drainMicrotasks();
    clock.advance(5);
    actuator.request({ targetKey: "cutoff", value: 0.8, write, immediate: true, sourceTimeMs: clock.now() });
    await drainMicrotasks();
    assert.equal(pending.length, 2, "two writes overlap for one target");

    // The host acknowledges the newest call first, so the old value lands last.
    const newest = pending.splice(pending.length - 1, 1)[0];
    newest();
    await drainMicrotasks();
    const oldest = pending.shift();
    oldest();
    await drainMicrotasks();
    assert.equal(applied.at(-1), 0.2, "the simulated host applied the old value last");

    while (pending.length > 0) {
      pending.shift()();
      await drainMicrotasks();
    }
    assert.equal(applied.at(-1), 0.8, "the confirming write lands the destination last");
  } finally { actuator.stop(); }
});

test("a ramp ends at the destination even when two writes overlap", async () => {
  const clock = fakeClock();
  const latencyMs = 40;
  const actuator = new ContinuousTargetActuator({ now: clock.now, minWriteIntervalMs: 20 });
  const target = simulatedTarget(clock, latencyMs);
  try {
    actuator.request({ targetKey: "cutoff", value: 0, write: target.write, sourceTimeMs: clock.now() });
    await drainMicrotasks();
    clock.advance(33);
    actuator.request({ targetKey: "cutoff", value: 1, write: target.write, sourceTimeMs: clock.now() });
    for (let step = 0; step < 6; step += 1) {
      clock.advance(20);
      // The tick waits for the write it starts, and that write only lands
      // when the simulated host acknowledges it.
      void actuator.tick();
      target.settle();
      await drainMicrotasks();
    }
    assert.equal(target.value(), 1, "the ramp ends at the destination");
  } finally { actuator.stop(); }
});

test("cancelling mid-stream leaves no new write", async () => {
  const clock = fakeClock();
  const actuator = new ContinuousTargetActuator({ now: clock.now, minWriteIntervalMs: 20 });
  const target = simulatedTarget(clock, 40);
  try {
    actuator.request({ targetKey: "cutoff", value: 0.2, write: target.write, immediate: true, sourceTimeMs: clock.now() });
    await drainMicrotasks();
    clock.advance(5);
    actuator.request({ targetKey: "cutoff", value: 0.8, write: target.write, immediate: true, sourceTimeMs: clock.now() });
    await drainMicrotasks();
    assert.equal(target.calls.length, 2, "two writes may be in flight");
    actuator.cancel("cutoff");
    clock.advance(40);
    target.settle();
    await drainMicrotasks();
    assert.equal(target.calls.length, 2, "a cancelled lane must not write again");
  } finally { actuator.stop(); }
});

test("settle() resolves only when no write is in flight", async () => {
  const clock = fakeClock();
  const actuator = new ContinuousTargetActuator({ now: clock.now, minWriteIntervalMs: 20 });
  const target = simulatedTarget(clock, 40);
  try {
    actuator.request({ targetKey: "cutoff", value: 0.4, write: target.write, immediate: true, sourceTimeMs: clock.now() });
    await drainMicrotasks();
    let settled = false;
    const settling = actuator.settle("cutoff").then(() => { settled = true; });
    await drainMicrotasks();
    assert.equal(settled, false, "settle() must wait for the write in flight");
    clock.advance(40);
    target.settle();
    await settling;
    assert.equal(settled, true, "settle() resolves once the target is idle");
  } finally { actuator.stop(); }
});

test("a failed write is retried by the next pump", async () => {
  const clock = fakeClock();
  const actuator = new ContinuousTargetActuator({ now: clock.now, minWriteIntervalMs: 20 });
  const calls = [];
  let failNext = true;
  const write = async (value) => {
    calls.push(value);
    if (failNext) {
      failNext = false;
      throw new Error("sdk exploded");
    }
  };
  try {
    actuator.request({ targetKey: "cutoff", value: 0.5, write, immediate: true, sourceTimeMs: clock.now() });
    await drainMicrotasks();
    assert.deepEqual(calls, [0.5]);
    await actuator.tick();
    await drainMicrotasks();
    assert.deepEqual(calls, [0.5, 0.5], "the failed value never reached Live, so it is sent again");
  } finally { actuator.stop(); }
});
