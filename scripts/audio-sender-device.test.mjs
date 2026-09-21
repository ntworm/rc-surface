// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// RC-Audio-Sender.amxd is a standalone audio-to-MIDI helper: the Extensions
// SDK exposes no audio at all, so only something inside Live's audio path can
// hear a track, and that is a Max device.
//
// It is generated rather than drawn, so these check the generator's output the
// way the browser tests check the markup. What they cannot check is whether
// Max loads it — that needs Max. They check everything up to that line.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { readPatch, listObjects } from './amxd.js';

const root = path.join(import.meta.dirname, '..');

const SENDER = path.join(root, 'static', 'RC-Audio-Sender.amxd');
const RECEIVER = path.join(root, 'static', 'RC-Midi-Receiver.amxd');

test('the device exists and is a readable amxd', () => {
  assert.ok(fs.existsSync(SENDER), 'the generator must have been run');
  const buf = fs.readFileSync(SENDER);
  // The container Live expects: three chunks, the last declaring the length of
  // the JSON that follows it.
  assert.equal(buf.toString('ascii', 0, 4), 'ampf');
  assert.equal(buf.toString('ascii', 12, 16), 'meta');
  const at = buf.indexOf('ptch');
  assert.ok(at > 0, 'a patcher chunk must be present');
  assert.equal(buf.readUInt32LE(at + 4), buf.length - at - 8,
    'the declared length must cover exactly what follows it');
  assert.doesNotThrow(() => readPatch(SENDER), 'and the JSON must parse');
});

test('Live classifies the sender as a Max Audio Effect', () => {
  const buf = fs.readFileSync(SENDER);
  const patch = readPatch(SENDER);

  // These are the identifiers stored by Live's own Max Audio Effect template.
  // A MIDI Effect uses mmmm / 1835887981 and cannot enter an audio track.
  assert.equal(buf.toString('ascii', 8, 12), 'aaaa');
  assert.equal(patch.patcher.project.amxdtype, 1633771873);
});

test('it carries the same patcher contract as the device Live already loads', () => {
  // Copied from the receiver rather than written from memory: if Live checks a
  // compatibility field, the one that works is the one to copy.
  const enviado = readPatch(SENDER).patcher;
  const recebido = readPatch(RECEIVER).patcher;
  for (const campo of ['fileversion', 'appversion', 'classnamespace',
    'minimum_live_version', 'minimum_max_version', 'platform_compatibility']) {
    assert.deepEqual(enviado[campo], recebido[campo], `${campo} must match the working device`);
  }
  // And none of the receiver's own runtime state: a sender that also claims a
  // receive port binds a socket for no reason.
  assert.equal(enviado.oscreceiveudpport, undefined);
});

test('Live presentation exposes the sender status instead of an empty device', () => {
  const patcher = readPatch(SENDER).patcher;
  assert.equal(patcher.openinpresentation, 1,
    'Live embeds Max devices in presentation mode');

  const boxes = patcher.boxes.map(({ box }) => box);
  const visible = (box) => Boolean(box) && box.presentation === 1
    && Array.isArray(box.presentation_rect)
    && box.presentation_rect.length === 4;
  const findText = (text) => boxes.find((box) => box.text === text);

  for (const text of ['RC AUDIO SENDER', 'LOCAL MAX / NO UDP', 'DETECTED NOTE']) {
    assert.ok(visible(findText(text)), `${text} must be visible in Live's device panel`);
  }
  assert.ok(boxes.some((box) => box.maxclass === 'number' && visible(box)),
    'the detected MIDI note value must be visible in Live');
});

test('the signal path is audio in, note out, over the wire that already exists', () => {
  const objetos = listObjects(readPatch(SENDER));
  // Audio from the track it sits on.
  assert.ok(objetos.includes('plugin~'), 'must take the track audio');
  assert.ok(objetos.some((o) => o.startsWith('fzero~')), 'must estimate a fundamental');
  // fzero has no clarity output. Its documented threshold and amplitude
  // report provide the one gate this Max path can honestly expose.
  assert.ok(objetos.some((o) => /^fzero~ .*@threshold 0\.015(?:\s|$)/.test(o)),
    'the estimator must use the documented level threshold');
  assert.ok(objetos.some((o) => o.startsWith('>= 0.015')), 'the gate threshold');
  // And out through the receiver that is already installed and working.
  assert.ok(objetos.some((o) => o === 'send rc-midi-audio-v2'),
    'must use the local Max bus with no network');
});

test('the sender delivers complete MIDI lists to the in-process bus', () => {
  const patch = readPatch(SENDER).patcher;
  const find = text => patch.boxes.find(({box}) => box.text === text)?.box.id;
  assert.ok(patch.lines.some(({patchline: p}) =>
    p.source[0] === find('prepend 144') && p.destination[0] === find('send rc-midi-audio-v2')));
});

