// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

import { clearExtensionContext, setExtensionContext } from "../src/context.ts";
import { adminSockets, trackedClients } from "../src/server/ws.ts";
import { oscTransport } from "../src/live/osc-transport.ts";
import { LFO_SUBDIVISIONS } from "../src/live/transport-clock.ts";
import {
  activeSmooths,
  clearHostModulatorsForClient,
  controlMappings,
  eventModesState,
  hostModulators,
  lastMappedValues,
  stopHostModulatorLoop,
  tickHostModulators as tickAtTime,
  updateHostModulator,
} from "../src/live/mappings.ts";
import { continuousTargetActuator } from "../src/live/continuous-target-actuator.ts";

// Config messages and manual ticks must use the same host clock.
let testNow = 100000;
test.beforeEach(t => {
  testNow = 100000;
  t.mock.method(Date, "now", () => testNow);
});
async function tickHostModulators(now) {
  testNow = 100000 + now;
  return tickAtTime(testNow);
}

function resetState() {
  stopHostModulatorLoop();
  continuousTargetActuator.stop();
  controlMappings.clear();
  lastMappedValues.clear();
  activeSmooths.clear();
  eventModesState.clear();
  hostModulators.clear();
  trackedClients.clear();
  adminSockets.clear();
  oscTransport.state.available = false;
  oscTransport.state.connected = false;
  oscTransport.state.isPlaying = false;
  oscTransport.state.currentSongTimeBeats = 0;
  oscTransport.lastSongTimeUpdateAt = Date.now();
  clearExtensionContext();
}

function setupMappedParam(controlName) {
  const applied = [];
  const param = {
    min: 0,
    max: 1,
    setValue(value) {
      applied.push(value);
    },
  };

  setExtensionContext({
    application: {
      song: {
        tempo: 120,
        tracks: [
          {
            devices: [
              {
                parameters: [param],
              },
            ],
          },
        ],
      },
    },
  });
  controlMappings.set(controlName, [
    { type: "device_param", trackIndex: 0, deviceIndex: 0, paramIndex: 0 },
  ]);

  return applied;
}

function setupTrackedClient(id = "client-1") {
  trackedClients.set(id, {
    id,
    ipAddress: "127.0.0.1",
    displayName: "phone",
    isAdmin: false,
    mode: "performance",
    path: "/ws",
    connectedAt: Date.now(),
    lastSeen: Date.now(),
    userAgent: "test",
    lastData: null,
    history: {},
    ws: { readyState: WebSocket.OPEN },
  });
}

test("host LFO motor generates mapped values from modulator state", async () => {
  resetState();
  const applied = setupMappedParam("toggle-1");

  try {
    updateHostModulator("client-1", {
      kind: "lfo",
      name: "toggle-1",
      active: true,
      rate: 1,
      depth: 1,
      syncMode: "free",
    });

    await tickHostModulators(0);
    await tickHostModulators(100); // 0.4 cycles at the 4Hz sine ceiling (smoothing clamps the value).

    assert.deepEqual(applied.map((v) => Number(v.toFixed(6))), [0, 0.904508]);
  } finally {
    resetState();
  }
});

test("host LFO motor publishes generated values to the admin panel feed", async () => {
  resetState();
  setupMappedParam("toggle-1");
  const adminMessages = [];
  const adminSocket = {
    readyState: WebSocket.OPEN,
    send(message) {
      adminMessages.push(JSON.parse(message));
    },
  };
  adminSockets.add(adminSocket);
  setupTrackedClient();

  try {
    updateHostModulator("client-1", {
      kind: "lfo",
      name: "toggle-1",
      active: true,
      rate: 1,
      depth: 1,
      syncMode: "free",
    });

    await tickHostModulators(0);

    const latestUpdate = adminMessages.findLast((msg) => msg.type === "client_update");
    assert.ok(latestUpdate, "expected host-generated values to notify admin clients");
    assert.equal(latestUpdate.client.client_id, "client-1");
    assert.equal(latestUpdate.latest.controls.at(-1).name, "toggle-1");
    assert.equal(latestUpdate.latest.controls.at(-1).value, 0);
    // History travels in full when a dashboard connects and as a delta after
    // that; this socket was attached directly, so it gets the delta framing.
    // Either way the samples are the same.
    const samples = (latestUpdate.history ?? latestUpdate.historyDelta)["toggle-1"];
    assert.equal(samples.at(-1)[1], 0);
  } finally {
    resetState();
  }
});

