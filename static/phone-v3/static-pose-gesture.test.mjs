// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

function load() {
  const source = fs.readFileSync(path.join(import.meta.dirname, 'safe-input-layer.js'), 'utf8');
  const context = { window: null, globalThis: null };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.SafeInputLayer;
}

// A hand whose fingers CURL. `e = 1` is extended, `e = 0` brings the tip back
// beside its own knuckle, which is what a finger does when it closes.
//
// The previous fixture folded a finger by scaling its length toward the wrist.
// That reads as a finger passing THROUGH its own knuckle and out the other
// side: at e = 0.42 the tip sat above the MCP, the knuckle-to-tip vector
// flipped, and the spread angle jumped 180 degrees between two poses that
// should differ slightly. Two conclusions were drawn from that fixture and
// both were wrong, so it is measured geometry now, calibrated so a folded
// finger reads about 0.30 of a palm from its knuckle and an extended one
// about 0.95 — the values RC MediaPipe recorded from real takes.
function handPose({ thumb = 0.5, index = 1, middle = 1, ring = 1, pinky = 1 } = {}) {
  const L = new Array(21);
  const P = (i, x, y) => { L[i] = { x, y, z: 0 }; };
  P(0, 0.50, 0.90);
  const a0 = thumb * (-2.30) + (1 - thumb) * 0.35;
  const a1 = a0 + (1 - thumb) * (Math.PI * 0.92);
  P(1, 0.445, 0.825);
  P(2, 0.405, 0.762);
  P(3, 0.405 + Math.cos(a0) * 0.100, 0.762 + Math.sin(a0) * 0.100);
  P(4, L[3].x + Math.cos(a1) * 0.092, L[3].y + Math.sin(a1) * 0.092);
  const columns = [[5, 0.42], [9, 0.48], [13, 0.54], [17, 0.60]];
  const extension = [index, middle, ring, pinky];
  const segments = [
    [0.105, 0.090, 0.070], [0.110, 0.095, 0.072],
    [0.100, 0.088, 0.068], [0.085, 0.072, 0.058],
  ];
  columns.forEach(([base, x], column) => {
    const e = extension[column];
    const seg = segments[column];
    P(base, x, 0.62);
    let px = x;
    let py = 0.62;
    let angle = -Math.PI / 2;
    const bend = (1 - e) * (Math.PI * 1.72);
    const share = [0.42, 0.34, 0.24];
    for (let joint = 0; joint < 3; joint += 1) {
      angle += bend * share[joint];
      px += Math.cos(angle) * seg[joint];
      py += Math.sin(angle) * seg[joint];
      P(base + 1 + joint, px, py);
    }
  });
  return L;
}

function transform(landmarks, { scale = 1, x = 0, y = 0, z = 0 } = {}) {
  return landmarks.map((point) => ({
    x: point.x * scale + x,
    y: point.y * scale + y,
    z: point.z * scale + z,
  }));
}

function transform2D(landmarks, { scale = 1, x = 0, y = 0, radians = 0, z = 0 } = {}) {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return landmarks.map((point) => ({
    x: (point.x * c - point.y * s) * scale + x,
    y: (point.x * s + point.y * c) * scale + y,
    z: point.z + z,
  }));
}

function frames(descriptor, count = 8, jitter = 0.002) {
  return Array.from({ length: count }, (_, frame) => descriptor.map((value, index) =>
    value + Math.sin(frame * 1.7 + index * 0.31) * jitter));
}

const performanceOptions = { threshold: .176, minimumConfidence: .52, ambiguityRatio: 1.25,
  holdMs: 120, releaseMs: 140, releaseRatio: 1.10, unknownGraceMs: 140 };

test('seeded 400-case corpus retains geometry and calibration before the finger-identity gate', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  let seed = 11;
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const results = [];
  for (let i = 0; i < 400; i++) {
    const library = new GestureLibrary(performanceOptions);
    const shape = () => normalizeHandPose(handPose(Object.fromEntries(
      ['thumb', 'index', 'middle', 'ring', 'pinky'].map(key => [key, random()]))));
    const base = shape();
    for (let take = 0; take < 3; take++) {
      library.learn('A', frames(base, 8, .002 + take * .001));
      library.learn('B', frames(shape(), 8, .002));
    }
    const evaluation = library.evaluate(shape(), 'A');
    results.push({ factors: ['A', 'B'].map(name => library.thresholdFor(name)),
      candidates: evaluation.candidates.map(({ name, score, confidence }) => ({ name, score, confidence }))
        .sort((a, b) => a.name.localeCompare(b.name)) });
  }
  // Captured by replaying e014e19 before this patch. Finger rejection/ranking
  // intentionally changes; distances, confidence and calibration must not.
  assert.equal(createHash('sha256').update(JSON.stringify(results)).digest('hex'), 'b86362dac56875ee70e03df5539ce1de6b136559d89e2644b21de2ffc661f7c1');
});

test('six-take bank scores its second neighbor and calibrates LOTO', () => {
  const { GestureLibrary, normalizeHandPose, weightedPoseDistance } = load();
  const library = new GestureLibrary({ ...performanceOptions, maxTakes: 6 });
  const config = thumb => handPose({ thumb, index: 1, middle: .2, ring: .2, pinky: 1 });
  for (const thumb of [.08, .09, .10, .25, .26, .27]) library.learn('Rock', frames(normalizeHandPose(config(thumb))));
  assert.equal(library.sampleCount('Rock'), 6);
  assert.equal(library.learn('Rock', frames(normalizeHandPose(config(.27)))), 6);
  const samples = library.templates.get('Rock'), weights = library.weightsFor('Rock');
  const second = values => values.sort((a, b) => a - b)[1];
  const distances = samples.map((sample, index) => samples.filter((_, other) => other !== index)
    .map(other => weightedPoseDistance(sample, other, weights)));
  const loto = Math.max(...distances.map(values => second(values.slice())));
  const worstPair = Math.max(...distances.flat());
  assert.equal(library.thresholdFor('Rock') / library.threshold, Math.min(2.5, Math.max(1, loto * 1.6 / library.threshold)));
  assert.ok(loto < worstPair);
  for (const thumb of [.08, .27]) {
    const live = normalizeHandPose(config(thumb));
    assert.equal(library.evaluate(live).score, second(samples.map(sample => weightedPoseDistance(live, sample, weights))));
    assert.equal(library.evaluate(live).accepted, true);
  }
  assert.equal(library.takeConsistency('Rock'), null, 'repeated legitimate variants are not isolated takes');
  const saved = JSON.parse(JSON.stringify(library.toJSON()));
  const restored = GestureLibrary.fromJSON(saved, { ...performanceOptions, maxTakes: 6 });
  assert.equal(JSON.stringify(restored.toJSON()), JSON.stringify(saved));
  const reduced = GestureLibrary.fromJSON(saved, { maxTakes: 3 });
  assert.equal(reduced.sampleCount('Rock'), 6, 'reducing the capture cap never deletes saved takes');
  assert.equal(new GestureLibrary().maxTakes, 6);
});

test('default bank accepts six takes and recognizes only from the third', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const library = new GestureLibrary();
  const descriptor = normalizeHandPose(handPose());
  for (let take = 1; take <= 6; take++) {
    assert.equal(library.learn('Pose', frames(descriptor)), take);
    assert.equal(library.evaluate(descriptor)?.accepted || false, take >= 3);
  }
  const saved = JSON.stringify(library.toJSON());
  assert.equal(library.learn('Pose', frames(descriptor)), 6);
  assert.equal(JSON.stringify(library.toJSON()), saved, 'a seventh capture must not replace saved examples');
});

