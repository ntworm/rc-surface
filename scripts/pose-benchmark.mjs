// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Offline session-level pose comparison. No network or implicit output files.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const phone = path.join(import.meta.dirname, '../static/phone-v3');
const context = {};
context.window = context; context.globalThis = context;
vm.runInNewContext(fs.readFileSync(path.join(phone, 'safe-input-layer.js'), 'utf8'), context);
export const safe = context.SafeInputLayer;
const app = fs.readFileSync(path.join(phone, 'app.js'), 'utf8');
export const presets = vm.runInNewContext(`(${app.match(/const GESTURE_PRESETS = (\{[\s\S]*?\n    \});/)[1]})`);
const kth = values => values.slice().sort((a, b) => a - b)[Math.min(2, values.length) - 1];
const clamp = value => Math.min(1, Math.max(0, value));
const percentile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
};

export function readSession(text, id = 'session') {
  let previous = -Infinity;
  const records = text.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
    let record;
    try { record = JSON.parse(line); } catch { throw new Error(`${id}:${index + 1}: invalid JSON`); }
    for (const field of ['landmarks', 'frameWidth', 'frameHeight', 'groundTruth', 'timestamp', 'type']) {
      if (!record || !Object.hasOwn(record, field)) throw new Error(`${id}:${index + 1}: missing ${field}`);
    }
    if (!Number.isFinite(record.timestamp) || record.timestamp < previous) {
      throw new Error(`${id}:${index + 1}: timestamp must be finite and chronological`);
    }
    previous = record.timestamp;
    if (!['observed', 'missing'].includes(record.type)) throw new Error(`${id}:${index + 1}: invalid type`);
    if (record.groundTruth !== null && (typeof record.groundTruth !== 'string' || !record.groundTruth.trim())) {
      throw new Error(`${id}:${index + 1}: groundTruth must be a nonempty label or null`);
    }
    let descriptor = null;
    if (record.type === 'observed') {
      for (const field of ['frameWidth', 'frameHeight']) if (!Number.isFinite(record[field]) || record[field] <= 0) {
        throw new Error(`${id}:${index + 1}: ${field} must be positive for observed frames`);
      }
      descriptor = safe.normalizeHandPose(record.landmarks, { aspect: record.frameWidth / record.frameHeight });
      if (!descriptor.length) throw new Error(`${id}:${index + 1}: invalid landmarks`);
    } else if (record.landmarks !== null) {
      throw new Error(`${id}:${index + 1}: missing frames require null landmarks`);
    }
    return { ...record, descriptor, id: `${id}:${index}`, sessionId: id };
  });
  if (!records.length) throw new Error(`${id}: empty session`);
  return { id, records };
}

export function extractTakes(session, options = {}) {
  const trimMs = options.trimMs ?? 200;
  const library = new safe.GestureLibrary(options.preset || presets.balanced);
  const takes = [], excluded = [];
  let group = [];
  function finish() {
    if (!group.length) return;
    const start = group[0].timestamp, end = group.at(-1).timestamp;
    const id = `${session.id}:take:${group[0].id}`;
    const frames = group.filter(frame => frame.descriptor && frame.timestamp >= start + trimMs && frame.timestamp <= end - trimMs);
    const label = group[0].groundTruth;
    const stable = frames.length >= 5 && library.isStableCapture(frames.map(frame => frame.descriptor));
    if (stable) takes.push({ id, sessionId: session.id, label, start, end, frames,
      prototype: safe.medianDescriptor(frames.map(frame => frame.descriptor)),
      spread: safe.descriptorSpread(frames.map(frame => frame.descriptor)) });
    else excluded.push({ id, label, start, end, reason: frames.length < 5 ? 'too-short' : 'unstable' });
    group = [];
  }
  for (const record of session.records) {
    if (group.length && group[0].groundTruth !== record.groundTruth) finish();
    if (record.groundTruth !== null) group.push(record);
  }
  finish();
  return { takes, excluded };
}

