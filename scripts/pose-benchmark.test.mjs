// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { benchmark, readSession, extractTakes, selectTraining, makeArm, replay, measure, safe, presets, adapterEvaluate } from './pose-benchmark.mjs';

function landmarks(bend = 0) {
  return Array.from({ length: 21 }, (_, i) => ({ x: .4 + (i % 4) * .05,
    y: .8 - Math.floor(i / 4) * .08 + (i === 8 ? bend : 0), z: 0 }));
}
function session(id, repetitions = 3) {
  const records = [];
  for (let take = 0; take < repetitions; take++) {
    for (let i = 0; i <= 12; i++) records.push({ timestamp: take * 2000 + i * 100,
      type: 'observed', landmarks: landmarks(), frameWidth: 320, frameHeight: 240, groundTruth: 'Open' });
    for (let i = 13; i < 20; i++) records.push({ timestamp: take * 2000 + i * 100,
      type: i === 13 ? 'missing' : 'observed', landmarks: i === 13 ? null : landmarks(.8),
      frameWidth: 320, frameHeight: 240, groundTruth: null });
  }
  return readSession(records.map(record => JSON.stringify(record)).join('\n'), id);
}

test('benchmark is deterministic, leaves whole sessions out and marks insufficient classes', () => {
  const sessions = [session('a'), session('b'), session('c')];
  const report = benchmark(sessions, { takes: [1, 3, 6] });
  assert.deepEqual(report, benchmark(sessions, { takes: [1, 3, 6] }));
  assert.equal(report.folds.length, 3);
  for (const fold of report.folds) for (const arm of fold.arms) {
    assert.ok(arm.trainingTakeIds.every(id => !id.startsWith(`${fold.testSession}:`)));
    assert.ok(arm.trainingFrameIds.every(id => !id.startsWith(`${fold.testSession}:`)));
  }
  const short = benchmark([session('a', 1), session('b', 1)], { takes: [3] });
  assert.ok(short.folds[0].arms.find(arm => arm.arm === 'A1').notEvaluable.includes('Open'));
  const training = selectTraining(sessions.slice(1).flatMap(s => extractTakes(s).takes), 3);
  assert.deepEqual(training.selected.map(take => take.sessionId), ['b', 'c', 'b']);
});

test('A0 replay reproduces native GestureLibrary decisions; A4 accepts distant inputs', () => {
  const train = extractTakes(session('train')).takes;
  const selected = selectTraining(train, 3).selected;
  const native = new safe.GestureLibrary(presets.balanced);
  for (const take of selected) native.learn(take.label, take.frames.map(frame => frame.descriptor));
  const arm = makeArm('A0', selected, presets.balanced);
  const testing = session('test');
  assert.deepEqual(replay(arm, testing), replay(native, testing));
  const distant = selected[0].prototype.map(value => value + 10);
  assert.equal(makeArm('A4', train, presets.balanced).evaluate(distant).accepted, true);
  assert.equal(makeArm('A1', selected, presets.balanced).evaluate(distant).accepted, false);
});

test('take extraction trims transitions, rejects unstable takes and keeps missing records in replay', () => {
  const original = session('a', 1);
  const result = extractTakes(original);
  assert.equal(result.takes.length, 1);
  assert.equal(result.takes[0].frames.length, 9);
  assert.equal(result.takes[0].frames[0].timestamp, 200);
  assert.equal(result.takes[0].frames.at(-1).timestamp, 1000);
  const unstable = readSession(original.records.map((record, i) => JSON.stringify({ ...record,
    landmarks: record.type === 'observed' ? landmarks(i % 2 ? .8 : 0) : null })).join('\n'), 'bad');
  assert.equal(extractTakes(unstable).excluded[0].reason, 'unstable');
});

test('native A2 exactly matches the P01 adapter across three and six take budgets', () => {
  for (const budget of [3, 6]) {
    const training = selectTraining(extractTakes(session('train', 6)).takes, budget).selected;
    const library = makeArm('A2', training);
    for (const record of session('test').records.filter(record => record.descriptor)) {
      assert.deepEqual(JSON.parse(JSON.stringify(library.evaluate(record.descriptor))),
        JSON.parse(JSON.stringify(adapterEvaluate(library, record.descriptor, null, 'A2'))));
    }
  }
});

test('metrics count exact entry, wrong class, false release, exit and unknown duration', () => {
  const records = Array.from({ length: 31 }, (_, i) => ({ timestamp: i * 100, type: 'observed',
    groundTruth: i <= 10 ? 'A' : null }));
  const take = { id: 'test:0', label: 'A', start: 0, end: 1000 };
  const playback = { edges: [
    { type: 'ON', name: 'A', timestamp: 100 }, { type: 'OFF', name: 'A', timestamp: 500 },
    { type: 'ON', name: 'B', timestamp: 600 }, { type: 'OFF', name: 'A', timestamp: 1200 },
    { type: 'ON', name: 'B', timestamp: 1500 },
  ], frames: records.map(record => ({ ...record, accepted: record.timestamp === 1500, predicted: 'B' })) };
  const result = measure({ records }, [take], playback);
  assert.equal(result.takes[0].correctOn, true);
  assert.equal(result.takes[0].wrongClass, true);
  assert.equal(result.takes[0].entryLatencyMs, 100);
  assert.equal(result.takes[0].falseOff, true);
  assert.equal(result.takes[0].exitLatencyMs, 200);
  assert.equal(result.unknown.falseOns, 1);
  assert.equal(result.unknown.durationMs, 1700);
  assert.equal(result.unknown.falseOnsPerMinute, 60000 / 1700);
  assert.equal(result.unknown.falseAcceptanceRate, 1 / 18);
});

test('invalid sessions fail clearly and CLI writes only explicit outputs', t => {
  assert.throws(() => readSession('{"type":"observed"}', 'bad'), /landmarks/);
  assert.throws(() => benchmark([session('single')]), /at least two sessions/);
  const invalid = session('a', 1).records.map(record => ({ ...record }));
  invalid[0].frameWidth = 0;
  assert.throws(() => readSession(invalid.map(JSON.stringify).join('\n'), 'bad'), /frameWidth/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pose-bench-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = ['a', 'b'].map(id => {
    const file = path.join(dir, `${id}.jsonl`);
    fs.writeFileSync(file, session(id).records.map(record => JSON.stringify(record)).join('\n'));
    return file;
  });
  const output = path.join(dir, 'report.json');
  const markdown = path.join(dir, 'report.md');
  const run = spawnSync(process.execPath, [path.join(import.meta.dirname, 'pose-benchmark.mjs'),
    '--sessions', ...files, '--takes', '3', '--out', output, '--md', markdown], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).folds.length, 2);
  assert.match(fs.readFileSync(markdown, 'utf8'), /A0/);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['a.jsonl', 'b.jsonl', 'report.json', 'report.md']);
});
