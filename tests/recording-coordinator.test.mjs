// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import * as oscCodec from 'osc-min';
import { OSCTransport } from '../src/live/osc-transport.ts';
import { RecordingCoordinator } from '../src/live/recording-coordinator.ts';
import { CMD, GET, REC, REC_LOOP, REC_PREFLIGHT, CLIP } from '../src/osc-tokens.ts';

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
  let song = { tracks: [
    { name: 'Guitar', handle: { id: '11' }, arm: true },
    { name: 'Bass', handle: { id: '22' }, arm: false },
  ], cuePoints: [{ name: 'Verse', time: 8 }, { name: 'Chorus', time: 24 }] };
  const values = { playing: false, record: false, position: 0, click: false, monitor: 1,
    loop: false, loopStart:0, loopLength:4, punchIn: false, punchOut: false, overdub: false, backToArranger: false, sessionRecord: false };
  const sent = [];
  let block, current = true;
  // AbletonOSC's pythonosc builder preserves Python bool as OSC T/F tags.
  // Exercise the real codec and OSCTransport entry, including index-prefixed
  // track getters, rather than converting booleans into integers in a mock.
  const push = (address, args) => osc.handleIncoming(oscCodec.fromBuffer(oscCodec.toBuffer({ address,
    args: args.map(value => ({ type: typeof value === 'boolean' ? (value ? 'true' : 'false')
      : typeof value === 'string' ? 'string' : value === null ? 'null' : Number.isInteger(value) ? 'integer' : 'float', value })) })));
  osc.send = (address, args = []) => {
    sent.push([address, args]);
    if (address === REC.setRecordMode) values.record = args[0].value === 1;
    if (address === REC.setMetronome) values.click = args[0].value === 1;
    if (address === REC.setSongTime) values.position = args[0].value;
    if (address === REC_LOOP.setEnabled) values.loop = args[0].value === 1;
    if (address === REC_LOOP.setStart) values.loopStart = args[0].value;
    if (address === REC_LOOP.setLength) values.loopLength = args[0].value;
    if (address === CMD.startPlaying) values.playing = true;
    if (address === CMD.stopPlaying) values.playing = false;
    if (address === CMD.cuePointJump) values.position = song.cuePoints[args[0].value].time;
    if (block === address) return;
    let response;
    if (address === GET.isPlaying) response = [values.playing];
    if (address === REC.getRecordMode) response = [values.record];
    if (address === GET.currentSongTime) response = [values.position];
    if (address === GET.metronome) response = [values.click];
    if (address === REC_LOOP.getStart) response = [values.loopStart];
    if (address === REC_LOOP.getLength) response = [values.loopLength];
    if (address === CLIP.getTrackNames) response = song.tracks.map(track => track.name);
    if ([REC_PREFLIGHT.signatureNumerator, REC_PREFLIGHT.signatureDenominator].includes(address)) response = [4];
    for (const key of ['loop','punchIn','punchOut','overdub','backToArranger','sessionRecord']) {
      if (address === REC_PREFLIGHT[key]) response = [values[key]];
    }
    const index = args[0]?.value;
    if (address === REC_PREFLIGHT.trackArm) response = [index, song.tracks[index].arm];
    if (address === REC_PREFLIGHT.trackCanArm) response = [index, true];
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
    block: address => { block = address; }, retire: () => { current = false; }, replaceSong: replacement => { song = replacement; } };
}

test('REC real OSC boolean replies preserve preflight flags and track armability', async t => {
  const f = fixture(t);
  const state = await f.coordinator.refresh();
  assert.deepEqual(state.safety,{loop:false,punchIn:false,punchOut:false,overdub:false,backToArranger:false,sessionRecord:false});
  assert.equal(state.tracks[0].arm,true);
  assert.equal(state.tracks[0].canArm,true);
  assert.equal(state.tracks[1].arm,false);
  assert.equal(state.tracks.filter(track=>track.canArm===true).length,2);
  assert.equal(state.transport.recordMode.value,false);
  assert.equal(state.transport.recordMode.fresh,true);
  assert.equal(state.preflightComplete,false);
  assert.equal(f.sent.some(([address])=>address.includes('/set/')),false);
});

