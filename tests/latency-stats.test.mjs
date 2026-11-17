// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The latency of the control path, phase by phase: the queue on the phone,
// the network, the dispatch in the host, and the write Live itself takes.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { WebSocket } from "ws";

if (typeof globalThis.__dirname === "undefined") {
  globalThis.__dirname = path.join(process.cwd(), "dist");
}

const { getLatencyStats, recordControlFrame, resetLatencyStats, forgetClient, PHASE_RING_SIZE } =
  await import("../src/server/latency-stats.ts");
const serverState = await import("../src/server/state.ts");
const { getControllerToken } = await import("../src/server/session-auth.ts");
const { dispatchClockMs, trackedClients } = await import("../src/server/ws.ts");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PHONE_ID = "11111111-2222-4333-8444-555555555555";
const VIEWER_ID = "22222222-3333-4444-8555-666666666666";
let nextSessionPort = 16240;

function frame(seq, ageMs, rttMs, name = "fader-1") {
  return JSON.stringify({ type: "control_frame", seq, age_ms: ageMs, rtt_ms: rttMs, controls: [{ name, value: 0.5 }] });
}

function socketUrl(port, clientId, token) {
  const query = token ? `token=${token}&client_id=${clientId}` : `client_id=${clientId}`;
  return `ws://127.0.0.1:${port}/ws?${query}`;
}

async function withSession(fn) {
  resetLatencyStats();
  process.env.RC_SURFACE_PORT = String(nextSessionPort);
  nextSessionPort += 4;
  await serverState.startServer();
  const port = serverState.actualPort;
  try {
    return await fn({ port });
  } finally {
    await serverState.stopServer();
    resetLatencyStats();
  }
}

async function openSocket(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  await sleep(60);
  return ws;
}

test("the phase rings keep the newest samples and report known percentiles", () => {
  resetLatencyStats();
  for (let seq = 0; seq < 600; seq += 1) recordControlFrame("phone-1", { seq, ageMs: seq, rttMs: 20 }, 1);
  let stats = getLatencyStats();
  assert.equal(stats.phoneQueueMs.count, PHASE_RING_SIZE, "the ring is bounded");
  assert.equal(stats.phoneQueueMs.max, 599, "the newest samples win");
  assert.equal(stats.phoneQueueMs.p50, 343.5);
  assert.equal(stats.halfRttMs.count, PHASE_RING_SIZE);
  assert.equal(stats.halfRttMs.p50, 10, "the round trip counts as its half");

  resetLatencyStats();
  for (const [index, age] of [10, 20, 30, 40].entries()) recordControlFrame("phone-1", { seq: index, ageMs: age }, 1);
  stats = getLatencyStats();
  assert.equal(stats.phoneQueueMs.p50, 25);
  assert.equal(stats.phoneQueueMs.p95, 38.5);
  assert.equal(stats.phoneQueueMs.max, 40);
  assert.equal(stats.phoneQueueMs.count, 4);
  assert.equal(stats.hostDispatchMs.count, 4);
});

test("a gap in the frame numbers counts the frames that never arrived", () => {
  resetLatencyStats();
  recordControlFrame("phone-1", { seq: 0 }, 1);
  recordControlFrame("phone-1", { seq: 3, ageMs: 4 }, 1);
  let stats = getLatencyStats();
  assert.equal(stats.clients.length, 1);
  assert.equal(stats.clients[0].frames, 2);
  assert.equal(stats.clients[0].skippedSeq, 2, "frames 1 and 2 never arrived");
  assert.equal(stats.clients[0].lastSeq, 3);

  // A frame number that does not grow starts a new stream: the phone
  // restarted its counter, so nothing was lost.
  recordControlFrame("phone-1", { seq: 1, ageMs: 4 }, 1);
  stats = getLatencyStats();
  assert.equal(stats.clients[0].skippedSeq, 2, "a new stream counts no loss");
  assert.equal(stats.clients[0].lastSeq, 1);
  assert.equal(stats.clients[0].frames, 3);
});

test("forgetClient and resetLatencyStats clear the counters", () => {
  resetLatencyStats();
  recordControlFrame("phone-1", { seq: 0, ageMs: 4 }, 1);
  forgetClient("phone-1");
  assert.equal(getLatencyStats().clients.length, 0);
  recordControlFrame("phone-2", { seq: 0, ageMs: 4 }, 1);
  resetLatencyStats();
  const stats = getLatencyStats();
  assert.equal(stats.clients.length, 0);
  assert.equal(stats.phoneQueueMs.count, 0);
  assert.equal(stats.halfRttMs.count, 0);
  assert.equal(stats.hostDispatchMs.count, 0);
});

