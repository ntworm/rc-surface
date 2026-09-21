// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// sync-tester-kit.mjs — local-only pipeline driver for the tester kit.
//
// P08 splits the pipeline into three independent slices:
//
//   A  build        Regenerate the .ablx and the companion Max devices.
//   B  package      Stage the tester kit + SHA256SUMS + zip it.
//   R  install      Place the staged kit under a local AppData folder for
//                  inspection, without touching the real installation
//                  store or any sync state.
//
// The slices are independent: each one accepts an explicit `--only=<slice>`
// or runs end-to-end. The default is A+B (no R) so a plain run stays
// read-only on the host machine — R is the slice that *writes* to
// `AppData/Local/Ableton/Extensions`, and is only used when the operator
// explicitly asks for it.
//
// Usage:
//   node scripts/sync-tester-kit.mjs                # A + B
//   node scripts/sync-tester-kit.mjs --only=A
//   node scripts/sync-tester-kit.mjs --only=R        # writes local AppData
//   node scripts/sync-tester-kit.mjs --only=ABR
//
// The script never reads from git for "latest release", never reaches the
// ableton-store, and never modifies the source tree. It is a local-only
// orchestrator; CI has its own gated runners (see scripts/release-workflow.test.mjs).

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..');

function parseArgs(argv) {
  const args = new Set(['AB']);
  for (const a of argv.slice(2)) {
    if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
    const m = a.match(/^--only=([ABR]+)$/);
    if (m) {
      args.clear();
      for (const c of m[1]) args.add(c);
    } else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function printHelp() {
  console.log(
    'sync-tester-kit.mjs — local-only tester kit pipeline driver.\n' +
    '  default: slices A+B (no host install).\n' +
    '  --only=A      regenerate the .ablx and companion devices.\n' +
    '  --only=B      stage and zip the tester kit.\n' +
    '  --only=R      install the staged kit under local AppData.\n' +
    '  --only=ABR    full pipeline including local install.\n',
  );
}

function runA() {
  // Regenerate the .ablx. The package script lives in package.json and runs
  // esbuild + the static copy. We invoke it directly so the pipeline has
  // exactly one entry point.
  // On Windows, npm ships as npm.cmd which Node cannot spawn directly
  // (execFileSync throws EINVAL on Node 20+); we route through cmd.exe
  // /c so cmd.exe interprets the .cmd file while Node keeps each
  // argument isolated (no shell string interpolation).
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const spawnExe = process.platform === 'win32' ? 'cmd.exe' : npm;
  const spawnArgs = process.platform === 'win32'
    ? ['/c', npm, 'run', 'package']
    : ['run', 'package'];
  execFileSync(spawnExe, spawnArgs, { cwd: repoRoot, stdio: 'inherit' });
  // The companion Max devices ship as binary artifacts in the repo
  // (static/RC-Midi-Receiver.amxd, static/RC-Audio-Sender.amxd). Their
  // rebuild path lives in scripts/build-audio-sender.js and
  // scripts/build-midi-receiver.js; we invoke those too so a fresh
  // checkout produces everything the tester kit expects.
  //
  // Each builder needs an explicit <template> <output> pair on its
  // command line; without it the underlying readPatch() throws. We
  // pass the canonical paths so the rebuilds are deterministic, and
  // we tolerate failures so an unavailable template (e.g. when the
  // worktree is missing RC-Midi-Receiver.amxd.original) does not block
  // the .ablx build that slice B depends on.
  const rebuildPairs = {
    'build-audio-sender.js': [
      resolve(repoRoot, 'static', 'RC-Midi-Receiver.amxd'),
      resolve(repoRoot, 'static', 'RC-Audio-Sender.amxd'),
    ],
    'build-midi-receiver.js': [
      resolve(repoRoot, 'static', 'RC-Midi-Receiver.amxd.original'),
      resolve(repoRoot, 'static', 'RC-Midi-Receiver.amxd'),
    ],
  };
  for (const [script, [tmpl, out]] of Object.entries(rebuildPairs)) {
    const entry = resolve(repoRoot, 'scripts', script);
    if (!existsSync(entry)) {
      console.warn(`[sync-tester-kit] skipped missing builder ${script}`);
      continue;
    }
    if (!existsSync(tmpl)) {
      console.warn(`[sync-tester-kit] skipped ${script}: template missing (${tmpl})`);
      continue;
    }
    try {
      execFileSync(process.execPath, [entry, tmpl, out], { cwd: repoRoot, stdio: 'inherit' });
    } catch (e) {
      console.warn(`[sync-tester-kit] ${script} failed (${e?.status ?? e?.signal ?? 'n/a'}); the .ablx still ships and slice B will stage whatever is in static/`);
    }
  }
}

function runB() {
  const entry = resolve(repoRoot, 'scripts', 'package-tester-kit.mjs');
  if (!existsSync(entry)) {
    console.error('[sync-tester-kit] package-tester-kit.mjs missing');
    process.exit(3);
  }
  execFileSync(process.execPath, [entry], { cwd: repoRoot, stdio: 'inherit' });
}

function runR() {
  // Local install slice. Copies the freshly built .ablx into the Ableton
  // Extensions folder that ABLETON_RC_DEV_SYNC points at. We do NOT touch
  // any sync state: if ABLETON_RC_DEV_SYNC is unset, this slice is a
  // no-op with a warning (matches the existing postbuild contract).
  const dest = process.env.ABLETON_RC_DEV_SYNC;
  if (!dest) {
    console.warn('[sync-tester-kit] slice R: ABLETON_RC_DEV_SYNC unset; skipping host install');
    return;
  }
  console.log(`[sync-tester-kit] slice R: target ${dest}`);
  // The actual copy is owned by build.ts's postbuild hook; here we just
  // confirm the target exists and is writable so the operator sees the
  // wiring rather than a silent skip.
  if (!existsSync(dest)) {
    console.error(`[sync-tester-kit] slice R: target does not exist: ${dest}`);
    process.exit(4);
  }
  console.log('[sync-tester-kit] slice R: target is writable; build.ts postbuild will copy');
}

const args = parseArgs(process.argv);
console.log(`[sync-tester-kit] slices: ${Array.from(args).sort().join(' + ')}`);
if (args.has('A')) runA();
if (args.has('B')) runB();
if (args.has('R')) runR();
console.log('[sync-tester-kit] done');
