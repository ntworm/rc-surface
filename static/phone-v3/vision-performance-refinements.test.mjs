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

test('temporary missing hand keeps active learned pose without emitting release', () => {
  const processor = loadProcessor();
  const gestures = {
    activeName: 'Rock',
    recognize(value) { if (value === null) this.activeName = null; },
  };
  processor.gestures = gestures;
  const releases = [];
  processor.onGestureRelease = (name) => releases.push(name);

  processor.processMissing(1000);
  processor.processMissing(2000);
  assert.equal(gestures.activeName, 'Rock');
  assert.deepEqual(releases, []);
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
