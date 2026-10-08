// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { setExtensionContext, clearExtensionContext } from '../src/context.ts';
import { applyMapping, controlMappings, eventModesState, cancelPendingMappingWrites } from '../src/live/mappings.ts';

test.afterEach(async () => {
  await cancelPendingMappingWrites();
  controlMappings.clear();
  eventModesState.clear();
  clearExtensionContext();
});

for (const neutralPolicy of ['hold', 'release']) {
  test(`pose Safe loss ${neutralPolicy}: return ON restores output without duplicate held notes`, async () => {
    const packets = [];
    const parameter = { name: 'RC MIDI Packet v2', min: 0, max: 4194303, isQuantized: false,
      setValue: async value => packets.push([Math.floor(value / 128) % 128, value % 128]) };
    setExtensionContext({ application: { song: { tempo: 120, tracks: [
      { devices: [{ name: 'RC-Midi-Receiver', parameters: [parameter] }] },
    ] } } });
    const control = 'sensor.vision.gesture.1';
    controlMappings.set(control, [{ type: 'device_param', mode: 'trigger_note', trackIndex: 0,
      midiNote: 'C3', noteTiming: 'immediate', noteGate: 'hold', neutralPolicy }]);
    await applyMapping('phone', control, 1);
    await applyMapping('phone', 'sensor.vision.active', 0, true);
    assert.deepEqual(packets, [[60, 100]], 'active loss must wait for the pose channel grace');
    await applyMapping('phone', control, 0, true);
    await applyMapping('phone', control, 1);
    await applyMapping('phone', control, 1);
    assert.deepEqual(packets, neutralPolicy === 'hold' ? [[60, 100]] : [[60, 100], [60, 0], [60, 100]]);
    await applyMapping('phone', 'sensor.vision.active', 0);
    assert.deepEqual(packets.at(-1), [60, 0], 'camera OFF still releases held notes');
  });
}
