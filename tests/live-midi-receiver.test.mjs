import test from 'node:test';
import assert from 'node:assert/strict';
import { setExtensionContext, clearExtensionContext } from '../src/context.ts';
import { applyMapping, controlMappings, eventModesState, lastMappedValues,
  commands, cancelPendingMappingWrites, handleClientDisconnect, setMappingsFilePath } from '../src/live/mappings.ts';
import { deferred, settle } from './helpers/isolated-module.mjs';
import { pressReceiverNote, findMidiReceiver } from '../src/live/midi-receiver.ts';
import { readPatch } from '../scripts/amxd.js';

function receiver() {
  const values = [];
  const parameter = { name: 'RC MIDI Packet v2', min: 0, max: 4194303,
    isQuantized: false, setValue: async value => { values.push(value); } };
  return { values, parameter, name: 'RC-Midi-Receiver', parameters: [parameter] };
}
const decode = value => [Math.floor(value / 128) % 128, value % 128];
function setup() {
  const a = receiver(), b = receiver();
  const song = { tempo: 120, tracks: [{ devices: [a] }, { devices: [b] }], returnTracks: [] };
  setExtensionContext({ application: { song } });
  setMappingsFilePath(null);
  const target = { type: 'device_param', mode: 'trigger_note', trackIndex: 0, midiNote: 'C3', midiVelocity: 100 };
  controlMappings.set('pad-1', [target]);
  return { a, b, song, target };
}
test.afterEach(async () => {
  await cancelPendingMappingWrites();
  controlMappings.clear(); eventModesState.clear(); lastMappedValues.clear(); clearExtensionContext();
});

// Live's DeviceParameter.name exposes the short name, not the scripting name.
// Derive metadata from the shipping AMXD so fixtures cannot conceal that boundary.
const shippingPatch = readPatch(new URL('../static/RC-Midi-Receiver.amxd', import.meta.url)).patcher;
const packetBox = shippingPatch.boxes.find(({ box }) => box.id === 'packet').box;
const packetAttrs = packetBox.saved_attribute_attributes.valueof;
for (const [label, name] of [
  ['attribute short name (Live API)', packetAttrs.parameter_shortname],
  ['attribute long name', packetAttrs.parameter_longname],
  ['registry short name', shippingPatch.parameters.packet[1]],
  ['registry long name', shippingPatch.parameters.packet[0]],
]) test(`shipping Receiver ${label} is discovered and its command stays hidden`, async () => {
  const { a } = setup();
  Object.assign(a.parameter, { name, min: packetAttrs.parameter_mmin,
    max: packetAttrs.parameter_mmax, isQuantized: packetAttrs.parameter_type !== 0 });
  const discovery = await commands.addUdpReceiverToTrack.handler({ trackIndex: 0 });
  assert.equal(discovery.success, true, `${label}: ${name} => ${discovery.reason}`);
  assert.equal(discovery.inserted, false);
  assert.equal((await commands.getDeviceParams.handler({ trackIndex: 0, deviceIndex: 0 })).parameters.length, 0);
  const targets = await commands.getTargets.handler({});
  assert.ok(targets.targets.filter(target => target.devices).every(target =>
    target.devices.every(device => device.params.every(param => param.label !== name))));
  await applyMapping('phone', 'pad-1', 1);
  await applyMapping('phone', 'pad-1', 0);
  assert.deepEqual(a.values.map(decode), [[60, 100], [60, 0]]);
});

test('Trigger Note addresses only the chosen Receiver and releases that same device after track reorder', async () => {
  const { a, b, song } = setup();
  await applyMapping('phone', 'pad-1', 1);
  assert.deepEqual(a.values.map(decode), [[60, 100]]);
  assert.deepEqual(b.values, []);
  song.tracks.reverse();
  await applyMapping('phone', 'pad-1', 0);
  assert.deepEqual(a.values.map(decode), [[60, 100], [60, 0]]);
  assert.deepEqual(b.values, []);
});

test('two mapped tracks never share the MIDI transport', async () => {
  const { a, b, target } = setup();
  controlMappings.set('pad-2', [{ ...target, trackIndex: 1 }]);
  await applyMapping('phone', 'pad-1', 1);
  await applyMapping('phone', 'pad-2', 1);
  await applyMapping('phone', 'pad-2', 0);
  assert.deepEqual(a.values.map(decode), [[60, 100]]);
  assert.deepEqual(b.values.map(decode), [[60, 100], [60, 0]]);
});

for (const operation of ['clear', 'disconnect', 'cancel']) test(`${operation} sends intentional Note Off to the captured Receiver`, async () => {
  const { a, b } = setup();
  await applyMapping('phone', 'pad-1', 1);
  if (operation === 'clear') await commands.clearMappings.handler({});
  if (operation === 'disconnect') await handleClientDisconnect('phone');
  if (operation === 'cancel') await cancelPendingMappingWrites();
  assert.deepEqual(a.values.map(decode), [[60, 100], [60, 0]]);
  assert.deepEqual(b.values, []);
});

