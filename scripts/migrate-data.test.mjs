import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "./migrate-data.mjs";

const fs = { existsSync, mkdirSync, readdirSync, copyFileSync, statSync };

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "rcs-migrate-"));
  const src = join(root, "worm.ableton-rc-surface");
  mkdirSync(src, { recursive: true });
  mkdirSync(join(src, "certs"), { recursive: true });
  writeFileSync(join(src, "autostart.json"), '{"enabled":true}');
  writeFileSync(join(src, "locale.json"), '{"locale":"en"}');
  writeFileSync(join(src, "mappings.json"), '{"maps":[]}');
  writeFileSync(join(src, "certs", "cert.pem"), "fake-cert");
  writeFileSync(join(src, "certs", "key.pem"), "fake-key");
  mkdirSync(join(src, "presets"), { recursive: true });
  writeFileSync(join(src, "presets", "default.json"), "{}");
  mkdirSync(join(src, "projects"), { recursive: true });
  return { root, src };
}

test("migrate: empty destination copies all files", () => {
  const { root } = makeRoot();
  try {
    const result = migrate({
      root,
      source: "worm.ableton-rc-surface",
      dest: "worm.rc-surface",
      fs,
    });
    assert.equal(result.missing, false);
    assert.equal(result.copied, 6, "should copy 6 files (autostart, locale, mappings, 2 certs, 1 preset)");
    assert.equal(result.skipped, 0);
    // Verify destination has the files
    const destDir = join(root, "worm.rc-surface");
    assert.ok(existsSync(join(destDir, "autostart.json")));
    assert.ok(existsSync(join(destDir, "certs", "cert.pem")));
    assert.ok(existsSync(join(destDir, "presets", "default.json")));
    // Verify source is intact (never moved)
    assert.ok(existsSync(join(root, "worm.ableton-rc-surface", "autostart.json")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("migrate: populated destination does not overwrite", () => {
  const { root } = makeRoot();
  try {
    const destDir = join(root, "worm.rc-surface");
    mkdirSync(destDir, { recursive: true });
    writeFileSync(join(destDir, "autostart.json"), '{"enabled":false,"existing":true}');
    const result = migrate({
      root,
      source: "worm.ableton-rc-surface",
      dest: "worm.rc-surface",
      fs,
    });
    assert.equal(result.missing, false);
    assert.equal(result.skipped, 1, "should skip 1 existing file");
    // Existing file should be unchanged
    const content = readFileSync(join(destDir, "autostart.json"), "utf8");
    assert.ok(content.includes("existing"), "existing dest file must not be overwritten");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("migrate: missing source exits with message and missing=true", () => {
  const root = mkdtempSync(join(tmpdir(), "rcs-migrate-"));
  try {
    const result = migrate({
      root,
      source: "worm.ableton-rc-surface",
      dest: "worm.rc-surface",
      fs,
    });
    assert.equal(result.missing, true);
    assert.equal(result.copied, 0);
    assert.equal(result.skipped, 0);
    assert.ok(result.message.includes("source not found"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("migrate: --dry-run does not write", () => {
  const { root } = makeRoot();
  try {
    const result = migrate({
      root,
      source: "worm.ableton-rc-surface",
      dest: "worm.rc-surface",
      dryRun: true,
      fs,
    });
    assert.equal(result.missing, false);
    assert.equal(result.dryRun, true);
    assert.equal(result.copied, 0);
    // Destination should NOT exist
    const destDir = join(root, "worm.rc-surface");
    assert.ok(!existsSync(destDir), "dry-run must not create destination");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