test('candidate diagnostics identify the nearest take, second distance and effective entry radius', () => {
  const { GestureLibrary, weightedPoseDistance } = load();
  const library = new GestureLibrary({ threshold: .16, minimumConfidence: .52 });
  for (const offset of [0, .02, .04]) library.learn('Pose', Array.from({ length: 8 }, () => Array(42).fill(offset)));
  const query = Array(42).fill(.039);
  const target = library.evaluate(query, 'Pose').target;
  const distances = library.templates.get('Pose').map(sample => weightedPoseDistance(query, sample, library.weightsFor('Pose')));
  assert.equal(target.nearestTake, 2);
  assert.equal(target.kthDistance, distances.sort((a, b) => a - b)[1]);
  assert.equal(target.entryRadius, (1 - .52) * 1.5 * library.thresholdFor('Pose'));
});

test('each shipped preset preserves its effective entry and hold radius', () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, 'app.js'), 'utf8');
  const presets = vm.runInNewContext(`(${source.match(/const GESTURE_PRESETS = (\{[\s\S]*?\n    \});/)[1]})`);
  const { GestureLibrary } = load();
  const base = Array(42).fill(0);
  const atDistance = distance => base.map(() => distance);
  const expected = { precision: .0561, balanced: .1152, performance: .12672, flexible: .168 };
  for (const [name, options] of Object.entries(presets)) {
    const library = new GestureLibrary({ ...options, holdMs: 0, releaseMs: 0 });
    for (let i = 0; i < 3; i++) library.learn('Pose', Array.from({ length: 8 }, () => base.slice()));
    const radius = (1 - options.minimumConfidence) * 1.5 * options.threshold;
    assert.ok(Math.abs(radius - expected[name]) < 1e-12);
    assert.equal(library.evaluate(atDistance(radius - 1e-9)).accepted, true, name);
    assert.equal(library.evaluate(atDistance(radius + 1e-9)).accepted, false, name);
    library.recognize(base, 0);
    const holdRadius = options.releaseRatio * options.threshold;
    library.recognize(atDistance(holdRadius - 1e-9), 100);
    assert.equal(library.activeName, 'Pose', name);
    library.recognize(atDistance(holdRadius + 1e-9), 200);
    library.recognize(atDistance(holdRadius + 1e-9), 201);
    assert.equal(library.activeName, null, name);
  }
  const looseConfidence = new GestureLibrary({ threshold: .16, minimumConfidence: .2 });
  for (let i = 0; i < 3; i++) looseConfidence.learn('Pose', Array.from({ length: 8 }, () => base.slice()));
  assert.equal(looseConfidence.evaluate(atDistance(.16 - 1e-9)).accepted, true);
  assert.equal(looseConfidence.evaluate(atDistance(.16 + 1e-9)).accepted, false,
    'below minimum confidence 1/3, the absolute threshold controls entry');
});

test('customization documents the effective radii in both languages', () => {
  for (const file of ['CUSTOMIZATION.md', 'CUSTOMIZATION.pt-BR.md']) {
    const doc = fs.readFileSync(path.join(import.meta.dirname, '../../docs', file), 'utf8');
    assert.ok(doc.includes('0.0561') && doc.includes('0.1152') && doc.includes('0.1267') && doc.includes('0.168'));
  }
});

for (const aspect of [4 / 3, 3 / 4]) {
  for (const degrees of [0, 30, 45]) {
    test(`pixel geometry is invariant at aspect ${aspect} and rotation ${degrees}`, () => {
      const { normalizeHandPose, poseDistance } = load();
      const physical = handPose({ thumb: 1, ring: .2, pinky: .2 });
      const reference = normalizeHandPose(physical);
      const image = transform2D(physical, { radians: degrees * Math.PI / 180 })
        .map(point => ({ ...point, x: point.x / aspect }));
      assert.ok(poseDistance(reference, normalizeHandPose(image, { aspect })) < 1e-9);
    });
  }
}

test('version8 descriptors require recapture; version9 retains calibration on roundtrip', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const library = new GestureLibrary();
  const descriptor = normalizeHandPose(handPose());
  for (let i = 0; i < 3; i++) library.learn('Open', frames(descriptor));
  const saved = JSON.parse(JSON.stringify(library.toJSON()));
  const old = GestureLibrary.fromJSON({ ...saved, version: 8 });
  assert.equal(old.sampleCount('Open'), 0);
  assert.deepEqual(Array.from(old.getIncompatibleNames()), ['Open']);
  assert.equal(saved.version, 9);
  const restored = GestureLibrary.fromJSON(saved);
  assert.equal(JSON.stringify(restored.toJSON()), JSON.stringify(saved));
  assert.equal(restored.thresholdFor('Open'), library.thresholdFor('Open'));
});

test('recapture markers survive v9 serialization until successful learn or explicit delete', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const old = { version: 8, templates: [{ name: 'Open', samples: [] }, { name: 'Curl', samples: [] }] };
  const library = GestureLibrary.fromJSON(GestureLibrary.fromJSON(old).toJSON());
  assert.deepEqual(Array.from(library.getIncompatibleNames()), ['Open', 'Curl']);
  assert.throws(() => library.learn('Open', []));
  assert.deepEqual(Array.from(library.getIncompatibleNames()), ['Open', 'Curl']);
  library.learn('Open', frames(normalizeHandPose(handPose())));
  assert.deepEqual(Array.from(library.getIncompatibleNames()), ['Curl']);
  assert.equal(library.delete('Curl'), true);
  assert.deepEqual(Array.from(GestureLibrary.fromJSON(library.toJSON()).getIncompatibleNames()), []);
});

test('aspect correction leaves direct computeHandData controls unchanged', () => {
  const context = { performance: { now: () => 0 } };
  context.window = context; context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(import.meta.dirname, 'vision-processor.js'), 'utf8'), context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.computeHandData(handPose({ thumb: 1, ring: .2, pinky: .2 })))), {
    x: .493, y: .287, z: .893, palmSize: .2807, facing: -.64, handedness: null,
    handReal: null, palmPoseOk: true, indexCurved: false, otherFingersExtended: false,
    thumb: 1, index: 1, middle: 1, ring: .149, pinky: .208, fist: false,
    pinch: false, pinchVal: 0, pinchSignal: 0, victory: true, open: false,
    rotateVal: .5, fingers: .6,
  });
});

for (const curl of [.2, .55]) {
  test(`a fifth open finger vetoes four-finger acceptance and HOLD (learned curl ${curl})`, () => {
    const { GestureLibrary, normalizeHandPose } = load();
    const pose = (pinky) => normalizeHandPose(handPose({ thumb: 1, pinky }));
    const library = new GestureLibrary(performanceOptions);
    for (const offset of [-.02, 0, .02]) library.learn('Four', frames(pose(curl + offset)));
    library.recognize(pose(curl), 0); library.recognize(pose(curl), 120);
    assert.equal(library.activeName, 'Four');
    assert.equal(library.evaluate(pose(1)).accepted, false, 'one contradictory finger cannot be diluted in the mean');
    library.recognize(pose(1), 240);
    assert.equal(library.activeName, 'Four', 'one frame does not release');
    library.recognize(pose(1), 400);
    assert.equal(library.activeName, null, 'persistent fifth finger releases G2');
    for (const dims of [42, 47]) {
      const saved = JSON.parse(JSON.stringify(library.toJSON()));
      for (const template of saved.templates) template.samples = template.samples.map((sample) => sample.slice(0, dims));
      const restored = GestureLibrary.fromJSON(saved, performanceOptions);
      assert.equal(restored.sampleCount('Four'), 3);
      assert.equal(restored.evaluate(pose(curl)).accepted, true);
      assert.equal(restored.evaluate(pose(1)).accepted, false, `saved ${dims}-dimensional takes retain finger identity`);
    }
  });
}