export function selectTraining(takes, budget) {
  const selected = [], notEvaluable = [];
  for (const label of new Set(takes.map(take => take.label))) {
    const sessions = new Map();
    for (const take of takes.filter(take => take.label === label)) {
      if (!sessions.has(take.sessionId)) sessions.set(take.sessionId, []);
      sessions.get(take.sessionId).push(take);
    }
    for (const list of sessions.values()) list.sort((a, b) => a.start - b.start);
    const ordered = [];
    while ([...sessions.values()].some(list => list.length)) {
      for (const list of sessions.values()) if (list.length) ordered.push(list.shift());
    }
    if (ordered.length < budget) notEvaluable.push(label);
    else selected.push(...ordered.slice(0, budget));
  }
  return { selected, notEvaluable };
}

export function calibrationFactor(library, name, loto = false) {
  const samples = library.templates.get(name) || [];
  if (samples.length < 2) return 1;
  const weights = library.weightsFor(name);
  const distances = samples.map((sample, index) => samples.filter((_, other) => other !== index)
    .map(other => safe.weightedPoseDistance(sample, other, weights)));
  const radius = Math.max(...distances.map(values => loto ? kth(values) : Math.max(...values)));
  return Math.min(2.5, Math.max(1, radius * 1.6 / library.threshold));
}

// Exposed as an adapter so the native A2 integration can be checked against it.
export function adapterEvaluate(library, descriptor, targetName = null, arm = 'A1', trainingFrames = []) {
  if (!Array.isArray(descriptor) || ![42, 47].includes(descriptor.length) || !descriptor.every(Number.isFinite)) return null;
  if (arm === 'A4') {
    const neighbors = trainingFrames.map(frame => ({ name: frame.label,
      score: Math.sqrt(frame.descriptor.reduce((sum, value, i) => sum + (value - descriptor[i]) ** 2, 0)) }))
      .sort((a, b) => a.score - b.score).slice(0, Math.min(100, trainingFrames.length));
    if (!neighbors.length) return null;
    const votes = new Map();
    for (const neighbor of neighbors) votes.set(neighbor.name, (votes.get(neighbor.name) || 0) + 1);
    const ranked = [...votes].sort((a, b) => b[1] - a[1]);
    const candidates = ranked.map(([name, count]) => ({ name, confidence: count / neighbors.length,
      score: neighbors.find(neighbor => neighbor.name === name).score }));
    return { ...candidates[0], confidence: 1, accepted: true, ambiguous: false, contradiction: false,
      candidates, target: candidates.find(candidate => candidate.name === targetName) || null };
  }
  const scores = [], neighbors = [];
  for (const [name, samples] of library.templates) {
    const distances = samples.map(sample => safe.weightedPoseDistance(descriptor, sample, library.weightsFor(name)));
    const score = kth(distances);
    const limit = library.thresholdFor(name);
    scores.push({ name, score, relative: score / Math.max(.0001, limit),
      confidence: clamp(1 - score / Math.max(.0001, limit * 1.5)),
      contradiction: safe.contradictsLearnedFingers(descriptor, samples) });
    for (const distance of distances) neighbors.push({ name, relative: distance / Math.max(.0001, limit) });
  }
  scores.sort((a, b) => Number(a.contradiction) - Number(b.contradiction) || a.relative - b.relative);
  if (!scores.length) return null;
  let best = scores[0];
  let ambiguous = Boolean(scores[1] && !scores[1].contradiction && scores[1].relative <= best.relative * library.ambiguityRatio);
  if (arm === 'A3') {
    const votes = new Map();
    for (const neighbor of neighbors.sort((a, b) => a.relative - b.relative).slice(0, 3)) {
      votes.set(neighbor.name, (votes.get(neighbor.name) || 0) + 1 / Math.max(1e-9, neighbor.relative));
    }
    const ranked = [...votes].sort((a, b) => b[1] - a[1]);
    best = scores.find(score => score.name === ranked[0][0]);
    ambiguous = Boolean(ranked[1] && ranked[1][1] * library.ambiguityRatio >= ranked[0][1]);
  }
  const candidates = scores.map(({ name, score, confidence }) => ({ name, score, confidence }));
  return { name: best.name, score: best.score, confidence: best.confidence,
    accepted: !best.contradiction && best.score <= library.thresholdFor(best.name)
      && best.confidence >= library.minimumConfidence && !ambiguous,
    ambiguous, contradiction: best.contradiction, candidates,
    target: candidates.find(candidate => candidate.name === targetName) || null };
}

