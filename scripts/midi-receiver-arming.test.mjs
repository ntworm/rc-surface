// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Executes the artifact's guard wiring with a small synchronous Max message
// model. Not a substitute for Max loading, scheduling or MIDI acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readPatch } from './amxd.js';

const patch = readPatch(new URL('../static/RC-Midi-Receiver.amxd', import.meta.url)).patcher;
const ON = 24164; // seq1, MIDI60, velocity100
const OFF = 40448; // seq2, MIDI60, velocity0
function graph() {
  const boxes = new Map(patch.boxes.map(({box}) => [box.id, box]));
  const gates = new Map(), values = new Map(), accepted = [], local = [], events = [];
  for (const b of boxes.values()) if (b.text?.startsWith('gate ')) gates.set(b.id, Number(b.text.split(' ')[2]));
  function emit(id, outlet, value) {
    for (const {patchline: p} of patch.lines.filter(({patchline: p}) =>
      p.source[0] === id && p.source[1] === outlet).sort((a, b) =>
        (a.patchline.order ?? 0) - (b.patchline.order ?? 0))) send(p.destination[0], value, p.destination[1]);
  }
  function send(id, value = 'bang', inlet = 0) {
    const b = boxes.get(id);
    assert.ok(b, `missing guard object ${id}`);
    // Intercept at the unchanged decoder entry and existing local MIDI merger.
    if (id === 'valid') { if (value >= 16384 && value <= 4194303) accepted.push(value); return; }
    if (id === 'activity-trigger') { local.push(value); return; }
    if (id === 'flush') { events.push(['flush', gates.get('sdk-gate')]); return; }
    if (b.maxclass === 'message') {
      emit(id, 0, b.text === '0' ? 0 : b.text === '1' ? 1 : b.text); return;
    }
    if (b.maxclass === 'toggle' || b.maxclass === 'live.numbox') {
      if (value === 'set 0') { values.set(id, 0); return; }
      values.set(id, value); emit(id, 0, value); return;
    }
    if (b.maxclass === 'button') { emit(id, 0, 'bang'); return; }
    if (b.text === 'round 1') { emit(id, 0, Math.round(value)); return; }
    if (gates.has(id)) {
      if (inlet === 0) { gates.set(id, value); events.push([id, value]); }
      else if (gates.get(id)) emit(id, 0, value);
      return;
    }
    if (b.text === 'sel 0') { if (value === 0) emit(id, 0, 'bang'); else emit(id, 1, value); return; }
    if (b.text?.startsWith('t ')) {
      const types = b.text.split(' ').slice(1);
      for (let o = types.length - 1; o >= 0; o--) emit(id, o, types[o] === 'b' ? 'bang' : value);
      return;
    }
    if (['loadbang', 'live.thisdevice', 'freebang', 'receive rc-midi-audio-v2'].includes(b.text)) {
      emit(id, 0, value); return;
    }
    assert.fail(`unmodelled guard object ${id}: ${b.text ?? b.maxclass}`);
  }
  return { send, emit, accepted, local, events, values, gates, boxes };
}

test('a restored SDK packet is discarded on load, then the device arms itself without replaying it', () => {
  const g = graph();
  g.send('packet', ON);
  assert.deepEqual(g.accepted, [], 'a stored command cannot reach MIDI on load');
  g.send('boot');
  assert.equal(g.values.get('sdk-enable'), 0, 'loadbang keeps the gate closed');
  g.send('lifecycle');
  assert.equal(g.values.get('sdk-enable'), 1, 'post-initialization arms SDK Notes');
  assert.equal(g.values.get('packet'), 0, 'arming clears the restored command');
  assert.deepEqual(g.accepted, [], 'arming never replays the restored command');
  g.send('packet', ON); g.send('packet', OFF);
  assert.deepEqual(g.accepted, [ON, OFF], 'fresh commands play without any click');
  assert.equal(g.values.get('local-enable') ?? 0, 0, 'the Audio Sender input stays an opt-in');
});

test('manual SDK enable clears stale command before opening and never replays it', () => {
  const g = graph();
  assert.equal(g.boxes.get('sdk-enable')?.parameter_enable, 0, 'arming must not be a Live parameter');
  g.send('packet', ON); g.send('sdk-enable', 1);
  assert.equal(g.values.get('packet'), 0);
  assert.deepEqual(g.accepted, [], 'enable must not bang the stored command');
  assert.ok(g.events.some(([type, open]) => type === 'flush' && open === 0));
  g.send('packet', ON); g.send('packet', OFF);
  assert.deepEqual(g.accepted, [ON, OFF]);
  g.send('sdk-enable', 0); g.send('packet', ON);
  assert.deepEqual(g.accepted, [ON, OFF]);
  assert.equal(g.gates.get('sdk-gate'), 0);
});

test('Panic disarms SDK and local input, flushes, and stays OFF until clicked', () => {
  const g = graph();
  g.send('sdk-enable', 1); g.send('local-enable', 1); g.send('packet', ON);
  const flushCount = g.events.filter(([type]) => type === 'flush').length;
  g.send('panic');
  assert.equal(g.gates.get('sdk-gate'), 0);
  assert.equal(g.gates.get('local-gate'), 0);
  assert.ok(g.events.filter(([type]) => type === 'flush').length > flushCount);
  g.send('packet', ON); g.send('local', [144, 60, 100]);
  assert.deepEqual(g.accepted, [ON]); assert.deepEqual(g.local, []);
  g.send('sdk-enable', 1); assert.deepEqual(g.accepted, [ON]);
  g.send('packet', OFF); assert.deepEqual(g.accepted, [ON, OFF]);
});

test('Device On=0 disarms and flushes; Device On=1 re-arms SDK Notes but not the local input', () => {
  const g = graph();
  g.send('sdk-enable', 1); g.send('local-enable', 1); g.send('packet', ON);
  const flushCount = g.events.filter(([type]) => type === 'flush').length;
  g.emit('lifecycle', 1, 0);
  assert.equal(g.gates.get('sdk-gate'), 0);
  assert.equal(g.gates.get('local-gate'), 0);
  assert.ok(g.events.filter(([type]) => type === 'flush').length > flushCount);
  g.send('packet', OFF);
  assert.deepEqual(g.accepted, [ON], 'nothing passes while disabled');
  g.emit('lifecycle', 1, 1);
  assert.equal(g.gates.get('sdk-gate'), 1, 'Device On re-arms');
  assert.equal(g.values.get('packet'), 0, 're-arming clears the held command without output');
  assert.deepEqual(g.accepted, [ON]);
  g.send('packet', OFF); assert.deepEqual(g.accepted, [ON, OFF]);
  g.send('local', [144, 60, 100]); assert.deepEqual(g.local, [], 'the local input stays opt-in');
});

test('local Sender opt-in does not open SDK, SDK opt-in does not open local Sender', () => {
  const g = graph();
  g.send('sdk-enable', 1); g.send('local', [144, 60, 100]);
  assert.deepEqual(g.local, []);
  g.send('sdk-enable', 0); g.send('local-enable', 1);
  g.send('packet', ON); assert.deepEqual(g.accepted, []);
  g.send('local', [144, 60, 100]); assert.deepEqual(g.local, [[144, 60, 100]]);
});