test('same four-finger pose tolerates curl and jitter without retrigger or false fifth-finger acceptance', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const pose = (pinky) => normalizeHandPose(handPose({ thumb: 1, pinky }));
  const library = new GestureLibrary(performanceOptions);
  for (const curl of [.18, .2, .22]) library.learn('Four', frames(pose(curl)));
  library.recognize(pose(.2), 0); library.recognize(pose(.2), 120);
  for (const time of [240, 400, 1000]) {
    assert.equal(library.recognize(pose(.25), time), null);
    assert.equal(library.activeName, 'Four');
  }
});

for (const finger of ['index', 'middle', 'ring', 'pinky']) {
  for (const count of [4, 5, 6]) {
    test(`${count}-take bank keeps ${finger} identity despite one opposing extra take`, () => {
      const { GestureLibrary, normalizeHandPose } = load();
      const shape = curl => normalizeHandPose(handPose({ thumb: 1, [finger]: curl }));
      const library = new GestureLibrary(performanceOptions);
      for (let take = 0; take < count - 1; take++) library.learn('Four', frames(shape(.18 + take * .01)));
      library.learn('Four', frames(shape(.85)));
      assert.equal(library.sampleCount('Four'), count);
      assert.equal(library.evaluate(shape(.2)).accepted, true, 'legitimate curl still works');
      assert.equal(library.evaluate(shape(1)).accepted, false, 'an extra take cannot erase finger identity');
      assert.equal(library.evaluate(shape(1)).contradiction, true);
      for (const time of [0, 60, 121, 300]) assert.equal(library.recognize(shape(1), time), null, 'no false onset');
      library.recognize(shape(.2), 400); library.recognize(shape(.2), 520);
      assert.equal(library.activeName, 'Four');
      library.recognize(shape(1), 600); library.recognize(shape(1), 741);
      assert.equal(library.activeName, null, 'opposing finger releases HOLD');
      for (const dims of [42, 47]) {
        const saved = JSON.parse(JSON.stringify(library.toJSON()));
        saved.templates[0].samples = saved.templates[0].samples.map(sample => sample.slice(0, dims));
        const restored = GestureLibrary.fromJSON(saved, performanceOptions);
        assert.equal(restored.sampleCount('Four'), count, 'restore never deletes the extra take');
        assert.equal(restored.evaluate(shape(.2)).accepted, true);
        assert.equal(restored.evaluate(shape(1)).accepted, false);
      }
    });
  }
}

test('six-take bank rejects two opposing extras and preserves held-pose recovery after missing hand', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const shape = pinky => normalizeHandPose(handPose({ thumb: 1, pinky }));
  const library = new GestureLibrary(performanceOptions);
  for (const curl of [.18, .19, .2, .21, .85, .86]) library.learn('Four', frames(shape(curl)));
  assert.equal(library.evaluate(shape(1)).accepted, false);
  library.recognize(shape(.2), 0); library.recognize(shape(.2), 120);
  assert.equal(library.activeName, 'Four');
  library.markMissing(180); library.markMissing(1000);
  assert.equal(library.activeName, 'Four', 'tracking loss remains distinct from visible contradiction');
  assert.equal(library.recognize(shape(.22), 1060), null, 'valid return cannot retrigger');
  assert.equal(library.activeName, 'Four');
});

test('six-take bank with equally supported opposing finger states cannot trigger either state', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const shape = pinky => normalizeHandPose(handPose({ thumb: 1, pinky }));
  const library = new GestureLibrary(performanceOptions);
  for (const curl of [.18, .2, .22, .98, .99, 1]) library.learn('Mixed', frames(shape(curl)));
  for (const curl of [.2, 1]) assert.equal(library.evaluate(shape(curl)).accepted, false, 'mixed finger identities have no safe majority');
  assert.equal(library.sampleCount('Mixed'), 6, 'mixed bank remains available to repair deliberately');
});

test('uncertain extras cannot erase folded identity and opposing extras cannot erase extended identity', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const shape = pinky => normalizeHandPose(handPose({ thumb: 1, pinky }));
  for (const [takes, correct, wrong] of [
    [[.18, .2, .22, .70], .2, 1],
    [[.98, .99, 1, .2], 1, .2],
  ]) {
    const library = new GestureLibrary(performanceOptions);
    for (const curl of takes) library.learn('Pose', frames(shape(curl)));
    assert.equal(library.evaluate(shape(correct)).accepted, true);
    assert.equal(library.evaluate(shape(wrong)).accepted, false);
    assert.equal(library.evaluate(shape(wrong)).contradiction, true);
  }
});

for (const [label, takes, correct, wrong] of [
  ['curled thumb', [.08, .10, .12], .1, 1],
  ['opposed thumb', [.58, .60, .62], .6, 1],
  ['open thumb', [.98, .99, 1], 1, .1],
]) {
  test(`${label} is part of Index identity before onset and during HOLD`, () => {
    const { GestureLibrary, normalizeHandPose } = load();
    const shape = thumb => normalizeHandPose(handPose({ thumb, index: 1, middle: .2, ring: .2, pinky: .2 }));
    const library = new GestureLibrary(performanceOptions);
    for (const thumb of takes) library.learn('Index', frames(shape(thumb)));
    assert.equal(library.evaluate(shape(correct)).accepted, true);
    assert.equal(library.evaluate(shape(wrong)).accepted, false, 'thumb contradiction cannot disappear in whole-hand distance');
    for (const time of [0, 60, 121, 300]) assert.equal(library.recognize(shape(wrong), time), null);
    library.recognize(shape(correct), 400); library.recognize(shape(correct), 520);
    assert.equal(library.activeName, 'Index');
    library.recognize(shape(wrong), 600); library.recognize(shape(wrong), 741);
    assert.equal(library.activeName, null);
    for (const dims of [42, 47]) {
      const saved = JSON.parse(JSON.stringify(library.toJSON()));
      saved.templates[0].samples = saved.templates[0].samples.map(sample => sample.slice(0, dims));
      const restored = GestureLibrary.fromJSON(saved, performanceOptions);
      assert.equal(restored.sampleCount('Index'), 3);
      assert.equal(restored.evaluate(shape(correct)).accepted, true);
      assert.equal(restored.evaluate(shape(wrong)).accepted, false);
    }
  });
}

