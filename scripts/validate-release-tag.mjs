// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "..");

function expectedReleaseTag(version) {
  return `v${version}`;
}

function validateReleaseTag(tag, version) {
  return tag === expectedReleaseTag(version);
}

async function main() {
  const pkg = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8"));
  const tag = process.argv[2];
  const expected = expectedReleaseTag(pkg.version);

  if (!validateReleaseTag(tag, pkg.version)) {
    const received = tag === undefined ? "<missing>" : JSON.stringify(tag);
    throw new Error(`release tag must be exactly ${expected}; received ${received}`);
  }

  process.stdout.write(`validated ${expected}\n`);
}

export { expectedReleaseTag, validateReleaseTag };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
