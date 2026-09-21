import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..');
const reportDir = join(repoRoot, 'test-results');
mkdirSync(reportDir, { recursive: true });

function run(args) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    env: { ...process.env, ABLETON_RC_DEV_SYNC: '0' },
    encoding: 'utf8',
  });
}

test('check-release-gates default stage=local accepts pending', () => {
  const reportPath = join(reportDir, 'gates-default-local.json');
  const result = run([
    join('scripts', 'check-release-gates.mjs'),
    `--report=${reportPath}`,
  ]);
  assert.equal(result.status, 0, `expected OK, got ${result.status} stderr=${result.stderr}`);
  assert.ok(existsSync(reportPath));
});

test('check-release-gates --stage publish is blocked by a blocked gate', async () => {
  // A fixture with one blocked gate: the live document passed every gate
  // on 2026-09-21, so the block is no longer observable through it.
  const gatesPath = join(reportDir, 'gates-fixture-blocked.json');
  const live = JSON.parse(await readFile(join(repoRoot, 'internal', 'RELEASE-GATES-1.0.json'), 'utf8'));
  live.gates.push({ id: 'fixture-blocked', phase: 'PXX', stage: 'publish', status: 'blocked', owner: 'test', rationale: 'fixture' });
  writeFileSync(gatesPath, JSON.stringify(live));
  const reportPath = join(reportDir, 'gates-publish-blocked.json');
  const result = run([
    join('scripts', 'check-release-gates.mjs'),
    '--stage=publish',
    `--gates=${gatesPath}`,
    `--report=${reportPath}`,
  ]);
  assert.equal(result.status, 4, `expected blocked, got ${result.status} stderr=${result.stderr}`);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.ok(report.blocking.some((g) => g.id === 'fixture-blocked'));
});

test('the live gates document passes the publish stage', () => {
  const result = run([
    join('scripts', 'check-release-gates.mjs'),
    '--stage=publish',
    `--report=${join(reportDir, 'gates-publish-live.json')}`,
  ]);
  assert.equal(result.status, 0, `expected all gates passed, got ${result.status} stderr=${result.stderr}`);
});

test('check-release-gates refuses unknown stage', () => {
  const result = run([
    join('scripts', 'check-release-gates.mjs'),
    '--stage=weird',
  ]);
  assert.notEqual(result.status, 0);
});

test('check-release-gates writes a structured report', async () => {
  const reportPath = join(reportDir, 'gates-structured.json');
  const result = run([
    join('scripts', 'check-release-gates.mjs'),
    '--stage=local',
    `--report=${reportPath}`,
  ]);
  assert.equal(result.status, 0);
  const parsed = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(parsed.schema_version, 1);
  assert.ok(Array.isArray(parsed.allowed));
  assert.ok(Array.isArray(parsed.blocking));
});