test('uncertain thumb cannot begin or complete a candidate, but does not retrigger a held pose', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const shape = thumb => normalizeHandPose(handPose({ thumb, index: 1, middle: .2, ring: .2, pinky: .2 }));
  const library = new GestureLibrary(performanceOptions);
  for (const thumb of [.08, .10, .12]) library.learn('Index', frames(shape(thumb)));
  const uncertain = shape(.8);
  assert.equal(library.evaluate(uncertain).accepted, false);
  assert.equal(library.evaluate(uncertain).fingerUncertain, true);
  assert.equal(library.recognize(shape(.1), 0), null);
  assert.equal(library.recognize(uncertain, 100), null);
  assert.equal(library.recognize(shape(.1), 121), null, 'uncertainty interrupts the onset timer');
  assert.equal(library.recognize(shape(.1), 241)?.name, 'Index');
  assert.equal(library.recognize(uncertain, 300), null);
  assert.equal(library.activeName, 'Index', 'uncertain camera reading is not a clear opposing finger');
  library.markMissing(400); library.markMissing(1000);
  assert.equal(library.recognize(shape(.1), 1100), null);
  assert.equal(library.activeName, 'Index');
});

test('extra opposing thumb capture and front/back/oblique views cannot erase thumb identity', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const points = thumb => handPose({ thumb, index: 1, middle: .2, ring: .2, pinky: .2 });
  const view = (thumb, radians) => points(thumb).map(point => ({
    x: .5 + (point.x - .5) * Math.cos(radians), y: point.y,
    z: (point.x - .5) * Math.sin(radians),
  }));
  const library = new GestureLibrary(performanceOptions);
  for (const radians of [0, Math.PI / 2, Math.PI]) library.learn('Index', frames(normalizeHandPose(view(.1, radians))));
  library.learn('Index', frames(normalizeHandPose(points(1))));
  for (const radians of [0, Math.PI / 4, Math.PI]) {
    assert.equal(library.evaluate(normalizeHandPose(view(1, radians))).accepted, false);
  }
  assert.equal(library.evaluate(normalizeHandPose(view(.1, 0))).accepted, true);
  const edgeOn = library.evaluate(normalizeHandPose(view(1, Math.PI / 2)));
  assert.equal(edgeOn.accepted, false, 'hidden thumb is not evidence for a new onset');
  assert.equal(edgeOn.fingerUncertain, true);
});

for (const count of [4, 5, 6]) {
  test(`${count} thumb takes preserve the dominant identity in both directions`, () => {
    const { GestureLibrary, normalizeHandPose } = load();
    const shape = thumb => normalizeHandPose(handPose({ thumb, index: 1, middle: .2, ring: .2, pinky: .2 }));
    for (const [correct, wrong] of [[.1, 1], [1, .1]]) {
      const library = new GestureLibrary(performanceOptions);
      for (let take = 0; take < count - 1; take++) library.learn('Index', frames(shape(correct)));
      library.learn('Index', frames(shape(wrong)));
      assert.equal(library.evaluate(shape(correct)).accepted, true);
      assert.equal(library.evaluate(shape(wrong)).accepted, false);
      assert.equal(library.sampleCount('Index'), count);
    }
  });
}

test('equally supported opposing thumb states keep the bank but cannot arm a pose', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const shape = thumb => normalizeHandPose(handPose({ thumb, index: 1, middle: .2, ring: .2, pinky: .2 }));
  const library = new GestureLibrary(performanceOptions);
  for (const thumb of [.08, .10, .12, .98, .99, 1]) library.learn('Mixed', frames(shape(thumb)));
  for (const thumb of [.1, 1]) {
    assert.equal(library.evaluate(shape(thumb)).accepted, false);
    assert.equal(library.evaluate(shape(thumb)).fingerUncertain, true);
  }
  assert.equal(library.sampleCount('Mixed'), 6);
});

test('learned three, four and five fingers switch directly after hold, with matching TEST evaluation', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const poses = [handPose({ thumb: 1, ring: .2, pinky: .2 }),
    handPose({ thumb: 1, pinky: .2 }), handPose({ thumb: 1 })].map(normalizeHandPose);
  const library = new GestureLibrary(performanceOptions);
  poses.forEach((pose, index) => { for (let take = 0; take < 3; take++) library.learn(`G${index + 1}`, frames(pose)); });
  const entries = [];
  for (const [time, index] of [[0, 0], [120, 0], [240, 1], [360, 1], [480, 2], [600, 2], [720, 0], [840, 0]]) {
    const evaluation = library.evaluate(poses[index]);
    assert.equal(evaluation.accepted, true);
    assert.equal(evaluation.name, `G${index + 1}`);
    const match = library.recognize(poses[index], time);
    if (match) entries.push(match.name);
  }
  assert.deepEqual(entries, ['G1', 'G2', 'G3', 'G1']);
});

test('normalizes all 21 MediaPipe landmarks independently of screen position and hand scale', () => {
  const { normalizeHandPose, poseDistance } = load();
  assert.equal(typeof normalizeHandPose, 'function');
  const pose = handPose({ thumb: 1, index: 1, middle: 0.25, ring: 0.2, pinky: 0.2 });
  const original = normalizeHandPose(transform(pose, { scale: 0.2, x: 0.15, y: 0.7, z: -0.1 }));
  const moved = normalizeHandPose(transform(pose, { scale: 0.75, x: 0.8, y: 0.1, z: 0.4 }));
  // 42 positional coordinates plus the 5-value articulation block.
  assert.equal(original.length, 47);
  assert.ok(poseDistance(original, moved) < 0.001);
});

test('static pose ignores depth and tolerates modest wrist rotation', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const pose = handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 });
  const library = new GestureLibrary({ holdMs: 0, minimumConfidence: 0.5 });
  for (const jitter of [-0.004, 0, 0.004]) {
    const sample = normalizeHandPose(transform2D(pose, { x: jitter }));
    library.learn('Gesture 1', frames(sample, 8, 0.002));
  }
  const liveLandmarks = transform2D(pose, {
    scale: 1.7,
    x: 0.31,
    y: -0.22,
    radians: Math.PI / 15,
  }).map((point, index) => ({ ...point, z: Math.sin(index * 1.9) * 0.8 }));
  const live = normalizeHandPose(liveLandmarks);
  assert.equal(library.evaluate(live)?.accepted, true);
});

test('version 7 spatial pose samples request recapture instead of appearing ready', () => {
  const { GestureLibrary } = load();
  const restored = GestureLibrary.fromJSON({
    version: 7,
    templates: [{ name: 'Gesture 1', kind: 'pose', samples: [Array(63).fill(0)] }],
  });
  assert.deepEqual(Array.from(restored.getIncompatibleNames()), ['Gesture 1']);
  assert.equal(restored.sampleCount('Gesture 1'), 0);
});

test('learns a static hand pose from three stable takes and rejects a different pose', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const gun = normalizeHandPose(handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const thumbsUp = normalizeHandPose(handPose({ thumb: 1, index: 0.2, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const lib = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.55, holdMs: 200 });
  lib.learn('Gesture 1', frames(gun, 8, 0.002));
  lib.learn('Gesture 1', frames(gun, 8, 0.003));
  lib.learn('Gesture 1', frames(gun, 8, 0.004));

  assert.equal(lib.kind('Gesture 1'), 'pose');
  assert.equal(lib.evaluate(gun).accepted, true);
  assert.equal(lib.evaluate(thumbsUp).accepted, false);
});

test('requires a stable pose, fires once, and rearms only after release', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const gun = normalizeHandPose(handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const open = normalizeHandPose(handPose());
  const lib = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.55, holdMs: 200, releaseMs: 150 });
  for (let take = 0; take < 3; take += 1) lib.learn('Gesture 1', frames(gun));

  assert.equal(lib.recognize(gun, 0), null);
  assert.equal(lib.recognize(gun, 100), null);
  assert.equal(lib.recognize(gun, 210)?.name, 'Gesture 1');
  assert.equal(lib.recognize(gun, 500), null, 'holding the pose must not repeat');
  assert.equal(lib.recognize(open, 550), null);
  assert.equal(lib.recognize(open, 720), null);
  assert.equal(lib.recognize(gun, 800), null);
  assert.equal(lib.recognize(gun, 1010)?.name, 'Gesture 1');
});