test('REC background refresh keeps last valid observations and yields immediately to a user action', async t => {
  const f=fixture(t);await f.select();
  const pending=f.coordinator.refresh();const result=pending.catch(error=>error);
  const during=f.coordinator.snapshot();
  assert.equal(during.pending,null,'a read is not a blocking performance operation');
  assert.equal(during.safety.loop,false);assert.equal(during.tracks[0].arm,true);
  assert.equal(during.transport.isPlaying.fresh,true);
  assert.doesNotThrow(()=>f.coordinator.selectTrack({index:0,id:'11',name:'Guitar'},f.context));
  await result;
  assert.equal(f.sent.some(([address])=>address.includes('/set/')),false);
});

test('REC concurrent passive reads share evidence and a failed refresh cannot revoke prepared intent',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});
  const f=fixture(t);await f.select();f.coordinator.setPoint(8,f.context);
  const ready=await f.coordinator.prepare(f.context),token=ready.preparedToken;
  const first=f.coordinator.refresh(),second=f.coordinator.refresh();
  const [a,b]=await Promise.all([first,second]);
  assert.equal(a,b);assert.equal(a.preparedToken,token);assert.equal(a.safety.loop,false);
  f.block(REC_PREFLIGHT.loop);
  const reading=f.coordinator.refresh(),rejected=assert.rejects(reading,/UNKNOWN/);
  for(let i=0;i<8;i++)await Promise.resolve();t.mock.timers.tick(2001);await rejected;
  assert.equal(f.coordinator.snapshot().preparedToken,token,'a read failure cannot cancel an explicit user choice');
  f.block(undefined);await f.coordinator.refresh();
  assert.equal(f.coordinator.snapshot().safety.loop,false);assert.equal(f.coordinator.snapshot().preparedToken,token);
});

test('REC boolean observations accept T/F and integer 0/1 only; monitor remains an integer enum', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:10000});
  const f=fixture(t);await f.select();
  for(const raw of [true,1,false,0]) {
    const expected=raw===true || raw===1;
    f.push(REC_PREFLIGHT.loop,[raw]);f.push(REC_PREFLIGHT.trackArm,[0,raw]);f.push(REC_PREFLIGHT.trackCanArm,[0,raw]);
    const state=f.coordinator.snapshot();
    assert.equal(state.safety.loop,expected);assert.equal(state.tracks[0].arm,expected);assert.equal(state.tracks[0].canArm,expected);
  }
  t.mock.timers.tick(2001);
  for(const raw of ['true','false','0','1',2,-1,null,.5,NaN,Infinity]) {
    f.push(REC_PREFLIGHT.loop,[raw]);f.push(REC_PREFLIGHT.trackArm,[0,raw]);f.push(REC_PREFLIGHT.trackCanArm,[0,raw]);
    const state=f.coordinator.snapshot();
    assert.equal(state.safety.loop,null,String(raw));assert.equal(state.tracks[0].arm,null,String(raw));assert.equal(state.tracks[0].canArm,null,String(raw));
  }
  f.push(REC_PREFLIGHT.punchIn,[false,0]);f.push(REC_PREFLIGHT.trackArm,[0,false,0]);
  f.push(REC_PREFLIGHT.trackCanArm,[-1,true]);f.push(REC_PREFLIGHT.trackCanArm,[.5,true]);
  f.push(REC_PREFLIGHT.trackMonitor,[0,true]);
  assert.equal(f.coordinator.snapshot().safety.punchIn,null);
  assert.equal(f.coordinator.snapshot().tracks[0].arm,null);
  assert.equal(f.coordinator.snapshot().tracks[0].canArm,null);
  assert.equal(f.coordinator.snapshot().tracks[0].monitor,null);
  for(const raw of [0,1,2]) {f.push(REC_PREFLIGHT.trackMonitor,[0,raw]);assert.equal(f.coordinator.snapshot().tracks[0].monitor,raw);}
});

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
  await assert.rejects(f.coordinator.arm(true,recordingTrack,f.context),/ARM_UNCONFIRMED/);
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

