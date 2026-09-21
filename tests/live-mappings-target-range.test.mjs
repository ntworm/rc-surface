// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeSmooths,
  applyMapping,
  controlMappings,
  eventModesState,
  getControlValues,
  lastMappedValues,
  safeInputRegistry,
  scaleTargetValue,
} from '../src/live/mappings.ts';
import { clearExtensionContext, setExtensionContext } from '../src/context.ts';
import * as targetScale from '../src/live/target-scale.ts';
import { continuousTargetActuator } from '../src/live/continuous-target-actuator.ts';

function resetMappingState() {
  continuousTargetActuator.cancel();
  controlMappings.clear();
  lastMappedValues.clear();
  activeSmooths.clear();
  eventModesState.clear();
  safeInputRegistry.clear();
  clearExtensionContext();
}

test.afterEach(resetMappingState);

test('target scaling clamps non-finite and out-of-range normalized values', () => {
  assert.equal(scaleTargetValue(-1, 20, 300), 20);
  assert.equal(scaleTargetValue(0.5, 20, 300), 160);
  assert.equal(scaleTargetValue(2, 20, 300), 300);
  assert.equal(scaleTargetValue(Number.NaN, 20, 300), 20);
});

test('target scaling snaps quantized Live parameters after scaling', () => {
  assert.equal(scaleTargetValue(0.6, 0, 3, true), 2);
  assert.equal(scaleTargetValue(0.49, 0, 3, true), 1);
  assert.equal(scaleTargetValue(2, 0, 3, true), 3);
});

test('target scaling gives wide positive ranges geometric musical travel', () => {
  const midpoint = scaleTargetValue(0.5, 20, 20000, false, 'geometric');
  assert.ok(Math.abs(midpoint - Math.sqrt(20 * 20000)) < 1e-9);
});

test('target scale auto resolves conservatively and has an exact inverse', () => {
  assert.equal(typeof targetScale.resolveTargetScale, 'function');
  assert.equal(typeof targetScale.unscaleTargetValue, 'function');
  assert.equal(targetScale.resolveTargetScale({
    requested: 'auto', min: 20, max: 20000, name: 'Frequency', isQuantized: false,
  }), 'geometric');
  assert.equal(targetScale.resolveTargetScale({
    requested: 'auto', min: -1, max: 1, name: 'Pan', isQuantized: false,
  }), 'linear');
  const midpoint = Math.sqrt(20 * 20000);
  assert.ok(Math.abs(targetScale.unscaleTargetValue(
    midpoint, 20, 20000, false, 'geometric', 'Frequency',
  ) - 0.5) < 1e-9);
});

test('explicit geometric target scale overrides the conservative tempo-family auto default', () => {
  assert.equal(targetScale.resolveTargetScale({
    requested: 'auto', min: 20, max: 300, name: 'Tempo', family: 'tempo', isQuantized: false,
  }), 'linear');
  assert.equal(targetScale.resolveTargetScale({
    requested: 'geometric', min: 20, max: 300, name: 'Tempo', family: 'tempo', isQuantized: false,
  }), 'geometric');
});

test('applyMapping clamps tempo and snaps a quantized device parameter', async () => {
  const applied = [];
  const song = {
    tempo: 120,
    tracks: [{
      devices: [{
        parameters: [{
          min: 0,
          max: 3,
          isQuantized: true,
          setValue(value) {
            applied.push(value);
            return Promise.resolve();
          },
        }],
      }],
    }],
  };
  setExtensionContext({ application: { song } });

  controlMappings.set('tempo-source', [{ type: 'tempo', outMin: -1, outMax: 2, takeoverMode: 'jump' }]);
  await applyMapping('client-1', 'tempo-source', 1);
  assert.equal(song.tempo, 300, 'tempo must never leave Live\'s 20–300 BPM range');

  controlMappings.set('quantized-source', [{
    type: 'device_param',
    trackIndex: 0,
    deviceIndex: 0,
    paramIndex: 0,
    outMin: 0,
    outMax: 1,
    takeoverMode: 'jump',
  }]);
  await applyMapping('client-1', 'quantized-source', 0.6);
  assert.deepEqual(applied, [2], 'quantized parameters must receive an integer value item');
});

test('applyMapping auto-scales a wide frequency target geometrically', async () => {
  const applied = [];
  const parameter = {
    name: 'Frequency',
    min: 20,
    max: 20000,
    isQuantized: false,
    setValue(value) {
      applied.push(value);
      return Promise.resolve();
    },
  };
  setExtensionContext({
    application: { song: { tempo: 120, tracks: [{ devices: [{ parameters: [parameter] }] }] } },
  });
  controlMappings.set('sensor.vision.pinch_x', [{
    type: 'device_param',
    trackIndex: 0,
    deviceIndex: 0,
    paramIndex: 0,
    targetScale: 'auto',
    takeoverMode: 'jump',
  }]);

  await applyMapping('client-1', 'sensor.vision.pinch_x', 0.5);
  await continuousTargetActuator.settle('device_param::0::0::0');

  assert.ok(Math.abs(applied.at(-1) - Math.sqrt(20 * 20000)) < 1e-9);
});

test('host feedback inverts the same geometric scale used for a wide frequency target', async () => {
  const midpoint = Math.sqrt(20 * 20000);
  const parameter = {
    name: 'Frequency',
    min: 20,
    max: 20000,
    isQuantized: false,
    getValue: async () => midpoint,
  };
  setExtensionContext({
    application: { song: { tempo: 120, tracks: [{ devices: [{ parameters: [parameter] }] }] } },
  });
  controlMappings.set('sensor.vision.pinch_x', [{
    type: 'device_param',
    trackIndex: 0,
    deviceIndex: 0,
    paramIndex: 0,
    targetScale: 'auto',
  }]);

  const values = await getControlValues('client-1');

  assert.ok(Math.abs(values['sensor.vision.pinch_x'] - 0.5) < 1e-9);
});

test('host feedback never reads MIDI note modes as device parameters', async () => {
  let reads = 0;
  const parameter = {
    name: 'Receiver internals', min: 0, max: 1, isQuantized: false,
    getValue: async () => { reads += 1; return 0.75; },
  };
  setExtensionContext({
    application: { song: { tempo: 120, tracks: [{ devices: [{ parameters: [parameter] }] }] } },
  });
  controlMappings.set('sensor.audio.note', [{
    type: 'device_param', trackIndex: 0, mode: 'follow_detected_note',
  }]);
  controlMappings.set('pad-1', [{
    type: 'device_param', trackIndex: 0, mode: 'trigger_note', midiNote: 'C3',
  }]);

  const values = await getControlValues('client-1');

  assert.equal(reads, 0);
  assert.equal('sensor.audio.note' in values, false);
  assert.equal('pad-1' in values, false);
});
