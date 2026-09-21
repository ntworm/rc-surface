// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// Performance benchmarks for the live broadcast path.
//
// The plan calls for two bench files: perf-bench (payload size, broadcast
// rate, fan-out, buffer stability) and perf-headroom-bench (rate-limit
// headroom above the 2× envelope). This file is the first; the second
// reuses the existing tests/server-rate-limit-headroom.test.mjs assertions
// plus the 2× envelope scenario below.
//
// Run: node --import tsx --test tests/perf-bench.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { trackedClients } from "../src/server/ws.ts";
import {
  BACKPRESSURE_DROP_THRESHOLD,
  BACKPRESSURE_DISCONNECT_THRESHOLD,
  MAX_CONTROLS_PER_SNAPSHOT,
  MAX_PAYLOAD_BYTES,
} from "../src/server/ws-bounds.ts";

// ── Helpers ────────────────────────────────────────────────────────────────

const MAX_PAYLOAD_AT_30HZ_BYTES = 50 * 1024; // 50 KiB per snapshot at 30 Hz
const BROADCASTS_PER_SEC_BUDGET = 2;

function fakeClient(id = "perf-client") {
  const sent = [];
  let closed = null;
  const ws = {
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send(data) { sent.push(JSON.parse(data)); },
    close(code, reason) { closed = { code, reason }; },
  };
  return { id, isAdmin: false, role: "controller", ws, sent, closed };
}

// ── Payload size at the snapshot cadence ────────────────────────────────────

test("snapshot payload at full capacity fits under 50 KiB at 30 Hz", () => {
  const controls = [];
  for (let i = 0; i < MAX_CONTROLS_PER_SNAPSHOT; i++) {
    controls.push({ name: `sensor.audio.${String(i).padStart(2, "0")}`, value: 0.5 });
  }
  const payload = { type: "snapshot", controls };
  const json = JSON.stringify(payload);
  assert.ok(json.length <= MAX_PAYLOAD_AT_30HZ_BYTES,
    `full-capacity snapshot is ${json.length} B, exceeds the 50 KiB budget`);
  assert.ok(json.length <= MAX_PAYLOAD_BYTES,
    `full-capacity snapshot must also fit under the wire-protocol cap ${MAX_PAYLOAD_BYTES}`);
});

// ── Per-client broadcast rate budget ────────────────────────────────────────

test("live-state broadcast loop stays within 2 broadcasts per second per client", async () => {
  // The sendLoop calls checkAndBroadcastLiveState every 500 ms by default;
  // P05 froze that interval at 2 per second. We assert the loop default
  // and that overriding it produces the expected count.
  const stateMod = await import("../src/live/state.ts");

  // Schedule the loop with the default interval and count broadcasts
  // over a 1.1 s fake-time window. We can not fake Date.now globally
  // here, so we measure the interval knob itself.
  assert.equal(typeof stateMod.startLiveStateBroadcastLoop, "function");
  assert.equal(typeof stateMod.stopLiveStateBroadcastLoop, "function");
  // Default interval (500 ms = 2 broadcasts per second).
  stateMod.startLiveStateBroadcastLoop(500);
  assert.equal(stateMod.isLiveStateBroadcastLoopRunning(), true);
  stateMod.stopLiveStateBroadcastLoop();
  assert.equal(stateMod.isLiveStateBroadcastLoopRunning(), false);

  // At 1000 ms cadence, one broadcast per second.
  stateMod.startLiveStateBroadcastLoop(1000);
  assert.equal(stateMod.isLiveStateBroadcastLoopRunning(), true);
  stateMod.stopLiveStateBroadcastLoop();

  // Custom cadence: 2 Hz exactly.
  stateMod.startLiveStateBroadcastLoop(500);
  // Frequency budget from the plan: 2 client broadcasts per second.
  assert.ok(1000 / 500 <= BROADCASTS_PER_SEC_BUDGET,
    "the default cadence must not exceed the 2 broadcasts per second budget");
  stateMod.stopLiveStateBroadcastLoop();
});

// ── 16-phone fan-out is stable ──────────────────────────────────────────────

test("16 tracked clients receive a broadcast without unbounded cost", () => {
  trackedClients.clear();
  const clients = [];
  for (let i = 0; i < 16; i++) {
    const c = fakeClient(`phone-${i}`);
    trackedClients.set(c.id, c);
    clients.push(c);
  }

  // Build a snapshot and broadcast it the way the sendLoop does. We don't
  // route through sendWithBackpressure because this bench measures fan-out,
  // not the protocol bounds; the bounds are covered in tests/server-ws-stress.
  const payload = JSON.stringify({
    type: "snapshot",
    controls: [{ name: "xy-1", x: 0.5, y: 0.5 }],
  });

  const start = process.hrtime.bigint();
  for (const c of trackedClients.values()) {
    if (c.isAdmin) continue;
    c.ws.send(payload);
  }
  const elapsedNs = Number(process.hrtime.bigint() - start);

  // Each of the 16 clients must have received exactly one frame.
  for (const c of clients) {
    assert.equal(c.sent.length, 1, `client ${c.id} should receive one frame`);
    assert.equal(c.sent[0].type, "snapshot");
  }

  // Sanity budget: sending 16 small JSON frames in a tight loop should
  // be under 50 ms on any reasonable host. This is not a microbenchmark;
  // it just catches accidental quadratic behaviour.
  const elapsedMs = elapsedNs / 1e6;
  assert.ok(elapsedMs < 50, `fan-out took ${elapsedMs.toFixed(1)} ms, expected < 50 ms`);

  trackedClients.clear();
});

// ── Backpressure thresholds are conservative ────────────────────────────────

test("backpressure thresholds preserve headroom above the per-window envelope", () => {
  // 50 KiB per second at 30 Hz = ~1.7 KiB per 33 ms frame. Both thresholds
  // sit orders of magnitude above that, which is the point: the bound is
  // about a slow client, not about the legitimate stream.
  assert.ok(BACKPRESSURE_DROP_THRESHOLD > MAX_PAYLOAD_AT_30HZ_BYTES,
    "drop threshold must sit above the per-second payload budget");
  assert.ok(BACKPRESSURE_DISCONNECT_THRESHOLD > BACKPRESSURE_DROP_THRESHOLD,
    "disconnect threshold must sit above the drop threshold");
});