const recordingTrack={index:0,id:'11',name:'Guitar'};
const markerRange=(loop=false)=>({start:{name:'Verse',time:8},end:loop?{name:'Chorus',time:24}:null,loop});

test('manual arm rejects a different controller selection before any SDK or OSC writes',async t=>{
  const f=fixture(t),writes=[];let firstArm=false,secondArm=false;
  Object.defineProperty(f.song.tracks[0],'arm',{get:()=>firstArm,set:value=>{firstArm=value;writes.push([0,value]);}});
  Object.defineProperty(f.song.tracks[1],'arm',{get:()=>secondArm,set:value=>{secondArm=value;writes.push([1,value]);}});
  await f.select();const viewed={...f.coordinator.snapshot().selected};
  const other={clientId:'phone-b',isCurrent:()=>true};
  f.coordinator.selectTrack({index:1,id:'22',name:'Bass'},other);
  const before=f.sent.length;
  await assert.rejects(f.coordinator.arm(true,viewed,f.context),/IDENTITY/);
  assert.deepEqual(writes,[]);assert.equal(firstArm,false);assert.equal(secondArm,false);
  assert.equal(f.sent.length,before,'reject the obsolete track binding before even starting a new read');
  assert.equal(f.coordinator.snapshot().selected.id,'22','rejecting client A must not replace client B selection');
});

test('manual arm requires an exact track reference and rechecks SDK identity after its read',async t=>{
  const f=fixture(t);await f.select();let writes=0;
  Object.defineProperty(f.song.tracks[0],'arm',{get:()=>false,set:()=>{writes++;}});
  const before=f.sent.length;
  for(const track of [undefined,null,{...recordingTrack,id:'old'},{...recordingTrack,name:'Renamed'},{...recordingTrack,index:1},{...recordingTrack,extra:true}]) {
    await assert.rejects(f.coordinator.arm(true,track,f.context),/IDENTITY/);
  }
  assert.equal(f.sent.length,before);assert.equal(writes,0);
  const send=f.osc.send;let replaced=false;
  f.osc.send=(address,args)=>{send(address,args);if(address===GET.currentSongTime && !replaced){replaced=true;f.song.tracks[0].handle.id='replacement';}};
  await assert.rejects(f.coordinator.arm(true,recordingTrack,f.context),/IDENTITY/);
  assert.equal(writes,0);assert.equal(f.sent.slice(before).some(([address])=>address.includes('/set/')),false);
});

test('manual arm cannot write when its client retires during the confirmation read',async t=>{
  const f=fixture(t);await f.select();let writes=0;
  Object.defineProperty(f.song.tracks[0],'arm',{get:()=>false,set:()=>{writes++;}});
  const send=f.osc.send;
  f.osc.send=(address,args)=>{send(address,args);if(address===GET.currentSongTime)f.retire();};
  await assert.rejects(f.coordinator.arm(true,recordingTrack,f.context),/SESSION/);
  assert.equal(writes,0);
});

function barNineLoopFixture(t) {
  const f=fixture(t);
  f.song.tracks[0].arm=false;
  const range={start:{name:'REC',time:32},end:{name:'REC2',time:48},loop:true};
  f.song.cuePoints=[range.start,range.end];
  return {...f,range};
}
const flushRecording=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};

function insertMarkerFixture(t,autoPlayOnRecord=false) {
  const f=barNineLoopFixture(t),send=f.osc.send;
  let insertTime=8;
  f.song.cuePoints.unshift({name:'REC',time:8});
  f.osc.send=(address,args=[])=>{
    if(address===CMD.cuePointJump) insertTime=f.song.cuePoints[args[0].value].time;
    if(address===CMD.startPlaying || (autoPlayOnRecord && address===REC.setRecordMode && args[0]?.value===1)) {
      f.values.position=insertTime;f.values.playing=true;
    }
    send(address,args);
  };
  return f;
}

test('marker jump changes the persistent playback start using the verified numeric cue index, even with duplicate names',async t=>{
  const f=insertMarkerFixture(t);
  await f.coordinator.seekMarker(f.range.start,f.context);
  assert.equal(f.values.position,32);assert.equal(f.values.playing,false);
  f.osc.play();
  assert.equal(f.values.position,32,'normal header Play must start at the marker rather than the older insert point');
  assert.deepEqual(f.sent.filter(([address])=>address===CMD.cuePointJump),[[CMD.cuePointJump,[{type:'integer',value:1}]]]);
  assert.equal(f.sent.some(([address])=>address===REC.setSongTime),false);
});

