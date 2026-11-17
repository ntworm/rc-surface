// suppressions-ratchet.test.mjs — the ESLint suppression budget only shrinks.
//
// eslint-suppressions.json is the structural debt ledger of the repo: every
// entry is a suppressed complexity / max-lines / max-lines-per-function
// violation. The file must only ever lose entries, so this test pins the
// total and fails when it grows.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..');

// The ceiling is the baseline measured on 2026-11-17: 617 suppressions over
// 144 files. It only ever goes down: lower this number when the debt
// shrinks, never raise it.
const MAX_SUPPRESSIONS = 617;

// Sums every `count` of an ESLint bulk-suppressions document.
export function sumSuppressions(suppressions) {
  let total = 0;
  for (const rules of Object.values(suppressions)) {
    for (const entry of Object.values(rules)) {
      total += entry.count ?? 0;
    }
  }
  return total;
}

test('eslint suppressions stay within the shrinking budget', async () => {
  const raw = await readFile(join(repoRoot, 'eslint-suppressions.json'), 'utf8');
  const total = sumSuppressions(JSON.parse(raw));
  assert.ok(
    total <= MAX_SUPPRESSIONS,
    `eslint suppressions grew to ${total}; the budget is ${MAX_SUPPRESSIONS}`,
  );
});

test('the helper counts a document whose total is above the budget', () => {
  const fixture = { 'scripts/example.mjs': { complexity: { count: MAX_SUPPRESSIONS + 1 } } };
  assert.ok(sumSuppressions(fixture) > MAX_SUPPRESSIONS);
});
