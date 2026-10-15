// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { OSCTransport } from '../src/live/osc-transport.ts';
import { RECORDING_CONFIRM_MS, RECORDING_FRESH_MS } from '../src/live/recording-transport.ts';
import { CMD, GET, REC, REC_PREROLL, RESPONSE } from '../src/osc-tokens.ts';

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 });
  const osc = new OSCTransport();
  Object.assign(osc.state, { available: true, connected: true });
  const sent = [];
  osc.send = (address, args = []) => { sent.push([address, args]); };
  const push = (address, value) => osc.handleIncoming({ oscType: 'message', address, args: [{ value }] });
  const seed = () => {
    push(REC.getRecordMode, 0);
    push(RESPONSE.isPlaying, 0);
    push(RESPONSE.currentSongTime, 8);
    push(RESPONSE.metronome, 0);
  };
  t.after(() => osc.dispose());
  return { osc, rec: osc.recording, sent, push, seed };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const writes = sent => sent.filter(([address]) => address.includes('/set/') || Object.values(CMD).includes(address));

test('REC canonical addresses match the public AbletonOSC Song contract', () => {
  assert.deepEqual(REC, {
    listenRecordMode: '/live/song/start_listen/record_mode',
    getRecordMode: '/live/song/get/record_mode',
    setRecordMode: '/live/song/set/record_mode',
    setSongTime: '/live/song/set/current_song_time',
    setMetronome: '/live/song/set/metronome',
  });
  assert.deepEqual(REC_PREROLL,{continuePlaying:'/live/song/continue_playing',setPunchIn:'/live/song/set/punch_in'});
});

test('REC starts unknown and observes each field independently; legacy optimistic state is not evidence', t => {
  const { osc, rec, seed, push } = fixture(t);
  let state = rec.snapshot();
  assert.equal(state.preflightComplete, false);
  for (const field of ['recordMode', 'isPlaying', 'songTimeBeats', 'metronome']) {
    assert.deepEqual(state[field], { value: null, observedAt: null, fresh: false });
  }
  osc.play();
  assert.equal(osc.state.isPlaying, false, 'a play command is not a Live observation');
  osc.state.isPlaying = true; // A legacy caller changing the cache still cannot confirm REC state.
  assert.equal(rec.snapshot().isPlaying.value, null);
  seed();
  t.mock.timers.tick(RECORDING_FRESH_MS + 1);
  push(RESPONSE.currentSongTime, 9);
  state = rec.snapshot();
  assert.equal(state.songTimeBeats.fresh, true);
  assert.equal(state.recordMode.fresh, false);
  assert.equal(state.isPlaying.fresh, false);
  push(REC.getRecordMode, 'not-a-boolean');
  assert.equal(rec.snapshot().recordMode.fresh, false);
});

test('REC read waits for new observations, only reads, and joins listener recovery after activation', async t => {
  const { osc, rec, sent, push, seed } = fixture(t);
  seed();
  let done = false;
  const reading = rec.readState().then(state => { done = true; return state; });
  await flush();
  assert.equal(done, false, 'cached observations must not complete a new read');
  assert.equal(writes(sent).length, 0);
  assert.ok(sent.some(([address]) => address === REC.listenRecordMode));
  push(REC.getRecordMode, 0); push(RESPONSE.isPlaying, 0); push(RESPONSE.metronome, 0);
  await flush(); assert.equal(done, false);
  push(RESPONSE.currentSongTime, 8);
  assert.equal((await reading).recordMode.value, false);
  sent.length = 0;
  osc.registerListeners();
  assert.ok(sent.some(([address]) => address === REC.listenRecordMode));
  assert.equal(writes(sent).length, 0);
});