test('marker jump revalidates name, time and index at the transport boundary before any locator packet',async t=>{
  const f=insertMarkerFixture(t),jump=f.osc.recording.jumpToMarker.bind(f.osc.recording);
  f.osc.recording.jumpToMarker=(index,time,guard)=>{
    f.song.cuePoints.reverse();
    return jump(index,time,guard);
  };
  await assert.rejects(f.coordinator.seekMarker(f.range.end,f.context),/MARKER_CHANGED/);
  assert.equal(f.sent.some(([address])=>address===CMD.cuePointJump || address===REC.setSongTime || address===CMD.startPlaying),false);
});

test('marker REC cannot enable record mode after its session retires during a locator jump',async t=>{
  const f=insertMarkerFixture(t),send=f.osc.send;
  f.osc.send=(address,args=[])=>{send(address,args);if(address===CMD.cuePointJump)f.retire();};
  await assert.rejects(f.coordinator.record(recordingTrack,{...f.range,end:null,loop:false},f.context),/SESSION/);
  assert.equal(f.values.position,32);assert.equal(f.values.record,false);assert.equal(f.values.playing,false);
  assert.equal(f.sent.some(([address])=>address===REC.setRecordMode || address===CMD.startPlaying || address===CMD.stopPlaying),false);
});

for(const automaticPlay of [false,true]) {
  test('marker REC starts at its marker when Start Playback with Record is '+automaticPlay,async t=>{
    const f=insertMarkerFixture(t,automaticPlay);
    await f.coordinator.record(recordingTrack,{...f.range,end:null,loop:false},f.context);
    assert.equal(f.values.position,32,'record mode must never restart from a stale insert marker');
    assert.equal(f.values.record,true);assert.equal(f.values.playing,true);
    const jumpIndex=f.sent.findIndex(([address])=>address===CMD.cuePointJump),recordIndex=f.sent.findIndex(([address])=>address===REC.setRecordMode);
    assert.ok(jumpIndex>=0 && jumpIndex<recordIndex);
    assert.equal(f.sent.filter(([address])=>address===CMD.startPlaying).length,automaticPlay?0:1);
    assert.equal(f.sent.some(([address])=>address===REC.setSongTime),false);
  });
}

test('loop confirmation waits through an old initial-poll reply before fresh 9.1 to 13.1 evidence',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});
  const f=barNineLoopFixture(t),send=f.osc.send;let afterSetter=false,staleReplies=0;
  f.osc.send=(address,args=[])=>{
    if(address===REC_LOOP.setLength)afterSetter=true;
    if(address===REC_LOOP.getLength && afterSetter && !staleReplies) {
      f.sent.push([address,args]);staleReplies++;
      queueMicrotask(()=>f.push(address,[4]));
      setTimeout(()=>f.push(address,[16]),25);
      return;
    }
    send(address,args);
  };
  let status='pending';
  const recording=f.coordinator.record(recordingTrack,f.range,f.context);
  const outcome=recording.then(value=>{status='success';return value;},error=>{status=error.message;throw error;});
  const caught=outcome.catch(error=>error);
  await flushRecording();
  assert.equal(status,'pending','an unmatched older reply is not a terminal setter failure');
  assert.equal(f.song.tracks[0].arm,false);assert.equal(f.values.record,false);
  t.mock.timers.tick(25);const result=await caught;
  assert.equal(status,'success',result?.message);
  assert.equal(result.loopRegion.start,32);assert.equal(result.loopRegion.length,16);
  assert.equal(f.values.playing,true);assert.equal(f.values.record,true);
  for(const address of [REC_LOOP.setLength,REC_LOOP.setStart,REC_LOOP.setEnabled]) assert.equal(f.sent.filter(([sent])=>sent===address).length,1);
});

