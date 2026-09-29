import test from 'node:test';
import assert from 'node:assert/strict';
import { setExtensionContext, clearExtensionContext } from '../src/context.ts';
import {
  applyMapping, controlMappings, eventModesState, cancelPendingMappingWrites,
  migrateVisionSafeLossTarget, triggerNoteClock,
} from '../src/live/mappings.ts';

function fixture(songFields = {}, targetFields = {}) {
  const packets = [];
  const parameter = {
    name: 'RC MIDI Packet v2', min: 0, max: 4194303, isQuantized: false,
    setValue: async (value) => { packets.push([Math.floor(value / 128) % 128, value % 128]); },
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

test('temporary hand loss holds a learned-pose note; camera OFF releases it', async () => {
  const packets = fixture();
  await applyMapping('phone', 'sensor.vision.gesture.1', 1);
  await applyMapping('phone', 'sensor.vision.gesture.1', 0, true);
  assert.deepEqual(packets, [[60, 100]]);
  await applyMapping('phone', 'sensor.vision.active', 0);
  assert.deepEqual(packets, [[60, 100], [60, 0]]);
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