test("host LFO motor interpolates morph targets without per-frame phone updates", async () => {
  resetState();
  setupMappedParam("toggle-1");

  try {
    updateHostModulator("client-1", {
      kind: "lfo",
      name: "toggle-1",
      active: true,
      rate: 0.2,
      depth: 0.2,
      syncMode: "free",
    });
    await tickHostModulators(0);

    updateHostModulator("client-1", {
      kind: "lfo",
      name: "toggle-1",
      active: true,
      rate: 0.8,
      depth: 1,
      syncMode: "free",
      morphMs: 1000,
    });
    await tickHostModulators(500);

    const state = hostModulators.get("client-1::toggle-1");
    assert.ok(state, "expected active host LFO state");
    assert.ok(state.rate > 0.45 && state.rate < 0.55, `expected interpolated rate, got ${state.rate}`);
    assert.ok(state.depth > 0.55 && state.depth < 0.65, `expected interpolated depth, got ${state.depth}`);

    await tickHostModulators(1000);

    assert.equal(Number(state.rate.toFixed(3)), 0.8);
    assert.equal(Number(state.depth.toFixed(3)), 1);
  } finally {
    resetState();
  }
});

test("host synced LFO applies updated shape while already active", async () => {
  resetState();
  const applied = setupMappedParam("toggle-1");
  oscTransport.state.available = true;
  oscTransport.state.connected = true;
  oscTransport.state.isPlaying = true;
  oscTransport.state.currentSongTimeBeats = 0;
  oscTransport.lastSongTimeUpdateAt = 0;

  try {
    updateHostModulator("client-1", {
      kind: "lfo",
      name: "toggle-1",
      active: true,
      rate: 0.5,
      depth: 1,
      syncMode: "sync",
      clockSource: "osc",
      syncSubdivisionBeats: 4,
      shape: "sine",
    });
    await tickHostModulators(0);

    updateHostModulator("client-1", {
      kind: "lfo",
      name: "toggle-1",
      active: true,
      rate: 0.5,
      depth: 1,
      syncMode: "sync",
      clockSource: "osc",
      syncSubdivisionBeats: 4,
      shape: "square",
    });
    await tickHostModulators(0);

    assert.equal(applied.at(-2), 0.5);
    assert.equal(applied.at(-1), 1);
    assert.equal(hostModulators.get("client-1::toggle-1")?.shape, "square");
  } finally {
    resetState();
  }
});

test("host LFO morph keeps active until inactive target completes", async () => {
  resetState();
  const applied = setupMappedParam("toggle-1");

  try {
    updateHostModulator("client-1", {
      kind: "lfo",
      name: "toggle-1",
      active: true,
      rate: 0.5,
      depth: 0.7,
      syncMode: "free",
    });
    await tickHostModulators(0);

    updateHostModulator("client-1", {
      kind: "lfo",
      name: "toggle-1",
      active: false,
      rate: 0.5,
      depth: 0,
      syncMode: "free",
      morphMs: 1000,
    });
    await tickHostModulators(500);

    assert.ok(hostModulators.has("client-1::toggle-1"), "inactive morph should keep host LFO alive mid-transition");

    await tickHostModulators(1000);

    assert.equal(hostModulators.has("client-1::toggle-1"), false);
    assert.equal(applied.at(-1), 0);
  } finally {
    resetState();
  }
});

