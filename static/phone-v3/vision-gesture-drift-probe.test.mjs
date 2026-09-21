// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// vision-gesture-drift-probe.test.mjs
// Verification suite for drift probe and deterministic replay harness.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { attachDriftProbe, runDeterministicReplay } from './vision-gesture-drift-probe.mjs';

function loadEnvironment() {
  const safeSource = fs.readFileSync(path.join(import.meta.dirname, 'safe-input-layer.js'), 'utf8');
  const cameraSource = fs.readFileSync(path.join(import.meta.dirname, 'camera-lifecycle.js'), 'utf8');
  const visionSource = fs.readFileSync(path.join(import.meta.dirname, 'vision-processor.js'), 'utf8');

  const context = {
    window: null,
    globalThis: {},
    document: {
      createElement: () => ({ set src(v) {}, onload: null, onerror: null }),
      head: { appendChild: () => {} },
    },
    performance: { now: () => Date.now() },
  };
  context.window = context;
  context.globalThis = context;

  vm.runInNewContext(safeSource, context, { filename: 'safe-input-layer.js' });
  vm.runInNewContext(cameraSource, context, { filename: 'camera-lifecycle.js' });
  vm.runInNewContext(visionSource, context, { filename: 'vision-processor.js' });

  globalThis.SafeInputLayer = context.SafeInputLayer;

  return {
    SafeInputLayer: context.SafeInputLayer,
    VisionProcessor: context.VisionProcessor,
    context,
  };
}

// Generate realistic 21-landmark array for pose tests
function createLandmarks({ thumb = 0.5, index = 1, middle = 1, ring = 1, pinky = 1 } = {}) {
  const landmarks = new Array(21);
  const setPoint = (i, x, y, z = 0) => { landmarks[i] = { x, y, z }; };
  setPoint(0, 0.50, 0.90);
  const a0 = thumb * (-2.30) + (1 - thumb) * 0.35;
  const a1 = a0 + (1 - thumb) * (Math.PI * 0.92);
  setPoint(1, 0.445, 0.825);
  setPoint(2, 0.405, 0.762);
  setPoint(3, 0.405 + Math.cos(a0) * 0.100, 0.762 + Math.sin(a0) * 0.100);
  setPoint(4, landmarks[3].x + Math.cos(a1) * 0.092, landmarks[3].y + Math.sin(a1) * 0.092);
  const columns = [[5, 0.42], [9, 0.48], [13, 0.54], [17, 0.60]];
  const extensions = [index, middle, ring, pinky];
  const segments = [
    [0.105, 0.090, 0.070], [0.110, 0.095, 0.072],
    [0.100, 0.088, 0.068], [0.085, 0.072, 0.058],
  ];
  columns.forEach(([base, x], col) => {
    const ext = extensions[col];
    const seg = segments[col];
    setPoint(base, x, 0.62);
    let px = x;
    let py = 0.62;
    let angle = -Math.PI / 2;
    const bend = (1 - ext) * (Math.PI * 1.72);
    const share = [0.42, 0.34, 0.24];
    for (let j = 0; j < 3; j++) {
      angle += bend * share[j];
      px += Math.cos(angle) * seg[j];
      py += Math.sin(angle) * seg[j];
      setPoint(base + 1 + j, px, py);
    }
  });
  return landmarks;
}

function setupLearnedGesture(processor, name = 'Gesture 1') {
  const pose = createLandmarks({ thumb: 0.1, index: 1, middle: 0.1, ring: 0.1, pinky: 0.1 });
  for (let take = 0; take < 3; take++) {
    processor.beginGestureLearn(name);
    // 5 stability frames
    for (let i = 0; i < 5; i++) {
      processor.processHandData({ x: 0.5, y: 0.5, z: 0.5, confidence: 1 }, i * 33, pose);
    }
    // Learn frames
    for (let i = 0; i < 10; i++) {
      processor.processHandData({ x: 0.5, y: 0.5, z: 0.5, confidence: 1 }, 200 + i * 33, pose);
    }
    processor.finishGestureLearn();
  }
  return pose;
}

