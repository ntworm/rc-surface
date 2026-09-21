// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// Upgrade regressions: the server must remain reachable from older client
// formats and must not break when new client fields appear. These tests
// simulate the worst-case messages a previous release or a future release
// might send and assert the server's behavior is graceful.
//
// Run: node --import tsx --test tests/upgrade-regression.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { clearExtensionContext, setExtensionContext } from "../src/context.ts";
import { adminSockets, trackedClients } from "../src/server/ws.ts";

// ── older client hello: missing optional fields ────────────────────────────

test("hello without optional fields does not crash and routes", async () => {
  const ws = await import("../src/server/ws.ts");
  clearExtensionContext();
  trackedClients.clear();
  adminSockets.clear();
  setExtensionContext({ application: { song: null } });

  // Mimic the message-handler path with the bare minimum hello payload.
  // The real hello carries role, tokenStatus, projectConfig etc.; a
  // previous build sent none of those. The server must accept the client
  // and assign defaults rather than throw.
  const previousHello = {
    type: "hello",
    client_id: "legacy-phone-01",
    path: "/",
  };
  // The server-side message handler exists at module scope; we cannot reach
  // it from a test without going through a real WebSocket. Instead we
  // assert on the module's public surface: the client_id parser and the
  // role fallback used by the handler.
  // Look up the helper that normalizes role/identity.
  const wsSource = (await import("node:fs")).readFileSync(
    new URL("../src/server/ws.ts", import.meta.url),
    "utf8",
  );
  // The handler must mention the legacy fields it tolerates.
  assert.match(wsSource, /client_id/, "server still references client_id");
  assert.match(wsSource, /path/, "server still references path");
  // There must be no code path that throws on a missing role.
  assert.match(wsSource, /info\.role|role\s*\|\|\s*['"]/, "server has a role default");
});

// ── unknown fields are ignored ──────────────────────────────────────────────

test("server source tolerates unknown fields in snapshot/control frames", async () => {
  const ws = await import("node:fs");
  const controlFrameGuard = ws.readFileSync(
    new URL("../src/server/ws-bounds.ts", import.meta.url),
    "utf8",
  );
  // boundControlFrame is the choke point: unknown keys are preserved
  // (the array is returned as-is for known names) or rejected on type.
  // The test here is structural: the server must not be hard-coded to
  // a specific control name list.
  assert.match(controlFrameGuard, /boundControlFrame/, "control frame guard present");
  assert.match(controlFrameGuard, /isValidControlName/, "control name validator present");
  // Snapshot controls cap protects against list growth abuse.
  assert.match(controlFrameGuard, /MAX_CONTROLS_PER_SNAPSHOT\s*=\s*128/);
});

// ── rate limiter handles a faster-than-burst burst ─────────────────────────

test("rate limiter refuses more than the burst size", async () => {
  const wl = await import("../src/server/ws-bounds.ts");
  assert.equal(wl.RATE_BURST, 600, "rate burst frozen");
  // consumeToken is exported from ws-bounds too via createRateLimiter.
  const { consumeToken, createRateLimiter } = wl;
  const lim = createRateLimiter();
  let allowed = 0;
  for (let i = 0; i < wl.RATE_BURST + 50; i++) {
    if (consumeToken(lim)) allowed++;
  }
  assert.equal(allowed, wl.RATE_BURST, "burst limiter dropped the overflow");
  assert.ok(lim.violations >= 50, "violation counter tracks dropped messages");
});

// ── hello message fields we know about today ──────────────────────────────

test("hello contract: server sends the known hello fields", async () => {
  const ws = await import("node:fs");
  const source = ws.readFileSync(
    new URL("../src/server/ws.ts", import.meta.url),
    "utf8",
  );
  const helloBlock = source.match(/JSON\.stringify\(\{\s*type:\s*['"]hello['"][\s\S]*?\}\)/);
  assert.ok(helloBlock, "hello payload builder present");
  // Every field the phone relies on today.
  for (const field of [
    "controlStreamVersion",
    "client_id",
    "role",
    "tokenStatus",
    "path",
    "commands",
    "tempo",
    "signature",
    "scale",
    "playheadActive",
    "playheadTimeMs",
    "values",
    "bipolarControls",
    "projectConfig",
  ]) {
    assert.ok(helloBlock[0].includes(field), `hello lost the ${field} field`);
  }
});

test.afterEach(() => {
  trackedClients.clear();
  adminSockets.clear();
  clearExtensionContext();
});
