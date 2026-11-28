import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';

import { TIMED, split } from './test-src.mjs';

test('timed files run apart and every other file runs in parallel', () => {
  const files = readdirSync(new URL('../tests/', import.meta.url)).filter((name) => name.endsWith('.test.mjs'));
  const { parallel, serial } = split(files);
  assert.deepEqual(new Set(serial), TIMED);
  assert.equal(parallel.length + serial.length, files.length);
  assert.ok(parallel.every((name) => !TIMED.has(name)));
});

test('a timed file that disappears fails the split instead of being skipped', () => {
  assert.throws(() => split(['a.test.mjs']), /timed test files not found/);
});
