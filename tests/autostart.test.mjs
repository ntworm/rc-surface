// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// Whether the bridge takes the network at launch. The reason to turn it off is
// another RC extension on the same machine, so the setting has to survive a
// restart and has to stay reachable when nothing is listening.

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const mod = await import("../src/server/autostart.ts");

async function tempDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), "rc-autostart-"));
}

test("a fresh install starts with Live, as every install did before", async () => {
  mod.resetAutostartForTests();
  assert.equal(mod.isAutostartEnabled(), true);
  assert.equal(mod.DEFAULT_AUTOSTART, true);
});

test("the choice survives a restart", async () => {
  const dir = await tempDir();
  mod.resetAutostartForTests();
  await mod.configureAutostartStorage(dir);
  mod.setAutostartEnabled(false);
  // Give the best-effort write a turn to land.
  await new Promise((r) => setTimeout(r, 50));

  mod.resetAutostartForTests();
  assert.equal(mod.isAutostartEnabled(), true, "reset must forget it");
  const loaded = await mod.configureAutostartStorage(dir);
  assert.equal(loaded, false, "and the file must bring it back");
  assert.equal(mod.isAutostartEnabled(), false);
});

test("junk does not flip the setting", async () => {
  mod.resetAutostartForTests();
  for (const bad of ["false", 0, null, undefined, {}, "off"]) {
    assert.equal(mod.setAutostartEnabled(bad), true, `${String(bad)} must be ignored`);
  }
  assert.equal(mod.setAutostartEnabled(false), false, "a real boolean still works");
});

test("a missing or unreadable store leaves the setting working", async () => {
  mod.resetAutostartForTests();
  assert.equal(await mod.configureAutostartStorage(null), true);
  // No file to read, and no path to write: the session still honours a change.
  assert.equal(mod.setAutostartEnabled(false), false);

  mod.resetAutostartForTests();
  const dir = await tempDir();
  await fs.writeFile(path.join(dir, "autostart.json"), "{ not json", "utf8");
  assert.equal(await mod.configureAutostartStorage(dir), true, "corrupt store falls back to the default");
});

test("the panel's Start button is independent of the autostart preference", async () => {
  // Bootstrap behavior is exercised by extension-activation-race.test.mjs;
  // do not couple its cancellation guard to a source-text distance here.
  const panel = await fs.readFile(new URL("../src/ui/panel.ts", import.meta.url), "utf8");
  assert.match(panel, /action === "start"[\s\S]{0,200}callbacks\.startServer\(\)/,
    "the panel start path must not consult the setting");
  assert.match(panel, /action === "autostart-on" \|\| action === "autostart-off"/);
  assert.doesNotMatch(panel, /autostart-o[nf]f?"[\s\S]{0,120}(startServer|stopServer)/,
    "toggling the preference must not start or stop anything");
});

test("the toggle is reachable in both ways the panel renders", async () => {
  const panel = await fs.readFile(new URL("../src/ui/panel.ts", import.meta.url), "utf8");
  // Over HTTP when the server is up...
  assert.match(panel, /autostart=\$\{autostart\}/);
  // ...and from disk when it is not, which is the case this setting creates.
  assert.match(panel, /window\.INITIAL_AUTOSTART = /);
  const app = await fs.readFile(new URL("../static/panel/app.js", import.meta.url), "utf8");
  assert.match(app, /window\.INITIAL_AUTOSTART/);
  assert.match(app, /URLSearchParams[\s\S]{0,60}autostart/);
});
