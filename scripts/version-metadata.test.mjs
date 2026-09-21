// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));

test("package, manifest, and lockfile advertise one installable version", () => {
  const packageJson = readJson("package.json");
  const manifest = readJson("manifest.json");
  const lockfile = readJson("package-lock.json");

  assert.equal(manifest.version, packageJson.version);
  assert.equal(lockfile.version, packageJson.version);
  assert.equal(lockfile.packages[""].version, packageJson.version);
});

test("production ablx script derives its filename from package metadata", () => {
  const packageJson = readJson("package.json");

  assert.match(packageJson.scripts["build:prod-ablx"], /package\.json/);
  assert.doesNotMatch(packageJson.scripts["build:prod-ablx"], /RC-Surface-0\.\d/);
});

test("production build propagates static-copy failures instead of packaging stale files", () => {
  const build = fs.readFileSync(path.join(root, "build.ts"), "utf8");

  assert.match(build, /catch \(err\) \{\s*console\.error\("Error copying static:", err\);\s*throw err;\s*\}/s);
});

test("production build removes a stale development sourcemap", () => {
  const build = fs.readFileSync(path.join(root, "build.ts"), "utf8");

  assert.match(
    build,
    /if \(production\)\s*\{\s*fs\.rmSync\(`\$\{manifest\.entry\}\.map`,\s*\{ force: true \}\);\s*\}/s,
  );
});
