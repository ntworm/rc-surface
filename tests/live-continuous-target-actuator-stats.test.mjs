// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from "node:test";
import assert from "node:assert/strict";

import { ContinuousTargetActuator } from "../src/live/continuous-target-actuator.ts";

function fakeClock(start = 0) {
  let value = start;
  return {
    now: () => value,
    advance(ms) { value += ms; },
  };
}

async function drainMicrotasks(turns = 200) {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve();
}

/**
 * Write that resolves immediately and records the value. The recorded
 * completion latency is whatever value `clock.advance(N)` was called with
 * before the pump's .then fired — typically the test sets that explicitly.
 */
function instantWrite() {
  const writes = [];
  const write = (value) => {
    writes.push(value);
    return Promise.resolve();
  };
  return { write, writes };
}

/**
 * Drive one immediate request to completion. The actuator fires `write(value)`
 * inside a microtask inside `pumpLane`; the write Promise resolves immediately
 * so the `.then` that records completion runs on the next microtask. Then we
 * drain microtasks until the stats counters settle.
 */
async function pumpOne(actuator, bucket, clock, value, latencyMs) {
  const before = actuator.getStats().total.writesCompleted;
  actuator.request({ targetKey: "gain", value, write: bucket.write, immediate: true });
  // The write creation happens in a microtask inside pumpLane; clock advance
  // happens before the .then that records completion (so durationMs = latencyMs).
  clock.advance(latencyMs);
  await drainMicrotasks();
  // Sanity: exactly one new completion recorded.
  const after = actuator.getStats().total.writesCompleted;
  assert.equal(after - before, 1, `pumpOne(${value}, ${latencyMs}) should record exactly one completion`);
}

test("getStats counts writesStarted, writesCompleted and latency from the per-target ring buffer", async () => {
  const clock = fakeClock();
  const actuator = new ContinuousTargetActuator({ now: clock.now });
  const bucket = instantWrite();
  await pumpOne(actuator, bucket, clock, 0.1, 12);

  const stats = actuator.getStats();
  const gain = stats.byTarget.gain;
  assert.ok(gain, "stats.byTarget.gain must exist");
  assert.equal(gain.writesStarted, 1);
  assert.equal(gain.writesCompleted, 1);
  assert.equal(gain.writesFailed, 0);
  assert.equal(gain.meanMs, 12);
  assert.equal(gain.p95Ms, 12);
  assert.equal(gain.maxMs, 12);
  assert.equal(gain.lastCompletedAtMs, 12);
  assert.equal(stats.total.writesStarted, 1);
  assert.equal(stats.total.writesCompleted, 1);
  assert.equal(stats.total.writesFailed, 0);
  actuator.stop();
});

test("getStats ratePerSecond counts completions inside a 1 s sliding window", async () => {
  const clock = fakeClock();
  const actuator = new ContinuousTargetActuator({ now: clock.now });
  const bucket = instantWrite();
  await pumpOne(actuator, bucket, clock, 0.1, 12);
  await pumpOne(actuator, bucket, clock, 0.2, 12);
  await pumpOne(actuator, bucket, clock, 0.3, 12);

  const inside = actuator.getStats().byTarget.gain;
  assert.equal(inside.writesCompleted, 3);
  assert.equal(inside.ratePerSecond, 3);

  // Walk the clock past the 1 s window boundary so all completions age out.
  clock.advance(1100);
  const outside = actuator.getStats().byTarget.gain;
  assert.equal(outside.ratePerSecond, 0);
  assert.equal(outside.writesCompleted, 3);
  actuator.stop();
});

test("getStats counts writesFailed when the SDK write rejects", async () => {
  const clock = fakeClock();
  const actuator = new ContinuousTargetActuator({ now: clock.now });
  // First write rejects, second resolves.
  let next = 0;
  const write = () => {
    if (next === 0) {
      next += 1;
      return Promise.reject(new Error("sdk exploded"));
    }
    return Promise.resolve();
  };
  actuator.request({ targetKey: "gain", value: 0.1, write, immediate: true });
  clock.advance(5);
  await drainMicrotasks();
  assert.equal(actuator.getStats().byTarget.gain.writesFailed, 1);
  assert.equal(actuator.getStats().byTarget.gain.writesCompleted, 0);

  // Second write succeeds.
  actuator.request({ targetKey: "gain", value: 0.5, write, immediate: true });
  clock.advance(20);
  await drainMicrotasks();
  const stats = actuator.getStats().byTarget.gain;
  assert.equal(stats.writesStarted, 2);
  assert.equal(stats.writesCompleted, 1);
  assert.equal(stats.writesFailed, 1);
  actuator.stop();
});

test("resetStats zeroes every counter and ring buffer", async () => {
  const clock = fakeClock();
  const actuator = new ContinuousTargetActuator({ now: clock.now });
  const bucket = instantWrite();
  await pumpOne(actuator, bucket, clock, 0.1, 15);
  assert.equal(actuator.getStats().byTarget.gain.writesCompleted, 1);

  actuator.resetStats();
  const after = actuator.getStats();
  assert.deepEqual(after.byTarget, {});
  assert.equal(after.total.writesStarted, 0);
  assert.equal(after.total.writesCompleted, 0);
  assert.equal(after.total.writesFailed, 0);
  assert.equal(after.total.ratePerSecond, 0);
  actuator.stop();
});

test("getStats aggregates latency and counters across multiple physical targets", async () => {
  const clock = fakeClock();
  const actuator = new ContinuousTargetActuator({ now: clock.now });
  const gainBucket = instantWrite();
  const panBucket = instantWrite();
  actuator.request({ targetKey: "gain", value: 0.4, write: gainBucket.write, immediate: true });
  actuator.request({ targetKey: "pan", value: 0.1, write: panBucket.write, immediate: true });
  clock.advance(10);
  await drainMicrotasks();

  const stats = actuator.getStats();
  assert.ok(stats.byTarget.gain && stats.byTarget.pan);
  assert.equal(stats.total.writesCompleted, 2);
  assert.equal(stats.total.writesStarted, 2);
  assert.equal(stats.total.ratePerSecond, 2);
  actuator.stop();
});
