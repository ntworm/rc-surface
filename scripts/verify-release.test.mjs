import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
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
    timeout: 10000,
  });
}

test('packagePath with .. is rejected by verify-release', () => {
  const result = run([join('scripts', 'verify-release.mjs'), '--package=../foo.ablx']);
  // Verify-release refuses on packagePath validation BEFORE running CI,
  // so it exits 3 (gates invalid) or 5 (package verifier failed).
  assert.equal(result.status, 5);
  assert.match(result.stderr, /packagePath must not contain/);
});

test('check-release-gates --stage publish refuses a gates document with pending status', async () => {
  const tmpPath = join(reportDir, 'gates-pending.json');
  const origPath = join(repoRoot, 'internal', 'RELEASE-GATES-1.0.json');
  const original = await readFile(origPath, 'utf8');
  try {
    const parsed = JSON.parse(original);
    // Ensure at least one gate is pending
    parsed.gates.push({
      id: 'test-pending-blocker',
      phase: 'PXX',
      stage: 'publish',
      status: 'pending',
      owner: 'test',
      rationale: 'forces publish-stage block',
    });
    await writeFile(tmpPath, JSON.stringify(parsed));
    const result = run([
      join('scripts', 'check-release-gates.mjs'),
      '--stage=publish',
      `--gates=${tmpPath}`,
      `--report=${join(reportDir, 'check-publish-pending.json')}`,
    ]);
    assert.equal(result.status, 4, `expected block, got ${result.status} stdout=${result.stdout} stderr=${result.stderr}`);
    assert.ok(existsSync(join(reportDir, 'check-publish-pending.json')), 'report should be written');
  } finally {
    await rm(tmpPath, { force: true });
  }
});

test('check-release-gates --stage local is permissive of pending', () => {
  const result = run([
    join('scripts', 'check-release-gates.mjs'),
    '--stage=local',
    `--report=${join(reportDir, 'check-local-ok.json')}`,
  ]);
  // The existing gates document has pending gates (P09) and a single
  // blocked gate (P10 distribution). Under stage=local, blocked is
  // treated as not-yet-passed but allowed; pending is also allowed.
  assert.equal(result.status, 0, `expected OK, got ${result.status} stderr=${result.stderr}`);
});

test('verify-release-package refuses to write the report inside the payload', async () => {
  // Build a tiny stub package file (not a zip) and a stub dist dir
  // so the verifier can run end-to-end.
  const tmpPkg = join(reportDir, 'stub.ablx');
  const tmpDist = join(reportDir, 'stub-dist');
  mkdirSync(tmpDist, { recursive: true });
  await writeFile(join(tmpDist, 'Hello.txt'), 'hello');
  await writeFile(tmpPkg, 'NOT-A-ZIP-PAYLOAD');
  const result = run([
    join('scripts', 'verify-release-package.mjs'),
    `--package=${tmpPkg}`,
    `--build-dir=${tmpDist}`,
    `--report=${join(reportDir, 'stub-report.json')}`,
  ]);
  // The stub is not a zip so the verifier records a documented
  // "package-format-unrecognized" diff but still exits non-zero
  // (4). The important check is that the report path is honored and
  // NOT rewritten into the build directory.
  assert.equal(result.status, 4);
  assert.ok(existsSync(join(reportDir, 'stub-report.json')), 'report must be written under test-results/');
  assert.ok(!existsSync(join(tmpDist, 'stub-report.json')), 'report must NOT live inside the build dir');
});