export function makeArm(arm, takes, preset = presets.balanced) {
  const library = new safe.GestureLibrary(preset);
  const trainingFrames = [];
  for (const name of new Set(takes.map(take => take.label))) {
    const group = takes.filter(take => take.label === name);
    library.templates.set(name, group.map(take => take.prototype));
    library.takeSpreads.set(name, group.map(take => take.spread));
    library.rebuildSpread(name);
    library.thresholdFactors.set(name, calibrationFactor(library, name, arm === 'A2'));
    for (const take of group) for (const frame of take.frames) trainingFrames.push({ label: name, descriptor: frame.descriptor });
  }
  if (arm !== 'A0') library.evaluate = (descriptor, targetName) => adapterEvaluate(library, descriptor, targetName, arm, trainingFrames);
  return library;
}

export function replay(library, session) {
  library.resetRecognition();
  const edges = [], frames = [];
  for (const record of session.records) {
    const before = library.activeName;
    let match = null, evaluation = null;
    if (record.type === 'missing') library.markMissing(record.timestamp);
    else {
      evaluation = library.evaluate(record.descriptor);
      match = library.recognize(record.descriptor, record.timestamp);
    }
    if (before !== null && before !== library.activeName) edges.push({ type: 'OFF', name: before, timestamp: record.timestamp });
    if (match) edges.push({ type: 'ON', name: match.name, timestamp: record.timestamp });
    frames.push({ timestamp: record.timestamp, type: record.type, groundTruth: record.groundTruth,
      accepted: Boolean(evaluation?.accepted), predicted: evaluation?.accepted ? evaluation.name : null });
  }
  return { edges, frames };
}

export function measure(session, takes, playback, options = {}) {
  const entryMs = options.entryMs ?? 1000, exitWindowMs = options.exitWindowMs ?? 200;
  const ignoreUnknownMs = options.ignoreUnknownMs ?? 300;
  const measuredTakes = takes.map(take => {
    const inside = playback.edges.filter(edge => edge.timestamp >= take.start && edge.timestamp <= take.end);
    const ons = inside.filter(edge => edge.type === 'ON');
    const correct = ons.find(edge => edge.name === take.label);
    const off = playback.edges.find(edge => edge.type === 'OFF' && edge.name === take.label && edge.timestamp >= take.end);
    return { id: take.id, label: take.label, correctOn: Boolean(correct && correct.timestamp - take.start <= entryMs),
      wrongClass: ons.some(edge => edge.name !== take.label), entryLatencyMs: correct ? correct.timestamp - take.start : null,
      falseOff: inside.some(edge => edge.type === 'OFF' && edge.timestamp < take.end - exitWindowMs),
      exitLatencyMs: off ? off.timestamp - take.end : null, spuriousSwitches: Math.max(0, ons.length - 1) };
  });
  // Unknown exposure must be identical across arms, even when one arm has
  // insufficient examples for a class. Use every labeled interval's end.
  const knownEnds = session.records.filter((record, i) => record.groundTruth !== null
    && session.records[i + 1]?.groundTruth !== record.groundTruth).map(record => record.timestamp);
  const eligible = timestamp => !knownEnds.some(end => timestamp > end && timestamp < end + ignoreUnknownMs);
  let durationMs = 0, observed = 0, falseAcceptances = 0;
  const confusion = new Map();
  for (let i = 0; i < playback.frames.length; i++) {
    const frame = playback.frames[i];
    if (frame.type === 'observed') {
      const key = JSON.stringify([frame.groundTruth, frame.predicted]);
      confusion.set(key, (confusion.get(key) || 0) + 1);
    }
    if (frame.groundTruth !== null) continue;
    let intervals = [[frame.timestamp, session.records[i + 1]?.timestamp ?? frame.timestamp]];
    for (const end of knownEnds) {
      intervals = intervals.flatMap(([a, b]) => b <= end || a >= end + ignoreUnknownMs ? [[a, b]]
        : [[a, Math.min(b, end)], [Math.max(a, end + ignoreUnknownMs), b]].filter(([x, y]) => y > x));
    }
    durationMs += intervals.reduce((sum, [a, b]) => sum + Math.max(0, b - a), 0);
    if (frame.type === 'observed' && eligible(frame.timestamp)) { observed++; if (frame.accepted) falseAcceptances++; }
  }
  const falseOns = playback.edges.filter(edge => edge.type === 'ON' && eligible(edge.timestamp)
    && session.records.find(record => record.timestamp === edge.timestamp)?.groundTruth === null).length;
  return { takes: measuredTakes,
    unknown: { durationMs, falseOns, falseOnsPerMinute: durationMs ? falseOns * 60000 / durationMs : null,
      observedFrames: observed, falseAcceptances, falseAcceptanceRate: observed ? falseAcceptances / observed : null },
    confusion: [...confusion].map(([key, count]) => { const [truth, predicted] = JSON.parse(key); return { truth, predicted, count }; }) };
}

