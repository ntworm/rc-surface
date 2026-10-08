import test from 'node:test';
import assert from 'node:assert/strict';
import { setExtensionContext, clearExtensionContext } from '../src/context.ts';
import {
  applyMapping, controlMappings, eventModesState, cancelPendingMappingWrites,
  migrateVisionSafeLossTarget, triggerNoteClock, triggerNoteScheduler,
} from '../src/live/mappings.ts';

function fixture(songFields = {}, targetFields = {}, onWrite) {
  const packets = [];
  const parameter = {
    name: 'RC MIDI Packet v2', min: 0, max: 4194303, isQuantized: false,
    setValue: async (value) => {
      const packet = [Math.floor(value / 128) % 128, value % 128];
      packets.push(packet);
      await onWrite?.(packet);
    },
  };
  setExtensionContext({ application: { song: { tempo: 120, tracks: [{ devices: [{ name: 'RC-Midi-Receiver', parameters: [parameter] }] }], ...songFields } } });
  controlMappings.set('sensor.vision.gesture.1', [{
    type: 'device_param', mode: 'trigger_note', trackIndex: 0, midiNote: 'C3',
    noteTiming: 'immediate', noteGate: 'hold', neutralPolicy: 'hold', ...targetFields,
  }]);
  return packets;
}

test.afterEach(async () => {
  await cancelPendingMappingWrites();
  controlMappings.clear();
  eventModesState.clear();
  triggerNoteClock.updateTransport(false, false, 120, 4, 4);
  clearExtensionContext();
});

test('C16: Now musical pulse starts immediately and keeps its duration across later tempo changes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const packets = fixture({}, { noteGate: 'pulse', noteDurationMode: 'grid', noteDurationBars: 0.25 });
  triggerNoteClock.updateTransport(false, true, 120, 3, 4);
  triggerNoteClock.observePosition(2.2, 120, 3, 4);
  await applyMapping('phone', 'sensor.vision.gesture.1', 1);
  await new Promise(setImmediate);
  assert.deepEqual(packets, [[60, 100]], 'Now must send before a beat boundary');
  triggerNoteClock.updateTransport(false, true, 60, 4, 4);
  t.mock.timers.tick(374);
  await new Promise(setImmediate);
  assert.deepEqual(packets, [[60, 100]]);
  t.mock.timers.tick(1);
  await new Promise(setImmediate);
  assert.deepEqual(packets, [[60, 100], [60, 0]], 'quarter bar in 3/4 at 120 BPM lasts 375 ms');
});

test('C16: Now musical refuses unknown meter instead of silently using ms or 4/4', async () => {
  const packets = fixture({}, { noteGate: 'pulse', noteDurationMode: 'grid', noteDurationBars: 0.25 });
  await applyMapping('phone', 'sensor.vision.gesture.1', 1);
  assert.deepEqual(packets, []);
});

test('pose release policy releases once; camera OFF adds no release', async () => {
  const packets = fixture({}, { neutralPolicy: 'release' });
  await applyMapping('phone', 'sensor.vision.gesture.1', 1);
  await applyMapping('phone', 'sensor.vision.gesture.1', 0, true);
  assert.deepEqual(packets, [[60, 100], [60, 0]]);
  await applyMapping('phone', 'sensor.vision.gesture.1', 0, true);
  await applyMapping('phone', 'sensor.vision.active', 0);
  assert.deepEqual(packets, [[60, 100], [60, 0]]);
});

for (const noteTiming of ['beat', 'bar']) {
  for (const loseHand of [false, true]) {
    test(`C20: ${noteTiming} pending ${loseHand ? 'cancels on camera OFF' : 'actually sounds without loss'}`, async t => {
      t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
      t.mock.method(triggerNoteClock, 'now', () => Date.now());
      t.mock.method(triggerNoteScheduler, 'now', () => Date.now());
      const packets = fixture({}, { noteTiming, noteGate: 'pulse', noteDurationMs: 100 });
      triggerNoteClock.updateTransport(true, true, 120, 4, 4);
      triggerNoteClock.observePosition(10.75, 120, 4, 4);
      assert.equal(triggerNoteClock.snapshot().valid, true);
      await applyMapping('phone', 'sensor.vision.gesture.1', 1);
      if (loseHand) await applyMapping('phone', 'sensor.vision.active', 0);
      t.mock.timers.tick(noteTiming === 'beat' ? 125 : 625);
      await new Promise(setImmediate);
      assert.deepEqual(packets, loseHand ? [] : [[60, 100]]);
      t.mock.timers.tick(2000);
      await new Promise(setImmediate);
      assert.deepEqual(packets, loseHand ? [] : [[60, 100], [60, 0]], 'no stale timer work');
    });
  }
}