test('loop confirmation polls getters for delayed observations without ever replaying a setter',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});
  const f=barNineLoopFixture(t),send=f.osc.send;let afterSetter=false,gets=0;
  f.osc.send=(address,args=[])=>{
    if(address===REC_LOOP.setLength)afterSetter=true;
    if(address===REC_LOOP.getLength && afterSetter && ++gets===1) {
      f.sent.push([address,args]);queueMicrotask(()=>f.push(address,[4]));return;
    }
    send(address,args);
  };
  let complete=false;
  const recording=f.coordinator.record(recordingTrack,f.range,f.context).then(value=>{complete=true;return value;});
  await flushRecording();assert.equal(f.song.tracks[0].arm,false);assert.equal(gets,1);
  t.mock.timers.tick(100);await flushRecording();assert.equal(complete,true,'a fresh retry GET must settle confirmation');const state=await recording;
  assert.equal(gets>=2,true);assert.equal(state.transport.recordMode.value,true);
  assert.equal(f.sent.filter(([address])=>address===REC_LOOP.setLength).length,1);
});

test('loop confirmation also waits for current start and canonical boolean enabled replies',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});
  const f=barNineLoopFixture(t),send=f.osc.send;let startSet=false,enabledSet=false,startOld=false,enabledOld=false;
  f.osc.send=(address,args=[])=>{
    if(address===REC_LOOP.setStart)startSet=true;
    if(address===REC_LOOP.setEnabled)enabledSet=true;
    if(address===REC_LOOP.getStart && startSet && !startOld) {
      startOld=true;f.sent.push([address,args]);queueMicrotask(()=>f.push(address,[0]));setTimeout(()=>f.push(address,[32]),25);return;
    }
    if(address===REC_PREFLIGHT.loop && enabledSet && !enabledOld) {
      enabledOld=true;f.sent.push([address,args]);queueMicrotask(()=>f.push(address,[false]));setTimeout(()=>f.push(address,[true]),25);return;
    }
    send(address,args);
  };
  const recording=f.coordinator.record(recordingTrack,f.range,f.context);
  await flushRecording();assert.equal(startOld,true);assert.equal(enabledSet,false);assert.equal(f.song.tracks[0].arm,false);
  t.mock.timers.tick(25);await flushRecording();assert.equal(enabledOld,true);assert.equal(f.song.tracks[0].arm,false);
  t.mock.timers.tick(25);await flushRecording();await recording;
  assert.equal(f.values.record,true);
  assert.deepEqual(f.sent.filter(([address])=>Object.values(REC_LOOP).includes(address) && address.includes('/set/')).map(([address])=>address),
    [REC_LOOP.setLength,REC_LOOP.setStart,REC_LOOP.setEnabled]);
});

test('loop confirmation permanent mismatch expires once with expected and observed details; late evidence cannot record',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});
  const f=barNineLoopFixture(t),send=f.osc.send;let afterSetter=false;
  f.osc.send=(address,args=[])=>{
    if(address===REC_LOOP.setLength)afterSetter=true;
    if(address===REC_LOOP.getLength && afterSetter) {f.sent.push([address,args]);queueMicrotask(()=>f.push(address,[4]));return;}
    send(address,args);
  };
  let status='pending';
  const result=f.coordinator.record(recordingTrack,f.range,f.context).then(value=>{status='success';return value;},error=>{status='failed';return error;});
  await flushRecording();assert.equal(status,'pending');
  t.mock.timers.tick(1999);await flushRecording();assert.equal(status,'pending');
  t.mock.timers.tick(1);await flushRecording();assert.equal(status,'failed');
  const error=await result;assert.match(error.message,/REC:LOOP_UNCONFIRMED.*loopLength expected=16 observed=4/);
  const before=f.sent.length;
  f.push(REC_LOOP.getLength,[16]);t.mock.timers.tick(5000);await flushRecording();
  assert.equal(f.sent.length,before,'timeout removes getter polling and every delayed continuation');
  assert.equal(f.song.tracks[0].arm,false);assert.equal(f.values.record,false);assert.equal(f.values.playing,false);
  assert.deepEqual(f.sent.filter(([address])=>address.includes('/set/')).map(([address])=>address),[REC_LOOP.setLength]);
  assert.equal(f.coordinator.listenerCount('observation'),0);
});