test('Receiver SDK and optional Sender input reach MIDI output and activity', () => {
  const patch = readPatch(RECEIVER).patcher;
  const links = patch.lines.map(({patchline: p}) => p.source.join(':') + '>' + p.destination.join(':'));
  for (const link of ['status:0>activity-trigger:0', 'local-gate:0>activity-trigger:0',
    'activity-trigger:0>bytes:0', 'bytes:0>flush:0', 'flush:0>output:0',
    'activity-trigger:1>activity:0', 'local-switch:1>flush:0', 'panic:0>reset:0']) {
    assert.ok(links.includes(link), link);
  }
});

test('the sender passes both audio channels through unchanged', () => {
  const patch = readPatch(SENDER);
  const boxes = new Map(patch.patcher.boxes.map(({ box }) => [box.id, box]));
  const plugin = [...boxes.values()].find((box) => box.text === 'plugin~');
  const plugout = [...boxes.values()].find((box) => box.text === 'plugout~');
  assert.ok(plugin && plugout, 'an Audio Effect needs Live audio input and output');

  const connects = (from, outlet, to, inlet) => patch.patcher.lines.some(({ patchline }) => (
    patchline.source[0] === from.id
    && patchline.source[1] === outlet
    && patchline.destination[0] === to.id
    && patchline.destination[1] === inlet
  ));
  assert.ok(connects(plugin, 0, plugout, 0), 'left channel must pass through');
  assert.ok(connects(plugin, 1, plugout, 1), 'right channel must pass through');
});

test('fzero follows its documented message outlet contract', () => {
  const patch = readPatch(SENDER);
  const boxes = new Map(patch.patcher.boxes.map(({ box }) => [box.id, box]));
  const findBox = (text) => [...boxes.values()].find((box) => box.text === text);
  const fzero = [...boxes.values()].find((box) => box.text?.startsWith('fzero~'));
  const ftom = findBox('ftom');
  assert.ok(fzero && ftom, 'the documented pitch path must exist');
  assert.equal(fzero.numinlets, 1);
  assert.equal(fzero.numoutlets, 3, 'frequency, analysis amplitude, and onset');
  assert.deepEqual(fzero.outlettype, ['', '', 'bang']);

  const connects = (from, outlet, to, inlet) => patch.patcher.lines.some(({ patchline }) => (
    patchline.source[0] === from.id
    && patchline.source[1] === outlet
    && patchline.destination[0] === to.id
    && patchline.destination[1] === inlet
  ));
  assert.ok(connects(fzero, 0, ftom, 0), 'frequency messages must reach ftom directly');

  const objects = listObjects(patch);
  assert.ok(!objects.some((text) => text.startsWith('snapshot~')),
    'message outlets must not be sampled as MSP signals');
  assert.ok(!objects.some((text) => text.startsWith('>= 0.65')),
    'fzero has no clarity outlet to compare against the phone clarity floor');
});

test('out-of-range pitch estimates are rejected instead of becoming boundary notes', () => {
  const patch = readPatch(SENDER);
  const boxes = new Map(patch.patcher.boxes.map(({ box }) => [box.id, box]));
  const findBox = (text) => [...boxes.values()].find((box) => box.text === text);
  const ftom = findBox('ftom');
  const round = findBox('round 1');
  const range = findBox('split 21 108');
  const gate = findBox('gate');
  const invalid = findBox('t b b');
  const stop = findBox('stop');
  const candidateReset = findBox('set -2');
  const candidate = [...boxes.values()].find((box) => box.text === 'change'
    && patch.patcher.lines.some(({ patchline }) => (
      patchline.source[0] === gate?.id && patchline.destination[0] === box.id
    )));
  assert.ok(ftom && round && range && gate && invalid && stop && candidateReset && candidate,
    'the musical range must accept valid notes and cancel invalid candidates');
  assert.equal(findBox('clip 21 108'), undefined,
    'clip would turn an invalid low estimate into a real A-1 note');

  const connects = (from, outlet, to, inlet) => patch.patcher.lines.some(({ patchline }) => (
    patchline.source[0] === from.id
    && patchline.source[1] === outlet
    && patchline.destination[0] === to.id
    && patchline.destination[1] === inlet
  ));
  assert.ok(connects(ftom, 0, round, 0));
  assert.ok(connects(round, 0, range, 0));
  assert.ok(connects(range, 0, gate, 1),
    'only split values inside 21..108 may enter the note path');
  assert.ok(connects(range, 1, invalid, 0));
  assert.ok(connects(invalid, 1, stop, 0),
    'an invalid estimate must cancel a candidate timer');
  assert.ok(connects(invalid, 0, candidateReset, 0));
  assert.ok(connects(candidateReset, 0, candidate, 0),
    'the same valid pitch must be allowed to start a fresh timer afterward');
});

