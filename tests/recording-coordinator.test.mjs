// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { OSCTransport } from '../src/live/osc-transport.ts';
import { RecordingCoordinator } from '../src/live/recording-coordinator.ts';
import { CMD, GET, REC, REC_PREFLIGHT, CLIP } from '../src/osc-tokens.ts';

test('REC conservative getter addresses match public AbletonOSC handlers literally', () => {
  assert.deepEqual(REC_PREFLIGHT, {
    loop:'/live/song/get/loop', punchIn:'/live/song/get/punch_in', punchOut:'/live/song/get/punch_out',
    overdub:'/live/song/get/arrangement_overdub', backToArranger:'/live/song/get/back_to_arranger',
    sessionRecord:'/live/song/get/session_record', trackArm:'/live/track/get/arm', trackCanArm:'/live/track/get/can_be_armed',
    trackMonitor:'/live/track/get/current_monitoring_state', signatureNumerator:'/live/song/get/signature_numerator',
    signatureDenominator:'/live/song/get/signature_denominator',
  });
});

function fixture(t) {
  const osc = new OSCTransport();
  Object.assign(osc.state, { available: true, connected: true });
  const song = { tracks: [
    { name: 'Guitar', handle: { id: '11' }, arm: true },
    { name: 'Bass', handle: { id: '22' }, arm: false },
  ], cuePoints: [{ name: 'Verse', time: 8 }, { name: 'Chorus', time: 24 }] };
  const values = { playing: false, record: false, position: 0, click: false, monitor: 1,
    loop: false, punchIn: false, punchOut: false, overdub: false, backToArranger: false, sessionRecord: false };
  const sent = [];
  let block, current = true;
  const push = (address, args) => osc.handleIncoming({ oscType: 'message', address,
    args: args.map(value => ({ value })) });
  osc.send = (address, args = []) => {
    sent.push([address, args]);
    if (address === REC.setRecordMode) values.record = args[0].value === 1;
    if (address === REC.setMetronome) values.click = args[0].value === 1;
    if (address === REC.setSongTime) values.position = args[0].value;
    if (address === CMD.startPlaying) values.playing = true;
    if (address === CMD.stopPlaying) values.playing = false;
    if (block === address) return;
    let response;
    if (address === GET.isPlaying) response = [Number(values.playing)];
    if (address === REC.getRecordMode) response = [Number(values.record)];
    if (address === GET.currentSongTime) response = [values.position];
    if (address === GET.metronome) response = [Number(values.click)];
    if (address === CLIP.getTrackNames) response = song.tracks.map(track => track.name);
    if ([REC_PREFLIGHT.signatureNumerator, REC_PREFLIGHT.signatureDenominator].includes(address)) response = [4];
    for (const key of ['loop','punchIn','punchOut','overdub','backToArranger','sessionRecord']) {
      if (address === REC_PREFLIGHT[key]) response = [Number(values[key])];
    }
    const index = args[0]?.value;
    if (address === REC_PREFLIGHT.trackArm) response = [index, Number(song.tracks[index].arm)];
    if (address === REC_PREFLIGHT.trackCanArm) response = [index, 1];
    if (address === REC_PREFLIGHT.trackMonitor) response = [index, values.monitor];
    if (response) queueMicrotask(() => push(address, response));
  };
  const coordinator = new RecordingCoordinator(osc, () => song);
  const context = { clientId: 'phone-a', isCurrent: () => current };
  const select = async () => {
    await coordinator.refresh();
    return coordinator.selectTrack({ index: 0, id: '11', name: 'Guitar' }, context);
  };
  t.after(() => { coordinator.dispose(); osc.dispose(); });
  return { osc, coordinator, song, values, sent, context, select, push,
    block: address => { block = address; }, retire: () => { current = false; } };
}

