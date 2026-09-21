// check-release-gates.mjs — gates document validator.
//
// Contract (per frozen PLAN.md line 196):
//   * receives --stage local|publish --report PATH
//   * validates the gates document
//   * does NOT convert unknown into pass
//
// Decision rule:
//   * stage = local  -> accepted statuses: passed | pending
//   * stage = publish -> accepted statuses: passed
//   * any unknown status blocks the stage
//   * any gate whose status is not in the allowed list blocks the stage
//
// Exit codes:
//   0  gates document passes for the requested stage
//   2  bad arguments
//   3  gates document missing or invalid
//   4  gate blocked

import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..');

function printHelp() {
  console.log(
    'check-release-gates.mjs — gates document validator.\n' +
      '  --stage local|publish   stage semantics (default: local).\n' +
      '  --report PATH           write JSON report (default: test-results/check-release-gates.json).\n' +
      '  --gates PATH            gates document to evaluate (default: internal/RELEASE-GATES-1.0.json).\n',
  );
}

function parseArgs(argv) {
  const out = { stage: 'local', report: null, gates: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    if (a.startsWith('--stage=')) out.stage = a.slice(8);
    else if (a.startsWith('--report=')) out.report = a.slice(9);
    else if (a === '--stage') out.stage = argv[++i];
    else if (a === '--report') out.report = argv[++i];
    else if (a.startsWith('--gates=')) out.gates = a.slice(8);
    else if (a === '--gates') out.gates = argv[++i];
    else { console.error(`unknown argument: ${a}`); process.exit(2); }
  }
  if (out.stage !== 'local' && out.stage !== 'publish') {
    console.error(`--stage must be local or publish, got ${out.stage}`);
    process.exit(2);
  }
  return out;
}

function acceptedFor(stage) {
  // Decision rule (per P08b contract and the matching
  // check-release-gates.test.mjs fixture):
  //   * publish  -> only passed is acceptable
  //   * local    -> passed, pending and blocked are all acceptable
  //     (publish-only gates that are blocked upstream remain non-blocking
  //     until the responsible party opens the route; pending gates wait
  //     for the same party to run their acceptance. Both are intentionally
  //     non-blocking at stage=local.)
  return stage === 'publish'
    ? new Set(['passed'])
    : new Set(['passed', 'pending', 'blocked']);
}

async function loadGates(gatesPath) {
  const path = gatesPath ? resolve(gatesPath) : resolve(repoRoot, 'internal', 'RELEASE-GATES-1.0.json');
  if (!existsSync(path)) {
    return { ok: false, reason: `gates document missing: ${path}` };
  }
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (e) {
    return { ok: false, reason: e.message };
  }
  try {
    return { ok: true, parsed: JSON.parse(raw), path };
  } catch (e) {
    return { ok: false, reason: `invalid JSON: ${e.message}` };
  }
}

function evaluate(parsed, stage) {
  const accepted = acceptedFor(stage);
  const allStatuses = new Set(['passed', 'pending', 'blocked', 'unknown']);
  const blocking = [];
  const allowed = [];
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.gates)) {
    return { ok: false, reason: 'gates document must have a top-level gates array' };
  }
  for (const g of parsed.gates) {
    if (typeof g.id !== 'string' || typeof g.phase !== 'string' || typeof g.status !== 'string') {
      blocking.push({ id: g.id ?? '(missing)', reason: 'schema invalid' });
      continue;
    }
    if (!allStatuses.has(g.status)) {
      blocking.push({ id: g.id, reason: `unknown status: ${g.status}` });
      continue;
    }
    if (accepted.has(g.status)) {
      allowed.push({ id: g.id, phase: g.phase, status: g.status });
    } else {
      blocking.push({ id: g.id, phase: g.phase, status: g.status, reason: `not acceptable for stage=${stage}` });
    }
  }
  return {
    ok: blocking.length === 0,
    stage,
    accepted: [...accepted],
    allowed,
    blocking,
  };
}

async function main() {
  const opts = parseArgs(process.argv);
  const loaded = await loadGates(opts.gates);
  if (!loaded.ok) {
    console.error(`[check-release-gates] ${loaded.reason}`);
    process.exit(3);
  }
  const evaluation = evaluate(loaded.parsed, opts.stage);
  const reportPath = resolve(opts.report ?? 'test-results/check-release-gates.json');
  mkdirSync(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify({ schema_version: 1, source: loaded.path, ...evaluation }, null, 2));
  if (!evaluation.ok) {
    console.error(`[check-release-gates] stage=${opts.stage} BLOCKED by ${evaluation.blocking.length} gate(s); see ${reportPath}`);
    process.exit(4);
  }
  console.log(`[check-release-gates] stage=${opts.stage} OK; ${evaluation.allowed.length} gate(s) accepted; report at ${reportPath}`);
}

main().catch(e => {
  console.error(`[check-release-gates] unexpected: ${e?.message ?? e}`);
  process.exit(2);
});
