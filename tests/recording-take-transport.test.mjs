// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The take-lane mark against the real REC transport.
//
// The mark service, the take-lane catalog and the AbletonOSC transport are
// real here. Only the socket is replaced: the OSC send is spied and the
// replies are fed back by hand, so no Live, no UDP and no timing luck are
// involved. The note read is the bounded read-only lane: it observes the
// transport without ever taking the transport-wide operation slot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { OSCTransport } from '../src/live/osc-transport.ts';
import { CMD, REC, RESPONSE } from '../src/osc-tokens.ts';
import { context, makeWorld } from './recording-take-marking-fixtures.mjs';

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 });
  const osc = new OSCTransport();
  Object.assign(osc.state, { available: true, connected: true });
  const sent = [];
  osc.send = (address, args = []) => { sent.push([address, args]); };
  const push = (address, value) => osc.handleIncoming({ oscType: 'message', address, args: [{ value }] });
  t.after(() => osc.dispose());
  return { osc, rec: osc.recording, sent, push };
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
/** One fresh report of both fields, as Live would send it. */
const report = (push, recordMode, isPlaying) => {
  push(REC.getRecordMode, recordMode);
  push(RESPONSE.isPlaying, isPlaying);
};

test('a take mark observes the real transport before it writes one clip name', async t => {
  const { rec, sent, push } = fixture(t);
  const world = makeWorld({ readTransport: signal => rec.readNoteState(signal), attemptActive: false });
  report(push, 0, 0);
  const pending = world.marking.mark(world.request('good'), context());
  await flush();
  assert.deepEqual(world.writes, [], 'no name is written before the transport is observed');
  report(push, 0, 0);
  await flush();
  assert.deepEqual(world.writes, [], 'the setter waits for a second fresh observation');
  report(push, 0, 0);
  await flush();
  assert.deepEqual(world.writes, ['clip.name'], 'the one name write follows the second observation');
  report(push, 0, 0);
  await flush();
  const result = await pending;
  assert.equal(result.clip.name, '[RC:GOOD] Take 1');
  assert.deepEqual(world.writes, ['clip.name'], 'exactly one name write');
  assert.equal(sent.filter(([address]) => address.includes('/set/')).length, 0, 'the mark never writes the transport');
});

test('a REC that starts during a mark refuses it without writing a name', async t => {
  const { rec, sent, push } = fixture(t);
  const world = makeWorld({ readTransport: signal => rec.readNoteState(signal), attemptActive: false });
  report(push, 0, 0);
  const pending = world.marking.mark(world.request('good'), context());
  await flush();
  const starting = rec.startRecording();
  await flush();
  assert.equal(rec.snapshot().pending, 'start', 'the REC write keeps the transport lane');
  report(push, 1, 1);
  await flush();
  await assert.rejects(pending, /REC:NOT_STOPPED/);
  assert.deepEqual(world.writes, [], 'no clip name is written while REC runs');
  report(push, 1, 1);
  await flush();
  const started = await starting;
  assert.equal(started.recordMode.value, true, 'the REC start itself succeeds');
  assert.equal(started.isPlaying.value, true);
  assert.equal(sent.filter(([address]) => address === CMD.startPlaying).length, 0);
});

test('a STOP cancels the pending note read while the real STOP write continues', async t => {
  const { rec, sent, push } = fixture(t);
  const world = makeWorld({ readTransport: signal => rec.readNoteState(signal), attemptActive: false });
  report(push, 0, 0);
  const pending = world.marking.mark(world.request('good'), context());
  await flush();
  world.marking.cancel();
  await assert.rejects(pending, /REC:MARK_CANCELED/);
  assert.deepEqual(world.writes, [], 'a canceled mark never writes a name');
  assert.equal(rec.listenerCount('observation'), 0, 'the canceled note read retires its waiters');
  const stopping = rec.stopRecording();
  await flush();
  assert.ok(sent.some(([address]) => address === CMD.stopPlaying), 'the real STOP write is sent');
  report(push, 0, 0);
  await stopping;
  assert.equal(rec.snapshot().pending, null);
});