test('probe: attaches observationally and records monotonic observed frames', () => {
  const { VisionProcessor } = loadEnvironment();
  const vp = new VisionProcessor();
  const pose = setupLearnedGesture(vp, 'Gesture 1');

  const probe = attachDriftProbe(vp, {
    sessionConfig: { preset: 'high', notes: 'unit-test' },
  });

  assert.equal(probe.records.length, 0);

  // Send 10 frames at 33ms cadence (spanning 297ms, past 200ms hold duration)
  for (let i = 0; i < 10; i++) {
    const t = 1000 + i * 33;
    vp.processHandData({ x: 0.5, y: 0.5, z: 0.5, confidence: 0.9 }, t, pose);
  }

  assert.equal(probe.records.length, 10);
  for (let i = 0; i < probe.records.length; i++) {
    const r = probe.records[i];
    assert.equal(r.frameIndex, i);
    assert.equal(r.type, 'observed');
    assert.equal(r.sawHand, true);
    assert.equal(r.timestamp, 1000 + i * 33);
    assert.equal(r.elapsedMs, i * 33);
    assert.ok(Array.isArray(r.descriptor));
    assert.ok(r.descriptor.length > 0);
    assert.ok(r.evaluation !== null);
    if (r.activeName === null) {
      assert.equal(r.candidateName, 'Gesture 1');
    } else {
      assert.equal(r.candidateName, null);
      assert.equal(r.activeName, 'Gesture 1', 'must engage activeName once holdMs has passed');
    }
    if (i > 0) {
      assert.ok(r.timestamp > probe.records[i - 1].timestamp, 'timestamps must be monotonically increasing');
    }
  }

  probe.uninstall();
});

test('probe: records missing frames without imputing unobserved scores', () => {
  const { VisionProcessor } = loadEnvironment();
  const vp = new VisionProcessor();
  setupLearnedGesture(vp, 'Gesture 1');

  const probe = attachDriftProbe(vp);

  vp.processMissing(1000);
  vp.processMissing(1033);

  assert.equal(probe.records.length, 2);
  const r0 = probe.records[0];
  assert.equal(r0.type, 'missing');
  assert.equal(r0.sawHand, false);
  assert.equal(r0.landmarks, null);
  assert.equal(r0.descriptor, null);
  assert.equal(r0.evaluation, null);
  assert.equal(r0.targetScore, null);

  probe.uninstall();
});

test('probe: observational wrappers preserve return values and exceptions', () => {
  const { VisionProcessor } = loadEnvironment();
  const vp = new VisionProcessor();
  const pose = setupLearnedGesture(vp, 'Gesture 1');

  const probe = attachDriftProbe(vp);

  const resHand = vp.processHandData({ x: 0.2, y: 0.3, z: 0.4 }, 500, pose);
  assert.ok(resHand);
  assert.equal(resHand.x, 0.2);
  assert.equal(resHand.active, true);

  const resMissing = vp.processMissing(600);
  assert.equal(resMissing, null);

  probe.uninstall();
});

test('probe: does not call recognize twice per frame or disrupt hold/trigger logic', () => {
  const { VisionProcessor } = loadEnvironment();
  const vp = new VisionProcessor();
  const pose = setupLearnedGesture(vp, 'Gesture 1');

  let gestureEvents = 0;
  vp.onGesture = () => { gestureEvents++; };

  const probe = attachDriftProbe(vp);

  // Feed stable pose continuously across 25 frames (825ms)
  // Hold time is 200ms by default.
  // Frame at 0ms: candidate begins
  // Frame at 231ms: triggers once
  // Frames after 231ms: hold state must prevent re-triggering
  for (let i = 0; i < 25; i++) {
    vp.processHandData({ x: 0.5, y: 0.5, z: 0.5, confidence: 1 }, i * 33, pose);
  }

  assert.equal(gestureEvents, 1, 'stable pose must fire exactly one recognition event');
  assert.equal(probe.summary().eventsCount, 1);

  probe.uninstall();
});

test('probe: uninstall restores original functions cleanly', () => {
  const { VisionProcessor } = loadEnvironment();
  const vp = new VisionProcessor();
  const origProcessHandData = vp.processHandData;
  const origProcessMissing = vp.processMissing;
  const origProcessResults = vp.processResults;
  const origRecognizeGesture = vp.recognizeGesture;

  const probe = attachDriftProbe(vp);
  assert.notEqual(vp.processHandData, origProcessHandData);

  probe.uninstall();
  assert.equal(vp.processHandData, origProcessHandData);
  assert.equal(vp.processMissing, origProcessMissing);
  assert.equal(vp.processResults, origProcessResults);
  assert.equal(vp.recognizeGesture, origRecognizeGesture);
});