test('a pitch change must stay stable for 70 ms before it becomes a MIDI note', () => {
  const patch = readPatch(SENDER);
  const boxes = new Map(patch.patcher.boxes.map(({ box }) => [box.id, box]));
  const findBox = (text) => [...boxes.values()].find((box) => box.text === text);
  const changes = [...boxes.values()].filter((box) => box.text === 'change');
  const trigger = findBox('t b b i');
  const store = findBox('i');
  const stop = findBox('stop');
  const delay = findBox('delay 70');
  const gate = findBox('gate');
  const makenote = findBox('makenote 100 200');
  const reset = findBox('set -1');
  const closed = findBox('sel 0');
  assert.equal(changes.length, 2,
    'candidate changes and committed notes need independent memories');
  assert.ok(trigger && store && stop && delay && gate && makenote && reset && closed,
    'the debounce and silence-cancellation objects must exist');

  const connects = (from, outlet, to, inlet) => patch.patcher.lines.some(({ patchline }) => (
    patchline.source[0] === from.id
    && patchline.source[1] === outlet
    && patchline.destination[0] === to.id
    && patchline.destination[1] === inlet
  ));
  const candidate = changes.find((box) => connects(gate, 0, box, 0));
  const committed = changes.find((box) => connects(box, 0, makenote, 0));
  assert.ok(candidate && committed && candidate !== committed,
    'raw candidates must be separated from notes already sent');
  assert.ok(connects(candidate, 0, trigger, 0));
  assert.ok(connects(trigger, 2, store, 1), 'store the candidate before scheduling');
  assert.ok(connects(trigger, 1, stop, 0), 'cancel the previous candidate timer');
  assert.ok(connects(stop, 0, delay, 0));
  assert.ok(connects(trigger, 0, delay, 0), 'start one fresh 70 ms timer');
  assert.ok(connects(delay, 0, store, 0));
  assert.ok(connects(store, 0, committed, 0));
  assert.ok(connects(reset, 0, candidate, 0));
  assert.ok(connects(reset, 0, committed, 0));
  assert.ok(connects(closed, 0, stop, 0),
    'silence must cancel a candidate that has not become a note');
});

test('silence resets the pitch filter so the same note can retrigger', () => {
  const patch = readPatch(SENDER);
  const boxes = new Map(patch.patcher.boxes.map(({ box }) => [box.id, box]));
  const findBox = (text) => [...boxes.values()].find((box) => box.text === text);
  const plugin = findBox('plugin~');
  const peak = findBox('peakamp~ 50');
  const levelGate = findBox('>= 0.015');
  const gate = findBox('gate');
  const closed = findBox('sel 0');
  const reset = findBox('set -1');
  const changed = findBox('change');
  assert.ok(plugin && peak && levelGate && gate && closed && reset && changed,
    'the periodic level and gate-close reset path must exist');
  assert.equal(reset.maxclass, 'message', 'set must update change without emitting a note');

  const connects = (from, outlet, to, inlet) => patch.patcher.lines.some(({ patchline }) => (
    patchline.source[0] === from.id
    && patchline.source[1] === outlet
    && patchline.destination[0] === to.id
    && patchline.destination[1] === inlet
  ));
  assert.ok(connects(plugin, 0, peak, 0), 'track audio must reach the periodic peak meter');
  assert.ok(connects(peak, 0, levelGate, 0), 'periodic peaks must drive the level gate');
  assert.ok(connects(levelGate, 0, gate, 0), 'the level decision must still control note flow');
  assert.ok(connects(levelGate, 0, closed, 0), 'gate close must also trigger the reset branch');
  assert.ok(connects(closed, 0, reset, 0));
  assert.ok(connects(reset, 0, changed, 0), 'silence must replace the stored pitch');
});

test('pack is driven from its hot inlet, or it holds a note it never sends', () => {
  // Only the leftmost inlet of pack causes output. Wiring both values into
  // cold inlets produces an object that silently accumulates and never emits —
  // a device that looks correct and does nothing.
  const patch = readPatch(SENDER);
  const caixas = new Map();
  for (const entry of patch.patcher.boxes) caixas.set(entry.box.id, entry.box.text || entry.box.maxclass);
  const packId = [...caixas.entries()].find(([, texto]) => texto === 'pack 0 0')?.[0];
  assert.ok(packId, 'the pack object must be present');
  const chegando = patch.patcher.lines
    .map((l) => l.patchline)
    .filter((l) => l.destination[0] === packId);
  assert.equal(chegando.length, 2, 'pitch and velocity');
  assert.ok(chegando.some((l) => l.destination[1] === 0), 'one of them must be hot');
  // makenote emits right to left, so the velocity lands cold before the pitch
  // triggers — the order that produces a correct pair rather than a stale one.
  const quente = chegando.find((l) => l.destination[1] === 0);
  assert.equal(caixas.get(quente.source[0]), 'makenote 100 200');
  assert.equal(quente.source[1], 0, 'the hot inlet must be the pitch');
});

test('every object is connected to something', () => {
  // A box with no wires is a box that was meant to do something.
  const patch = readPatch(SENDER);
  const ligados = new Set();
  for (const { patchline } of patch.patcher.lines) {
    ligados.add(patchline.source[0]);
    ligados.add(patchline.destination[0]);
  }
  const soltos = patch.patcher.boxes
    .map((e) => e.box)
    .filter((b) => b.maxclass !== 'comment' && !ligados.has(b.id))
    .map((b) => b.text || b.maxclass);
  assert.deepEqual(soltos, [], 'these are wired to nothing');
});
