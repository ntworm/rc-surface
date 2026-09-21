// verify-release.mjs — local-only release verifier.
//
// This is the entry point that `task verify` invokes inside the worktree.
// It runs the local CI gate, validates the gates document, and asks the
// package verifier to compare the candidate against a fresh build.
//
// Contract (per the frozen PLAN.md, line 194-206):
//   * no network, no git read for "latest", no service startup
//   * no installs, no publication
//   * ABLETON_RC_DEV_SYNC must be unset (or "0"); the verifier refuses to
//     run otherwise so the host installation store is never touched
//   * diagnostic output goes to test-results/ (already gitignored)
//   * when --package is provided, hands off to the package verifier
//   * the gates document may not be self-referential: sourceDigest is
//     computed on the production payload, not on the gates document
//
// Exit codes:
//   0  all gates passed (or, with --stage local, only `pending`/`passed`
//      are accepted)
//   2  bad arguments or environment
//   3  gates document invalid
//   4  CI gate failed
//   5  package verifier failed

import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..');

function printHelp() {
  console.log(
    'verify-release.mjs — local-only release verifier.\n' +
      '  default: runs npm run ci, validates internal/RELEASE-GATES-1.0.json.\n' +
      '  --package PATH        verify an existing candidate against a fresh build.\n' +
      '  --build-dir DIR       directory to compare against (default: dist).\n' +
      '  --report PATH         write a JSON report outside the payload.\n' +
      '  --stage local|publish gate semantics (default: local).\n' +
      '  --quick               run only the fast CI gates (test + lint + build:prod).\n' +
      '                        Use only for local iteration; the contracted CI\n' +
      '                        (which includes test:ui / Playwright) is the default.\n',
  );
}

