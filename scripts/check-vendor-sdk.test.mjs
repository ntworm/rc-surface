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
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkVendorSdk } from "./check-vendor-sdk.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "rc-vendor-check-"));
  const vendorDir = join(root, "vendor");
  await mkdir(vendorDir);
  const sdk = Buffer.from("sdk tarball bytes");
  const cli = Buffer.from("cli tarball bytes");
  await writeFile(
    join(vendorDir, "manifest.json"),
    JSON.stringify({
      files: {
        "sdk.tgz": { sha256: sha256(sdk), size: sdk.length },
        "cli.tgz": { sha256: sha256(cli), size: cli.length },
      },
    }),
  );
  return { root, vendorDir, sdk, cli };
}

test("vendor check passes when every manifest tarball is present with the recorded hash", async () => {
  const { root, vendorDir, sdk, cli } = await fixture();
  try {
    await writeFile(join(vendorDir, "sdk.tgz"), sdk);
    await writeFile(join(vendorDir, "cli.tgz"), cli);
    const result = await checkVendorSdk({ vendorDir });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.mismatched, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("vendor check reports missing and mismatched tarballs without touching them", async () => {
  const { root, vendorDir, cli } = await fixture();
  try {
    await writeFile(join(vendorDir, "cli.tgz"), Buffer.concat([cli, Buffer.from("!")]));
    const result = await checkVendorSdk({ vendorDir });
    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, ["sdk.tgz"]);
    assert.deepEqual(result.mismatched, ["cli.tgz"]);
    assert.equal((await readFile(join(vendorDir, "cli.tgz"))).length, cli.length + 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("vendor check copies tarballs from a source directory before verifying and never overwrites a matching file", async () => {
  const { root, vendorDir, sdk, cli } = await fixture();
  try {
    const from = join(root, "private");
    await mkdir(from);
    await writeFile(join(from, "sdk.tgz"), sdk);
    await writeFile(join(from, "cli.tgz"), cli);
    await writeFile(join(from, "unrelated.txt"), "ignored");
    const result = await checkVendorSdk({ vendorDir, from });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.copied.sort(), ["cli.tgz", "sdk.tgz"]);
    assert.equal((await readFile(join(vendorDir, "sdk.tgz"))).toString(), sdk.toString());

    const again = await checkVendorSdk({ vendorDir, from });
    assert.equal(again.ok, true);
    assert.deepEqual(again.copied, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the real vendor manifest lists exactly the tarballs package.json depends on", async () => {
  const repoRoot = join(import.meta.dirname, "..");
  const manifest = JSON.parse(await readFile(join(repoRoot, "vendor", "manifest.json"), "utf8"));
  const pkg = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
  const referenced = Object.values({ ...pkg.dependencies, ...pkg.devDependencies })
    .filter((spec) => typeof spec === "string" && spec.startsWith("file:./vendor/"))
    .map((spec) => spec.slice("file:./vendor/".length))
    .sort();
  assert.deepEqual(Object.keys(manifest.files).sort(), referenced);
  for (const entry of Object.values(manifest.files)) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    assert.ok(Number.isInteger(entry.size) && entry.size > 0);
  }
  const ignore = await readFile(join(repoRoot, ".gitignore"), "utf8");
  assert.match(ignore, /^vendor\/\*\.tgz$/m, "tarballs must stay untracked");
});