test("the estimate is the sum of the phase percentiles and the notes name the limits", () => {
  resetLatencyStats();
  recordControlFrame("phone-1", { seq: 0, ageMs: 10, rttMs: 20 }, 2);
  const stats = getLatencyStats();
  const sum = (key) => stats.phoneQueueMs[key] + stats.halfRttMs[key] + stats.hostDispatchMs[key] + stats.actuatorWriteMs[key];
  assert.equal(stats.estimate.label, "sumOfPhasePercentiles");
  assert.equal(stats.estimate.p50, sum("p50"));
  assert.equal(stats.estimate.p95, sum("p95"));
  assert.ok(stats.notes.some((note) => note.includes("RTT/2")), "the notes name the round trip");
  assert.ok(stats.notes.some((note) => note.includes("rate limiter")), "the notes name the dropped frames");
  assert.ok(stats.notes.some((note) => note.includes("lower bound")), "the notes name the lower bound");
});

test("the dispatch clock falls back to the wall clock without process.hrtime", () => {
  const wall = dispatchClockMs(false);
  assert.ok(Math.abs(wall - Date.now()) < 50, "the fallback reads the wall clock");
  assert.ok(dispatchClockMs(true) > 0, "the monotonic clock runs");
});

test("a live-write frame is measured phase by phase and a viewer frame is not", async () => {
  await withSession(async ({ port }) => {
    const phone = await openSocket(socketUrl(port, PHONE_ID, getControllerToken()));
    phone.send(frame(0, 12, 20));
    await sleep(120);
    let stats = getLatencyStats();
    assert.equal(stats.phoneQueueMs.count, 1);
    assert.equal(stats.phoneQueueMs.p50, 12);
    assert.equal(stats.halfRttMs.p50, 10);
    assert.equal(stats.hostDispatchMs.count, 1);
    assert.equal(stats.clients.length, 1);
    assert.equal(stats.clients[0].clientId, PHONE_ID);
    assert.equal(stats.clients[0].frames, 1);
    assert.equal(stats.clients[0].lastSeq, 0);

    const viewer = await openSocket(socketUrl(port, VIEWER_ID, ""));
    viewer.send(frame(0, 12, 20));
    await sleep(120);
    stats = getLatencyStats();
    assert.equal(stats.phoneQueueMs.count, 1, "a viewer frame is never measured");
    assert.equal(stats.clients.length, 1, "a viewer is not a client of the stream");

    // The single control and the descriptor batch are not measured: only the
    // frame path carries the telemetry of the stream.
    phone.send(JSON.stringify({ type: "control", control: { name: "fader-2", value: 0.5 } }));
    phone.send(JSON.stringify({
      type: "controls",
      controls: ["transient", "kick", "snare", "brightness"].map((n) => ({ name: `sensor.audio.${n}`, value: 0.5 })),
    }));
    await sleep(120);
    stats = getLatencyStats();
    assert.equal(stats.phoneQueueMs.count, 1, "only the frame path is measured");
    assert.equal(stats.hostDispatchMs.count, 1);
    phone.close();
    viewer.close();
  });
});

test("the client is forgotten on disconnect and when a newer socket replaces it", async () => {
  await withSession(async ({ port }) => {
    const first = await openSocket(socketUrl(port, PHONE_ID, getControllerToken()));
    first.send(frame(0, 12, 20));
    await sleep(120);
    assert.equal(getLatencyStats().clients.length, 1);

    // A newer socket takes the client id over: the counters of the session
    // it replaced are over with it.
    const second = await openSocket(socketUrl(port, PHONE_ID, getControllerToken()));
    await sleep(150);
    assert.equal(getLatencyStats().clients.length, 0, "the replaced session is forgotten");

    second.send(frame(0, 12, 20));
    await sleep(120);
    const stats = getLatencyStats();
    assert.equal(stats.clients.length, 1);
    assert.equal(stats.clients[0].frames, 1, "the new session starts a new stream");

    second.close();
    await sleep(250);
    assert.equal(getLatencyStats().clients.length, 0, "a disconnect forgets the client");
  });
});

test("a frame with a broken timing is ignored but still applies", async () => {
  await withSession(async ({ port }) => {
    const phone = await openSocket(socketUrl(port, PHONE_ID, getControllerToken()));
    phone.send(JSON.stringify({
      type: "control_frame",
      seq: "seven",
      controls: [{ name: "fader-9", value: 0.5 }],
    }));
    await sleep(150);
    const stats = getLatencyStats();
    assert.equal(stats.phoneQueueMs.count, 0, "a broken timing is not measured");
    assert.equal(stats.halfRttMs.count, 0);
    assert.equal(stats.hostDispatchMs.count, 0);
    assert.equal(stats.clients.length, 0);
    assert.ok(trackedClients.get(PHONE_ID)?.history["fader-9"], "the controls of the frame still apply");
    phone.close();
  });
});
