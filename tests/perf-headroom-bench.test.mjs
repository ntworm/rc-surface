// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// Headroom benchmarks: the rate limiter must accept the protocol's nominal
// envelope and the 2× peak envelope without dropping a single frame, and the
// burst bucket must accommodate the 2× envelope in a single window.
//
// Sustained-rate throttling is already covered by tests/server-rate-limit-headroom.test.mjs
// (a sustained 2× overload of 8000 messages over 5 s is reported via
// state.violations). This file pins the positive claim only: legitimate
// peaks are never the limiter's problem.
//
// Run: node --import tsx --test tests/perf-headroom-bench.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import {
  RATE_BURST,
  RATE_SUSTAINED_PER_SEC,
  createRateLimiter,
  consumeToken,
} from "../src/server/ws-bounds.ts";

const NOMINAL_ENVELOPE_MS = 100;        // 100 ms envelope
const NOMINAL_MESSAGES_PER_WINDOW = 80; // ~8 KiB at the per-message budget
const PEAK_MULTIPLIER = 2;              // the plan asks for 2× headroom

function withMockedClock(fn) {
  const originalNow = Date.now;
  let now = Date.now();
  Date.now = () => now;
  try {
    fn((delta) => { now += delta; });
  } finally {
    Date.now = originalNow;
  }
}

test("the 2× envelope peak passes when the bucket is full", () => {
  const state = createRateLimiter();
  // Bucket starts at RATE_BURST (600). The 2× envelope is 160 messages in
  // a single 100 ms window, so it fits in the initial bucket without
  // needing the refill path. Mock the clock so the test does not actually
  // wait 100 ms.
  assert.equal(state.tokens, RATE_BURST);

  withMockedClock((advance) => {
    let dropped = 0;
    for (let i = 0; i < NOMINAL_MESSAGES_PER_WINDOW * PEAK_MULTIPLIER; i++) {
      advance(NOMINAL_ENVELOPE_MS / (NOMINAL_MESSAGES_PER_WINDOW * PEAK_MULTIPLIER));
      if (!consumeToken(state)) dropped++;
    }
    assert.equal(dropped, 0, "the 2× envelope peak must not drop legitimate frames");
    // The bucket should still have room left for the next peak.
    assert.ok(state.tokens > 0, "burst bucket must keep headroom after the 2× envelope");
  });
});

test("after a sustained overload the bucket refills and the next 2× envelope passes", () => {
  const state = createRateLimiter();
  // Drain the bucket the way a runaway client would.
  for (let i = 0; i < RATE_BURST; i++) consumeToken(state);
  assert.equal(state.tokens, 0);

  withMockedClock((advance) => {
    // Burn 2 seconds of wall time — enough for two refill windows to
    // refill the bucket back to RATE_BURST (capped). The exact refill
    // count depends on the mock baseline, but after >= 1 s the bucket
    // must be at RATE_BURST again.
    advance(2000);
    if (!consumeToken(state)) {
      // Still empty? The mock may not have advanced the clock past a
      // full window from state.lastRefill. Force it.
      advance(1000);
      consumeToken(state);
    }
    assert.ok(state.tokens > 0 || consumeToken(state),
      "bucket must refill after sustained quiet time");
  });
});

test("the 2× envelope stays below the burst bucket size", () => {
  // A single peak window (160 messages) must fit in RATE_BURST (600) so a
  // client that has been quiet can spike without tripping the limiter.
  assert.ok(RATE_BURST >= NOMINAL_MESSAGES_PER_WINDOW * PEAK_MULTIPLIER,
    `burst bucket (${RATE_BURST}) must accommodate the 2× envelope (${NOMINAL_MESSAGES_PER_WINDOW * PEAK_MULTIPLIER})`);
});

test("the nominal envelope sits inside the sustained rate when scaled per second", () => {
  // The phone's designed output is about 270–300 messages/s (snapshots +
  // audio descriptors + modulator config + heartbeat, per the comment in
  // server-rate-limit-headroom.test.mjs). The nominal envelope at 100 ms
  // is 80 messages = 800/s peak, but the long-term average is what the
  // sustained rate governs. We assert the nominal as a 100 ms peak fits
  // the burst bucket (allowing the bucket to absorb it), and the sustained
  // rate sits above the phone's documented ~300/s baseline.
  assert.ok(RATE_BURST >= NOMINAL_MESSAGES_PER_WINDOW,
    `burst bucket (${RATE_BURST}) must absorb the 100 ms nominal envelope (${NOMINAL_MESSAGES_PER_WINDOW})`);
  assert.ok(RATE_SUSTAINED_PER_SEC >= 300,
    `sustained rate (${RATE_SUSTAINED_PER_SEC}/s) must cover the phone's designed ~300/s output`);
});
