// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import test from "node:test";
import assert from "node:assert/strict";
import { VisionLossWatchdog } from "../src/live/vision-loss.ts";

/** Run fn in an environment that has no global performance, like Ableton Live's ExtensionHost. */
function withoutGlobalPerformance(fn) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "performance");
  delete globalThis.performance;
  try {
    return fn();
  } finally {
    if (saved) Object.defineProperty(globalThis, "performance", saved);
  }
}

const LEARNED_CONTROL = "sensor.vision.gesture.1";

test("ExtensionHost regression: VisionLossWatchdog.observe works without global performance", () => {
  withoutGlobalPerformance(() => {
    assert.equal(typeof performance, "undefined");
    const released = [];
    const watchdog = new VisionLossWatchdog({
      policy: () => ({ version: 1, mode: "hold", timeoutMs: 10000, legacy: true }),
      release: (client, control) => { released.push([client, control]); },
    });

    let permitted;
    assert.doesNotThrow(() => {
      permitted = watchdog.observe("client-1", LEARNED_CONTROL, 1, false,
        { seq: 1, qualified: true, graceMs: 500, activation: true });
    });
    assert.equal(permitted, true, "an activation frame with tracking must still permit the dispatch");
    assert.deepEqual(released, []);
    watchdog.reset();
  });
});

test("VisionLossWatchdog reports the loss after the timeout when a clock is injected", () => {
  let now = 1000;
  let armed = null;
  const events = [];
  const watchdog = new VisionLossWatchdog({
    policy: () => ({ version: 1, mode: "timeout", timeoutMs: 200, legacy: false }),
    release: (client, control) => { events.push(["release", client, control]); },
    loss: (client, control) => { events.push(["loss", client, control]); },
    now: () => now,
    set: (fn) => { armed = fn; return 1; },
    clear: () => { armed = null; },
  });

  assert.equal(watchdog.observe("client-1", LEARNED_CONTROL, 1, false,
    { seq: 1, qualified: true, graceMs: 50, activation: true }), true);
  assert.deepEqual(events, [], "a qualified frame must not report a loss");

  now = 1100; // past the grace, still inside the timeout
  assert.ok(armed, "a timer must be armed for the loss deadline");
  armed();
  assert.deepEqual(events, [["loss", "client-1", LEARNED_CONTROL]]);

  now = 1300; // past lastQualified + timeoutMs
  assert.ok(armed, "the gate must stay armed until the timeout expires");
  armed();
  assert.deepEqual(events, [
    ["loss", "client-1", LEARNED_CONTROL],
    ["release", "client-1", LEARNED_CONTROL],
  ]);
});