test('REC seek is a real finite beat write and refuses unknown, playing, or record-enabled preparation', async t => {
  const { rec, sent, push, seed } = fixture(t);
  await assert.rejects(rec.seek(16), /observed stopped/);
  seed();
  for (const value of [-1, NaN, Infinity, '16']) await assert.rejects(rec.seek(value), /finite non-negative/);
  const seek = rec.seek(16);
  assert.deepEqual(writes(sent), [[REC.setSongTime, [{ type: 'float', value: 16 }]]]);
  push(RESPONSE.currentSongTime, 15);
  let done = false; seek.then(() => { done = true; });
  await flush(); assert.equal(done, false);
  push(RESPONSE.currentSongTime, 16);
  assert.equal((await seek).songTimeBeats.value, 16);
  push(RESPONSE.isPlaying, 1);
  await assert.rejects(rec.seek(4), /observed stopped/);
  push(RESPONSE.isPlaying, 0); push(REC.getRecordMode, 1);
  await assert.rejects(rec.seek(4), /observed stopped/);
});

test('REC metronome uses an explicit integer setter and never confirms from its cache', async t => {
  const { rec, sent, push, seed } = fixture(t);
  seed();
  await assert.rejects(rec.setMetronome(1), /boolean/);
  const setting = rec.setMetronome(false);
  let done = false; setting.then(() => { done = true; });
  await flush(); assert.equal(done, false);
  assert.deepEqual(writes(sent), [[REC.setMetronome, [{ type: 'integer', value: 0 }]]]);
  push(RESPONSE.metronome, 0);
  assert.equal((await setting).metronome.value, false);
});

test('REC native marker jump waits for fresh position and stopped record-off evidence and validates its arguments',async t=>{
  const {rec,sent,push,seed}=fixture(t);
  await assert.rejects(rec.jumpToMarker(1,32),/observed stopped/);
  seed();
  for(const [index,beats] of [[-1,32],[.5,32],[1,-1],[1,NaN],[1,Infinity],['1',32]]) await assert.rejects(rec.jumpToMarker(index,beats),/non-negative finite/);
  let complete=false,guards=0;
  const jumping=rec.jumpToMarker(1,32,()=>{guards++;}).then(value=>{complete=true;return value;});
  assert.deepEqual(writes(sent),[[CMD.cuePointJump,[{type:'integer',value:1}]]]);
  push(RESPONSE.currentSongTime,32);await flush();assert.equal(complete,false,'cached stopped state cannot confirm a new locator jump');
  push(REC.getRecordMode,false);push(RESPONSE.isPlaying,true);await flush();assert.equal(complete,false);
  push(RESPONSE.isPlaying,false);const state=await jumping;
  assert.equal(guards,2);assert.equal(state.songTimeBeats.value,32);assert.equal(state.isPlaying.value,false);assert.equal(state.recordMode.value,false);
});

test('REC STOP supersedes a native marker jump before confirmation without repeating the jump or starting playback',async t=>{
  const {rec,sent,push,seed}=fixture(t);seed();
  const jumping=rec.jumpToMarker(1,32),rejected=assert.rejects(jumping,/superseded/);
  const before=sent.length,stopping=rec.stopRecording();
  assert.deepEqual(sent.slice(before,before+2),[[CMD.stopPlaying,[]],[REC.setRecordMode,[{type:'integer',value:0}]]]);
  push(RESPONSE.isPlaying,false);push(REC.getRecordMode,false);await stopping;await rejected;
  push(RESPONSE.currentSongTime,32);t.mock.timers.tick(3000);await flush();
  assert.deepEqual(writes(sent),[[CMD.cuePointJump,[{type:'integer',value:1}]],[CMD.stopPlaying,[]],[REC.setRecordMode,[{type:'integer',value:0}]]]);
});

test('REC native marker send failure rejects immediately and cannot be confirmed by a later reply',async t=>{
  const {rec,sent,push,seed}=fixture(t);seed();
  let failure;
  const jumping=rec.jumpToMarker(1,32).catch(error=>{failure=error;});
  rec.sendFailed(CMD.cuePointJump,Error('marker send failed'));await flush();
  assert.match(failure?.message || 'pending',/marker send failed/);await jumping;
  push(RESPONSE.currentSongTime,32);push(RESPONSE.isPlaying,false);push(REC.getRecordMode,false);
  assert.equal(rec.snapshot().pending,null);
  assert.deepEqual(writes(sent),[[CMD.cuePointJump,[{type:'integer',value:1}]]]);
});