test('switches directly between learned poses after each new pose is held', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const gun = normalizeHandPose(handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const open = normalizeHandPose(handPose());
  const lib = new GestureLibrary({ threshold: 0.16, minimumConfidence: 0.52, holdMs: 160, releaseMs: 220 });
  for (let take = 0; take < 3; take += 1) {
    lib.learn('Gesture 1', frames(gun));
    lib.learn('Gesture 2', frames(open));
  }

  assert.equal(lib.evaluate(gun)?.accepted, true);
  assert.equal(lib.evaluate(open)?.accepted, true);
  assert.equal(lib.recognize(gun, 0), null);
  assert.equal(lib.recognize(gun, 170)?.name, 'Gesture 1');
  assert.equal(lib.recognize(open, 200), null, 'the new pose must complete its own hold');
  assert.equal(lib.recognize(gun, 300), null, 'returning to the active pose cancels the switch');
  assert.equal(lib.recognize(open, 330), null);
  assert.equal(lib.recognize(open, 480), null, 'an interrupted switch must start a fresh hold');
  assert.equal(lib.recognize(open, 500)?.name, 'Gesture 2', 'switching must not require an empty camera frame');
  assert.equal(lib.recognize(open, 600), null, 'holding the second pose must not repeat');
  assert.equal(lib.recognize(gun, 630), null);
  assert.equal(lib.recognize(gun, 800)?.name, 'Gesture 1', 'switching back must also work');
});

test('a held pose does not rearm while its score drifts across the acquisition cutoff', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const gun = normalizeHandPose(handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const mildDrift = gun.map((value) => value + 0.14);
  const clearRelease = gun.map((value) => value + 0.30);
  const lib = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.55, holdMs: 0, releaseMs: 150 });
  for (let take = 0; take < 3; take += 1) lib.learn('Gesture 1', frames(gun));

  assert.equal(lib.recognize(gun, 0)?.name, 'Gesture 1');
  assert.equal(lib.evaluate(mildDrift).accepted, false, 'drift is outside the acquisition cutoff');
  assert.equal(lib.recognize(mildDrift, 100), null);
  assert.equal(lib.recognize(mildDrift, 260), null);
  assert.equal(lib.recognize(gun, 261), null, 'mild drift must not rearm a continuously held pose');

  assert.equal(lib.recognize(clearRelease, 300), null);
  assert.equal(lib.recognize(clearRelease, 451), null);
  assert.equal(lib.recognize(gun, 452)?.name, 'Gesture 1', 'a clear release must still rearm immediately');
});

test('uses the median of three pose examples and persists only the static format', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const gun = normalizeHandPose(handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const open = normalizeHandPose(handPose());
  const lib = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.55, holdMs: 0 });
  lib.learn('Gesture 1', frames(gun));
  lib.learn('Gesture 1', frames(gun, 8, 0.004));
  lib.learn('Gesture 1', frames(open));
  assert.equal(lib.evaluate(gun).accepted, true);

  const saved = lib.toJSON();
  assert.equal(saved.version, 9);
  assert.equal(saved.templates[0].kind, 'pose');
  const restored = GestureLibrary.fromJSON(saved, { threshold: 0.13, minimumConfidence: 0.55, holdMs: 0 });
  assert.equal(restored.evaluate(gun).accepted, true);

  const legacy = GestureLibrary.fromJSON({
    version: 6,
    templates: [{ name: 'Gesture 1', samples: [[{ x: 0, y: 0, z: 0 }]], kind: 'motion' }],
  });
  assert.equal(legacy.sampleCount('Gesture 1'), 0);
});

test('rejects an unstable capture instead of learning hand movement as a pose', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const gun = normalizeHandPose(handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const open = normalizeHandPose(handPose());
  const lib = new GestureLibrary({ captureStabilityThreshold: 0.08 });
  assert.throws(() => lib.learn('Gesture 1', [gun, open, gun, open, gun]), /hold the pose still/i);
});

for (const outlierIndex of [0, 2]) {
  test(`take consistency finds a thumb outlier at index ${outlierIndex} without changing the library`, () => {
    const { GestureLibrary, normalizeHandPose } = load();
    const library = new GestureLibrary({ threshold: .16 });
    for (let i = 0; i < 3; i++) library.learn('Rock', frames(normalizeHandPose(handPose({
      thumb: i === outlierIndex ? 1 : .15, index: 1, middle: .2, ring: .2, pinky: 1,
    }))));
    const before = JSON.stringify(library.toJSON());
    const warning = library.takeConsistency('Rock');
    assert.equal(warning?.index, outlierIndex);
    assert.ok(warning.widen >= 1.25);
    assert.equal(JSON.stringify(library.toJSON()), before);
    const retained = new GestureLibrary({ threshold: .16 });
    for (let i = 0; i < 3; i++) if (i !== outlierIndex) retained.learn('Rock', frames(normalizeHandPose(handPose({
      thumb: .15, index: 1, middle: .2, ring: .2, pinky: 1,
    }))));
    assert.equal(library.removeTake('Rock', outlierIndex), 2);
    assert.equal(JSON.stringify(library.toJSON()), JSON.stringify(retained.toJSON()));
    assert.equal(library.thresholdFor('Rock'), retained.thresholdFor('Rock'));
  });
}

test('natural curl variation and a looser take do not raise an outlier warning', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  for (const curls of [[[.16, .18], [.20, .20], [.26, .24]], [[.20, .20], [.26, .24], [.42, .36]]]) {
    const library = new GestureLibrary({ threshold: .16 });
    for (const [middle, ring] of curls) library.learn('Rock', frames(normalizeHandPose(handPose({ thumb: 1, middle, ring, pinky: 1 }))));
    assert.equal(library.takeConsistency('Rock'), null);
  }
});

for (const count of [3, 4, 5, 6]) test(`take consistency diagnoses ${count} captures without anatomical consensus without changing recognition`, () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const library = new GestureLibrary({ threshold: .16 });
  const poses = [
    {thumb:.15,index:1,middle:.15,ring:.15,pinky:.15},
    {thumb:.15,index:.15,middle:1,ring:.15,pinky:.15},
    {thumb:.15,index:.15,middle:.15,ring:.15,pinky:1},
  ];
  for(let index=0;index<count;index++)library.learn('G1',frames(normalizeHandPose(handPose(poses[index%3]))));
  const before=JSON.stringify(library.toJSON()),probe=normalizeHandPose(handPose(poses[0]));
  const evaluation=JSON.stringify(library.evaluate(probe));
  assert.equal(library.takeConsistency('G1')?.kind,'no-consensus');
  assert.equal(library.takeConsistency('G1')?.index,count-1,'general RETAKE targets the latest, without blaming it');
  assert.equal(JSON.stringify(library.toJSON()),before);assert.equal(JSON.stringify(library.evaluate(probe)),evaluation);
  assert.equal(GestureLibrary.fromJSON(JSON.parse(before)).takeConsistency('G1')?.kind,'no-consensus');
});

