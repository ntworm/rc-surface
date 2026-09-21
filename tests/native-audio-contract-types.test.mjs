// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('TypeScript consumers narrow decoded data without casts and cannot mutate validated frames', () => {
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc',
    '--noEmit', '--strict', '--skipLibCheck', '--target', 'es2022',
    '--module', 'nodenext', '--types', 'node', 'tests/helpers/native-audio-contract-types.ts'],
  { cwd, encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
