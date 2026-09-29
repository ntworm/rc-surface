// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

process.env.RC_SURFACE_PORT = "16162";

import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { TriggerNoteClock, nextTriggerBeat } from "../src/live/trigger-note-clock.ts";
import { TriggerNoteScheduler } from "../src/live/trigger-note-scheduler.ts";
import { oscTransport } from "../src/live/osc-transport.ts";
import { triggerNoteClock } from "../src/live/mappings.ts";
import { startServer, stopServer, actualPort } from "../src/server/state.ts";
import { getControllerToken } from "../src/server/session-auth.ts";

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

async function withoutGlobalPerformanceAsync(fn) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "performance");
  delete globalThis.performance;
  try {
    return await fn();
  } finally {
    if (saved) Object.defineProperty(globalThis, "performance", saved);
  }
}

test("ExtensionHost regression: TriggerNoteClock works with safe fallback when global performance is undefined", () => {
  withoutGlobalPerformance(() => {
    assert.equal(typeof performance, "undefined");
    const clock = new TriggerNoteClock();
    const snap = clock.snapshot();
    assert.equal(typeof snap, "object");
    assert.equal(snap.valid, false);

    clock.updateTransport(true, true, 120, 4, 4);
    clock.observePosition(1.0, 120, 4, 4);
    const snap2 = clock.snapshot();
    assert.equal(snap2.valid, true);
    assert.equal(snap2.playing, true);

    const targetBeat = nextTriggerBeat(snap2.beat, "beat", snap2.beatsPerBar);
    assert.equal(typeof targetBeat, "number");
  });
});

test("ExtensionHost regression: TriggerNoteScheduler works with safe fallback when global performance is undefined", async () => {
  await withoutGlobalPerformanceAsync(async () => {
    assert.equal(typeof performance, "undefined");
    const clock = new TriggerNoteClock();
    const scheduler = new TriggerNoteScheduler(clock);
    const lane = {};
    scheduler.enqueue({
      lane,
      key: "test-lane",
      timing: "beat",
      durationMs: 80,
      send: () => ({ started: Promise.resolve(true), release: async () => {} }),
      isCurrent: () => true,
      feedback: () => {},
    });
    scheduler.refresh();
    await scheduler.dispose();
  });
});

test("oscTransport regression: updateTransport recognizes isPlaying property", () => {
  oscTransport.emit("update", {
    isPlaying: true,
    connected: true,
    tempo: 125,
    signatureNumerator: 4,
    signatureDenominator: 4,
  });
  const snap = triggerNoteClock.snapshot();
  assert.equal(snap.playing, true, "triggerNoteClock must reflect isPlaying: true from oscTransport");

  oscTransport.emit("update", {
    isPlaying: false,
    connected: true,
    tempo: 125,
    signatureNumerator: 4,
    signatureDenominator: 4,
  });
  const snapPaused = triggerNoteClock.snapshot();
  assert.equal(snapPaused.playing, false, "triggerNoteClock must reflect isPlaying: false from oscTransport");
});

test.before(async () => { await startServer(); });
test.after(async () => { await stopServer(); });

test("ExtensionHost regression: sendHello succeeds and emits controlStreamVersion=1 even without global performance", async () => {
  await withoutGlobalPerformanceAsync(async () => {
    assert.equal(typeof performance, "undefined");
    const token = getControllerToken();
    const msg = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${actualPort}/ws?token=${token}`);
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error("timed out waiting for hello without global performance"));
      }, 5000);
      ws.on("message", (raw) => {
        const parsed = JSON.parse(raw.toString());
        if (parsed.type !== "hello") return;
        clearTimeout(timer);
        ws.close();
        resolve(parsed);
      });
      ws.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    assert.equal(msg.type, "hello");
    assert.equal(msg.controlStreamVersion, 1);
    assert.ok(msg.client_id, "hello must announce client_id");
    assert.equal(msg.tokenStatus, "valid");
    assert.equal(msg.role, "controller");
    assert.ok(msg.clock, "hello must include clock snapshot even without performance global");
  });
});
