// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// The rate limiter exists to stop a runaway client from starving the Live
// thread. It must never fire on the traffic this protocol is designed to
// produce — a dropped message is silent (ws.ts returns without a reply), so
// the symptom is not an error but a control that stops following the finger.
//
// The phone's own designed output, per second:
//   ~30  snapshots        (app.js TICK_MS = 33)
//  ~120  descriptor frames (short audio analysis, one batch per display frame)
//  ~120  modulator frames (LFO/stutter drag, one per 120 Hz display frame)
//   0.2  pings             (session.js PING_MS = 5000)
// Anything at or below that budget must pass untouched.
import test from "node:test";
import assert from "node:assert/strict";
import {
  RATE_BURST,
  RATE_SUSTAINED_PER_SEC,
  createRateLimiter,
  consumeToken,
} from "../src/server/ws-bounds.ts";

const SNAPSHOTS_PER_SEC = 30; // app.js TICK_MS = 33
const DESCRIPTOR_FRAMES_PER_SEC = 120; // one immediate four-control batch per audio rAF
const MODULATOR_FRAMES_PER_SEC = 120; // one coalesced emit per 120 Hz animation frame
const PROTOCOL_PEAK_PER_SEC = SNAPSHOTS_PER_SEC
  + DESCRIPTOR_FRAMES_PER_SEC
  + MODULATOR_FRAMES_PER_SEC
  + 1;
const REALTIME_PROTOCOL_PEAK_PER_SEC = 31 + 125 + MODULATOR_FRAMES_PER_SEC + 20 + 1;
// v1: 125 shared control/audio/pad frames, <=120 coalesced modulator config
// frames, 31 visual snapshots, 20 gate transitions/commands, 1 heartbeat.

test("the sustained rate leaves headroom above the phone's own peak output", () => {
  assert.ok(
    RATE_SUSTAINED_PER_SEC > Math.max(PROTOCOL_PEAK_PER_SEC, REALTIME_PROTOCOL_PEAK_PER_SEC),
    `sustained rate ${RATE_SUSTAINED_PER_SEC}/s must exceed the protocol peak of ` +
      `${PROTOCOL_PEAK_PER_SEC}/s, otherwise legitimate frames are dropped in silence`,
  );
  assert.ok(
    RATE_BURST >= RATE_SUSTAINED_PER_SEC,
    "the burst bucket must be at least one full second of sustained traffic",
  );
});

test("ten seconds of peak protocol traffic is never rate-limited", () => {
  const state = createRateLimiter();
  let now = Date.now();
  const originalNow = Date.now;
  Date.now = () => now;

  try {
    let dropped = 0;
    for (let second = 0; second < 10; second++) {
      for (let i = 0; i < REALTIME_PROTOCOL_PEAK_PER_SEC; i++) {
        now += 1000 / REALTIME_PROTOCOL_PEAK_PER_SEC;
        if (!consumeToken(state)) dropped++;
      }
    }
    assert.equal(dropped, 0, `${dropped} legitimate frames were dropped`);
    assert.equal(state.violations, 0);
  } finally {
    Date.now = originalNow;
  }
});

test("a runaway client is still throttled", () => {
  const state = createRateLimiter();
  let now = Date.now();
  const originalNow = Date.now;
  Date.now = () => now;

  try {
    let dropped = 0;
    // 10,000 messages inside a single window — a client stuck in a send loop.
    for (let i = 0; i < 10_000; i++) {
      if (!consumeToken(state)) dropped++;
    }
    assert.equal(dropped, 10_000 - RATE_BURST);
    assert.ok(state.violations > 0, "violations must be recorded for a runaway client");
  } finally {
    Date.now = originalNow;
  }
});