for (const noteGate of ['hold', 'pulse']) {
  test(`C20: camera OFF releases Now ${noteGate} without an active mapping, isolated by client/control`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const packets = fixture({}, { noteGate, noteDurationMs: 100 });
    const target = controlMappings.get('sensor.vision.gesture.1')[0];
    controlMappings.set('sensor.vision.gesture.2', [{ ...target, midiNote: 'D3' }]);
    controlMappings.set('pad-1', [{ ...target, midiNote: 'E3' }]);
    await applyMapping('phone', 'sensor.vision.gesture.1', 1);
    await applyMapping('other-phone', 'sensor.vision.gesture.2', 1);
    await applyMapping('phone', 'pad-1', 1);
    await new Promise(setImmediate);
    await applyMapping('phone', 'sensor.vision.active', 0);
    assert.deepEqual(packets, [[60, 100], [62, 100], [64, 100], [60, 0]], 'other client and non-vision control remain held');
    await applyMapping('phone', 'sensor.vision.active', 0);
    await applyMapping('other-phone', 'sensor.vision.active', 0);
    assert.deepEqual(packets, [[60, 100], [62, 100], [64, 100], [60, 0], [62, 0]]);
    if (noteGate === 'hold') await applyMapping('phone', 'pad-1', 0);
    t.mock.timers.tick(200);
    await new Promise(setImmediate);
    assert.deepEqual(packets, [[60, 100], [62, 100], [64, 100], [60, 0], [62, 0], [64, 0]], 'old vision timers never release twice');
  });
}

test('C20: a lost placeholder value cannot activate a Trigger Note', async () => {
  const packets = fixture();
  await applyMapping('phone', 'sensor.vision.gesture.1', 1, true);
  assert.deepEqual(packets, []);
});

test('C20: camera OFF retires a queued unsent Receiver ON without inventing an OFF', async () => {
  let acknowledge;
  const blocked = new Promise(resolve => { acknowledge = resolve; });
  const packets = fixture({}, {}, ([note, velocity]) => note === 62 && velocity > 0 ? blocked : undefined);
  const target = controlMappings.get('sensor.vision.gesture.1')[0];
  controlMappings.set('pad-1', [{ ...target, midiNote: 'D3' }]);
  const padOn = applyMapping('phone', 'pad-1', 1);
  await new Promise(setImmediate);
  const visionOn = applyMapping('phone', 'sensor.vision.gesture.1', 1);
  const loss = applyMapping('phone', 'sensor.vision.active', 0);
  await new Promise(setImmediate);
  acknowledge();
  await Promise.all([padOn, visionOn, loss]);
  assert.deepEqual(packets, [[62, 100]], 'neither unsent vision ON nor phantom OFF');
  await applyMapping('phone', 'sensor.vision.gesture.1', 1);
  await applyMapping('phone', 'sensor.vision.gesture.1', 0);
  assert.deepEqual(packets, [[62, 100], [60, 100], [60, 0]], 'fresh activation works after cleanup');
});

test('C20: delayed pulse ON acknowledgement after camera OFF leaves no stale timer release', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let acknowledge;
  const blocked = new Promise(resolve => { acknowledge = resolve; });
  let writes = 0;
  const packets = fixture({}, { noteGate: 'pulse', noteDurationMs: 100 }, () => ++writes === 1 ? blocked : undefined);
  await applyMapping('phone', 'sensor.vision.gesture.1', 1);
  await new Promise(setImmediate);
  const loss = applyMapping('phone', 'sensor.vision.active', 0);
  await new Promise(setImmediate);
  acknowledge();
  await loss;
  assert.deepEqual(packets, [[60, 100], [60, 0]]);
  await applyMapping('phone', 'sensor.vision.gesture.1', 1);
  await new Promise(setImmediate);
  t.mock.timers.tick(100);
  await new Promise(setImmediate);
  t.mock.timers.tick(1000);
  await new Promise(setImmediate);
  assert.deepEqual(packets, [[60, 100], [60, 0], [60, 100], [60, 0]], 'only the new pulse owns its timer');
});

test('old vision default release migrates once, preserving deliberate policies', () => {
  assert.equal(migrateVisionSafeLossTarget('sensor.vision.x', { neutralPolicy: 'release' }).neutralPolicy, 'hold');
  assert.equal(migrateVisionSafeLossTarget('sensor.vision.fist', {}).neutralPolicy, 'hold');
  for (const neutralPolicy of ['zero', 'center', 'custom']) {
    assert.equal(migrateVisionSafeLossTarget('sensor.vision.x', { neutralPolicy }).neutralPolicy, neutralPolicy);
  }
  assert.equal(migrateVisionSafeLossTarget('sensor.motion.ax', { neutralPolicy: 'release' }).neutralPolicy, 'release');
  assert.equal(migrateVisionSafeLossTarget('sensor.vision.x', { neutralPolicy: 'release', visionSafeLossVersion: 2 }).neutralPolicy, 'release');
});
