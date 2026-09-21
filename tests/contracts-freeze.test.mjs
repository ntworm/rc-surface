// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// Contract freeze: the values below are the wire and behavior contract that
// the phone and host both load from the same source and that the tests
// assert never drift silently. A change here is a deliberate protocol
// version bump, not a refactor.
//
// Run: node --import tsx --test tests/contracts-freeze.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── Protocol bounds (ws-bounds.ts) ─────────────────────────────────────────

test("wire-protocol bounds are frozen", async () => {
  const ws = await import("../src/server/ws-bounds.ts");
  const expected = {
    PER_MESSAGE_DEFLATE: false,
    MAX_PAYLOAD_BYTES: 102_400,
    MAX_WS_CONNECTIONS: 64,
    MAX_WS_CONNECTIONS_PER_IP: 16,
    WS_HEARTBEAT_INTERVAL_MS: 15_000,
    MAX_CLIENT_NAME_LENGTH: 64,
    MAX_CONTROL_NAME_LENGTH: 128,
    MAX_CONTROLS_PER_SNAPSHOT: 128,
    MAX_CONTROLS_PER_IMMEDIATE_BATCH: 12,
    HISTORY_RING_SIZE: 120,
    RATE_BURST: 600,
    RATE_SUSTAINED_PER_SEC: 300,
    RATE_WINDOW_MS: 1_000,
    CACHE_MAX_ENTRIES: 2_048,
    BACKPRESSURE_DROP_THRESHOLD: 512 * 1024,
    BACKPRESSURE_DISCONNECT_THRESHOLD: 2 * 1024 * 1024,
    RATE_NOTICE_INTERVAL_MS: 1_000,
  };
  for (const [k, v] of Object.entries(expected)) {
    assert.equal(ws[k], v, `ws-bounds.${k} drifted from frozen value`);
  }
});

// ── OSC address registry (osc-tokens.ts) ────────────────────────────────────

test("OSC addresses are frozen", async () => {
  const osc = await import("../src/osc-tokens.ts");
  assert.equal(osc.LISTEN.isPlaying, "/live/song/start_listen/is_playing");
  assert.equal(osc.LISTEN.tempo, "/live/song/start_listen/tempo");
  assert.equal(osc.LISTEN.metronome, "/live/song/start_listen/metronome");
  assert.equal(osc.LISTEN.signatureNumerator, "/live/song/start_listen/signature_numerator");
  assert.equal(osc.LISTEN.signatureDenominator, "/live/song/start_listen/signature_denominator");
  assert.equal(osc.LISTEN.currentSongTime, "/live/song/start_listen/current_song_time");
  assert.equal(osc.LISTEN.beat, "/live/song/start_listen/beat");
  assert.equal(osc.LISTEN.selectedTrack, "/live/view/start_listen/selected_track");
  assert.equal(osc.GET.cuePoints, "/live/song/get/cue_points");
  assert.equal(osc.GET.selectedDevice, "/live/view/get/selected_device");
  assert.equal(osc.CMD.startPlaying, "/live/song/start_playing");
  assert.equal(osc.CMD.stopPlaying, "/live/song/stop_playing");
  assert.equal(osc.CMD.jumpToPrevCue, "/live/song/jump_to_prev_cue");
  assert.equal(osc.CMD.jumpToNextCue, "/live/song/jump_to_next_cue");
  assert.equal(osc.CMD.cuePointJump, "/live/song/cue_point/jump");
  assert.equal(osc.LISTENER_QUIET_MS, 1_500);
});

// ── osc-transport.ts must route through osc-tokens.ts ──────────────────────

test("osc-transport routes through the osc-tokens registry", async () => {
  const transportSource = fs.readFileSync(
    path.join(REPO, "src/live/osc-transport.ts"),
    "utf8",
  );
  // The transport must not hand-write OSC addresses; it imports them from
  // the canonical registry. The registry is the single source of truth.
  assert.match(
    transportSource,
    /from\s+['"]\.\.\/osc-tokens(\.js)?['"]/,
    "osc-transport must import from ../osc-tokens.ts so the registry stays canonical",
  );
  // And it must use the registry objects, not raw string concatenation.
  for (const token of ["LISTEN", "GET", "CMD", "RESPONSE"]) {
    assert.ok(
      transportSource.includes(token),
      `osc-transport references the ${token} token group`,
    );
  }
  // Every frozen address must be present as a string somewhere under the
  // registry tree; the transport test below exercises the live wiring.
  const osc = await import("../src/osc-tokens.ts");
  const registryAddresses = new Set([
    ...Object.values(osc.LISTEN),
    ...Object.values(osc.GET),
    ...Object.values(osc.CMD),
    ...Object.values(osc.RESPONSE),
  ]);
  // Walk the source for the registry file and ensure each address appears.
  const registrySource = fs.readFileSync(
    path.join(REPO, "src/osc-tokens.ts"),
    "utf8",
  );
  for (const addr of registryAddresses) {
    assert.ok(
      registrySource.includes(addr),
      `osc-tokens registry is missing ${addr}`,
    );
  }
});

// ── Rhythmic policy is frozen (host side) ─────────────────────────────────

test("transport-clock shape ceilings are frozen", async () => {
  const tc = await import("../src/live/transport-clock.ts");
  // Source: internal/LIVE-WRITE-CEILING-1.0.md fallback (write-ceiling P04 pendente);
  // rule maxHz(shape) = floor(teto_efetivo / minPointsPerCycle(shape)), teto_efetivo ~ 50 escritas/s.
  const expected = { sine: 4, triangle: 3, ramp_up: 3, ramp_down: 3, square: 12 };
  for (const [shape, max] of Object.entries(expected)) {
    assert.equal(tc.getLfoMaxHz(shape), max, `getLfoMaxHz(${shape}) drifted`);
  }
});

// ── Rhythmic policy is frozen (browser side, from the real source file) ───

test("controls.js rhythmic tables match the frozen values", () => {
  const source = fs.readFileSync(path.join(REPO, "static/phone-v3/controls.js"), "utf8");
  // LFO_SHAPE_MAX_HZ table must declare each ceiling. The table uses
  // unquoted keys (JS object literal shorthand): `{ sine: 5, ... }`.
  const table = source.match(/LFO_SHAPE_MAX_HZ\s*=\s*\{[\s\S]*?\}/);
  assert.ok(table, "LFO_SHAPE_MAX_HZ table missing");
  const sliced = table[0];
  for (const [shape, max] of Object.entries({ sine: 4, triangle: 3, ramp_up: 3, ramp_down: 3, square: 12 })) {
    const entryRegex = new RegExp(`(?:^|[,\\s{])${shape}\\s*:\\s*${max}\\b`);
    assert.ok(entryRegex.test(sliced), `LFO_SHAPE_MAX_HZ.${shape} !== ${max} (table: ${sliced})`);
  }
  // STUTTER_SUBDIVISIONS is a separate table: reachability check.
  assert.match(source, /STUTTER_SUBDIVISIONS\s*=\s*\[/);
});
