// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// ROOT CAUSE R7 — the phone cannot edit its own mappings.
//
// Field evidence:
//   Unauthorized: role 'controller' cannot execute 'config-write' command
//   'removeMapping'. Requires 'admin' role.
//
// The MAP panel lives in the PHONE UI, and the phone authenticates as
// `controller` via the QR token. The role gate added on 2026-07-29 classified
// every mapping and preset command as admin-only `config-write`, so binding a
// control silently fails — and because no mapping is ever stored, vision,
// sensor and pad values have nothing to drive. That is why the hand is visibly
// detected while no Live parameter moves.
//
// Earlier builds had no role gate at all, which is why this worked before.
//
// The fix must NOT make every client an admin. Mapping/preset editing is the
// controller's own job; exporting, importing and rolling back the whole
// project config stay admin-only.

import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMAND_SIDE_EFFECTS,
  isRoleAuthorized,
  getRequiredRoleForSideEffect,
  dispatchCommand,
} from "../src/server/command-dispatch.ts";
import { commands } from "../src/live/mappings.ts";

const PHONE_MAP_PANEL_COMMANDS = [
  "setMapping",
  "removeMapping",
  "clearMappings",
  "savePreset",
  "loadPreset",
  "deletePreset",
  "confirmProjectRelink",
  "saveProjectClientState",
];

const ADMIN_ONLY_COMMANDS = [
  "exportProjectConfig",
  "importProjectConfig",
  "rollbackProjectConfig",
  "getServerInfo",
];

test("every registered command has an explicit side-effect classification", () => {
  assert.deepEqual(
    Object.keys(COMMAND_SIDE_EFFECTS).sort(),
    Object.keys(commands).sort(),
    "an unclassified command silently falls back to admin-only config-write",
  );
});

test("a viewer can read the shared locale without gaining a write role", async () => {
  assert.equal(COMMAND_SIDE_EFFECTS.getLocale, "read");
  const result = await dispatchCommand("viewer", {
    id: "locale-read",
    cmd: "getLocale",
  });
  assert.equal(result.ok, true, result.error);
  assert.ok(["en", "pt-BR"].includes(result.result?.locale));
});

test("R7: a controller may run every command the phone MAP panel needs", () => {
  for (const cmd of PHONE_MAP_PANEL_COMMANDS) {
    const sideEffect = COMMAND_SIDE_EFFECTS[cmd];
    assert.ok(sideEffect, `${cmd} has no side-effect classification`);
    assert.equal(
      isRoleAuthorized("controller", sideEffect),
      true,
      `BUG CONFIRMED: the phone cannot run '${cmd}' (classified '${sideEffect}'), ` +
        `so mappings can never be saved and no mapped parameter ever moves.`,
    );
  }
});

test("R7: project-config export/import/rollback and server info stay admin-only", () => {
  for (const cmd of ADMIN_ONLY_COMMANDS) {
    const sideEffect = COMMAND_SIDE_EFFECTS[cmd];
    assert.ok(sideEffect, `${cmd} has no side-effect classification`);
    assert.equal(
      isRoleAuthorized("controller", sideEffect),
      false,
      `${cmd} must remain admin-only`,
    );
    assert.equal(getRequiredRoleForSideEffect(sideEffect), "admin");
  }
});

test("R7: a viewer still cannot edit mappings", () => {
  for (const cmd of PHONE_MAP_PANEL_COMMANDS) {
    assert.equal(
      isRoleAuthorized("viewer", COMMAND_SIDE_EFFECTS[cmd]),
      false,
      `a viewer must not be able to run '${cmd}'`,
    );
  }
});

test("R7: dispatching removeMapping as controller is not refused by the role gate", async () => {
  const result = await dispatchCommand("controller", {
    id: "t1",
    cmd: "removeMapping",
    args: { control: "pad-1" },
  });
  // The handler may still fail for unrelated reasons in a test process (no
  // Live, no storage). What must never appear again is the authorization refusal.
  if (result.ok === false) {
    assert.doesNotMatch(
      String(result.error),
      /Unauthorized/,
      `BUG CONFIRMED: ${result.error}`,
    );
  }
});

test("R7: dispatching removeMapping as viewer is still refused", async () => {
  const result = await dispatchCommand("viewer", {
    id: "t2",
    cmd: "removeMapping",
    args: { control: "pad-1" },
  });
  assert.equal(result.ok, false);
  assert.match(String(result.error), /Unauthorized/);
});

test("testTriggerNote is classified as live-write and authorized for controller but refused for viewer", async () => {
  assert.equal(COMMAND_SIDE_EFFECTS.testTriggerNote, "live-write");
  assert.equal(isRoleAuthorized("controller", "live-write"), true);
  assert.equal(isRoleAuthorized("admin", "live-write"), true);
  assert.equal(isRoleAuthorized("viewer", "live-write"), false);

  const viewerResult = await dispatchCommand("viewer", {
    id: "test-viewer",
    cmd: "testTriggerNote",
    args: { control: "pad-1", targetIndex: 0 },
  });
  assert.equal(viewerResult.ok, false);
  assert.match(String(viewerResult.error), /Unauthorized/);
});

test("testTriggerNote rejects missing, spoofed, or stale execution context", async () => {
  // Context missing
  const noCtxResult = await dispatchCommand("controller", {
    id: "test-no-ctx",
    cmd: "testTriggerNote",
    args: { control: "pad-1", targetIndex: 0 },
  });
  assert.equal(noCtxResult.ok, false);
  assert.match(String(noCtxResult.error), /Invalid or stale command execution context/);

  // Context stale (isCurrent() returns false)
  const staleCtxResult = await dispatchCommand(
    "controller",
    {
      id: "test-stale-ctx",
      cmd: "testTriggerNote",
      args: { control: "pad-1", targetIndex: 0 },
    },
    { clientId: "spoofed-id", isCurrent: () => false },
  );
  assert.equal(staleCtxResult.ok, false);
  assert.match(String(staleCtxResult.error), /Invalid or stale command execution context/);
});
