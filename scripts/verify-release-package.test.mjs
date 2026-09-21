import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { writeFile, rm, readFile } from 'node:fs/promises';
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

test('package-format-unrecognized is recorded without rewriting the candidate', async () => {
  const pkg = join(reportDir, 'verify-pkg-notzip.ablx');
  const dist = join(reportDir, 'verify-pkg-notzip-dist');
  mkdirSync(dist, { recursive: true });
  await writeFile(join(dist, 'README.txt'), 'build artifact');
  await writeFile(pkg, 'not a real zip');
  const report = join(reportDir, 'verify-pkg-notzip-report.json');
  try {
    const result = run([
      join('scripts', 'verify-release-package.mjs'),
      `--package=${pkg}`,
      `--build-dir=${dist}`,
      `--report=${report}`,
    ]);
    // not-a-zip surfaces a diff but does not silently mask the mismatch
    assert.equal(result.status, 4);
    const r = JSON.parse(await readFile(report, 'utf8'));
    assert.ok(Array.isArray(r.comparison.diffs));
    assert.equal(r.comparison.diffs[0].kind, 'package-format-unrecognized');
    assert.equal(r.exit, 4);
  } finally {
    await rm(pkg, { force: true });
    await rm(dist, { recursive: true, force: true });
    await rm(report, { force: true });
  }
});

test('missing build directory is reported cleanly', async () => {
  const pkg = join(reportDir, 'verify-pkg-nodist.ablx');
  await writeFile(pkg, 'not a real zip');
  const missing = join(reportDir, 'verify-pkg-nodist-dist-should-not-exist');
  try {
    const result = run([
      join('scripts', 'verify-release-package.mjs'),
      `--package=${pkg}`,
      `--build-dir=${missing}`,
      `--report=${join(reportDir, 'verify-pkg-nodist-report.json')}`,
    ]);
    // The verifier records ok=false in the manifest step, exits 3
    assert.equal(result.status, 3);
  } finally {
    await rm(pkg, { force: true });
    await rm(missing, { recursive: true, force: true });
  }
});

test('documented-temporal entries (e.g. *.map) are ignored', async () => {
  const pkg = join(reportDir, 'verify-pkg-map.ablx');
  const dist = join(reportDir, 'verify-pkg-map-dist');
  mkdirSync(dist, { recursive: true });
  await writeFile(join(dist, 'main.js'), 'console.log(1)');
  await writeFile(join(dist, 'main.js.map'), 'fake map');
  await writeFile(pkg, 'still not a zip');
  try {
    const result = run([
      join('scripts', 'verify-release-package.mjs'),
      `--package=${pkg}`,
      `--build-dir=${dist}`,
      `--report=${join(reportDir, 'verify-pkg-map-report.json')}`,
    ]);
    assert.equal(result.status, 4);
    const report = JSON.parse(
      await readFile(join(reportDir, 'verify-pkg-map-report.json'), 'utf8'),
    );
    const mapEntry = report.buildDir.files['verify-pkg-map-dist/main.js.map'];
    assert.ok(mapEntry && mapEntry.ignored === 'documented-temporal');
  } finally {
    await rm(pkg, { force: true });
    await rm(dist, { recursive: true, force: true });
    await rm(join(reportDir, 'verify-pkg-map-report.json'), { force: true });
  }
});
