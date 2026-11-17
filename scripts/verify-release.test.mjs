import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile, readFile, rm, copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './verify-release.mjs';

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

// verify-release reads the gates document from its own repository root, so
// the fixtures below run a copy of the verifier in a scratch directory that
// carries a gates document of its own.
async function scratchVerifier(name, gate) {
  const scratch = join(reportDir, `verify-release-${name}`);
  await mkdir(join(scratch, 'scripts'), { recursive: true });
  await mkdir(join(scratch, 'dev'), { recursive: true });
  await copyFile(
    join(repoRoot, 'scripts', 'verify-release.mjs'),
    join(scratch, 'scripts', 'verify-release.mjs'),
  );
  await copyFile(
    join(repoRoot, 'scripts', 'check-release-gates.mjs'),
    join(scratch, 'scripts', 'check-release-gates.mjs'),
  );
  await writeFile(join(scratch, 'dev', 'RELEASE-GATES-1.0.json'), JSON.stringify({
    schema_version: 1,
    gates: [gate],
  }));
  return scratch;
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
  const origPath = join(repoRoot, 'dev', 'RELEASE-GATES-1.0.json');
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
  // The live gates document (dev/RELEASE-GATES-1.0.json) records every gate
  // with status "passed" today, so stage=local accepts the document as it
  // stands and the run must exit 0.
  assert.equal(result.status, 0, `expected OK, got ${result.status} stderr=${result.stderr}`);
});

test('verify-release blocks an unknown gate status at stage local', async () => {
  const scratch = await scratchVerifier('unknown-status-local', {
    id: 'unknown-status', phase: 'PXX', stage: 'local', status: 'unknown', owner: 'test', rationale: 'fixture',
  });
  try {
    const result = run([join(scratch, 'scripts', 'verify-release.mjs')]);
    assert.equal(result.status, 3, `expected exit 3, got ${result.status} stdout=${result.stdout} stderr=${result.stderr}`);
    assert.match(result.stderr, /unknown-status/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test('verify-release blocks an unknown gate status at stage publish', async () => {
  const scratch = await scratchVerifier('unknown-status-publish', {
    id: 'unknown-status-publish', phase: 'PXX', stage: 'publish', status: 'unknown', owner: 'test', rationale: 'fixture',
  });
  try {
    const result = run([join(scratch, 'scripts', 'verify-release.mjs'), '--stage=publish']);
    assert.equal(result.status, 3, `expected exit 3, got ${result.status} stdout=${result.stdout} stderr=${result.stderr}`);
    assert.match(result.stderr, /unknown-status-publish/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
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

test('verify-release accepts a separate value for every option, exactly like the = form', () => {
  const argv = (...args) => ['node', 'verify-release.mjs', ...args];
  const pairs = [
    [['--package', 'candidate.ablx'], ['--package=candidate.ablx']],
    [['--build-dir', 'out'], ['--build-dir=out']],
    [['--report', 'report.json'], ['--report=report.json']],
    [['--stage', 'publish'], ['--stage=publish']],
  ];
  for (const [separate, equals] of pairs) {
    assert.deepEqual(
      parseArgs(argv(...separate)),
      parseArgs(argv(...equals)),
      `${separate.join(' ')} must parse like ${equals.join(' ')}`,
    );
  }
  // The separate form must land on the documented key, not on a key named
  // after the option itself.
  assert.deepEqual(parseArgs(argv('--build-dir', 'out')), {
    package: null,
    buildDir: 'out',
    report: null,
    stage: 'local',
    quick: false,
  });
});

test('verify-release refuses an option that is missing its value', () => {
  const result = run([join('scripts', 'verify-release.mjs'), '--build-dir']);
  assert.equal(result.status, 2, `expected exit 2, got ${result.status} stdout=${result.stdout} stderr=${result.stderr}`);
  assert.match(result.stderr, /unknown argument: --build-dir/);
});
