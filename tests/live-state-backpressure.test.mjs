// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// Live broadcast backpressure contract (P03):
//   - playhead_state frames are telemetry: dropped above 512 KiB buffered,
//     replaced by the next periodic frame; never queued behind a slow client.
//   - live_state changes are critical: a unique scale/tempo change must not
//     disappear, so it is delivered up to the 2 MiB disconnect ceiling.
//   - Above 2 MiB the slow client is closed with code 4008; a reconnect gets
//     the current state back through hello.
//   - Admins keep their existing role behavior and never receive either
//     broadcast; an exception in one client's send never blocks the others.
//
// No real sockets and no Live: trackedClients is isolated per case and the
// extension context is a stub song.
import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { clearExtensionContext, setExtensionContext } from "../src/context.ts";
import { trackedClients } from "../src/server/ws.ts";
import {
  BACKPRESSURE_DROP_THRESHOLD,
  BACKPRESSURE_DISCONNECT_THRESHOLD,
} from "../src/server/ws-bounds.ts";

const stateMod = await import("../src/live/state.ts");

const SONG = {
  tempo: 120,
  scenes: [{ signatureNumerator: 4, signatureDenominator: 4 }],
  scaleMode: false,
  scaleName: "Major",
  rootNote: 0,
  scaleIntervals: [0, 2, 4, 5, 7, 9, 11],
};

function resetCache() {
  // The module exports a live binding: reassignment is not allowed from
  // outside, so mutate the cached snapshot's own fields instead.
  Object.assign(stateMod.lastBroadcastedState, {
    tempo: -1,
    signature: "",
    scale: "",
    scaleMode: false,
    scaleName: "",
    rootNote: 0,
    scaleIntervals: [],
  });
}

function makeClient({ bufferedAmount = 0, isAdmin = false, sendError = null, readyState = WebSocket.OPEN } = {}) {
  const observed = { sent: [], closed: null };
  const ws = {
    readyState,
    bufferedAmount,
    send(data) {
      if (sendError) throw sendError;
      observed.sent.push(JSON.parse(data));
    },
    close(code, reason) {
      observed.closed = { code, reason };
    },
  };
  return { isAdmin, role: isAdmin ? "admin" : "controller", ws, observed };
}

function setupClients(...clients) {
  trackedClients.clear();
  for (const [i, c] of clients.entries()) trackedClients.set(`client-${i}`, c);
}

function setSong(song) {
  setExtensionContext({ application: { song } });
}

// ── playhead_state is telemetry ─────────────────────────────────────────────

test("playhead broadcast is dropped above 512 KiB and never closes the socket", () => {
  const slow = makeClient({ bufferedAmount: BACKPRESSURE_DROP_THRESHOLD + 1 });
  setupClients(slow);

  stateMod.broadcastPlayheadState();

  assert.equal(slow.observed.sent.length, 0, "telemetry frame must be skipped above 512 KiB");
  assert.equal(slow.observed.closed, null, "telemetry drop must not close the socket");
});

test("playhead broadcast is sent exactly at the 512 KiB boundary and at +1 byte is dropped", () => {
  const atBoundary = makeClient({ bufferedAmount: BACKPRESSURE_DROP_THRESHOLD });
  setupClients(atBoundary);
  stateMod.broadcastPlayheadState();
  assert.equal(atBoundary.observed.sent.length, 1, "512 KiB exactly must still send");
  assert.equal(atBoundary.observed.sent[0].type, "playhead_state");

  const overBoundary = makeClient({ bufferedAmount: BACKPRESSURE_DROP_THRESHOLD + 1 });
  setupClients(overBoundary);
  stateMod.broadcastPlayheadState();
  assert.equal(overBoundary.observed.sent.length, 0, "512 KiB + 1 byte must drop");
  assert.equal(overBoundary.observed.closed, null);
});

test("playhead broadcast above 2 MiB closes with 4008 without sending", () => {
  const stuck = makeClient({ bufferedAmount: BACKPRESSURE_DISCONNECT_THRESHOLD + 1 });
  setupClients(stuck);

  stateMod.broadcastPlayheadState();

  assert.equal(stuck.observed.sent.length, 0, "nothing may be enqueued behind 2 MiB");
  assert.deepEqual(stuck.observed.closed, { code: 4008, reason: "slow client: backpressure exceeded" });
});

test("playhead broadcast skips non-OPEN sockets silently", () => {
  const closing = makeClient({ readyState: WebSocket.CLOSING });
  setupClients(closing);

  stateMod.broadcastPlayheadState();

  assert.equal(closing.observed.sent.length, 0);
  assert.equal(closing.observed.closed, null);
});

// ── live_state is critical ──────────────────────────────────────────────────