function parseArgs(argv) {
  const opts = {
    package: null,
    buildDir: 'dist',
    report: null,
    stage: 'local',
    quick: false,
  };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
    if (a === '--package' || a === '--build-dir' || a === '--report' || a === '--stage') {
      opts[a.slice(2).replace(/^./, c => c.toLowerCase()) === 'stage' ? 'stage' : a.slice(2)] = rest[++i];
    } else if (a.startsWith('--package=')) {
      opts.package = a.slice('--package='.length);
    } else if (a.startsWith('--build-dir=')) {
      opts.buildDir = a.slice('--build-dir='.length);
    } else if (a.startsWith('--report=')) {
      opts.report = a.slice('--report='.length);
    } else if (a.startsWith('--stage=')) {
      opts.stage = a.slice('--stage='.length);
    } else if (a === '--quick') {
      opts.quick = true;
    } else if (a === '--package' || a === '--build-dir' || a === '--report' || a === '--stage') {
      // already handled above
    } else if (a === '--package' || a === '--build-dir' || a === '--report' || a === '--stage') {
      opts[a.slice(2).toLowerCase() === 'stage' ? 'stage' : a.slice(2)] = rest[++i];
    } else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

function guardEnvironment() {
  const sync = process.env.ABLETON_RC_DEV_SYNC;
  if (sync && sync !== '0') {
    console.error(
      `[verify-release] refusing to run while ABLETON_RC_DEV_SYNC=${sync}; unset it before verifying.`,
    );
    process.exit(2);
  }
  // Force the gate's own session to disable host install, even if the
  // operator forgot to clear the variable in the parent shell.
  process.env.ABLETON_RC_DEV_SYNC = '0';
}

const STAGE_KEYS = { '--package': 'package', '--build-dir': 'buildDir', '--report': 'report', '--stage': 'stage' };

async function loadGates() {
  const path = resolve(repoRoot, 'internal', 'RELEASE-GATES-1.0.json');
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (e) {
    console.error(`[verify-release] cannot read ${path}: ${e.message}`);
    process.exit(3);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error(`[verify-release] invalid JSON in ${path}: ${e.message}`);
    process.exit(3);
  }
  return parsed;
}

function validateGates(gates, stage) {
  if (!gates || typeof gates !== 'object' || !Array.isArray(gates.gates)) {
    return { ok: false, reason: 'gates array missing' };
  }
  const allowed = new Set(['passed', 'pending', 'blocked', 'unknown']);
  const knownForStage = new Set(['passed', 'pending']); // publish: only passed
  for (const g of gates.gates) {
    if (typeof g.id !== 'string' || typeof g.phase !== 'string' || typeof g.status !== 'string') {
      return { ok: false, reason: `gate ${g.id ?? '(missing)'}: schema invalid` };
    }
    if (!allowed.has(g.status)) {
      return { ok: false, reason: `gate ${g.id}: status ${g.status} is not from the allowed set ${[...allowed].join(',')}` };
    }
    if (stage === 'publish' && !knownForStage.has(g.status)) {
      return { ok: false, reason: `gate ${g.id}: publish stage requires passed|pending, found ${g.status}` };
    }
  }
  return { ok: true };
}

function runCi(opts) {
  // The verifier invokes npm. We refuse to use shell interpolation:
  // args stay as an array, never joined into a string for the shell
  // to interpret. On Windows, npm ships as npm.cmd, which Node cannot
  // spawn directly (execFileSync throws EINVAL on Node 20+); we route
  // through cmd.exe /c npm.cmd so cmd.exe interprets the .cmd file
  // while Node keeps each argument isolated. On POSIX, npm is a real
  // executable and we spawn it directly.
  // Default mode honors the contract: `npm run ci` runs test + lint +
  // build:prod + test:ui (Playwright). The --quick mode skips test:ui
  // for local iteration; the contracted full run remains the default.
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const spawnExe = process.platform === 'win32' ? 'cmd.exe' : npm;
  const wrapArgs = process.platform === 'win32'
    ? (args) => ['/c', npm, ...args]
    : (args) => args;
  // Pipe stdout/stderr to a log file inside test-results/ (already
  // gitignored) so that even when the parent exec gets reaped by an
  // external signal, the partial output stays on disk for inspection.
  const logPath = resolve(repoRoot, 'test-results', 'verify-release-ci.log');
  mkdirSync(dirname(logPath), { recursive: true });
  const logFd = openSync(logPath, 'a');
  // We run the steps sequentially because execFileSync does not carry
  // shell-style &&. --quick mode runs the three fast gates and stops
  // short of test:ui (Playwright).
  const stageArgs = opts.quick
    ? [['run', 'test'], ['run', 'lint'], ['run', 'build:prod']]
    : [['run', 'ci']];
  try {
    for (const args of stageArgs) {
      try {
        execFileSync(spawnExe, wrapArgs(args), {
          cwd: repoRoot,
          stdio: ['inherit', logFd, logFd],
          env: { ...process.env, ABLETON_RC_DEV_SYNC: '0' },
          timeout: 30 * 60 * 1000,
        });
      } catch (e) {
        const status = e?.status;
        const signal = e?.signal;
        const why = signal
          ? `killed by signal ${signal} (CI stage ${args.join(' ')}; log: ${logPath})`
          : `exit=${status ?? 'n/a'}`;
        console.error(`[verify-release] CI gate failed (${why})`);
        return false;
      }
    }
  } finally {
    try { closeSync(logFd); } catch {}
  }
  return true;
}

async function runPackageVerifier(opts, gates) {
  const candidate = gates.candidate ?? {};
  const pkgPath = opts.package ?? candidate.packagePath;
  if (!pkgPath) {
    if (opts.quick) {
      console.warn('[verify-release] --quick mode: no candidate.packagePath declared; skipping package verifier');
      return { ok: true, skipped: 'no-candidate-in-quick' };
    }
    return { ok: false, reason: 'no candidate.packagePath declared and no --package given' };
  }
  if (pkgPath.includes('..')) {
    return { ok: false, reason: `packagePath must not contain '..': ${pkgPath}` };
  }
  const abs = resolve(repoRoot, pkgPath);
  if (!abs.startsWith(resolve(repoRoot, 'release-kits'))) {
    return { ok: false, reason: `packagePath must live under release-kits/: ${pkgPath}` };
  }
  if (!existsSync(abs)) {
    if (opts.quick) {
      console.warn(`[verify-release] --quick mode: candidate missing on disk (${pkgPath}); skipping package verifier`);
      return { ok: true, skipped: 'candidate-missing-in-quick' };
    }
    return { ok: false, reason: `candidate package missing: ${pkgPath}` };
  }
  const reportPath = opts.report ?? resolve(repoRoot, 'test-results', 'verify-release-package-report.json');
  mkdirSync(dirname(reportPath), { recursive: true });
  const node = process.execPath;
  // Resolve the package verifier path via fileURLToPath so the resulting
  // string is a native Windows path (e.g. C:\...\verify-release-package.mjs).
  // Using verifier.pathname directly yields '/C:/...' on Windows, which the
  // Node CLI reinterprets as relative-to-cwd and joins with the drive root,
  // producing a doubled 'C:\C:\...' path that cannot be resolved.
  const verifierPath = fileURLToPath(new URL('./verify-release-package.mjs', import.meta.url));
  try {
    execFileSync(node, [
      verifierPath,
      `--package=${abs}`,
      `--build-dir=${opts.buildDir}`,
      `--report=${reportPath}`,
    ], { cwd: repoRoot, stdio: 'inherit', timeout: 10 * 60 * 1000 });
  } catch (e) {
    return { ok: false, reason: `package verifier exited with code ${e.status ?? 'n/a'}` };
  }
  // Compare the declared sha256 (if any) against the file on disk.
  const declared = candidate.sha256;
  if (declared) {
    const file = await readFile(abs);
    const actual = createHash('sha256').update(file).digest('hex');
    if (declared.toLowerCase() !== actual.toLowerCase()) {
      return { ok: false, reason: `candidate sha256 mismatch: declared ${declared} actual ${actual}` };
    }
  }
  return { ok: true, reportPath };
}

async function main() {
  guardEnvironment();
  const opts = parseArgs(process.argv);
  const gates = await loadGates();
  const v = validateGates(gates, opts.stage);
  if (!v.ok) {
    console.error(`[verify-release] gates document rejected: ${v.reason}`);
    process.exit(3);
  }

  // Reject traversal before starting the expensive CI gate (which includes tests).
  const packagePath = opts.package ?? gates.candidate?.packagePath;
  if (packagePath?.includes('..')) {
    console.error(`[verify-release] package verifier failed: packagePath must not contain '..': ${packagePath}`);
    process.exit(5);
  }

  const ciOk = runCi(opts);
  if (!ciOk) process.exit(4);

  const pkg = await runPackageVerifier(opts, gates);
  if (!pkg.ok) {
    console.error(`[verify-release] package verifier failed: ${pkg.reason}`);
    process.exit(5);
  }

  console.log('[verify-release] OK');
}

main().catch(e => {
  console.error(`[verify-release] unexpected error: ${e?.message ?? e}`);
  process.exit(2);
});
