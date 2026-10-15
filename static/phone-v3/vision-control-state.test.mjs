import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

function load() {
  const window = {};
  const context = vm.createContext({ window, globalThis: window });
  vm.runInContext(fs.readFileSync(path.join(import.meta.dirname, 'vision-control-state.js'), 'utf8'), context);
  return window;
}

test('restored gesture templates retain up to six takes before the UI renders', () => {
  const { normalizeVisionGestureTemplates } = load();
  const templates = normalizeVisionGestureTemplates([{ name: 'Gesture 1', samples: [1, 2, 3, 4, 5, 6, 7] }]);
  assert.deepEqual(Array.from(templates[0].samples), [1, 2, 3, 4, 5, 6]);
});

test('vision detectors are opt-in and persist only explicit choices', () => {
  const { VisionControlState, VISION_DETECTORS } = load();
  const state = new VisionControlState();
  assert.deepEqual(Array.from(VISION_DETECTORS), ['open', 'fist', 'pinch', 'victory']);
  for (const detector of VISION_DETECTORS) {
    assert.equal(state.detectorEnabled(detector), false);
  }
  assert.equal(state.setDetector('fingers', true), false);
  state.setDetector('victory', true);
  assert.equal(state.detectorEnabled('victory'), true);
  assert.equal(state.toJSON().detectors.victory, true);
});

test('restored learned gestures keep every numbered control through fifteen', () => {
  const { VisionControlState } = load();
  const state = new VisionControlState({}, [
    { name: 'Wave' }, { name: 'Circle' }, { name: 'Push' }, { name: 'Ignored' },
  ]);
  assert.equal(state.slots.length, 4);
  assert.deepEqual(Array.from(state.slots, (slot) => slot.name), ['Wave', 'Circle', 'Push', 'Ignored']);
  assert.equal(state.controlForSlot(1), 'sensor.vision.gesture.1');
  assert.equal(state.controlForSlot(3), 'sensor.vision.gesture.3');
  assert.equal(state.slotForGesture('circle').id, 2);
});

test('Add pose appends stable IDs, persists the list and stops at fifteen', () => {
  const { VisionControlState, normalizeVisionGestureTemplates } = load();
  const state = new VisionControlState();
  for (let id = 4; id <= 15; id++) {
    assert.equal(state.addSlot().id, id);
    assert.equal(state.controlForSlot(id), `sensor.vision.gesture.${id}`);
  }
  assert.equal(state.addSlot(), null);
  for (const id of [0, 16, 1.5, NaN]) assert.equal(state.controlForSlot(id), null);
  const restored = new VisionControlState(JSON.parse(JSON.stringify(state.toJSON())));
  assert.deepEqual(JSON.parse(JSON.stringify(restored.toJSON())), JSON.parse(JSON.stringify(state.toJSON())));
  assert.equal(normalizeVisionGestureTemplates(Array.from({length: 16}, (_, i) => ({name: `Gesture ${i + 1}`, samples: [i]}))).length, 15);
  assert.equal(new VisionControlState({slots: Array(20).fill({})}).slots.length, 15);
});

test('new learned gesture slots have fixed names and need no performer text input', () => {
  const { VisionControlState } = load();
  const state = new VisionControlState();
  assert.deepEqual(Array.from(state.slots, (slot) => slot.name), ['Gesture 1', 'Gesture 2', 'Gesture 3']);
});

test('saved slot names take precedence over migrated gesture templates', () => {
  const { VisionControlState } = load();
  const state = new VisionControlState({ slots: [{ name: 'Saved wave' }] }, [{ name: 'Old wave' }]);
  assert.equal(state.slots[0].name, 'Saved wave');
  assert.equal(state.slots[1].name, 'Gesture 2');
});

test('hand label only exposes detectors explicitly enabled by the performer', () => {
  const { VisionControlState } = load();
  const state = new VisionControlState();
  const hand = { active: true, open: true, fist: true, fingers: 0.8 };
  assert.equal(state.describeHand(hand), 'Hand tracked');
  state.setDetector('open', true);
  assert.equal(state.describeHand(hand), 'Open hand');
  state.setDetector('open', false);
  assert.equal(state.setDetector('fingers', true), false);
  assert.equal(state.describeHand(hand), 'Hand tracked');
});
