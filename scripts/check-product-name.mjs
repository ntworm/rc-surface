#!/usr/bin/env node
// P01 permanent gate: fails if old product name or old artifact name appears in active files.
// Active = everything except node_modules/, dist/, release-kits/, test-results/, .git/,
// docs/superpowers/, and the excluded historicals.
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";

const root = process.cwd();
const EXCLUDE_DIRS = new Set([
  "node_modules", "dist", "release-kits", ".git", "test-results", ".worktrees"
]);
const EXCLUDE_FILES = new Set([
  "CHANGELOG.md",
  "PESQUISA_CELULAR_GESTUAL.md",
  "RELEASE-READINESS-2026-09-07.pt-BR.md",
  "check-product-name.mjs",
]);
const EXCLUDE_PATH_SUBSTRINGS = [
  sep + "docs" + sep + "superpowers" + sep,
  sep + "internal" + sep + "PESQUISA_CELULAR_GESTUAL.md",
  sep + "internal" + sep + "RELEASE-READINESS-2026-09-07.pt-BR.md",
];

function walk(dir, files = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (EXCLUDE_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

function shouldExclude(filePath) {
  for (const sub of EXCLUDE_PATH_SUBSTRINGS) {
    if (filePath.includes(sub)) return true;
  }
  const base = filePath.split(sep).pop();
  if (EXCLUDE_FILES.has(base)) return true;
  return false;
}

const namePattern = /ableton rc surface/i;
const artifactPattern = /ableton-rc-surface-\d/i;

const files = walk(root);
const violations = [];
for (const f of files) {
  if (shouldExclude(f)) continue;
  const content = readFileSync(f, "utf8");
  const nameMatches = content.match(namePattern);
  const artMatches = content.match(artifactPattern);
  if (nameMatches || artMatches) {
    violations.push({
      file: f.replace(root + sep, ""),
      names: nameMatches ? nameMatches.length : 0,
      artifacts: artMatches ? artMatches.length : 0,
    });
  }
}

if (violations.length > 0) {
  console.error("name gate FAIL:");
  for (const v of violations) {
    console.error(`  ${v.file}: names=${v.names} artifacts=${v.artifacts}`);
  }
  process.exit(1);
}
console.log("name gate ok");