test('anatomical take diagnostic preserves natural position, scale, rotation and curl variation',()=>{
  const { GestureLibrary, normalizeHandPose }=load();const library=new GestureLibrary({threshold:.16});
  for(let index=0;index<6;index++)library.learn('G1',frames(normalizeHandPose(transform2D(handPose({thumb:.15,index:1,middle:.18+index*.03,ring:.2,pinky:1}),
    {scale:.8+index*.04,radians:index*.07,x:index*.01,y:index*.01}))));
  assert.equal(library.takeConsistency('G1'),null);
});

test('clear opposing finger in one of six captures is diagnosed even when it does not widen calibration',()=>{
  const {GestureLibrary,normalizeHandPose}=load(),library=new GestureLibrary({threshold:2});
  for(let index=0;index<6;index++)library.learn('G1',frames(normalizeHandPose(handPose({thumb:.15,index:index===5?.15:1,middle:index===5?1:.15,ring:.15,pinky:.15}))));
  const warning=library.takeConsistency('G1');assert.equal(warning?.index,5);assert.equal(warning?.kind,undefined);assert.equal(warning?.widen,1);
});

test('takes captured with variation accept the gesture repeated loosely, without accepting a different one', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  // The rock: thumb, index and pinky out; middle and ring folded in. The two
  // folded fingers are the ones the performer cannot reproduce identically,
  // and they are exactly what defines the gesture.
  const rock = (middle, ring) => normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle, ring, pinky: 1 }));

  const tight = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 });
  const varied = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 });

  // Three takes in the same spot, the way the capture flow used to ask for.
  for (let take = 0; take < 3; take += 1) tight.learn('Rock', frames(rock(0.20, 0.20)));

  // Three takes with the folded fingers curled slightly differently each time,
  // which is what actually happens when a person repeats a gesture.
  varied.learn('Rock', frames(rock(0.16, 0.18)));
  varied.learn('Rock', frames(rock(0.20, 0.20)));
  varied.learn('Rock', frames(rock(0.26, 0.24)));

  // A fourth attempt, curled looser than any of the three takes — the case
  // the performer complains about: same gesture, done a bit differently.
  const attempt = rock(0.42, 0.36);

  // The tolerance arrives through the weighting, not through a wider radius:
  // the dimensions the performer cannot hold steady are discounted, so the
  // same variation scores far closer without the acceptance radius moving.
  assert.equal(tight.evaluate(attempt).accepted, false,
    'three identical takes demand the pose be reproduced exactly');
  assert.equal(varied.evaluate(attempt).accepted, true,
    'takes captured with variation accept the same gesture curled differently');
  assert.ok(varied.evaluate(attempt).score < tight.evaluate(attempt).score * 0.75,
    'the same hand scores markedly closer once the gesture knows its own spread');

  // Tolerance must not be bought with discrimination. The near neighbour is
  // the same gesture missing one finger, and it must still be turned away.
  const withoutThumb = normalizeHandPose(
    handPose({ thumb: 0.15, index: 1, middle: 0.20, ring: 0.20, pinky: 1 }));
  const open = normalizeHandPose(handPose());
  const fist = normalizeHandPose(
    handPose({ thumb: 0.15, index: 0.15, middle: 0.15, ring: 0.15, pinky: 0.15 }));
  assert.equal(varied.evaluate(withoutThumb).accepted, false, 'the rock without a thumb is not the rock');
  assert.equal(varied.evaluate(open).accepted, false, 'an open hand is still rejected');
  assert.equal(varied.evaluate(fist).accepted, false, 'a closed fist is still rejected');
});

test('the learned spread survives a save and reload, and an older save still loads', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const rock = (middle, ring) => normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle, ring, pinky: 1 }));
  const lib = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 });
  lib.learn('Rock', frames(rock(0.16, 0.18)));
  lib.learn('Rock', frames(rock(0.20, 0.20)));
  lib.learn('Rock', frames(rock(0.26, 0.24)));

  const saved = lib.toJSON();
  assert.equal(saved.version, 9, 'current camera-corrected format retains optional spread compatibility');
  assert.equal(saved.templates[0].spread.length, 47);

  const restored = GestureLibrary.fromJSON(saved, { threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 });
  assert.equal(restored.thresholdFor('Rock'), lib.thresholdFor('Rock'),
    'the calibrated radius is restored, not recomputed from nothing');
  assert.equal(restored.evaluate(rock(0.31, 0.27)).accepted, true);

  // A save written before spread existed carries no such field and must still load.
  const older = GestureLibrary.fromJSON(
    { version: 9, templates: [{ name: 'Rock', kind: 'pose', samples: saved.templates[0].samples }] },
    { threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 });
  assert.equal(older.sampleCount('Rock'), 3, 'a spreadless save still loads its samples');
});

test('each take has equal weight even when devices deliver different frame counts', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const rock = (middle, ring) => normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle, ring, pinky: 1 }));
  const takes = [rock(0.16, 0.18), rock(0.20, 0.20), rock(0.26, 0.24)];
  const learn = (counts) => {
    const library = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 });
    takes.forEach((descriptor, index) => library.learn('Rock', frames(descriptor, counts[index], 0)));
    return Array.from(library.toJSON().templates[0].spread);
  };

  const even = learn([8, 8, 8]);
  const uneven = learn([8, 80, 8]);
  assert.ok(even.some((value) => value > 0), 'the three distinct takes must teach a non-zero spread');
  assert.ok(
    even.every((value, index) => Math.abs(value - uneven[index]) < 1e-12),
    'a high-FPS take must not outweigh the other two',
  );
});

test('remove after reload rebuilds tolerance from the two retained takes and the replacement', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const rock = (middle, ring) => normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle, ring, pinky: 1 }));
  const options = { threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 };
  const original = new GestureLibrary(options);
  for (const descriptor of [rock(0.16, 0.18), rock(0.20, 0.20), rock(0.26, 0.24)]) {
    original.learn('Rock', frames(descriptor, 8, 0));
  }

  const restored = GestureLibrary.fromJSON(original.toJSON(), options);
  assert.equal(restored.removeLast('Rock'), 2);
  restored.learn('Rock', frames(rock(0.32, 0.29), 32, 0));

  const fresh = new GestureLibrary(options);
  for (const descriptor of [rock(0.16, 0.18), rock(0.20, 0.20), rock(0.32, 0.29)]) {
    fresh.learn('Rock', frames(descriptor, 8, 0));
  }
  const restoredSpread = Array.from(restored.toJSON().templates[0].spread);
  const freshSpread = Array.from(fresh.toJSON().templates[0].spread);
  assert.ok(
    restoredSpread.every((value, index) => Math.abs(value - freshSpread[index]) < 1e-12),
    'retaking after reload must be equivalent to learning those same three takes fresh',
  );
});

