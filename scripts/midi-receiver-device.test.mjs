import test from 'node:test';
import assert from 'node:assert/strict';
import { readPatch, listObjects } from './amxd.js';

const receiver = new URL('../static/RC-Midi-Receiver.amxd', import.meta.url);
const sender = new URL('../static/RC-Audio-Sender.amxd', import.meta.url);
test('shipping MIDI devices have no network listener or sender', () => {
  for (const file of [receiver, sender]) {
    const patch = readPatch(file);
    assert.equal(patch.patcher.oscreceiveudpport, undefined);
    assert.ok(!listObjects(patch).some(text => /^(?:udpreceive|udpsend|node\.script)\b/.test(text)), String(file));
  }
});
test('Receiver exposes a wide Float SDK command behind manual arming', () => {
  const patch = readPatch(receiver).patcher;
  const packet = patch.boxes.find(({ box }) => box.varname === 'RC MIDI Packet v2')?.box;
  assert.ok(packet, 'missing versioned SDK command');
  const attrs = packet.saved_attribute_attributes.valueof;
  // Max Int is limited to 256 values. Wide integer packets require Float + Int units.
  assert.equal(attrs.parameter_type, 0);
  assert.equal(attrs.parameter_unitstyle, 0);
  assert.equal(attrs.parameter_mmax, 4194303);
  assert.equal(attrs.parameter_invisible, 0); // Live API only enumerates automatable parameters.
  assert.equal(attrs.parameter_speedlim, 0);
  assert.equal(attrs.parameter_defer, 0);
  assert.equal(attrs.parameter_undo_enabled, undefined, 'do not claim an unsupported undo attribute');
  const objects = listObjects({ patcher: patch });
  assert.ok(objects.includes('receive rc-midi-audio-v2'));
  assert.ok(objects.includes('gate 1 0'));
  assert.ok(objects.includes('split 16384 4194303'), 'zero is not a command');
  assert.ok(objects.includes('expr ($i1 / 128) % 128'));
  assert.ok(objects.includes('% 128'));
  assert.ok(objects.includes('prepend 144'), 'velocity zero is Note Off');
  assert.ok(objects.includes('round 1'), 'round normalized Float precision before integer decoding');
  const wired = (from, to) => patch.lines.some(({ patchline }) =>
    patchline.source[0] === from && patchline.destination[0] === to);
  assert.ok(wired('packet', 'round') && wired('round', 'sdk-gate') && wired('sdk-gate', 'valid'));
});
test('packet math roundtrips every MIDI note and velocity within exact float precision', () => {
  for (const seq of [1, 127, 255]) for (let note = 0; note < 128; note++) for (let velocity = 0; velocity < 128; velocity++) {
    const packet = seq * 16384 + note * 128 + velocity;
    assert.equal(Math.fround(packet), packet);
    assert.equal(Math.round(Math.fround(packet / 4194303) * 4194303), packet);
    assert.equal(Math.floor(packet / 128) % 128, note);
    assert.equal(packet % 128, velocity);
  }
});
