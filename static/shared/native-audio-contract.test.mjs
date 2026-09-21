// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ids, makeFrame, makeSnapshot, makeExchange, makeSlot } from '../../tests/helpers/native-audio-fixtures.mjs';

function load() {
  const context = vm.createContext({});
  const file = new URL('./native-audio-contract.js', import.meta.url);
  if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  assert.ok(context.NativeAudioContract, 'native boundary must decode untrusted payloads');
  return context.NativeAudioContract;
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test('all twelve measurements survive decoding without introducing mutable aliases', () => {
  const contract = load();
  const input = makeFrame();
  input.values.kick = .75;
  input.peaks.kick = .9;
  const decoded = contract.validateFrame(input);
  assert.deepEqual(plain(decoded), input);
  input.values.kick = 0;
  assert.equal(decoded.values.kick, .75);
  assert.ok(Object.isFrozen(decoded) && Object.isFrozen(decoded.values));
  assert.equal(contract.VERSION, 1);
});

test('descriptor packets reject missing, unknown, coercible and nonfinite values', () => {
  const { validateFrame } = load();
  const invalid = [];
  const missing = makeFrame(); delete missing.values.high; invalid.push(missing);
  const extra = makeFrame(); extra.values.pitch = .5; invalid.push(extra);
  for (const value of [NaN, Infinity, -Infinity, -.001, 1.001, '0.5', null, true]) {
    const frame = makeFrame(); frame.values.high = value; invalid.push(frame);
  }
  invalid.push(makeFrame({ version: 2 }), makeFrame({ seq: -1 }), makeFrame({ seq: .5 }),
    makeFrame({ seq: Number.MAX_SAFE_INTEGER + 1 }), makeFrame({ instanceId: 'track-name' }),
    makeFrame({ hostEpoch: 'secret' }), makeFrame({ enabled: 1 }), makeFrame({ sampleRate: 0 }),
    makeFrame({ fftSize: 1000 }), makeFrame({ hopSize: 4096 }), makeFrame({ signalVectorSize: 0 }),
    makeFrame({ configRevision: -1 }), makeFrame({ captureSample: -1 }), makeFrame({ audio: [0, 1] }),
    makeFrame({ dspRunning: false, spectralReady: true }));
  for (const frame of invalid) assert.throws(() => validateFrame(frame), { code: 'invalid_frame' });
});

test('warmup, stopped DSP and digital silence remain explicit instead of invented data', () => {
  const { validateFrame } = load();
  for (const flags of [{ dspRunning: true, spectralReady: false },
    { dspRunning: false, spectralReady: false, enabled: false }]) {
    assert.deepEqual(plain(validateFrame(makeFrame(flags))), makeFrame(flags));
  }
  assert.equal(validateFrame(makeFrame()).values.high, 0);
});

test('snapshot and ACK identities cannot be substituted inside an authenticated exchange', () => {
  const { validateExchange } = load();
  const ack = { commandId: ids.command, ok: true, code: 'ok', snapshot: makeSnapshot() };
  const exchange = makeExchange({ pairNonce: 16777215, snapshot: makeSnapshot(), ack });
  assert.deepEqual(plain(validateExchange(exchange)), exchange);
  for (const invalid of [makeExchange({ frame: makeFrame({ hostEpoch: ids.device }) }),
    makeExchange({ snapshot: makeSnapshot({ instanceId: ids.device }) }),
    makeExchange({ ack: { ...ack, snapshot: makeSnapshot({ instanceId: ids.device }) } }),
    makeExchange({ pairNonce: 16777216 }), makeExchange({ pairNonce: -.5 }),
    makeExchange({ snapshot: makeSnapshot({ slots: Array.from({ length: 13 }, (_, slot) => makeSlot({ slot })) }) }),
    makeExchange({ snapshot: makeSnapshot({ slots: [makeSlot(), makeSlot()] }) })]) {
    assert.throws(() => validateExchange(invalid), { code: 'invalid_exchange' });
  }
  const heartbeat = { version: 1, hostEpoch: ids.epoch, instanceId: ids.instance };
  assert.deepEqual(plain(validateExchange(heartbeat)), heartbeat);
});

test('configuration is a strict typed patch, preserving FREE bounds and musical subdivisions', () => {
  const { validateChange } = load();
  const changes = [
    { kind: 'settings', patch: { releaseMs: 10, toneMs: 200, releaseBeats: 1 / 48, toneBeats: 0, syncMode: 'sync' } },
    { kind: 'settings', patch: { releaseMs: 500, releaseBeats: 6, bandsGain: 8, window: 4 } },
    { kind: 'enabled', enabled: false }, { kind: 'prepare-slot', slot: makeSlot() },
    { kind: 'commit-slot', preparedId: ids.command }, { kind: 'remove-slot', slot: 11 },
  ];
  for (const change of changes) assert.deepEqual(plain(validateChange(change)), change);
  for (const change of [{ kind: 'settings', patch: {} },
    ...[{ releaseMs: 5 }, { toneMs: 201 }, { releaseBeats: 0 }, { toneBeats: .37 },
      { sensitivity: '0.5' }, { window: 3 }, { attacksGain: 9 }, { syncMode: 'auto' }, { pitch: 1 }]
      .map(patch => ({ kind: 'settings', patch })),
    { kind: 'enabled', enabled: 'false' }, { kind: 'remove-slot', slot: 12 },
    { kind: 'transportPlay' }, { kind: 'commit-slot', preparedId: 'abc' }]) {
    assert.throws(() => validateChange(change), { code: 'invalid_change' });
  }
});

test('target shape rejects ambiguous mixer paths and invalid ranges before mapping', () => {
  const { validateChange } = load();
  const slot = makeSlot();
  for (const target of [{ ...slot.target, kind: 'volume' },
    { ...slot.target, deviceIndex: null }, { ...slot.target, fingerprint: 'name' },
    { ...slot.target, track: { kind: 'master', index: 2 } },
    { ...slot.target, parameterIndex: -1 }, { ...slot.target, catalogGeneration: .1 }]) {
    assert.throws(() => validateChange({ kind: 'prepare-slot', slot: { ...slot, target } }), { code: 'invalid_change' });
  }
  for (const patch of [{ min: .8, max: .2 }, { amount: 2 }, { descriptor: 'gate' }, { mode: 'midi' }]) {
    assert.throws(() => validateChange({ kind: 'prepare-slot', slot: makeSlot(patch) }), { code: 'invalid_change' });
  }
  const mixer = makeSlot({ target: { ...slot.target, kind: 'volume', deviceIndex: null, parameterIndex: 0 } });
  assert.deepEqual(plain(validateChange({ kind: 'prepare-slot', slot: mixer })).slot, mixer);
});

test('decoder never executes getters, accepts prototype tricks or echoes raw secret input', () => {
  const { validateExchange, validateFrame } = load();
  let reads = 0;
  const frame = makeFrame();
  Object.defineProperty(frame, 'values', { get() { reads++; throw Error('private secret'); }, enumerable: true });
  assert.throws(() => validateFrame(frame), { code: 'invalid_frame' });
  assert.equal(reads, 0);
  const malicious = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(() => validateExchange(malicious), { code: 'invalid_exchange' });
  const cyclic = makeExchange(); cyclic.frame = cyclic;
  for (const input of [cyclic, null, [], { ...makeExchange(), privateToken: 'private secret'.repeat(2000) }]) {
    assert.throws(() => validateExchange(input), (error) => error.code === 'invalid_exchange' && !error.message.includes('private secret'));
  }
  assert.equal({}.polluted, undefined);
});

test('snapshot settings are complete and failed ACKs remain readable without trusting their error text', () => {
  const { validateExchange } = load();
  const failed = makeExchange({ ack: { commandId: ids.command, ok: false,
    code: 'revision_conflict', snapshot: makeSnapshot() } });
  assert.equal(validateExchange(failed).ack.ok, false);
  const invalid = [makeSnapshot({ bpm: 0 }), makeSnapshot({ tempoAvailable: 1 }),
    makeSnapshot({ profile: 'midi' }), makeSnapshot({ revision: -1 }),
    makeSnapshot({ needsRelink: 'false' }), makeSnapshot({ deviceId: 'device-name' }),
    makeSnapshot({ settings: { sensitivity: .65 } })];
  for (const snapshot of invalid) assert.throws(() => validateExchange(makeExchange({ snapshot })), { code: 'invalid_exchange' });
  for (const patch of [{ code: 'C:/private/token' }, { ok: 1 }, { preparedId: 'name' }, { commandId: '' }]) {
    assert.throws(() => validateExchange(makeExchange({ ack: { ...failed.ack, ...patch } })), { code: 'invalid_exchange' });
  }
  const slots = Array.from({ length: 12 }, (_, slot) => makeSlot({ slot, descriptor: slot % 2 ? 'high' : 'kick' }));
  assert.equal(validateExchange(makeExchange({ snapshot: makeSnapshot({ slots }) })).snapshot.slots.length, 12);
});

test('each family, frame geometry and amplitude field is validated, not only one sample value', () => {
  const { validateFrame } = load();
  for (const sampleRate of [8000, 44100, 48000, 96000, 192000, 384000]) {
    assert.equal(validateFrame(makeFrame({ sampleRate })).sampleRate, sampleRate);
  }
  for (const patch of [{ sampleRate: 7999 }, { sampleRate: 384001 }, { sampleRate: '48000' },
    { signalVectorSize: 3 }, { signalVectorSize: 16384 }, { fftSize: 128 },
    { fftSize: 131072 }, { hopSize: 512 }, { seq: '1' }, { captureSample: .1 },
    { spectralReady: 1 }, { dspRunning: null }, { configRevision: Infinity },
    { amplitude: { rms: -1, envelope: 0 } }, { amplitude: { rms: 0 } },
    { peaks: { transient: 0, kick: 1.1, snare: 0 } }]) {
    assert.throws(() => validateFrame(makeFrame(patch)), { code: 'invalid_frame' });
  }
  for (const key of Object.keys(makeFrame().values)) {
    const frame = makeFrame(); frame.values[key] = NaN;
    assert.throws(() => validateFrame(frame), { code: 'invalid_frame' });
  }
});

test('plain JSON only: sparse arrays, class instances, hidden and symbol properties are rejected', () => {
  const { validateExchange } = load();
  const sparse = new Array(2); sparse[1] = makeSlot();
  const hidden = makeExchange(); Object.defineProperty(hidden, 'extra', { value: 1 });
  const hiddenKnown = makeExchange(); Object.defineProperty(hiddenKnown, 'instanceId', { enumerable: false });
  const symbol = makeExchange(); symbol[Symbol('private')] = 1;
  class Forged { constructor() { Object.assign(this, makeExchange()); } }
  for (const input of [makeExchange({ snapshot: makeSnapshot({ slots: sparse }) }), hidden, hiddenKnown, symbol, new Forged()]) {
    assert.throws(() => validateExchange(input), { code: 'invalid_exchange' });
  }
});