test('delete removes every learned statistic before the same gesture name is relearned', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const pose = (thumb, index, middle, ring, pinky) => normalizeHandPose(
    handPose({ thumb, index, middle, ring, pinky }));
  const options = { threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 };
  const reused = new GestureLibrary(options);
  for (const descriptor of [
    pose(1, 1, 0.16, 0.18, 1),
    pose(1, 1, 0.20, 0.20, 1),
    pose(1, 1, 0.26, 0.24, 1),
  ]) reused.learn('Gesture 1', frames(descriptor, 8, 0));
  assert.equal(reused.delete('Gesture 1'), true);

  const replacementTakes = [
    pose(1, 0.16, 0.18, 0.18, 0.18),
    pose(1, 0.20, 0.20, 0.20, 0.20),
    pose(1, 0.28, 0.25, 0.24, 0.23),
  ];
  for (const descriptor of replacementTakes) reused.learn('Gesture 1', frames(descriptor, 8, 0));
  const fresh = new GestureLibrary(options);
  for (const descriptor of replacementTakes) fresh.learn('Gesture 1', frames(descriptor, 8, 0));

  const reusedSpread = Array.from(reused.toJSON().templates[0].spread);
  const freshSpread = Array.from(fresh.toJSON().templates[0].spread);
  assert.ok(
    reusedSpread.every((value, index) => Math.abs(value - freshSpread[index]) < 1e-12),
    'deleted frames and thresholds must not influence a gesture learned under the same name',
  );
  assert.equal(reused.thresholdFor('Gesture 1'), fresh.thresholdFor('Gesture 1'));
});

test('a calibrated gesture radius follows later recognition preset changes', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const rock = (middle, ring) => normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle, ring, pinky: 1 }));
  const library = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 });
  for (const descriptor of [rock(0.16, 0.18), rock(0.20, 0.20), rock(0.28, 0.25)]) {
    library.learn('Rock', frames(descriptor, 8, 0));
  }

  const learnedFactor = library.thresholdFor('Rock') / library.threshold;
  library.threshold = 0.20;
  assert.ok(
    Math.abs(library.thresholdFor('Rock') - 0.20 * learnedFactor) < 1e-12,
    'switching to Flexible must scale an already learned gesture immediately',
  );
  library.threshold = 0.11;
  assert.ok(
    Math.abs(library.thresholdFor('Rock') - 0.11 * learnedFactor) < 1e-12,
    'switching to Precision must tighten that same learned gesture immediately',
  );
});

test('TEST scores every learned gesture and rejects the same ambiguity as Live', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const pose = normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 1 }));
  const library = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 });
  for (const name of ['Gesture 1', 'Gesture 2']) {
    for (let take = 0; take < 3; take += 1) library.learn(name, frames(pose, 8, 0));
  }

  const live = library.evaluate(pose);
  const testMode = library.evaluate(pose, 'Gesture 1');
  assert.equal(live.ambiguous, true);
  assert.equal(live.accepted, false);
  assert.equal(testMode.ambiguous, true, 'TEST must not hide a competing learned gesture');
  assert.equal(testMode.accepted, false, 'a pose rejected by Live cannot pass TEST');
  assert.equal(testMode.candidates.length, 2, 'TEST must show all competing candidates');
});

test('one short missing-hand interval does not restart the gesture hold timer', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const pose = normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const library = new GestureLibrary({
    threshold: 0.13,
    minimumConfidence: 0.45,
    holdMs: 160,
    unknownGraceMs: 120,
  });
  for (let take = 0; take < 3; take += 1) library.learn('Gesture 1', frames(pose));

  assert.equal(library.recognize(pose, 0), null);
  assert.equal(library.recognize(null, 80), null);
  assert.equal(library.recognize(pose, 170)?.name, 'Gesture 1',
    'a 90 ms detector dropout should retain the stable hold started at 0 ms');
});

test('a missing-hand interval beyond the grace period restarts acquisition', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const pose = normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const library = new GestureLibrary({
    threshold: 0.13,
    minimumConfidence: 0.45,
    holdMs: 160,
    unknownGraceMs: 100,
  });
  for (let take = 0; take < 3; take += 1) library.learn('Gesture 1', frames(pose));

  assert.equal(library.recognize(pose, 0), null);
  assert.equal(library.recognize(null, 40), null);
  assert.equal(library.recognize(null, 150), null);
  assert.equal(library.recognize(pose, 170), null,
    'returning after a long dropout must start a fresh hold');
  assert.equal(library.recognize(pose, 340)?.name, 'Gesture 1');
});

test('a visible different pose still cancels acquisition immediately', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const pose = normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const open = normalizeHandPose(handPose());
  const library = new GestureLibrary({
    threshold: 0.13,
    minimumConfidence: 0.45,
    holdMs: 160,
    unknownGraceMs: 200,
  });
  for (let take = 0; take < 3; take += 1) library.learn('Gesture 1', frames(pose));

  assert.equal(library.recognize(pose, 0), null);
  assert.equal(library.recognize(open, 80), null);
  assert.equal(library.recognize(pose, 170), null,
    'grace applies to missing tracking, not a contradictory visible pose');
  assert.equal(library.recognize(pose, 340)?.name, 'Gesture 1');
});

test('the articulation block sharpens the near neighbour without costing tolerance', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const rock = (middle, ring) => normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle, ring, pinky: 1 }));
  const positionalOnly = (d) => d.slice(0, 42);

  const opts = { threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 };
  const build = (trim) => {
    const lib = new GestureLibrary(opts);
    for (const take of [rock(0.10, 0.12), rock(0.16, 0.15), rock(0.24, 0.20)]) {
      lib.learn('Rock', frames(trim ? positionalOnly(take) : take));
    }
    return lib;
  };
  const flat = build(true);
  const hybrid = build(false);

  // Same gesture done with a looser curl: both accept it, so the articulation
  // block is not bought at the cost of tolerance.
  const looser = rock(0.42, 0.36);
  assert.equal(flat.evaluate(positionalOnly(looser)).accepted, true);
  assert.equal(hybrid.evaluate(looser).accepted, true);

  // The hard neighbour is the same gesture with the thumb tucked away. It is
  // what the opposition dimension exists to separate, and the margin against
  // it is where the block earns its place.
  const withoutThumb = normalizeHandPose(
    handPose({ thumb: 0, index: 1, middle: 0.16, ring: 0.15, pinky: 1 }));
  const flatMargin = flat.evaluate(positionalOnly(withoutThumb)).score
    / flat.thresholdFor('Rock');
  const hybridMargin = hybrid.evaluate(withoutThumb).score
    / hybrid.thresholdFor('Rock');
  assert.ok(flatMargin > 1, 'positional alone already rejects it, but only just');
  assert.ok(hybridMargin > flatMargin * 1.25,
    `articulation must widen the margin: ${flatMargin.toFixed(2)} -> ${hybridMargin.toFixed(2)}`);
});

test('a save written before the articulation block still loads and still matches', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const rock = (middle, ring) => normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle, ring, pinky: 1 }));

  // An old save carries 42-long samples and no articulation. Nothing about
  // this change may force a gesture to be taught again.
  const legacySamples = [rock(0.10, 0.12), rock(0.16, 0.15), rock(0.24, 0.20)]
    .map((d) => d.slice(0, 42));
  const restored = GestureLibrary.fromJSON(
    { version: 9, templates: [{ name: 'Rock', kind: 'pose', samples: legacySamples }] },
    { threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 });

  assert.equal(restored.sampleCount('Rock'), 3, 'a 42-long save still loads');
  // And a live frame, which now carries articulation, still matches it: the
  // comparison uses only the dimensions both sides have.
  assert.equal(restored.evaluate(rock(0.20, 0.18)).accepted, true);
});