export function pairedBootstrap(baseline, comparison, options = {}) {
  const pairs = comparison.map(take => [baseline.find(other => other.id === take.id), take]).filter(([base]) => base);
  if (!pairs.length) return null;
  let seed = options.seed ?? 1;
  const random = () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  const differences = pairs.map(([base, candidate]) => Number(candidate.correctOn) - Number(base.correctOn));
  const samples = [];
  for (let i = 0; i < (options.resamples ?? 2000); i++) {
    let sum = 0;
    for (let j = 0; j < pairs.length; j++) sum += differences[Math.floor(random() * pairs.length)];
    samples.push(sum / pairs.length);
  }
  return { pairedTakes: pairs.length, accuracyDelta: differences.reduce((a, b) => a + b, 0) / pairs.length,
    ci95: [percentile(samples, .025), percentile(samples, .975)], seed: options.seed ?? 1, resamples: options.resamples ?? 2000 };
}

export function benchmark(sessions, options = {}) {
  if (sessions.length < 2) throw new Error('benchmark requires at least two sessions');
  if (new Set(sessions.map(session => session.id)).size !== sessions.length) throw new Error('session IDs must be unique');
  const presetName = options.preset ?? 'balanced';
  const preset = presets[presetName];
  if (!preset) throw new Error(`unknown preset: ${presetName}`);
  const budgets = options.takes ?? [1, 2, 3, 5, 6];
  if (!budgets.length || budgets.some(n => !Number.isInteger(n) || n < 1 || n > 6)) throw new Error('takes must be integers from 1 to 6');
  const extracted = sessions.map(session => extractTakes(session, { ...options, preset }));
  const folds = sessions.map((session, index) => {
    const train = extracted.filter((_, other) => other !== index).flatMap(result => result.takes);
    const testTakes = extracted[index].takes;
    const labels = [...new Set([...train, ...testTakes].map(take => take.label))];
    const specs = [{ arm: 'A0', takes: 3 }, ...['A1', 'A2', 'A3'].flatMap(arm => budgets.map(takes => ({ arm, takes }))), { arm: 'A4', takes: null }];
    const arms = specs.map(spec => {
      const selection = spec.arm === 'A4' ? { selected: train, notEvaluable: [] } : selectTraining(train, spec.takes);
      const trained = new Set(selection.selected.map(take => take.label));
      const notEvaluable = labels.filter(label => !trained.has(label));
      const library = makeArm(spec.arm, selection.selected, preset);
      const playback = replay(library, session);
      const metrics = measure(session, testTakes, playback, options);
      metrics.takes = metrics.takes.filter(take => trained.has(take.label));
      return { ...spec, notEvaluable, trainingTakeIds: selection.selected.map(take => take.id),
        trainingFrameIds: selection.selected.flatMap(take => take.frames.map(frame => frame.id)),
        edges: playback.edges, metrics };
    });
    return { testSession: session.id, excludedTakes: extracted[index].excluded, arms };
  });
  const aggregate = folds[0].arms.map(spec => {
    const matching = folds.map(fold => fold.arms.find(arm => arm.arm === spec.arm && arm.takes === spec.takes));
    const takes = matching.flatMap(arm => arm.metrics.takes);
    const baseline = folds.flatMap(fold => fold.arms[0].metrics.takes);
    const unknownMs = matching.reduce((sum, arm) => sum + arm.metrics.unknown.durationMs, 0);
    const falseOns = matching.reduce((sum, arm) => sum + arm.metrics.unknown.falseOns, 0);
    return { arm: spec.arm, takes: spec.takes, evaluatedTakes: takes.length,
      accuracy: takes.length ? takes.filter(take => take.correctOn).length / takes.length : null,
      falseOnsPerMinute: unknownMs ? falseOns * 60000 / unknownMs : null,
      entryLatencyP95Ms: percentile(takes.map(take => take.entryLatencyMs).filter(Number.isFinite), .95),
      pairedAgainstA0: pairedBootstrap(baseline, takes, options) };
  });
  return { version: 1, preset: presetName, options: { trimMs: options.trimMs ?? 200, entryMs: options.entryMs ?? 1000,
    exitWindowMs: options.exitWindowMs ?? 200, ignoreUnknownMs: options.ignoreUnknownMs ?? 300 }, folds, aggregate };
}