test('REC mutating waits invalidate the previous field and return settled snapshots', async t => {
  const { rec, push, seed } = fixture(t);
  seed();
  const setting = rec.setMetronome(true);
  assert.equal(rec.snapshot().metronome.value, null, 'a pre-write value is not current state after dispatch');
  push(RESPONSE.metronome, 1);
  assert.equal((await setting).pending, null);
});

test('REC start observes record mode and rereads playback before sending start once', async t => {
  const { rec, sent, push, seed } = fixture(t);
  seed();
  const starting = rec.startRecording();
  assert.deepEqual(writes(sent), [[REC.setRecordMode, [{ type: 'integer', value: 1 }]]]);
  await assert.rejects(rec.startRecording(), /pending/);
  push(REC.getRecordMode, 1);
  await flush();
  assert.equal(writes(sent).length, 1);
  assert.equal(sent.at(-1)[0], GET.isPlaying);
  push(RESPONSE.isPlaying, 0);
  await flush();
  assert.equal(writes(sent).filter(([address]) => address === CMD.startPlaying).length, 1);
  push(RESPONSE.isPlaying, 1); push(REC.getRecordMode, 1);
  const state = await starting;
  assert.equal(state.recordMode.value, true);
  assert.equal(state.isPlaying.value, true);
  assert.equal(state.preflightComplete, false);
});

test('REC respects Live starting playback with Record and never sends a second start', async t => {
  const { rec, sent, push, seed } = fixture(t);
  seed();
  const starting = rec.startRecording();
  push(REC.getRecordMode, 1); push(RESPONSE.isPlaying, 1);
  await flush();
  push(RESPONSE.isPlaying, 1);
  await starting;
  assert.equal(writes(sent).filter(([address]) => address === CMD.startPlaying).length, 0);
});

test('REC STOP supersedes preparation immediately; late anonymous getters cannot start or complete the old operation', async t => {
  const { rec, sent, push, seed } = fixture(t);
  seed();
  const starting = rec.startRecording();
  const rejected = assert.rejects(starting, /superseded by stop/);
  const stopping = rec.stopRecording();
  assert.deepEqual(writes(sent).slice(-2), [
    [CMD.stopPlaying, []], [REC.setRecordMode, [{ type: 'integer', value: 0 }]],
  ]);
  push(REC.getRecordMode, 1); push(RESPONSE.isPlaying, 1);
  await flush(); await rejected;
  assert.equal(writes(sent).some(([address]) => address === CMD.startPlaying), false);
  let done = false; stopping.then(() => { done = true; });
  push(RESPONSE.isPlaying, 0);
  await flush(); assert.equal(done, false, 'STOP needs record disabled as well as transport stopped');
  push(REC.getRecordMode, 0);
  assert.equal((await stopping).recordMode.value, false);
});

test('REC STOP works with unknown state and sends both writes even when the first send fails', async t => {
  const { osc, rec, sent } = fixture(t);
  osc.state.connected = false;
  osc.send = (address, args = []) => {
    sent.push([address, args]);
    if (address === CMD.stopPlaying) throw new Error('fake send failure');
  };
  await assert.rejects(rec.stopRecording(), /fake send failure/);
  assert.deepEqual(writes(sent), [[CMD.stopPlaying, []], [REC.setRecordMode, [{ type: 'integer', value: 0 }]]]);
});

test('REC STOP also cancels the playback-read phase after record mode was observed', async t => {
  const { rec, sent, push, seed } = fixture(t);
  seed();
  const starting = rec.startRecording();
  const rejected = assert.rejects(starting, /superseded by stop/);
  push(REC.getRecordMode, 1);
  await flush();
  const stopping = rec.stopRecording();
  push(RESPONSE.isPlaying, 0); push(REC.getRecordMode, 0);
  await rejected; await stopping;
  push(RESPONSE.isPlaying, 0);
  await flush();
  assert.equal(writes(sent).some(([address]) => address === CMD.startPlaying), false);
});