test('Performance preset accepts natural Rock curl rejected by Balanced while rejecting invalid poses', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const rock = (middle, ring) => normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle, ring, pinky: 1 }));

  const balancedOpts = { threshold: 0.16, ambiguityRatio: 1.25, minimumConfidence: 0.52, holdMs: 160, releaseMs: 220, releaseRatio: 1.4, unknownGraceMs: 140 };
  const performanceOpts = { threshold: 0.176, ambiguityRatio: 1.25, minimumConfidence: 0.52, holdMs: 120, releaseMs: 140, releaseRatio: 1.10, unknownGraceMs: 140 };

  const balanced = new GestureLibrary(balancedOpts);
  const performance = new GestureLibrary(performanceOpts);

  const takes = [rock(0.16, 0.18), rock(0.20, 0.20), rock(0.26, 0.24)];
  for (const take of takes) {
    balanced.learn('Rock', frames(take));
    performance.learn('Rock', frames(take));
  }

  // Measured natural curl that Balanced marginally rejects but Performance accepts
  const naturalLoose = rock(0.50, 0.50);
  assert.equal(balanced.evaluate(naturalLoose).accepted, false, 'Balanced marginally rejects looser natural curl');
  assert.equal(performance.evaluate(naturalLoose).accepted, true, 'Performance accepts looser natural curl');

  // Translation, scale, and moderate wrist rotation invariance preserved
  const transformed = normalizeHandPose(transform2D(handPose({ thumb: 1, index: 1, middle: 0.50, ring: 0.50, pinky: 1 }), {
    scale: 1.4,
    x: 0.25,
    y: -0.15,
    radians: Math.PI / 16,
  }));
  assert.equal(performance.evaluate(transformed).accepted, true, 'Performance preserves 2D translation, scale and rotation invariance');

  // Open, fist, near neighbour missing thumb and ambiguous poses must be rejected
  const open = normalizeHandPose(handPose());
  const fist = normalizeHandPose(handPose({ thumb: 0.15, index: 0.15, middle: 0.15, ring: 0.15, pinky: 0.15 }));
  const withoutThumb = normalizeHandPose(handPose({ thumb: 0.15, index: 1, middle: 0.20, ring: 0.20, pinky: 1 }));
  assert.equal(performance.evaluate(open).accepted, false, 'Open hand is rejected');
  assert.equal(performance.evaluate(fist).accepted, false, 'Fist is rejected');
  assert.equal(performance.evaluate(withoutThumb).accepted, false, 'Rock without thumb is rejected');

  // Ambiguity rejected
  for (const take of takes) performance.learn('RockTwin', frames(take));
  const ambig = performance.evaluate(takes[0]);
  assert.equal(ambig.ambiguous, true, 'Twin pose causes ambiguity');
  assert.equal(ambig.accepted, false, 'Ambiguous pose cannot be accepted');
});

test('GestureLibrary FSM exposes getRecognitionState without reset and follows Performance timing', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const rock = normalizeHandPose(handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 1 }));
  const peace = normalizeHandPose(handPose({ thumb: 0.2, index: 1, middle: 1, ring: 0.2, pinky: 0.2 }));

  const perfOpts = { threshold: 0.176, ambiguityRatio: 1.25, minimumConfidence: 0.52, holdMs: 120, releaseMs: 140, releaseRatio: 1.10, unknownGraceMs: 140 };
  const lib = new GestureLibrary(perfOpts);

  assert.equal(typeof lib.getRecognitionState, 'function', 'getRecognitionState interface exists');
  assert.equal(lib.getRecognitionState(), 'ready', 'Initial state is ready');

  for (let take = 0; take < 3; take += 1) {
    lib.learn('Rock', frames(rock));
    lib.learn('Peace', frames(peace));
  }

  // candidate at t=0
  assert.equal(lib.recognize(rock, 0), null);
  assert.equal(lib.getRecognitionState(), 'candidate', 'State is candidate during hold');

  // event at t=120
  const ev1 = lib.recognize(rock, 120);
  assert.equal(ev1?.name, 'Rock', 'Fires at 120ms');
  assert.equal(lib.getRecognitionState(), 'held', 'State is held after recognition');

  // drift inside retention does not repeat
  assert.equal(lib.recognize(rock, 150), null, 'Drift within retention does not repeat');
  assert.equal(lib.getRecognitionState(), 'held', 'State remains held during drift');

  // 90ms dropout does not rearm
  assert.equal(lib.recognize(null, 160), null);
  assert.equal(lib.recognize(rock, 250), null, '90ms dropout retains held state');
  assert.equal(lib.getRecognitionState(), 'held', 'State remains held across 90ms dropout');

  // score above release Performance (releaseRatio=1.10, 0.176*1.10=0.1936) but below hold Balanced (0.16*1.4=0.224)
  // We can pass a descriptor that evaluates to score ~0.205 (e.g. by intercepting evaluate or mocking evaluate)
  const realEvaluate = lib.evaluate.bind(lib);
  let mockScore = null;
  lib.evaluate = (descriptor, targetName) => {
    if (mockScore !== null) {
      return {
        name: 'Rock',
        score: mockScore,
        confidence: 0.60,
        accepted: false,
        ambiguous: false,
        candidates: [{ name: 'Rock', score: mockScore, confidence: 0.60 }],
        target: null,
      };
    }
    return realEvaluate(descriptor, targetName);
  };

  // At t=200: score 0.205 is above Performance release (0.1936)
  mockScore = 0.205;
  assert.equal(lib.recognize(rock, 200), null);
  assert.equal(lib.getRecognitionState(), 'releasing', 'Score above release puts state into releasing');

  // Before 140ms release expires (e.g. t=300), still releasing
  assert.equal(lib.recognize(rock, 300), null);
  assert.equal(lib.getRecognitionState(), 'releasing', 'Still releasing at 300ms');

  // At t=341 (> 340ms, releaseMs=140 passed): rearmed!
  assert.equal(lib.recognize(rock, 341), null);
  assert.equal(lib.getRecognitionState(), 'ready', 'Rearmed at 341ms (state is ready)');

  // Return at t=350 gives candidate, event at t=470 (350+120)
  mockScore = null;
  assert.equal(lib.recognize(rock, 350), null);
  assert.equal(lib.getRecognitionState(), 'candidate', 'Candidate at 350ms');
  const ev2 = lib.recognize(rock, 470);
  assert.equal(ev2?.name, 'Rock', 'Second event fired at 470ms');
  assert.equal(lib.getRecognitionState(), 'held', 'State is held after second event');

  // hold 10s does not repeat
  assert.equal(lib.recognize(rock, 10470), null, 'Holding for 10s does not repeat');
  assert.equal(lib.getRecognitionState(), 'held', 'State remains held after 10s');

  // switch direto exige hold próprio e contradição reinicia candidato
  assert.equal(lib.recognize(peace, 10500), null, 'Switch to Peace requires hold');
  assert.equal(lib.getRecognitionState(), 'candidate', 'State is candidate for Peace');
  // Contradiction at 10550 (e.g. unknown or unmatched pose)
  const open = normalizeHandPose(handPose());
  assert.equal(lib.recognize(open, 10550), null, 'Contradiction cancels candidate');
  assert.notEqual(lib.getRecognitionState(), 'held', 'Contradiction interrupted previous hold');

  // Peace presented again must start a fresh hold of 120ms
  assert.equal(lib.recognize(peace, 10600), null);
  assert.equal(lib.recognize(peace, 10700), null, '100ms is not enough for fresh hold');
  const evPeace = lib.recognize(peace, 10720);
  assert.equal(evPeace?.name, 'Peace', 'Peace fires after completing its own fresh 120ms hold');
});