function markdown(report) {
  const number = value => value === null ? 'n/a' : Number(value.toFixed(4));
  return ['# Offline pose benchmark', '', `Preset: ${report.preset}. ${report.folds.length} leave-one-session-out folds.`, '',
    'Synthetic results do not establish real-camera gains. A4 intentionally has no rejection.', '',
    '| Arm | Takes/class | Evaluated takes | Accuracy | False ON/min | Entry p95 ms |',
    '| --- | --- | --- | --- | --- | --- |', ...report.aggregate.map(row =>
      `| ${row.arm} | ${row.takes ?? 'all frames'} | ${row.evaluatedTakes} | ${number(row.accuracy)} | ${number(row.falseOnsPerMinute)} | ${number(row.entryLatencyP95Ms)} |`), '',
    'Paired bootstrap confidence intervals, exclusions and full per-take metrics are in the JSON report.', ''].join('\n');
}

export function parseArgs(args) {
  const options = { sessions: [] };
  const numeric = { '--trim-ms': 'trimMs', '--entry-ms': 'entryMs', '--exit-window-ms': 'exitWindowMs', '--ignore-unknown-ms': 'ignoreUnknownMs' };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--sessions') {
      while (args[i + 1] && !args[i + 1].startsWith('--')) options.sessions.push(args[++i]);
    } else if (flag === '--takes') options.takes = (args[++i] || '').split(',').map(Number);
    else if (['--preset', '--out', '--md'].includes(flag)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
      options[flag.slice(2)] = value;
    } else if (numeric[flag]) {
      const value = Number(args[++i]);
      if (!Number.isFinite(value) || value < 0) throw new Error(`${flag} requires a nonnegative number`);
      options[numeric[flag]] = value;
    } else throw new Error(`unknown option: ${flag}`);
  }
  if (!options.out) throw new Error('--out is required');
  if (options.sessions.length < 2) throw new Error('--sessions requires at least two sessions');
  const inputs = options.sessions.map(file => path.resolve(file));
  const outputs = [options.out, options.md].filter(Boolean).map(file => path.resolve(file));
  if (outputs.some(file => inputs.includes(file)) || new Set(outputs).size !== outputs.length) throw new Error('outputs must be distinct from input sessions and each other');
  return options;
}

export function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const sessions = options.sessions.map(file => readSession(fs.readFileSync(file, 'utf8'), path.resolve(file)));
  const report = benchmark(sessions, options);
  fs.writeFileSync(options.out, JSON.stringify(report, null, 2) + '\n');
  if (options.md) fs.writeFileSync(options.md, markdown(report));
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