test('loop confirmation shares one two-second budget across length and start instead of resetting for each setter',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});
  const f=barNineLoopFixture(t),send=f.osc.send;let lengthSet=false,startSet=false;
  f.osc.send=(address,args=[])=>{
    if(address===REC_LOOP.setLength) {lengthSet=true;setTimeout(()=>f.push(REC_LOOP.getLength,[16]),1500);}
    if(address===REC_LOOP.setStart) {startSet=true;setTimeout(()=>f.push(REC_LOOP.getStart,[32]),1000);}
    if((address===REC_LOOP.getLength && lengthSet && Date.now()<11500) || (address===REC_LOOP.getStart && startSet && Date.now()<12500)) {
      f.sent.push([address,args]);queueMicrotask(()=>f.push(address,[address===REC_LOOP.getLength?4:0]));return;
    }
    send(address,args);
  };
  let status='pending';
  const result=f.coordinator.record(recordingTrack,f.range,f.context).then(value=>{status='success';return value;},error=>{status='failed';return error;});
  await flushRecording();t.mock.timers.tick(1500);await flushRecording();
  assert.equal(startSet,true);assert.equal(status,'pending');
  t.mock.timers.tick(500);await flushRecording();assert.equal(status,'failed','the second setter receives only the remaining budget');
  assert.match((await result).message,/REC:LOOP_UNCONFIRMED.*loopStart expected=32 observed=0/);
  t.mock.timers.tick(1000);await flushRecording();
  assert.equal(f.song.tracks[0].arm,false);assert.equal(f.values.record,false);
  assert.equal(f.sent.some(([address])=>address===REC_LOOP.setEnabled || address===CMD.startPlaying),false);
});

for(const interruption of ['STOP','retired session','OSC loss','changed track','Punch enabled']) {
  test('loop confirmation interrupted by '+interruption+' cannot issue later setters, arm or start',async t=>{
    t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});
    const f=barNineLoopFixture(t),send=f.osc.send;let afterSetter=false;
    f.osc.send=(address,args=[])=>{
      if(address===REC_LOOP.setLength)afterSetter=true;
      if(address===REC_LOOP.getLength && afterSetter) {f.sent.push([address,args]);queueMicrotask(()=>f.push(address,[4]));return;}
      send(address,args);
    };
    let settled=false;
    const result=f.coordinator.record(recordingTrack,f.range,f.context).then(value=>{settled=true;return value;},error=>{settled=true;return error;});
    await flushRecording();assert.equal(f.song.tracks[0].arm,false);
    if(interruption==='STOP') {
      const before=f.sent.length,stopping=f.coordinator.stop(f.context);
      assert.deepEqual(f.sent.slice(before,before+2),[[CMD.stopPlaying,[]],[REC.setRecordMode,[{type:'integer',value:0}]]]);
      await stopping;
    } else if(interruption==='retired session') {f.retire();t.mock.timers.tick(100);}
    else if(interruption==='OSC loss') {f.osc.state.lastSeenAt=Date.now()-6000;f.osc.heartbeatTick();}
    else if(interruption==='changed track') {f.song.tracks[0].handle.id='replaced';f.push(REC_LOOP.getLength,[16]);}
    else {f.values.punchIn=true;f.push(REC_PREFLIGHT.punchIn,[true]);}
    await flushRecording();
    assert.equal(settled,true,'unsafe or superseded confirmation must settle without waiting for its timeout');
    const error=await result;
    assert.match(error.message,interruption==='STOP'?/STOPPED/:interruption==='retired session'?/SESSION/:interruption==='OSC loss'?/CONNECTION/:interruption==='changed track'?/IDENTITY/:/PUNCHIN/);
    const before=f.sent.length;
    f.push(REC_LOOP.getLength,[16]);t.mock.timers.tick(3000);await flushRecording();
    if(interruption==='OSC loss') assert.equal(f.sent.slice(before).some(([address])=>address.includes('/set/') || address===CMD.stopPlaying),false,'reconnection may query but cannot replay a write');
    else assert.equal(f.sent.length,before);
    assert.equal(f.song.tracks[0].arm,false);assert.equal(f.values.record,false);assert.equal(f.values.playing,false);
    assert.equal(f.sent.some(([address])=>address===REC_LOOP.setStart || address===REC_LOOP.setEnabled || address===CMD.startPlaying),false);
    assert.equal(f.sent.filter(([address])=>address===REC_LOOP.setLength).length,1);
    assert.equal(f.coordinator.listenerCount('observation'),0);
    if(interruption!=='STOP') assert.equal(f.sent.some(([address])=>address===CMD.stopPlaying),false);
  });
}