test('REC complete flow prepares observed position/arm, starts once, stops, auditions disarmed, and retains return point', async t => {
  const f = fixture(t);
  await f.select();
  f.coordinator.setPoint(8, f.context);
  const ready = await f.coordinator.prepare(f.context);
  assert.ok(ready.preparedToken);
  const started = await f.coordinator.start(ready.preparedToken, f.context);
  assert.equal(started.transport.recordMode.value, true);
  const stopped = await f.coordinator.stop(f.context);
  assert.equal(stopped.lastAttempt.stopped, true);
  assert.equal(stopped.point, 8);
  await f.coordinator.audition(true, f.context);
  assert.equal(f.song.tracks[0].arm, false);
  assert.equal(f.values.record, false);
  assert.equal(f.values.playing, true);
  assert.equal(f.values.position, 8);
  assert.equal(f.sent.filter(([address]) => address === REC.setRecordMode && address.includes('set')).length, 2);
});

test('REC blocks each incompatible Arrangement mode without changing it or arming other tracks', async t => {
  const f = fixture(t);
  await f.select(); f.coordinator.setPoint(0, f.context);
  for (const key of ['loop','punchIn','punchOut','overdub','backToArranger','sessionRecord']) {
    f.values[key] = true;
    await assert.rejects(f.coordinator.prepare(f.context), /REC:/, key);
    assert.equal(f.values[key], true);
    f.values[key] = false;
  }
  f.song.tracks[1].arm = true;
  await assert.rejects(f.coordinator.prepare(f.context), /OTHER_ARMED/);
  assert.equal(f.song.tracks[1].arm, true);
  assert.equal(f.sent.some(([address]) => address === REC.setRecordMode), false);
});

test('REC requires current identity and arm again immediately before start', async t => {
  const f = fixture(t);
  await f.select(); f.coordinator.setPoint(0, f.context);
  let ready = await f.coordinator.prepare(f.context);
  f.song.tracks[0].arm = false;
  await assert.rejects(f.coordinator.start(ready.preparedToken, f.context), /TRACK_NOT_ARMED/);
  f.song.tracks[0].arm = true;
  ready = await f.coordinator.prepare(f.context);
  f.song.tracks[0].handle.id = '999';
  await assert.rejects(f.coordinator.start(ready.preparedToken, f.context), /IDENTITY/);
  assert.equal(f.sent.some(([address]) => address === REC.setRecordMode), false);
});

test('REC deduplicates a shared prepared start from two controllers and refuses token replay', async t => {
  const f = fixture(t);
  await f.select(); f.coordinator.setPoint(0, f.context);
  const ready = await f.coordinator.prepare(f.context);
  await Promise.all([f.coordinator.start(ready.preparedToken, f.context),
    f.coordinator.start(ready.preparedToken, { clientId: 'phone-b', isCurrent: () => true })]);
  assert.equal(f.sent.filter(([address, args]) => address === REC.setRecordMode && args[0].value === 1).length, 1);
  await assert.rejects(f.coordinator.start(ready.preparedToken, f.context), /PREPARE_REQUIRED/);
});

test('REC STOP cancels pending preparation, sends both writes immediately and ignores late callbacks', async t => {
  const f = fixture(t);
  await f.select(); f.coordinator.setPoint(0, f.context);
  f.block(REC_PREFLIGHT.loop);
  const preparing = f.coordinator.prepare(f.context);
  const rejected = assert.rejects(preparing, /STOPPED/);
  const stopping = f.coordinator.stop(f.context);
  assert.ok(f.sent.some(([address]) => address === CMD.stopPlaying));
  assert.ok(f.sent.some(([address, args]) => address === REC.setRecordMode && args[0].value === 0));
  await stopping; await rejected;
  f.push(REC_PREFLIGHT.loop, [0]);
  assert.equal(f.sent.some(([address]) => address === CMD.startPlaying), false);
});

test('REC retired socket and OSC loss never stop an already running recording', async t => {
  const f = fixture(t);
  await f.select(); f.coordinator.setPoint(0, f.context);
  const ready = await f.coordinator.prepare(f.context);
  await f.coordinator.start(ready.preparedToken, f.context);
  const writes = f.sent.filter(([address]) => address.includes('/set/') || address === CMD.stopPlaying).length;
  f.retire();
  await assert.rejects(f.coordinator.stop(f.context), /SESSION/);
  f.osc.state.lastSeenAt = Date.now() - 6000; f.osc.heartbeatTick();
  assert.equal(f.values.record, true);
  assert.equal(f.sent.filter(([address]) => address.includes('/set/') || address === CMD.stopPlaying).length, writes);
  assert.equal(f.coordinator.snapshot().preparedToken, null);
});