test("host LFO motor applies to Live before publishing admin panel updates", async () => {
  resetState();
  const events = [];
  const param = {
    min: 0,
    max: 1,
    setValue(value) {
      events.push(["live", value]);
    },
  };

  setExtensionContext({
    application: {
      song: {
        tempo: 120,
        tracks: [
          {
            devices: [
              {
                parameters: [param],
              },
            ],
          },
        ],
      },
    },
  });
  controlMappings.set("toggle-1", [
    { type: "device_param", trackIndex: 0, deviceIndex: 0, paramIndex: 0 },
  ]);
  adminSockets.add({
    readyState: WebSocket.OPEN,
    send() {
      events.push(["admin"]);
    },
  });
  setupTrackedClient();

  try {
    updateHostModulator("client-1", {
      kind: "lfo",
      name: "toggle-1",
      active: true,
      rate: 1,
      depth: 1,
      syncMode: "free",
    });

    await tickHostModulators(0);

    assert.equal(events[0][0], "live");
    assert.equal(events[1][0], "admin");
  } finally {
    resetState();
  }
});

test("host stutter motor generates mapped pulses from modulator state", async () => {
  resetState();
  const applied = setupMappedParam("button-1");

  try {
    updateHostModulator("client-1", {
      kind: "stutter",
      name: "button-1",
      active: true,
      rate: 1,
      count: 1,
      depth: 1,
      syncMode: "free",
    });

    await tickHostModulators(0);
    await tickHostModulators(40);

    assert.deepEqual(applied, [1, 0]);
  } finally {
    resetState();
  }
});

test("clearing a client stops host modulators and sends a final zero", async () => {
  resetState();
  const applied = setupMappedParam("button-1");

  try {
    updateHostModulator("client-1", {
      kind: "stutter",
      name: "button-1",
      active: true,
      rate: 1,
      count: 1,
      syncMode: "free",
    });

    clearHostModulatorsForClient("client-1");
    for (let i = 0; i < 20; i++) await Promise.resolve();

    assert.equal(hostModulators.size, 0);
    assert.equal(applied.at(-1), 0);
  } finally {
    resetState();
  }
});

// ---------------------------------------------------------------------------
// Pad mode D is a shape, and the host is what Live hears.

test("a mode D burst shapes the values the host generates", async () => {
  const source = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("../src/live/host-modulators.ts", import.meta.url), "utf8"));

  // The phone draws its own bar, but this loop is what writes to Live: an
  // envelope applied only on the phone changes the picture and nothing else.
  const escalados = source.match(/burstEnvelope\(state, now\)/g) || [];
  assert.equal(escalados.length, 4,
    "every generated value must be scaled: two LFO paths and two stutter gates");

  // The start is stamped here. Taking it from the phone would compare two
  // unrelated clocks, and a coalesced re-send would restart the envelope.
  assert.match(source, /state\.burstStartMs = Date\.now\(\)/);
  assert.match(source, /state\.burstDurationMs === undefined \|\| state\.burstStartMs === undefined/,
    "a repeat while a burst runs must not restart it");
});

test("the burst envelope opens, closes, and stays out of the way otherwise", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(new URL("../src/live/host-modulators.ts", import.meta.url), "utf8");
  const inicio = source.indexOf("function burstEnvelope(");
  assert.ok(inicio > 0, "burstEnvelope must exist");
  const corpo = source.slice(source.indexOf("{", inicio) + 1, source.indexOf("\n}", inicio));
  // Strip the type annotations; the arithmetic is what is under test.
  const js = corpo.replace(/: HostModulatorState|: number/g, "");
  const env = new Function("state", "now", js);
  const st = { burstStartMs: 0, burstDurationMs: 1000, burstAttackMs: 200 };
  assert.equal(env(st, 0), 0);
  assert.ok(Math.abs(env(st, 100) - 0.5) < 1e-9);
  assert.equal(env(st, 200), 1);
  assert.ok(Math.abs(env(st, 600) - 0.5) < 1e-9);
  assert.equal(env(st, 1000), 0);
  // No burst is the normal case and must scale by exactly one.
  assert.equal(env({}, 500), 1);
});

