// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The controller token is kept between starts of the extension: a phone that
// was paired before a restart stays a controller. The admin token is not kept
// - it belongs to the run that issued it.

import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { clearExtensionContext, setExtensionContext } from "../src/context.ts";
import { loadControllerToken } from "../src/server/controller-token.ts";
import { getAdminToken, getControllerToken, regenerateTokens } from "../src/server/session-auth.ts";

/** Run a body with the warnings it prints captured. */
async function withWarnings(body) {
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.map(String).join(" ")); };
  try {
    return { result: await body(), warnings };
  } finally {
    console.warn = realWarn;
  }
}

/**
 * Run a body with a storage directory of its own - without the session
 * directory in it - and clean both the context and the directory up.
 */
async function inStorage(body) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rc-surface-token-"));
  setExtensionContext({ environment: { storageDirectory: dir } });
  try {
    return await withWarnings(() => body(dir));
  } finally {
    clearExtensionContext();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("the stored controller token comes back on the next load", async () => {
  const { result, warnings } = await inStorage(async (dir) => {
    const first = await loadControllerToken();
    assert.match(first, /^[0-9a-f]{32}$/, "a controller token is 16 random bytes in hex");

    const sessionDir = path.join(dir, "session");
    const stored = await fs.readFile(path.join(sessionDir, "controller-token"), "utf8");
    assert.equal(stored.trim(), first, "the token must be in the file");
    assert.deepEqual(await fs.readdir(sessionDir), ["controller-token"], "no temporary file is left behind");
    return { first, second: await loadControllerToken() };
  });
  assert.equal(result.second, result.first, "the token must survive between loads");
  assert.equal(warnings.length, 0, "a stored token is not a failure");
});

test("a file that does not hold a token is replaced by a new one", async () => {
  await inStorage(async (dir) => {
    const sessionDir = path.join(dir, "session");
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(path.join(sessionDir, "controller-token"), "not-a-token");

    const token = await loadControllerToken();
    assert.match(token, /^[0-9a-f]{32}$/);
    const stored = await fs.readFile(path.join(sessionDir, "controller-token"), "utf8");
    assert.equal(stored.trim(), token, "the file must hold the new token");
  });
});

test("without a storage directory there is no token to keep", async () => {
  clearExtensionContext();
  const { result, warnings } = await withWarnings(() => loadControllerToken());
  assert.equal(result, null, "a token that cannot be kept is not returned");
  assert.ok(warnings.length > 0, "the missing storage must be reported");

  // A context without an environment is the same absence.
  setExtensionContext({});
  assert.equal(await loadControllerToken(), null);
  clearExtensionContext();
});

test("a storage that cannot be used yields null, not a crash", async () => {
  // The session path is a plain file: the session directory cannot be made.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rc-surface-token-"));
  setExtensionContext({ environment: { storageDirectory: dir } });
  try {
    await fs.writeFile(path.join(dir, "session"), "not a directory");
    const { result, warnings } = await withWarnings(() => loadControllerToken());
    assert.equal(result, null, "an unusable storage must not throw");
    assert.ok(warnings.length > 0, "the failure must be reported");
    for (const warning of warnings) {
      assert.doesNotMatch(warning, /[0-9a-f]{32}/, "the warning must not carry a token");
    }
  } finally {
    clearExtensionContext();
    await fs.rm(dir, { recursive: true, force: true });
  }

  // The token file is a directory: it cannot be read, and it is not a token.
  const { result, warnings } = await inStorage(async (storage) => {
    await fs.mkdir(path.join(storage, "session", "controller-token"), { recursive: true });
    return loadControllerToken();
  });
  assert.equal(result, null, "a file that cannot be read is not a token");
  assert.ok(warnings.length > 0, "the failure must be reported");
});

test("the stored token is readable by its owner only", {
  skip: process.platform === "win32" ? "POSIX permissions only" : false,
}, async () => {
  await inStorage(async (dir) => {
    await loadControllerToken();
    const stat = await fs.stat(path.join(dir, "session", "controller-token"));
    assert.equal(stat.mode & 0o777, 0o600, "the token file must not be readable by anyone else");
  });
});

test("a persisted controller token is kept while the admin token rotates", () => {
  const persisted = "a".repeat(32);
  const controllerBefore = getControllerToken();
  const adminBefore = getAdminToken();

  const result = regenerateTokens(persisted);

  assert.equal(result.controllerToken, persisted, "the persisted controller token must be used");
  assert.equal(getControllerToken(), persisted);
  assert.notEqual(result.adminToken, adminBefore, "the admin token must rotate on every start");
  assert.notEqual(getAdminToken(), adminBefore);
  assert.notEqual(getControllerToken(), controllerBefore);

  const drawn = regenerateTokens();
  assert.notEqual(drawn.controllerToken, persisted, "without a persisted token the controller rotates");
  assert.notEqual(drawn.adminToken, result.adminToken, "the admin token must rotate");
  assert.match(drawn.controllerToken, /^[0-9a-f]{32}$/);

  const afterNull = regenerateTokens(null);
  assert.notEqual(afterNull.controllerToken, drawn.controllerToken, "null is no persisted token");
});