test('marker REC owns arm/prepare internally; STOP disarms only its recorded track and marker playback uses no extra listen command',async t=>{
  const f=fixture(t);f.song.tracks[0].arm=false;
  const result=await f.coordinator.record(recordingTrack,markerRange(),f.context);
  assert.equal(result.transport.recordMode.value,true);assert.equal(result.transport.isPlaying.value,true);
  assert.equal(f.song.tracks[0].arm,true);assert.equal(f.values.position,8);
  assert.equal(f.sent.filter(([address])=>address===CMD.startPlaying).length,1);
  await f.coordinator.stop(f.context);
  assert.equal(f.song.tracks[0].arm,false);assert.equal(f.song.tracks[1].arm,false);
  const before=f.sent.length;
  await f.coordinator.seekMarker({name:'Verse',time:8},f.context);
  assert.equal(f.values.position,8);
  assert.equal(f.sent.slice(before).some(([address])=>address===CMD.startPlaying || address===REC.setRecordMode),false);
  await f.coordinator.record(recordingTrack,markerRange(),f.context);
  assert.equal(f.song.tracks[0].arm,true,'another REC explicitly arms again');
});

test('marker REC applies real Arrangement loop start/length and confirms all endpoints before recording',async t=>{
  const f=fixture(t);f.song.tracks[0].arm=false;
  const state=await f.coordinator.record(recordingTrack,markerRange(true),f.context);
  assert.equal(state.range.loop,true);assert.equal(f.values.loop,true);assert.equal(f.values.loopStart,8);assert.equal(f.values.loopLength,16);
  const setters=f.sent.filter(([address])=>address.includes('/set/'));
  assert.deepEqual(setters.slice(0,3),[[REC_LOOP.setLength,[{type:'float',value:16}]],[REC_LOOP.setStart,[{type:'float',value:8}]],[REC_LOOP.setEnabled,[{type:'integer',value:1}]]]);
  assert.ok(f.sent.findIndex(([address])=>address===REC_LOOP.setEnabled)<f.sent.findIndex(([address])=>address===REC.setRecordMode));
  await f.coordinator.stop(f.context);assert.equal(f.values.loop,true,'STOP retains the chosen region for normal header playback');
  await f.coordinator.record(recordingTrack,markerRange(false),f.context);assert.equal(f.values.loop,false,'explicit Loop off disables the previous Arrangement loop');
});

test('missing, reordered or changed marker endpoints and invalid ranges never start REC',async t=>{
  const f=fixture(t);
  for(const range of [{...markerRange(true),end:{name:'Verse',time:8}}, {...markerRange(true),start:{name:'Verse',time:9}}, {...markerRange(),loop:'true'}]) {
    await assert.rejects(f.coordinator.record(recordingTrack,range,f.context),/LOOP_RANGE|MARKER_CHANGED|ARGUMENTS/);
  }
  assert.equal(f.sent.some(([address])=>address.includes('/set/')),false);
  f.song.cuePoints.reverse();
  await f.coordinator.seekMarker({name:'Verse',time:8},f.context);assert.equal(f.values.position,8,'marker identity is name and exact position, not list index');
  await assert.rejects(f.coordinator.seekMarker({name:'Verse',time:24},f.context),/MARKER_CHANGED/);
});