// ---------------------------------------------------------------------------
// The phone and the host both compute the same things. When they drift, the
// picture on screen stops describing what Live is receiving — which is exactly
// how a burst envelope applied only on the phone looked like a working fix.

async function ler(rel) {
  const fs = await import("node:fs");
  return fs.readFileSync(new URL(rel, import.meta.url), "utf8");
}

function subdivisionTable(source, name) {
  const match = source.match(new RegExp(`\\b${name}\\s*=\\s*\\[([^\\]]+)\\]`));
  assert.ok(match, `${name}: expected a subdivision table`);
  return match[1].split(',').map(value => value.trim()).filter(Boolean).map(value => {
    assert.match(value, /^\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?$/,
      `${name}: expected a beat duration or fraction`);
    const [numerator, denominator = 1] = value.split('/').map(Number);
    return numerator / denominator;
  });
}

test("the subdivision tables agree on both sides of the socket", async () => {
  const phone = await ler("../static/phone-v3/controls.js");
  const host = await ler("../src/live/transport-clock.ts");
  // The phone picks the subdivision from the same rate the host is given, so a
  // table that differs by one entry silently shifts every unpinned rate.
  // P02: 32/16/8 beats (8/4/2 bars) added at the start of LFO_SUBDIVISIONS.
  const lfo = [32, 16, 8, 4, 3, 8 / 3, 2, 1.5, 4 / 3, 1, 0.75, 2 / 3, 0.5,
    0.375, 1 / 3, 0.25, 0.1875, 1 / 6, 0.125, 0.09375, 1 / 12,
    0.0625, 0.046875, 1 / 24, 0.03125];
  const stutter = [1, 0.5, 0.25, 0.125, 0.0625, 0.03125];
  assert.deepEqual(subdivisionTable(phone, 'LFO_SUBDIVISIONS'), lfo, "phone LFO table");
  assert.deepEqual(subdivisionTable(phone, 'STUTTER_SUBDIVISIONS'), stutter, "phone stutter table");
  assert.deepEqual(LFO_SUBDIVISIONS, lfo, "host LFO table");
  assert.deepEqual(subdivisionTable(host, 'STUTTER_SUBDIVISIONS'), stutter, "host stutter table");
});

test("the LFO waveform is the same curve on the phone and in the host", async () => {
  const phone = await ler("../static/phone-v3/controls.js");
  const host = await ler("../src/live/transport-clock.ts");

  function switchDe(source, rotulo) {
    const i = source.indexOf("switch (shape)");
    assert.ok(i > 0, `${rotulo}: waveform switch must exist`);
    // Brace-matched, because the two files indent differently and a slice that
    // guesses the closing line produces a block that will not parse.
    let prof = 0;
    let fim = i;
    for (let k = source.indexOf("{", i); k < source.length; k += 1) {
      if (source[k] === "{") prof += 1;
      else if (source[k] === "}") {
        prof -= 1;
        if (prof === 0) { fim = k + 1; break; }
      }
    }
    assert.ok(fim > i, `${rotulo}: waveform switch must close`);
    return new Function("shape", "phase", `${source.slice(i, fim)}\n  return 0;`);
  }

  const doPhone = switchDe(phone, "phone");
  const doHost = switchDe(host, "host");
  for (const shape of ["sine", "triangle", "ramp_up", "ramp_down", "square", "desconhecida"]) {
    for (const phase of [0, 0.1, 0.25, 0.499, 0.5, 0.75, 0.999]) {
      assert.equal(doPhone(shape, phase), doHost(shape, phase),
        `${shape} at ${phase} differs between the phone and the host`);
    }
  }
});