test('old and duplicate Receivers fail closed and do not report success', async () => {
  const { a, song } = setup();
  song.tracks[0].devices = [{ name: 'RC-Midi-Receiver', parameters: [] }];
  assert.equal((await commands.addUdpReceiverToTrack.handler({ trackIndex: 0 })).reason, 'receiver_upgrade_required');
  await applyMapping('phone', 'pad-1', 1);
  assert.deepEqual(a.values, []);
  song.tracks[0].devices = [a, receiver()];
  assert.equal((await commands.addUdpReceiverToTrack.handler({ trackIndex: 0 })).reason, 'receiver_ambiguous');
});

test('slow Receiver serializes notes from separate pads and drops cancelled pending ONs', async () => {
  const { a, target } = setup();
  const gate = deferred();
  a.parameter.setValue = async value => { a.values.push(value); if (a.values.length === 1) await gate.promise; };
  controlMappings.set('pad-2', [{ ...target, midiNote: 'D3' }]);
  const first = applyMapping('phone', 'pad-1', 1);
  await settle();
  const second = applyMapping('phone', 'pad-2', 1);
  await settle();
  const cancel = cancelPendingMappingWrites();
  gate.resolve();
  await Promise.all([first, second, cancel]);
  assert.deepEqual(a.values.map(decode), [[60, 100], [60, 0]]);
});

test('internal MIDI packet parameter never appears as a normal mappable control', async () => {
  const { a } = setup();
  const result = await commands.getTargets.handler({});
  assert.ok(result.targets.filter(target => target.devices).every(target =>
    target.devices.every(device => device.params.every(param => param.label !== a.parameter.name))));
});

test('release before a queued note starts sends neither stale ON nor spurious OFF', async () => {
  const { a } = setup();
  const on = applyMapping('phone', 'pad-1', 1);
  const off = applyMapping('phone', 'pad-1', 0);
  await Promise.all([on, off]);
  assert.deepEqual(a.values, []);
});

test('device parameter listing hides the internal command without changing real parameter indices', async () => {
  const { a } = setup();
  a.parameters.push({ name: 'Device On', min: 0, max: 1, defaultValue: 1,
    isQuantized: true, valueItems: [], getValue: async () => 1 });
  const result = await commands.getDeviceParams.handler({ trackIndex: 0, deviceIndex: 0 });
  assert.deepEqual(result.parameters.map(({ index, name }) => ({ index, name })),
    [{ index: 1, name: 'Device On' }]);
});

test('Receiver bounds queued ONs while preserving every accepted note release', async () => {
  const { a, song } = setup();
  const gate = deferred();
  a.parameter.setValue = async value => { a.values.push(value); if (a.values.length === 1) await gate.promise; };
  const notes = Array.from({ length: 64 }, (_, pitch) => pressReceiverNote(song.tracks[0], pitch, 100, () => true));
  const excess = pressReceiverNote(song.tracks[0], 64, 100, () => true);
  assert.equal(await excess.started, false);
  await settle();
  const firstOff = notes[0].release();
  gate.resolve();
  assert.ok((await Promise.all(notes.map(note => note.started))).every(Boolean));
  await firstOff;
  await Promise.all(notes.map(note => note.release()));
  await excess.release();
  const decoded = a.values.map(decode);
  for (let pitch = 0; pitch < 64; pitch++) {
    assert.deepEqual(decoded.filter(([note]) => note === pitch), [[pitch, 100], [pitch, 0]]);
  }
  assert.equal(decoded.length, 128);
});

test('Receiver accepts the wide Float parameter required by Max, not a quantized Int', () => {
  const { a, song } = setup();
  a.parameter.isQuantized = false;
  assert.equal(findMidiReceiver(song.tracks[0]).parameter, a.parameter);
  a.parameter.isQuantized = true;
  assert.equal(findMidiReceiver(song.tracks[0]).reason, 'receiver_upgrade_required');
});

test('release reserves its queue position before a repeated note while SDK ON is in flight', async () => {
  const { a, song } = setup();
  const gate = deferred();
  a.parameter.setValue = async value => { a.values.push(value); if (a.values.length === 1) await gate.promise; };
  const first = pressReceiverNote(song.tracks[0], 60, 100, () => true);
  await settle();
  const off = first.release();
  const repeated = pressReceiverNote(song.tracks[0], 60, 100, () => true);
  gate.resolve();
  await Promise.all([first.started, off, repeated.started]);
  assert.deepEqual(a.values.map(decode), [[60, 100], [60, 0], [60, 100]]);
  await repeated.release();
  assert.deepEqual(a.values.map(decode), [[60, 100], [60, 0], [60, 100], [60, 0]]);
});