test("live_state change is delivered at 600 KiB buffered (critical priority)", () => {
  const busy = makeClient({ bufferedAmount: 600 * 1024 });
  setupClients(busy);
  setSong({ ...SONG, tempo: 120 });
  resetCache();

  stateMod.checkAndBroadcastLiveState();

  assert.equal(busy.observed.sent.length, 1, "a unique state change must survive 600 KiB");
  assert.equal(busy.observed.sent[0].type, "live_state");
  assert.equal(busy.observed.sent[0].tempo, 120);
  assert.equal(busy.observed.closed, null);
});

test("live_state above 2 MiB closes without sending and the cache still holds the change", () => {
  const stuck = makeClient({ bufferedAmount: BACKPRESSURE_DISCONNECT_THRESHOLD + 1 });
  setupClients(stuck);
  setSong({ ...SONG, tempo: 130 });
  resetCache();

  stateMod.checkAndBroadcastLiveState();

  assert.equal(stuck.observed.sent.length, 0);
  assert.deepEqual(stuck.observed.closed, { code: 4008, reason: "slow client: backpressure exceeded" });
  // The global cache keeps the new state so reconnect/hello restores it.
  assert.equal(stateMod.lastBroadcastedState.tempo, 130);
});

test("live_state is sent exactly at 2 MiB and closes at 2 MiB + 1 byte", () => {
  const atCeiling = makeClient({ bufferedAmount: BACKPRESSURE_DISCONNECT_THRESHOLD });
  setupClients(atCeiling);
  setSong({ ...SONG, tempo: 121 });
  resetCache();
  stateMod.checkAndBroadcastLiveState();
  assert.equal(atCeiling.observed.sent.length, 1, "2 MiB exactly must still deliver critical");
  assert.equal(atCeiling.observed.closed, null);

  const overCeiling = makeClient({ bufferedAmount: BACKPRESSURE_DISCONNECT_THRESHOLD + 1 });
  setupClients(overCeiling);
  setSong({ ...SONG, tempo: 122 });
  resetCache();
  stateMod.checkAndBroadcastLiveState();
  assert.equal(overCeiling.observed.sent.length, 0);
  assert.equal(overCeiling.observed.closed.code, 4008);
});

test("a reconnect after a 2 MiB close receives the new state", () => {
  const stuck = makeClient({ bufferedAmount: BACKPRESSURE_DISCONNECT_THRESHOLD + 1 });
  setupClients(stuck);
  setSong({ ...SONG, tempo: 130 });
  resetCache();
  stateMod.checkAndBroadcastLiveState();
  assert.equal(stuck.observed.closed.code, 4008);

  // The phone reconnects with a fresh socket; the next change reaches it.
  const reconnected = makeClient({ bufferedAmount: 0 });
  setupClients(reconnected);
  setSong({ ...SONG, tempo: 131 });
  stateMod.checkAndBroadcastLiveState();
  assert.equal(reconnected.observed.sent.length, 1);
  assert.equal(reconnected.observed.sent[0].tempo, 131);
});

// ── mixed clients, exceptions, roles ────────────────────────────────────────

test("fast and slow clients coexist: telemetry skips the slow one, critical reaches it", () => {
  const fast = makeClient({ bufferedAmount: 0 });
  const slow = makeClient({ bufferedAmount: 600 * 1024 });
  setupClients(fast, slow);
  setSong({ ...SONG, tempo: 120 });
  resetCache();

  stateMod.broadcastPlayheadState();
  assert.equal(fast.observed.sent.length, 1);
  assert.equal(slow.observed.sent.length, 0, "playhead must skip the slow client");

  stateMod.checkAndBroadcastLiveState();
  assert.equal(fast.observed.sent.length, 2, "fast client gets live_state too");
  assert.equal(slow.observed.sent.length, 1, "slow client gets the critical live_state");
  assert.equal(slow.observed.sent[0].type, "live_state");
});

test("an exception in one client's send never blocks the other clients", () => {
  const broken = makeClient({ sendError: new Error("boom") });
  const healthy = makeClient({ bufferedAmount: 0 });
  setupClients(broken, healthy);
  setSong({ ...SONG, tempo: 120 });
  resetCache();

  stateMod.broadcastPlayheadState();
  stateMod.checkAndBroadcastLiveState();

  assert.equal(healthy.observed.sent.length, 2);
  assert.equal(broken.observed.closed, null);
});

test("admins never receive playhead or live_state broadcasts", () => {
  const admin = makeClient({ isAdmin: true });
  const phone = makeClient({ bufferedAmount: 0 });
  setupClients(admin, phone);
  setSong({ ...SONG, tempo: 120 });
  resetCache();

  stateMod.broadcastPlayheadState();
  stateMod.checkAndBroadcastLiveState();

  assert.equal(admin.observed.sent.length, 0);
  assert.equal(phone.observed.sent.length, 2);
});

// ── teardown ────────────────────────────────────────────────────────────────

test.afterEach(() => {
  trackedClients.clear();
  clearExtensionContext();
});
