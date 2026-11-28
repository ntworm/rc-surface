// Runs tests/*.test.mjs in two passes: every file in parallel (node's default
// concurrency), then the timing-sensitive files one at a time.
//
// With --test-concurrency=1 for everything the src suite took about 105 s on
// Windows (28/11/2026); in parallel it takes about 10 s, but the two files in
// TIMED measure wall-clock budgets and fail when other files load the CPU.
// They keep the serial run. Add a file here only when it measures time.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TIMED = new Set(['lfo-stutter-stress.test.mjs', 'recording-waveform.test.mjs']);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function split(files) {
  const missing = [...TIMED].filter((name) => !files.includes(name));
  if (missing.length) throw new Error(`timed test files not found: ${missing.join(', ')}`);
  return {
    parallel: files.filter((name) => !TIMED.has(name)),
    serial: files.filter((name) => TIMED.has(name)),
  };
}

function run(files, extra) {
  const args = ['--import', 'tsx', '--test', '--test-force-exit', ...extra, ...files.map((name) => join('tests', name))];
  return spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' }).status ?? 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = readdirSync(join(root, 'tests')).filter((name) => name.endsWith('.test.mjs')).sort();
  const { parallel, serial } = split(files);
  const first = run(parallel, []);
  const second = run(serial, ['--test-concurrency=1']);
  process.exit(first || second);
}
