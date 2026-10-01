// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

function loadProcessor() {
  const source = fs.readFileSync(path.join(import.meta.dirname, 'vision-processor.js'), 'utf8');
  const context = { console, Date, performance };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'vision-processor.js' });
  return new context.VisionProcessor();
}

function hand() {
  const points = Array.from({ length: 21 }, (_, i) => ({
    x: 0.25 + (i % 5) * 0.08,
    y: 0.30 + Math.floor(i / 5) * 0.08,
    z: 0,
  }));
  points[0] = { x: 0.5, y: 0.8, z: 0 };
  return points;
}

test('C19: first missing hand releases active pose once', () => {
  const processor = loadProcessor();
  const gestures = {
    activeName: 'Rock',
    resetRecognition() { this.activeName = null; },
  };
  processor.gestures = gestures;
  const releases = [];
  processor.onGestureRelease = (name) => releases.push(name);

  processor.processMissing(1000);
  assert.equal(gestures.activeName, null);
  assert.deepEqual(releases, ['Rock']);
  processor.processMissing(2000);
  assert.deepEqual(releases, ['Rock']);
});

function learnedPipeline(holdMs = 120) {
  const context = { performance: { now: () => 0 }, Date };
  context.window = context; context.globalThis = context;
  for (const file of ['safe-input-layer.js', 'vision-processor.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(import.meta.dirname, file), 'utf8'), context);
  }
  const fixture = fs.readFileSync(path.join(import.meta.dirname, 'static-pose-gesture.test.mjs'), 'utf8');
  vm.runInNewContext(fixture.slice(fixture.indexOf('function handPose('), fixture.indexOf('function transform(')), context);
  const processor = new context.VisionProcessor();
  processor.active = true;
  processor.setGestureOptions({ threshold: .176, minimumConfidence: .52, holdMs,
    releaseMs: 140, releaseRatio: 1.10, ambiguityRatio: 1.25 });
  const pose = context.handPose({ thumb: 1, ring: .2, pinky: .2 });
  const descriptor = context.SafeInputLayer.normalizeHandPose(pose);
  for (let take = 0; take < 3; take++) processor.gestures.learn('G1', Array.from({ length: 8 }, () => descriptor.slice()));
  const edges = [];
  processor.onGesture = match => edges.push(`${match.name}:ON`);
  processor.onGestureRelease = name => edges.push(`${name}:OFF`);
  const raw = { x: .5, y: .5, z: .5, active: true };
  const frame = time => processor.processHandData(raw, time, pose);
  return { processor, pose, edges, frame };
}

for (const holdMs of [120, 160, 260]) {
  test(`C19: recovery requires a fresh full ${holdMs} ms hold; templates survive`, () => {
    const { processor, frame, edges } = learnedPipeline(holdMs);
    frame(0); frame(holdMs);
    const saved = JSON.stringify(processor.gestures.toJSON());
    processor.processMissing(300);
    assert.deepEqual(edges, ['G1:ON', 'G1:OFF']);
    assert.equal(processor.gestures.activeName, null);
    for (const time of [500, 1120, 10000]) processor.processMissing(time);
    assert.equal(JSON.stringify(processor.gestures.toJSON()), saved);
    frame(11000); frame(11000 + holdMs - 1);
    assert.deepEqual(edges, ['G1:ON', 'G1:OFF']);
    frame(11000 + holdMs); frame(12000);
    assert.deepEqual(edges, ['G1:ON', 'G1:OFF', 'G1:ON']);
  });
}

test('C19: loss before confirmation clears candidate without a phantom OFF', () => {
  const { processor, frame, edges } = learnedPipeline();
  frame(0); frame(80);
  processor.processMissing(90);
  assert.equal(processor.gestures.candidateName, null);
  assert.deepEqual(edges, []);
  frame(100); frame(219);
  assert.deepEqual(edges, []);
  frame(220);
  assert.deepEqual(edges, ['G1:ON']);
});

for (const invalid of [[], [null], [Array(21).fill({ x: NaN, y: .5, z: 0 })]]) {
  test(`C19: unusable landmarks release before hand-loss callback (${JSON.stringify(invalid).slice(0, 20)})`, () => {
    const { processor, frame, edges } = learnedPipeline();
    frame(0); frame(120);
    processor.onHandUpdate = data => {
      assert.equal(data, null);
      assert.deepEqual(edges, ['G1:ON', 'G1:OFF']);
    };
    processor.processResults({ multiHandLandmarks: invalid }, 130);
    processor.processResults({ multiHandLandmarks: invalid }, 140);
  });
}

test('C19: explicit inference error releases once, preserves error and requires fresh recovery', () => {
  const { processor, frame, edges } = learnedPipeline();
  frame(0); frame(120);
  const readings = [];
  processor.onHandUpdate = data => readings.push(data);
  processor.setVisionStatus({ stage: 'error', lastError: 'Inference failed: worker rejected frame' });
  assert.deepEqual(edges, ['G1:ON', 'G1:OFF']);
  assert.equal(readings.at(-1), null);
  assert.equal(processor.visionStatus.lastError, 'Inference failed: worker rejected frame');
  processor.setVisionStatus({ stage: 'error', lastError: 'Inference failed: worker rejected frame' });
  assert.deepEqual(edges, ['G1:ON', 'G1:OFF']);
  frame(1000); frame(1120);
  assert.deepEqual(edges, ['G1:ON', 'G1:OFF', 'G1:ON']);
});

test('partial landmarks are treated as missing and the next valid frame recovers', () => {
  const processor = loadProcessor();
  processor.active = true;
  const readings = [];
  processor.onHandUpdate = (reading) => readings.push(reading);
  const broken = hand();
  delete broken[9];

  assert.doesNotThrow(() => processor.processResults({ multiHandLandmarks: [broken] }, 1000));
  assert.equal(readings.at(-1), null);
  assert.equal(processor.visionStatus.stage, 'waiting-hand');

  for (const invalid of [{ x: undefined, y: 0.5, z: 0 }, { x: 0.5, y: NaN, z: 0 }]) {
    const frame = hand();
    frame[8] = invalid;
    assert.doesNotThrow(() => processor.processResults({ multiHandLandmarks: [frame] }, 1010));
    assert.equal(readings.at(-1), null);
  }

  assert.doesNotThrow(() => processor.processResults({ multiHandLandmarks: [hand()] }, 1033));
  assert.equal(readings.at(-1)?.active, true);
  assert.equal(processor.visionStatus.stage, 'hand-detected');
});
