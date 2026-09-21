// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
//
// check-vendor-sdk.mjs — verify the Ableton Extensions SDK/CLI tarballs that
// package.json references through `file:./vendor/...`. The tarballs are
// licensed material and are not tracked in Git (see vendor/README.md); this
// script confirms that the local copies match vendor/manifest.json before
// `npm ci` runs, and can stage them from a private directory first
// (`--from DIR`, used by hosted CI). It never overwrites a file that already
// matches and never deletes anything.
//
// Exit codes: 0 all tarballs present and matching; 1 missing or mismatched.

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

async function sha256File(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function matches(path, expected) {
  try {
    const s = await stat(path);
    if (!s.isFile()) return false;
    if (Number.isInteger(expected.size) && s.size !== expected.size) return false;
    return (await sha256File(path)) === expected.sha256;
  } catch {
    return false;
  }
}

export async function checkVendorSdk({ vendorDir, from } = {}) {
  const dir = resolve(vendorDir ?? join(fileURLToPath(new URL(".", import.meta.url)), "..", "vendor"));
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
  const result = { ok: true, vendorDir: dir, copied: [], missing: [], mismatched: [] };

  for (const [name, expected] of Object.entries(manifest.files)) {
    const target = join(dir, name);
    if (from && !(await matches(target, expected))) {
      const source = join(resolve(from), name);
      if (await matches(source, expected)) {
        await mkdir(dir, { recursive: true });
        await copyFile(source, target);
        result.copied.push(name);
      }
    }
    let present = false;
    try {
      present = (await stat(target)).isFile();
    } catch {
      present = false;
    }
    if (!present) {
      result.missing.push(name);
    } else if (!(await matches(target, expected))) {
      result.mismatched.push(name);
    }
  }
  result.ok = result.missing.length === 0 && result.mismatched.length === 0;
  return result;
}

function parseArgs(argv) {
  const out = { from: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--from=")) out.from = a.slice("--from=".length);
    else if (a === "--from") out.from = argv[++i];
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  const result = await checkVendorSdk({ from: opts.from });
  for (const name of result.copied) console.log(`[check-vendor-sdk] staged ${name} from ${opts.from}`);
  for (const name of result.missing) console.error(`[check-vendor-sdk] missing: vendor/${name}`);
  for (const name of result.mismatched) console.error(`[check-vendor-sdk] hash mismatch: vendor/${name}`);
  if (!result.ok) {
    console.error(
      "[check-vendor-sdk] The Ableton Extensions SDK/CLI tarballs are not distributed with this repository. " +
        "Obtain them from Ableton and place them in vendor/ (see vendor/README.md).",
    );
    process.exit(1);
  }
  console.log(`[check-vendor-sdk] ok: ${result.vendorDir}`);
}