test('a loop setter with no matching observed result cannot arm or record',async t=>{
  const f=fixture(t);f.song.tracks[0].arm=false;
  const send=f.osc.send;
  f.osc.send=(address,args)=>{if(address!==REC_LOOP.setStart)send(address,args);};
  const error=await f.coordinator.record(recordingTrack,markerRange(true),f.context).then(()=>null,error=>error);
  assert.equal(f.values.loop,false,'a rejected endpoint must not advance to enabling the global loop');
  assert.match(error?.message || 'unexpected success',/LOOP_UNCONFIRMED/);
  assert.equal(f.song.tracks[0].arm,false);assert.equal(f.sent.some(([address])=>address===REC.setRecordMode || address===CMD.startPlaying),false);
});

test('STOP between loop setters prevents late region/start writes and background reads cannot undo STOP',async t=>{
  const f=fixture(t);const send=f.osc.send;let stopping;
  f.osc.send=(address,args)=>{send(address,args);if(address===REC_LOOP.setLength)stopping=f.coordinator.stop(f.context);};
  await assert.rejects(f.coordinator.record(recordingTrack,markerRange(true),f.context),/STOPPED/);
  await stopping;
  assert.equal(f.sent.some(([address])=>address===REC_LOOP.setStart || address===CMD.startPlaying),false);
  assert.equal(f.values.record,false);assert.equal(f.values.playing,false);
});

test('marker REC never disarms another track or changes unrelated Punch/Session settings',async t=>{
  const f=fixture(t);f.song.tracks[0].arm=false;f.song.tracks[1].arm=true;
  await assert.rejects(f.coordinator.record(recordingTrack,markerRange(true),f.context),/OTHER_ARMED/);
  assert.equal(f.song.tracks[1].arm,true);assert.equal(f.song.tracks[0].arm,false);
  assert.equal(f.sent.some(([address])=>address.includes('/set/')),false);
});

test('STOP discards arm ownership when Song changes without an intervening refresh',async t=>{
  const f=fixture(t);f.song.tracks[0].arm=false;
  await f.coordinator.record(recordingTrack,markerRange(),f.context);
  const writes=[];
  const replacement={...f.song,tracks:f.song.tracks.map(track=>({...track,handle:{...track.handle}}))};
  let arm=true;
  Object.defineProperty(replacement.tracks[0],'arm',{get:()=>arm,set:value=>{writes.push(value);arm=value;}});
  replacement.tracks[1].arm=true;
  f.replaceSong(replacement);
  const before=f.sent.length;
  const stopped=await f.coordinator.stop(f.context);
  assert.deepEqual(writes,[],'matching track ids and names in another Song do not transfer ownership');
  assert.equal(replacement.tracks[0].arm,true);assert.equal(replacement.tracks[1].arm,true);
  assert.equal(stopped.selected,null);assert.equal(stopped.range,null);
  assert.deepEqual(f.sent.slice(before).filter(([address])=>address===CMD.stopPlaying || address===REC.setRecordMode),[
    [CMD.stopPlaying,[]],[REC.setRecordMode,[{type:'integer',value:0}]],
  ]);
  await f.coordinator.stop(f.context);assert.deepEqual(writes,[],'a later STOP cannot reclaim the previous Song ownership');
});

test('STOP immediately inside the SDK arm setter disarms its track before confirmation and never starts later',async t=>{
  const f=fixture(t),writes=[];let arm=false,stopping;
  Object.defineProperty(f.song.tracks[0],'arm',{get:()=>arm,set:value=>{
    writes.push(value);arm=value;
    if(value) {
      const before=f.sent.length;
      stopping=f.coordinator.stop(f.context);
      assert.deepEqual(f.sent.slice(before, before+2),[[CMD.stopPlaying,[]],[REC.setRecordMode,[{type:'integer',value:0}]]]);
    }
  }});
  const recording=f.coordinator.record(recordingTrack,markerRange(),f.context);
  await assert.rejects(recording,/STOPPED/);await stopping;
  assert.deepEqual(writes,[true,false]);assert.equal(arm,false);assert.equal(f.song.tracks[1].arm,false);
  f.push(REC_PREFLIGHT.trackArm,[0,true]);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(writes,[true,false],'late arm evidence does not replay the interrupted SDK setter');
  assert.equal(f.sent.some(([address,args])=>address===CMD.startPlaying || (address===REC.setRecordMode && args[0]?.value===1)),false);
  assert.equal(f.values.playing,false);assert.equal(f.values.record,false);
});
