// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import test from "node:test";
import assert from "node:assert/strict";

// RED: src/server/ws.ts já existe. Estes testes verificam exports que serão adicionados
// na Task 6 ou se já existem não-exportados.

test("ws.ts exports appendHistory", async () => {
  const mod = await import("../src/server/ws.ts");
  assert.equal(typeof mod.appendHistory, "function",
    "appendHistory should be exported as a helper");
});

test("ws.ts exports broadcastToAdmins", async () => {
  const mod = await import("../src/server/ws.ts");
  assert.equal(typeof mod.broadcastToAdmins, "function");
});

test("appendHistory caps at HISTORY_MAX (120 ring-buffer entries)", async () => {
  const { appendHistory, HISTORY_MAX } = await import("../src/server/ws.ts");
  assert.equal(HISTORY_MAX, 120, "HISTORY_MAX should be 120");
  // fake tracked client with empty history
  const c = { history: {} };
  for (let i = 0; i < HISTORY_MAX + 50; i++) {
    appendHistory(c, "knob1", i, Date.now());
  }
  const series = c.history.knob1;
  assert.ok(series.length <= HISTORY_MAX,
    `history should be capped at ${HISTORY_MAX}, got ${series.length}`);
});

test("ws.ts treats typed phone messages as non-command envelopes", async () => {
  const { isCommandEnvelope } = await import("../src/server/ws.ts");

  assert.equal(isCommandEnvelope({ type: "snapshot" }), false);
  assert.equal(isCommandEnvelope({ type: "ping" }), false);
  assert.equal(isCommandEnvelope({ cmd: "getServerInfo" }), true);
  assert.equal(isCommandEnvelope({ cmd: 42 }), false);
});

test("shared surface state evicts its oldest key at the cache limit", async () => {
  const {
    recordSurfaceValue,
    resetSurfaceState,
    surfaceControlValues,
  } = await import("../src/server/ws.ts");
  const { CACHE_MAX_ENTRIES } = await import("../src/server/ws-bounds.ts");

  resetSurfaceState();
  for (let i = 0; i <= CACHE_MAX_ENTRIES; i += 1) {
    recordSurfaceValue("cache-test", `control-${i}`, i / CACHE_MAX_ENTRIES);
  }

  assert.equal(surfaceControlValues.size, CACHE_MAX_ENTRIES);
  assert.equal(surfaceControlValues.has("control-0"), false);
  assert.equal(surfaceControlValues.has(`control-${CACHE_MAX_ENTRIES}`), true);
  resetSurfaceState();
});

test("per-client history evicts its oldest signal at the cache limit", async () => {
  const { appendHistory } = await import("../src/server/ws.ts");
  const { CACHE_MAX_ENTRIES } = await import("../src/server/ws-bounds.ts");
  const client = { history: {}, historyWritten: {}, adminHistoryCursor: { "signal-0": 1 } };

  for (let i = 0; i <= CACHE_MAX_ENTRIES; i += 1) {
    appendHistory(client, `signal-${i}`, i, i);
  }

  assert.equal(Object.keys(client.history).length, CACHE_MAX_ENTRIES);
  assert.equal(Object.hasOwn(client.history, "signal-0"), false);
  assert.equal(Object.hasOwn(client.history, `signal-${CACHE_MAX_ENTRIES}`), true);
  assert.equal(Object.hasOwn(client.historyWritten, "signal-0"), false);
  assert.equal(Object.hasOwn(client.adminHistoryCursor, "signal-0"), false);
});

test("per-client history treats prototype names as ordinary signal data", async () => {
  const { appendHistory } = await import("../src/server/ws.ts");
  const client = { history: {}, historyWritten: {}, adminHistoryCursor: {} };

  for (const name of ["__proto__", "constructor", "toString"]) {
    appendHistory(client, name, 0.5, 1);
    assert.equal(Object.hasOwn(client.history, name), true);
    assert.deepEqual(client.history[name], [[1, 0.5]]);
    assert.equal(client.historyWritten[name], 1);
  }
});
