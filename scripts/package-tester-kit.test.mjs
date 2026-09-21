// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = join(import.meta.dirname, "..");
const scriptPath = join(repoRoot, "scripts", "package-tester-kit.mjs");
const testerGuidePath = join(repoRoot, "internal", "TESTER-GUIDE.md");

test("tester-kit: script is present and runnable via node", () => {
  const r = spawnSync("node", ["--check", scriptPath], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

test("tester-kit: built-in zip writer produces a readable zip", async () => {
  const mod = await import(`${pathToFileURL(scriptPath).href}?test=${Date.now()}`);
  assert.equal(typeof mod.buildZip, "function");

  const dir = await mkdtemp(join(tmpdir(), "tester-kit-zip-src-"));
  const out = join(tmpdir(), `tester-kit-${Date.now()}.zip`);
  try {
    await mkdir(join(dir, "docs"), { recursive: true });
    await writeFile(join(dir, "hello.txt"), "hello\n");
    await writeFile(join(dir, "docs", "readme.txt"), "docs\n");

    await mod.buildZip(dir, out);
    const zip = await readFile(out);
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    assert.match(zip.toString("utf8"), /hello\.txt/);
    assert.match(zip.toString("utf8"), /docs\/readme\.txt/);
    assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(out, { force: true });
  }
});

test("tester-kit: SHA256 helper matches known hash for fixed bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tester-kit-"));
  try {
    const file = join(dir, "hello.txt");
    await writeFile(file, "hello\n");
    const h = createHash("sha256").update("hello\n").digest("hex");
    const re = await readFile(file);
    const reh = createHash("sha256").update(re).digest("hex");
    assert.equal(reh, h);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("tester-kit: stages and hashes both documented Max devices", async () => {
  const mod = await import(`${pathToFileURL(scriptPath).href}?devices=${Date.now()}`);
  const expectedDevices = ["RC-Midi-Receiver.amxd", "RC-Audio-Sender.amxd"];
  assert.deepEqual(mod.companionDevices, expectedDevices);

  const sourceDir = await mkdtemp(join(tmpdir(), "tester-kit-max-src-"));
  const stagedDir = await mkdtemp(join(tmpdir(), "tester-kit-max-dst-"));
  try {
    for (const name of expectedDevices) {
      await writeFile(join(sourceDir, name), `fixture:${name}\n`);
    }

    await mod.stageCompanionDevices(sourceDir, stagedDir);

    for (const name of expectedDevices) {
      assert.equal(await readFile(join(stagedDir, name), "utf8"), `fixture:${name}\n`);
      assert.ok(mod.packageFiles.includes(name), `${name} must be covered by SHA256SUMS.txt`);
    }
  } finally {
    await rm(sourceDir, { recursive: true, force: true });
    await rm(stagedDir, { recursive: true, force: true });
  }
});

test("tester guide distinguishes v2 acceptance from previous Audio Sender field tests", async () => {
  const guide = await readFile(testerGuidePath, "utf8");

  assert.match(guide, /\| `RC-Audio-Sender\.amxd` \| Max for Live audio-track pitch sender/);
  assert.match(guide, /### 3\. RC-Audio-Sender\.amxd/);
  assert.match(guide, /v2 must be retested in Live/i);
  assert.match(guide, /Previous field evidence belongs to the UDP/);
  assert.match(guide, /Audio Sender input.*OFF at load/);
  assert.match(guide, /same note again/i);
  assert.match(guide, /silence/i);
});

test("tester-kit: stage docs list includes required user-facing files", async () => {
  // read package.json and assert that the script references the docs we ship
  const src = await readFile(scriptPath, "utf8");
  const expected = [
    "README.md",
    "LICENSE",
    "NOTICE",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "internal/README.md",
    "docs/INSTALL.md",
    "docs/USER-GUIDE.md",
    "docs/FAQ.md",
    "docs/PRIVACY.md",
    "docs/SECURITY.md",
    "docs/CUSTOMIZATION.md",
    "internal/TESTER-GUIDE.md",
    "internal/PESQUISA_CELULAR_GESTUAL.md",
  ];
  for (const doc of expected) {
    assert.ok(src.includes(doc), `expected ${doc} in stageDocs`);
  }
});

test("tester-kit: stages bilingual operator docs with checksum coverage", async () => {
  const mod = await import(pathToFileURL(scriptPath).href);
  const stagedDir = await mkdtemp(join(tmpdir(), "tester-kit-docs-"));
  try {
    assert.equal(typeof mod.stageDocumentation, "function");
    await mod.stageDocumentation(repoRoot, stagedDir);
    for (const name of ["INSTALL", "USER-GUIDE", "FAQ", "PRIVACY", "SECURITY", "CUSTOMIZATION", "AUDIO-AUDIT"]) {
      for (const suffix of [".md", ".pt-BR.md"]) {
        const rel = `docs/${name}${suffix}`;
        assert.deepEqual(await readFile(join(stagedDir, rel)), await readFile(join(repoRoot, rel)));
        assert.ok(mod.packageFiles.includes(rel), `${rel} needs checksum coverage`);
      }
    }
  } finally {
    await rm(stagedDir, { recursive: true, force: true });
  }
});

test("tester-kit: missing required documentation stops packaging", async () => {
  const mod = await import(pathToFileURL(scriptPath).href);
  const sourceDir = await mkdtemp(join(tmpdir(), "tester-kit-missing-"));
  const stagedDir = await mkdtemp(join(tmpdir(), "tester-kit-incomplete-"));
  try {
    assert.equal(typeof mod.stageDocumentation, "function");
    await assert.rejects(mod.stageDocumentation(sourceDir, stagedDir), /README\.md/);
  } finally {
    await rm(sourceDir, { recursive: true, force: true });
    await rm(stagedDir, { recursive: true, force: true });
  }
});

test("tester-kit: checksum generation refuses an incomplete kit", async () => {
  const mod = await import(pathToFileURL(scriptPath).href);
  const stagedDir = await mkdtemp(join(tmpdir(), "tester-kit-hashes-"));
  try {
    assert.equal(typeof mod.writeChecksums, "function");
    await assert.rejects(mod.writeChecksums(stagedDir), /RC-Surface-.*\.ablx/);
    for (const rel of mod.packageFiles) {
      await mkdir(join(stagedDir, rel, ".."), { recursive: true });
      await writeFile(join(stagedDir, rel), "hello\n");
    }
    await mod.writeChecksums(stagedDir);
    const sums = await readFile(join(stagedDir, "SHA256SUMS.txt"), "utf8");
    assert.equal(sums.trim().split("\n").length, mod.packageFiles.length);
    assert.ok(sums.split("\n").filter(Boolean).every((line) =>
      line.startsWith("5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03  ")));
  } finally {
    await rm(stagedDir, { recursive: true, force: true });
  }
});

test("tester-kit: broken relative links stop packaging", async () => {
  const mod = await import(pathToFileURL(scriptPath).href);
  const stagedDir = await mkdtemp(join(tmpdir(), "tester-kit-links-"));
  try {
    assert.equal(typeof mod.checkMarkdownLinks, "function");
    for (const rel of mod.stageDocs) {
      await mkdir(join(stagedDir, rel, ".."), { recursive: true });
      await writeFile(join(stagedDir, rel), "");
    }
    await writeFile(join(stagedDir, "README.md"), "[Guide](docs/USER-GUIDE.md#intro)\n");
    await mod.checkMarkdownLinks(stagedDir);
    await rm(join(stagedDir, "docs/USER-GUIDE.md"));
    await assert.rejects(mod.checkMarkdownLinks(stagedDir), /broken relative link/i);
  } finally {
    await rm(stagedDir, { recursive: true, force: true });
  }
});

test("tester-kit: staged docs include every staged markdown link they reference", async () => {
  const mod = await import(`${pathToFileURL(scriptPath).href}?docs=${Date.now()}`);
  const staged = new Set(mod.stageDocs);
  const docLink = /`((?:docs\/)?[A-Za-z0-9._/-]+\.md)`/g;

  for (const rel of staged) {
    if (!rel.endsWith(".md")) continue;
    const text = await readFile(join(repoRoot, rel), "utf8");
    for (const match of text.matchAll(docLink)) {
      const linkedDoc = match[1];
      const baseDir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : "";
      const resolvedDoc = linkedDoc.startsWith("docs/") || staged.has(linkedDoc)
        ? linkedDoc
        : `${baseDir}${linkedDoc}`;
      assert.ok(
        staged.has(resolvedDoc),
        `${rel} references ${linkedDoc}, but ${resolvedDoc} is not staged`,
      );
    }
  }
});

test("tester-kit: zip writer does NOT include certs, env, tests, node_modules, dist", async () => {
  const src = await readFile(scriptPath, "utf8");
  // the script must not reference forbidden dirs in its stage list
  const forbidden = [".env", ".pem", ".key", "node_modules", "/dist/"];
  for (const token of forbidden) {
    assert.ok(!src.includes(token), `forbidden token in script: ${token}`);
  }
});