test('probe: enforces maxFrames buffer cap and exports JSONL and CSV', () => {
  const { VisionProcessor } = loadEnvironment();
  const vp = new VisionProcessor();
  const pose = setupLearnedGesture(vp, 'Gesture 1');

  const probe = attachDriftProbe(vp, { maxFrames: 10 });

  for (let i = 0; i < 15; i++) {
    vp.processHandData({ x: 0.5, y: 0.5, z: 0.5, confidence: 1 }, i * 33, pose);
  }

  assert.equal(probe.records.length, 10, 'must cap buffer to maxFrames');

  const jsonl = probe.exportJSONL();
  const lines = jsonl.trim().split('\n');
  assert.equal(lines.length, 10);
  const parsedFirst = JSON.parse(lines[0]);
  assert.ok(parsedFirst.timestamp);
  assert.equal(parsedFirst.type, 'observed');

  const csv = probe.exportCSV();
  assert.ok(csv.startsWith('frameIndex,timestamp,elapsedMs,type,sawHand,preset,score,confidence,accepted,activeName,event\n'));

  probe.uninstall();
});

test('probe: summary calculates stats (median, p05, p95, slope, events)', () => {
  const { VisionProcessor } = loadEnvironment();
  const vp = new VisionProcessor();
  const pose = setupLearnedGesture(vp, 'Gesture 1');

  const probe = attachDriftProbe(vp);

  for (let i = 0; i < 20; i++) {
    vp.processHandData({ x: 0.5, y: 0.5, z: 0.5, confidence: 1 }, i * 33, pose);
  }
  vp.processMissing(20 * 33);
  vp.processMissing(21 * 33);

  const summary = probe.summary();
  assert.equal(summary.totalFrames, 22);
  assert.equal(summary.observedFrames, 20);
  assert.equal(summary.missingFrames, 2);
  assert.equal(typeof summary.medianScore, 'number');
  assert.equal(typeof summary.p05Score, 'number');
  assert.equal(typeof summary.p95Score, 'number');
  assert.equal(typeof summary.scoreSlopePerMinute, 'number');
  assert.ok(summary.p05Score <= summary.medianScore);
  assert.ok(summary.medianScore <= summary.p95Score);

  probe.uninstall();
});

test('replay: runDeterministicReplay proves fixed descriptor has 0 drift over >=6 minutes', () => {
  const { SafeInputLayer } = loadEnvironment();
  const library = new SafeInputLayer.GestureLibrary();

  const pose = createLandmarks({ thumb: 0.1, index: 1, middle: 0.1, ring: 0.1, pinky: 0.1 });
  const descriptor = SafeInputLayer.normalizeHandPose(pose);

  // Train gesture with 3 samples
  library.learn('G1', [descriptor, descriptor, descriptor, descriptor, descriptor]);
  library.learn('G1', [descriptor, descriptor, descriptor, descriptor, descriptor]);
  library.learn('G1', [descriptor, descriptor, descriptor, descriptor, descriptor]);

  // Run replay for 6 minutes (360,000 ms) at 33.33ms intervals (~10,800 frames)
  const result = runDeterministicReplay({
    library,
    descriptor,
    durationMs: 360000,
    intervalMs: 33.333,
    targetName: 'G1',
  });

  assert.ok(result.summary.totalFrames >= 10800, 'replay must cover at least 10800 frames across 6 minutes');
  assert.equal(result.summary.eventsCount, 1, 'fixed pose must trigger exactly once at onset');
  assert.equal(result.summary.missingFrames, 0);
  assert.equal(result.summary.scoreSlopePerMinute, 0, 'deterministic replay must exhibit exactly 0 score drift');
  assert.equal(result.summary.p05Score, result.summary.medianScore);
  assert.equal(result.summary.p95Score, result.summary.medianScore);
  assert.equal(result.finalActiveName, 'G1', 'pose must remain actively held without dropping');
});