test('REC markers choose verified points without duplicate-name jumps, and audition refuses Monitor In', async t => {
  const f = fixture(t);
  await f.select(); f.coordinator.setPoint(0, f.context);
  assert.equal(f.coordinator.chooseLocator('next', f.context).point, 8);
  assert.equal(f.coordinator.chooseLocator('next', f.context).point, 24);
  assert.equal(f.coordinator.chooseLocator('previous', f.context).point, 8);
  f.values.monitor = 0;
  await assert.rejects(f.coordinator.audition(true, f.context), /MONITOR_IN/);
  assert.equal(f.values.playing, false);
});

test('REC missing preflight getter times out unknown; a late report never records', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date'], now:10000});
  const f = fixture(t); await f.select(); f.coordinator.setPoint(0,f.context);
  f.block(REC_PREFLIGHT.punchIn);
  const preparing = f.coordinator.prepare(f.context), rejected = assert.rejects(preparing,/UNKNOWN/);
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(2001); await rejected;
  assert.equal(f.coordinator.snapshot().safety.punchIn,null);
  assert.equal(f.coordinator.snapshot().preparedToken,null);
  f.push(REC_PREFLIGHT.punchIn,[0]);
  assert.equal(f.sent.some(([address]) => address === REC.setRecordMode),false);
  assert.equal(f.coordinator.listenerCount('observation'),0);
});

test('REC explicit arm requires new OSC confirmation; never trusts the SDK setter alone', async t => {
  const f = fixture(t); await f.select();
  Object.defineProperty(f.song.tracks[0],'arm',{get:()=>false,set:()=>{}});
  await assert.rejects(f.coordinator.arm(true,f.context),/ARM_UNCONFIRMED/);
  assert.equal(f.coordinator.snapshot().tracks[0].arm,false);
  assert.equal(f.song.tracks[1].arm,false);
});

test('REC retired socket between record mode and playback cannot cause delayed play or an automatic stop', async t => {
  const f = fixture(t); await f.select(); f.coordinator.setPoint(0,f.context);
  const ready = await f.coordinator.prepare(f.context), original = f.osc.send;
  f.osc.send = (address,args) => {
    original(address,args);
    if (address === REC.setRecordMode && args[0].value === 1) f.retire();
  };
  await assert.rejects(f.coordinator.start(ready.preparedToken,f.context),/SESSION/);
  assert.equal(f.values.record,true);
  assert.equal(f.sent.some(([address]) => address === CMD.startPlaying || address === CMD.stopPlaying),false);
});

test('REC concurrent STOP deduplicates; unknown transport never blocks its immediate two writes', async t => {
  const f = fixture(t);
  const first = f.coordinator.stop(f.context), second = f.coordinator.stop({clientId:'b',isCurrent:()=>true});
  assert.equal(f.sent.filter(([address]) => address === CMD.stopPlaying).length,1);
  assert.equal(f.sent.filter(([address]) => address === REC.setRecordMode).length,1);
  const result = await first; await second;
  assert.equal(result.preflightComplete,false);
  assert.equal(result.captureVerified,false);
});

test('REC no current session means no local workflow mutation, OSC or SDK write', async t => {
  const f = fixture(t); await f.select(); f.retire(); const count = f.sent.length;
  for (const action of [()=>f.coordinator.arm(true),()=>f.coordinator.prepare(f.context),()=>f.coordinator.click(true,f.context),()=>f.coordinator.audition(true,f.context)]) await assert.rejects(action(),/SESSION/);
  assert.throws(()=>f.coordinator.setPoint(2,f.context),/SESSION/);
  assert.equal(f.sent.length,count);
});

test('REC multi-track getter overflow cannot masquerade as listener push and hide recovery',async t => {
  const f=fixture(t); await f.select();
  f.osc.lastPushAt=100;
  for(let index=0;index<20;index++) f.osc.expectReply(REC_PREFLIGHT.trackArm);
  for(let index=0;index<20;index++) f.push(REC_PREFLIGHT.trackArm,[index,0]);
  assert.equal(f.osc.lastPushAt,100);
  f.push(REC_PREFLIGHT.signatureNumerator,[3]);
  assert.ok(f.osc.lastPushAt>100,'genuine meter listener push remains evidence');
});