test('REC STOP cancels a pending seek and waits for fresh observations of both off states', async t => {
  const { rec, push, seed } = fixture(t);
  seed();
  const seeking = rec.seek(32);
  const rejected = assert.rejects(seeking, /superseded by stop/);
  const stopping = rec.stopRecording();
  let done = false; stopping.then(() => { done = true; });
  push(RESPONSE.currentSongTime, 32);
  await rejected; await flush();
  assert.equal(done, false, 'cached off states must not acknowledge STOP');
  push(REC.getRecordMode, 0); push(RESPONSE.isPlaying, 0);
  await stopping;
});

test('REC synchronous STOP inside a send leaves only reads from the superseded start batch', async t => {
  const { osc, rec, sent, push, seed } = fixture(t);
  seed();
  let stopping;
  osc.send = (address, args = []) => {
    sent.push([address, args]);
    if (address === REC.setRecordMode && args[0].value === 1) stopping = rec.stopRecording();
  };
  const starting = rec.startRecording();
  const rejected = assert.rejects(starting, /superseded by stop/);
  assert.deepEqual(writes(sent), [
    [REC.setRecordMode, [{ type: 'integer', value: 1 }]],
    [CMD.stopPlaying, []], [REC.setRecordMode, [{ type: 'integer', value: 0 }]],
  ]);
  push(RESPONSE.isPlaying, 0); push(REC.getRecordMode, 0);
  await rejected; await stopping;
  assert.equal(rec.listenerCount('observation'), 0);
});

test('REC OSC loss rejects a pending start; recovery and disposal never stop Live', async t => {
  const { osc, rec, sent, push, seed } = fixture(t);
  seed();
  const starting = rec.startRecording();
  const rejected = assert.rejects(starting, /lost/);
  const count = writes(sent).length;
  osc.state.lastSeenAt = Date.now() - 6000;
  osc.heartbeatTick();
  await rejected;
  push(RESPONSE.tempo, 120);
  await flush();
  assert.equal(writes(sent).length, count);
  let disposed;
  rec.on('update', state => { disposed = state; });
  osc.dispose();
  assert.equal(disposed.connected, false);
  assert.equal(disposed.recordMode.value, null);
  assert.equal(writes(sent).length, count);
});

test('REC timeout and OSC loss invalidate pending work without replay or a disconnect stop', async t => {
  const { osc, rec, sent, push, seed } = fixture(t);
  seed();
  const starting = rec.startRecording();
  const timedOut = assert.rejects(starting, /not observed/);
  t.mock.timers.tick(RECORDING_CONFIRM_MS + 1);
  await timedOut;
  assert.equal(rec.snapshot().recordMode.value, null, 'timeout with no new report leaves record mode unknown');
  assert.equal(rec.listenerCount('observation'), 0);
  push(REC.getRecordMode, 1); push(RESPONSE.isPlaying, 1);
  await flush();
  assert.equal(writes(sent).filter(([address]) => address === CMD.startPlaying).length, 0);
  const count = writes(sent).length;
  osc.state.lastSeenAt = Date.now() - 6000;
  osc.heartbeatTick();
  assert.equal(rec.snapshot().recordMode.value, null);
  assert.equal(writes(sent).length, count);
  push(RESPONSE.tempo, 120);
  osc.registerListeners();
  assert.equal(writes(sent).length, count);
});

test('REC polling refreshes stale individual fields even when unrelated pushes keep OSC alive', t => {
  const { osc, rec, sent, push } = fixture(t);
  rec.requestState();
  sent.length = 0;
  t.mock.timers.tick(RECORDING_FRESH_MS + 1);
  push(RESPONSE.tempo, 121);
  osc.pollTick();
  for (const address of [REC.getRecordMode, GET.isPlaying, GET.currentSongTime, GET.metronome]) {
    assert.ok(sent.some(([value]) => value === address), address);
  }
  assert.equal(writes(sent).length, 0);
});
