// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import * as oscCodec from 'osc-min';
import { OSCTransport } from '../src/live/osc-transport.ts';
import { RecordingCoordinator } from '../src/live/recording-coordinator.ts';
import { CMD, GET, REC, REC_LOOP, REC_PREFLIGHT, REC_PREROLL, CLIP } from '../src/osc-tokens.ts';

test('REC conservative getter addresses match public AbletonOSC handlers literally', () => {
  assert.deepEqual(REC_PREFLIGHT, {
    loop:'/live/song/get/loop', punchIn:'/live/song/get/punch_in', punchOut:'/live/song/get/punch_out',
    overdub:'/live/song/get/arrangement_overdub', backToArranger:'/live/song/get/back_to_arranger',
    sessionRecord:'/live/song/get/session_record', trackArm:'/live/track/get/arm', trackCanArm:'/live/track/get/can_be_armed',
    trackSolo:'/live/track/get/solo',trackMute:'/live/track/get/mute',
    trackMonitor:'/live/track/get/current_monitoring_state', signatureNumerator:'/live/song/get/signature_numerator',
    signatureDenominator:'/live/song/get/signature_denominator',
  });
});

function fixture(t,nativePositioning=false) {
  const osc = new OSCTransport();
  Object.assign(osc.state, { available: true, connected: true });
  let song = { tracks: [
    { name: 'Guitar', handle: { id: '11' }, arm: true,solo:false,mute:false },
    { name: 'Bass', handle: { id: '22' }, arm: false,solo:false,mute:false },
  ], cuePoints: [{ name: 'Verse', time: 8 }, { name: 'Chorus', time: 24 }] };
  const values = { playing: false, record: false, position: 0, stoppedResume:0, insertion:0, click: false, monitor: 1,
    loop: false, loopStart:0, loopLength:4, punchIn: false, punchOut: false, overdub: false, backToArranger: false, sessionRecord: false,
    numerator:4, denominator:4, tempo:120 };
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
    if (address === REC_PREROLL.setPunchIn) values.punchIn = args[0].value === 1;
    if (address === '/live/song/continue_playing') {values.position=values.stoppedResume;values.playing=true;}
    if (address === CMD.startPlaying) {if(nativePositioning && !values.playing) values.position=values.insertion;values.playing=true;}
    if (address === CMD.stopPlaying) {if(values.playing) values.stoppedResume=values.position;values.playing = false;}
    if (address === CMD.cuePointJump) values.position = values.insertion = song.cuePoints[args[0].value].time;
    if (block === address) return;
    let response;
    if (address === GET.isPlaying) response = [values.playing];
    if (address === REC.getRecordMode) response = [values.record];
    if (address === GET.currentSongTime) response = [values.position];
    if (address === GET.metronome) response = [values.click];
    if (address === REC_LOOP.getStart) response = [values.loopStart];
    if (address === REC_LOOP.getLength) response = [values.loopLength];
    if (address === CLIP.getTrackNames) response = song.tracks.map(track => track.name);
    if (address === REC_PREFLIGHT.signatureNumerator) response = [values.numerator];
    if (address === REC_PREFLIGHT.signatureDenominator) response = [values.denominator];
    if (address === GET.tempo) response = [values.tempo];
    for (const key of ['loop','punchIn','punchOut','overdub','backToArranger','sessionRecord']) {
      if (address === REC_PREFLIGHT[key]) response = [values[key]];
    }
    const index = args[0]?.value;
    if (address === REC_PREFLIGHT.trackArm) response = [index, song.tracks[index].arm];
    if (address === REC_PREFLIGHT.trackSolo) response = [index, song.tracks[index].solo];
    if (address === REC_PREFLIGHT.trackMute) response = [index, song.tracks[index].mute];
    if (address === REC_PREFLIGHT.trackCanArm) response = [index, song.tracks[index].canArm??true];
    if (address === REC_PREFLIGHT.trackMonitor) response = [index, song.tracks[index].monitor??values.monitor];
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

function preRollFixture(t) {
  t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});
  const f=fixture(t,true);
  f.song.tracks[0].arm=false;
  f.song.cuePoints=[{name:'Take',time:32,handle:{id:'cue-take'}},{name:'End',time:64,handle:{id:'cue-end'}}];
  f.cueWrites=[];let cueId=0;
  f.song.createCuePoint=async time=>{
    const cue={name:'Locator',time,handle:{id:'own-cue-'+(++cueId)}};
    f.song.cuePoints.push(cue);f.cueWrites.push(['create',cue.handle.id,time]);return cue;
  };
  f.song.deleteCuePoint=async cue=>{
    f.cueWrites.push(['delete',cue.handle.id,cue.time]);
    f.song.cuePoints=f.song.cuePoints.filter(item=>item.handle.id!==cue.handle.id);
  };
  f.values.stoppedResume=57.549;f.values.insertion=32;
  f.values.loopStart=4;
  f.range={start:{name:'Take',time:32},end:null,loop:false};
  return f;
}
const preRollWrites=f=>f.sent.filter(([address])=>address.includes('/set/') || address===CMD.startPlaying || address===CMD.stopPlaying);

test('REC pre-roll accepts only OFF/1/2/4 and refuses negative lead-in before writing or arming',async t=>{
  const f=preRollFixture(t);
  for(const bars of [-1,3,5,'1',null,NaN]) await assert.rejects(f.coordinator.record(recordingTrack,f.range,f.context,bars),/PRE_ROLL_RANGE/);
  f.song.cuePoints[0].time=2;f.range.start.time=2;
  await assert.rejects(f.coordinator.record(recordingTrack,f.range,f.context,1),/PRE_ROLL_RANGE/);
  assert.equal(f.song.tracks[0].arm,false);assert.deepEqual(preRollWrites(f),[]);
  assert.equal(f.coordinator.snapshot().preRoll,null);
});

for(const bars of [1,2,4]) test('REC pre-roll '+bars+' bars follows the observed 6/8 meter and starts playback record-OFF before Record ON',async t=>{
  const f=preRollFixture(t);f.values.numerator=6;f.values.denominator=8;
  const send=f.osc.send;let insertSeek=0;
  f.osc.send=(address,args=[])=>{
    // Model Live's Start Playback with Record preference. It must not get a
    // stopped transport to reposition to the old insert marker here.
    if(address===REC.setRecordMode && args[0]?.value===1 && !f.values.playing) {insertSeek++;f.values.position=100;}
    send(address,args);
  };
  const state=await f.coordinator.record(recordingTrack,f.range,f.context,bars);
  assert.equal(state.preRoll.phase,'running');assert.equal(state.preRoll.start,32-bars*3);
  assert.equal(state.pending,'record');assert.equal(f.values.position,32-bars*3);assert.equal(insertSeek,0);
  assert.equal(f.values.punchIn,true);assert.equal(f.values.click,true);assert.equal(f.values.loopStart,32);
  const sequence=preRollWrites(f).map(([address])=>address);
  assert.ok(sequence.indexOf(REC_PREROLL.setPunchIn)<sequence.indexOf(CMD.startPlaying));
  assert.ok(sequence.indexOf(CMD.startPlaying)<sequence.indexOf(REC.setRecordMode));
  assert.equal(f.sent.filter(([address])=>address===CMD.cuePointJump).length,1);
  assert.equal(f.sent.some(([address])=>address==='/live/song/continue_playing' || address===REC.setSongTime || address.includes('count_in_duration')),false);
  await f.coordinator.stop(f.context);
  assert.equal(f.values.click,false);assert.equal(f.values.punchIn,false);assert.equal(f.values.loopStart,4);assert.equal(f.song.tracks[0].arm,false);
});

test('REC pre-roll returns armed immediately and keeps host ownership through a 16-second lead-in; first crossing restores click',async t=>{
  const f=preRollFixture(t);f.values.tempo=60;
  const state=await f.coordinator.record(recordingTrack,f.range,f.context,4);
  assert.equal(state.preRoll.start,16);assert.equal(state.preRoll.phase,'running');
  for(let beat=17;beat<=32;beat++) {
    f.values.position=beat;t.mock.timers.tick(1000);await flushRecording();
    if(beat<32) {assert.equal(f.values.click,true);assert.equal(f.coordinator.snapshot().pending,'record');}
  }
  const captured=f.coordinator.snapshot();
  assert.equal(captured.preRoll.phase,'complete');assert.equal(captured.pending,null);assert.equal(f.values.record,true);assert.equal(f.values.playing,true);
  assert.equal(f.values.click,false,'restore original click at the first observed marker crossing');
  assert.equal(f.sent.filter(([address,args])=>address===REC.setMetronome && args[0].value===0).length,1);
  assert.equal(f.values.punchIn,true,'native Punch In stays owned until explicit STOP');
  // Live STOP alone does not dispose the temporary Punch/loop-start ownership.
  f.values.record=false;f.values.playing=false;
  await assert.rejects(f.coordinator.record(recordingTrack,f.range,f.context,0),/PRE_ROLL_STATE/);
  await f.coordinator.stop(f.context);
  assert.equal(f.values.punchIn,false);assert.equal(f.values.loopStart,4);assert.equal(f.song.tracks[0].arm,false);
});

test('REC pre-roll preserves an originally enabled click and the explicitly selected native Loop region',async t=>{
  const f=preRollFixture(t);f.values.click=true;f.range={...f.range,end:{name:'End',time:64},loop:true};
  await f.coordinator.record(recordingTrack,f.range,f.context,1);
  await f.coordinator.stop(f.context);
  assert.equal(f.values.click,true);assert.equal(f.values.loop,true);assert.equal(f.values.loopStart,32);assert.equal(f.values.loopLength,32);
  assert.equal(f.values.punchIn,false);assert.equal(f.song.tracks[0].arm,false);
  assert.equal(f.sent.some(([address])=>address===REC.setMetronome),false,'click was never owned or changed');
});

test('REC pre-roll confirms still before marker immediately before Record ON and aborts a passed marker without late capture',async t=>{
  const f=preRollFixture(t),send=f.osc.send;f.values.tempo=240;
  f.osc.send=(address,args)=>{send(address,args);if(address===CMD.startPlaying) {t.mock.timers.setTime(11000);f.values.position=32;}};
  await assert.rejects(f.coordinator.record(recordingTrack,f.range,f.context,1),/PRE_ROLL_PASSED/);
  assert.equal(f.sent.some(([address,args])=>address===REC.setRecordMode && args[0]?.value===1),false);
  assert.equal(f.values.record,false);assert.equal(f.values.playing,false);assert.equal(f.values.punchIn,false);assert.equal(f.values.click,false);
  assert.equal(f.values.loopStart,4);assert.equal(f.song.tracks[0].arm,false);assert.equal(f.coordinator.snapshot().preRoll,null);
});

for(const phase of ['play confirmation','last pre-Record read']) for(const direction of ['forward','backward']) {
  test('REC pre-roll rejects a startup '+direction+' seek below the marker during '+phase+' without Record ON',async t=>{
    const f=preRollFixture(t),send=f.osc.send;let continued=false,positionReads=0;
    f.osc.send=(address,args)=>{
      if(address===CMD.startPlaying) continued=true;
      if(address===GET.currentSongTime && continued && ++positionReads===(phase==='play confirmation'?1:2)) f.values.position=direction==='forward'?31:27;
      // The startup observation must be rejected even if a later report
      // returns to the lead-in start before the final pre-Record read.
      if(phase==='play confirmation' && positionReads===2) f.values.position=28;
      send(address,args);
    };
    await assert.rejects(f.coordinator.record(recordingTrack,f.range,f.context,1),/PRE_ROLL_SEEK/);
    assert.equal(f.sent.some(([address,args])=>address===REC.setRecordMode && args[0]?.value===1),false);
    assert.equal(f.sent.filter(([address])=>address===CMD.startPlaying).length,1,'never replay the native start');
    assert.equal(f.sent.filter(([address])=>address===CMD.cuePointJump).length,1,'never retry the seek');
    assert.equal(f.values.record,false);assert.equal(f.values.playing,false);assert.equal(f.song.tracks[0].arm,false);
  });
}

for(const elapsed of [0,500]) test('REC pre-roll accepts plausible startup progress with '+elapsed+'ms observation latency',async t=>{
  const f=preRollFixture(t),send=f.osc.send;let continued=false,positionReads=0;
  f.osc.send=(address,args)=>{
    if(address===CMD.startPlaying) continued=true;
    if(address===GET.currentSongTime && continued && ++positionReads<=2) {
      t.mock.timers.setTime(10000+positionReads*elapsed);
      f.values.position=elapsed?28+positionReads:28+positionReads*.2;
    }
    send(address,args);
  };
  const state=await f.coordinator.record(recordingTrack,f.range,f.context,1);
  assert.equal(state.preRoll.phase,'running');assert.equal(state.preRoll.start,28);
  assert.equal(f.values.record,true);assert.equal(f.values.playing,true);
  assert.equal(f.sent.filter(([address,args])=>address===REC.setRecordMode && args[0]?.value===1).length,1);
  await f.coordinator.stop(f.context);
});

test('REC STOP during pre-roll setup retains ownership while the aborted start settles and restores every owned property',async t=>{
  const f=preRollFixture(t),send=f.osc.send;let stopping;
  f.osc.send=(address,args)=>{
    send(address,args);
    if(address===REC_PREROLL.setPunchIn && args[0]?.value===1) {
      const before=f.sent.length;stopping=f.coordinator.stop(f.context);
      assert.deepEqual(f.sent.slice(before,before+2),[[CMD.stopPlaying,[]],[REC.setRecordMode,[{type:'integer',value:0}]]]);
    }
  };
  await assert.rejects(f.coordinator.record(recordingTrack,f.range,f.context,1),/STOPPED/);await stopping;
  assert.equal(f.values.punchIn,false);assert.equal(f.values.click,false);assert.equal(f.values.loopStart,4);assert.equal(f.song.tracks[0].arm,false);
  assert.equal(f.sent.some(([address])=>address===REC_PREROLL.continuePlaying || address===CMD.startPlaying),false);
});

test('REC STOP preempts the running pre-roll monitor, restores ownership and disarms even if click restoration fails',async t=>{
  const f=preRollFixture(t);await f.coordinator.record(recordingTrack,f.range,f.context,1);
  const send=f.osc.send;
  f.osc.send=(address,args)=>{if(address===REC.setMetronome && args[0]?.value===0) throw Error('click restore failed');send(address,args);};
  const before=f.sent.length,stopping=f.coordinator.stop(f.context);
  assert.deepEqual(f.sent.slice(before,before+2),[[CMD.stopPlaying,[]],[REC.setRecordMode,[{type:'integer',value:0}]]]);
  await assert.rejects(stopping,/click restore failed/);
  assert.equal(f.values.record,false);assert.equal(f.values.playing,false);assert.equal(f.values.punchIn,false);assert.equal(f.values.loopStart,4);
  assert.equal(f.song.tracks[0].arm,false);assert.equal(f.coordinator.snapshot().pending,null);
  const count=f.sent.length;t.mock.timers.tick(5000);await flushRecording();assert.equal(f.sent.length,count,'cancelled monitor never resumes a write');
});

test('REC STOP does not overwrite a temporary loop start after the operator enables Loop or moves its start',async t=>{
  const f=preRollFixture(t);await f.coordinator.record(recordingTrack,f.range,f.context,1);
  f.values.loop=true;await f.coordinator.stop(f.context);
  assert.equal(f.values.loop,true);assert.equal(f.values.loopStart,32,'an enabled Loop must retain its start');
  f.values.loop=false;await f.coordinator.record(recordingTrack,f.range,f.context,1);
  f.values.loopStart=48;await f.coordinator.stop(f.context);
  assert.equal(f.values.loopStart,48,'a changed loop start is no longer owned');assert.equal(f.values.punchIn,false);
});

for(const interruption of ['retired session','OSC loss','new Song']) test('REC pre-roll '+interruption+' retires monitor without delayed or reconnect writes',async t=>{
  const f=preRollFixture(t);await f.coordinator.record(recordingTrack,f.range,f.context,1);
  const before=preRollWrites(f).length;
  if(interruption==='retired session') f.retire();
  else if(interruption==='OSC loss') {f.osc.state.connected=false;f.osc.emit('link-lost');}
  else {f.replaceSong({...f.song,tracks:f.song.tracks.map(track=>({...track,handle:{...track.handle}}))});f.coordinator.snapshot();}
  t.mock.timers.tick(100);await flushRecording();
  assert.equal(preRollWrites(f).length,before,'a stale owner cannot send STOP, restore, seek or Record ON');
  Object.assign(f.osc.state,{connected:true,available:true});await f.coordinator.refresh();
  assert.equal(f.coordinator.snapshot().pending,null,'retired monitor ownership cannot block future reads or actions');
  t.mock.timers.tick(5000);await flushRecording();assert.equal(preRollWrites(f).length,before,'recovery reads never replay cleanup');
});

test('REC pre-roll loop-confirmation failure leaves no stale owner for the next direct OFF attempt',async t=>{
  const f=preRollFixture(t),send=f.osc.send;f.range={...f.range,end:{name:'End',time:64},loop:true};
  f.osc.send=(address,args)=>{if(address===REC_LOOP.setLength) throw Error('loop write failed');send(address,args);};
  await assert.rejects(f.coordinator.record(recordingTrack,f.range,f.context,1),/loop write failed/);
  assert.equal(f.coordinator.snapshot().preRoll,null);assert.equal(f.coordinator.snapshot().pending,null);
  assert.equal(f.sent.some(([address])=>address===CMD.stopPlaying || address===REC_PREROLL.setPunchIn),false,'no pre-roll write was owned yet');
  f.osc.send=send;f.range={...f.range,end:null,loop:false};
  const result=await f.coordinator.record(recordingTrack,f.range,f.context,0);
  assert.equal(result.preRoll,null);assert.equal(result.transport.recordMode.value,true);assert.equal(f.values.position,32);
  assert.equal(f.sent.some(([address])=>address===REC_PREROLL.continuePlaying || address===REC_PREROLL.setPunchIn),false);
});

for(const changed of ['marker','meter','track','seek','clock']) test('REC pre-roll aborts '+changed+' changes before the marker and disarms its own track safely',async t=>{
  const f=preRollFixture(t);await f.coordinator.record(recordingTrack,f.range,f.context,1);
  if(changed==='marker') f.song.cuePoints[0].time=33;
  if(changed==='meter') f.values.numerator=3;
  if(changed==='track') f.song.tracks[0].handle.id='replaced';
  if(changed==='seek') f.values.position=40;
  t.mock.timers.tick(changed==='clock'?2100:100);await flushRecording();
  assert.equal(f.values.record,false);assert.equal(f.values.playing,false);
  if(changed==='track') assert.equal(f.song.tracks[0].arm,true,'a replaced track never inherits arm ownership');
  else assert.equal(f.song.tracks[0].arm,false,'only the original owned track is disarmed');
  assert.match(f.coordinator.snapshot().error,/REC:/);
  assert.equal(f.sent.filter(([address,args])=>address===REC.setRecordMode && args[0]?.value===1).length,1,'abort never restarts recording');
});

test('REC native pre-roll fixes insertion independently of current/last-stopped positions and removes its cue before arming or playback',async t=>{
  const f=preRollFixture(t),originals=[...f.song.cuePoints],remove=f.song.deleteCuePoint,send=f.osc.send;
  f.values.position=3.405;
  f.song.deleteCuePoint=async cue=>{
    assert.equal(cue.name,'RC pre-roll');assert.equal(f.song.tracks[0].arm,false);
    assert.equal(f.values.click,false);assert.equal(f.values.punchIn,false);assert.equal(f.values.playing,false);
    return remove(cue);
  };
  f.osc.send=(address,args)=>{
    if(address===CMD.startPlaying || address===REC.setRecordMode) assert.deepEqual(f.song.cuePoints,originals,'no temporary cue may remain at playback/Record ON');
    send(address,args);
  };
  const state=await f.coordinator.record(recordingTrack,f.range,f.context,1);
  assert.equal(state.preRoll.start,28);assert.equal(f.values.position,28);assert.equal(f.values.insertion,28);assert.equal(f.values.stoppedResume,57.549);
  assert.deepEqual(f.cueWrites,[['create','own-cue-1',28],['delete','own-cue-1',28]]);
  assert.deepEqual(f.song.cuePoints,originals);assert.equal(originals[0].name,'Take');
  assert.equal(f.sent.some(([address])=>address==='/live/song/continue_playing' || address===REC.setSongTime),false);
  await f.coordinator.stop(f.context);
});

test('REC native pre-roll reuses an exact existing cue without renaming or deleting it',async t=>{
  const f=preRollFixture(t),cue={name:'Original lead-in',time:28,handle:{id:'existing-lead'}};
  f.song.cuePoints.push(cue);const originals=[...f.song.cuePoints];
  await f.coordinator.record(recordingTrack,f.range,f.context,1);await f.coordinator.stop(f.context);
  assert.deepEqual(f.cueWrites,[]);assert.deepEqual(f.song.cuePoints,originals);assert.equal(cue.name,'Original lead-in');assert.equal(f.values.insertion,28);
});

test('REC native pre-roll SDK create rejection and a preexisting returned handle cannot arm, start or delete a user cue',async t=>{
  const f=preRollFixture(t),originals=[...f.song.cuePoints];let creates=0;
  f.song.createCuePoint=async()=>{creates++;throw Error('SDK create rejected');};
  await assert.rejects(f.coordinator.record(recordingTrack,f.range,f.context,1),/SDK create rejected/);
  f.song.createCuePoint=async()=>{creates++;return originals[0];};
  await assert.rejects(f.coordinator.record(recordingTrack,f.range,f.context,1),/PRE_ROLL_LOCATOR/);
  assert.equal(creates,2);assert.deepEqual(f.cueWrites,[]);assert.deepEqual(f.song.cuePoints,originals);
  assert.equal(f.song.tracks[0].arm,false);assert.equal(f.values.punchIn,false);assert.equal(f.values.click,false);
  assert.equal(f.sent.some(([address])=>address===CMD.startPlaying || address===REC_PREROLL.setPunchIn),false);
});

for(const failure of ['reject','unconfirmed']) test('REC native pre-roll '+failure+' deletion blocks playback, never retries and preserves original cues',async t=>{
  const f=preRollFixture(t),originals=[...f.song.cuePoints];let deletes=0;
  f.song.deleteCuePoint=async()=>{deletes++;if(failure==='reject') throw Error('SDK delete rejected');};
  await assert.rejects(f.coordinator.record(recordingTrack,f.range,f.context,1),failure==='reject'?/SDK delete rejected/:/PRE_ROLL_LOCATOR/);
  assert.equal(deletes,1);assert.ok(originals.every(cue=>f.song.cuePoints.includes(cue)));
  assert.equal(f.song.tracks[0].arm,false);assert.equal(f.values.punchIn,false);assert.equal(f.values.click,false);
  assert.equal(f.sent.some(([address])=>address===CMD.startPlaying || address===REC_PREROLL.setPunchIn),false);
});

test('REC native pre-roll priority STOP handles a late SDK creation once without later arming or starting',async t=>{
  const f=preRollFixture(t),create=f.song.createCuePoint,originals=[...f.song.cuePoints];let resolveCreation;
  f.song.createCuePoint=time=>new Promise(resolve=>{resolveCreation=()=>create(time).then(resolve);});
  const recording=f.coordinator.record(recordingTrack,f.range,f.context,1),rejected=assert.rejects(recording,/STOPPED/);
  await flushRecording();const before=f.sent.length,stopping=f.coordinator.stop(f.context);
  assert.deepEqual(f.sent.slice(before,before+2),[[CMD.stopPlaying,[]],[REC.setRecordMode,[{type:'integer',value:0}]]]);
  resolveCreation();await stopping;await rejected;
  assert.deepEqual(f.song.cuePoints,originals);assert.equal(f.cueWrites.filter(([kind])=>kind==='delete').length,1);
  assert.equal(f.sent.some(([address])=>address===CMD.startPlaying || address===CMD.cuePointJump || address===REC_PREROLL.setPunchIn),false);
});

test('REC native pre-roll creation timeout is bounded and cleans its exact late resource while the same session remains valid',async t=>{
  const f=preRollFixture(t),create=f.song.createCuePoint,originals=[...f.song.cuePoints];let resolveCreation,done=false;
  f.song.createCuePoint=time=>new Promise(resolve=>{resolveCreation=()=>create(time).then(resolve);});
  const recording=f.coordinator.record(recordingTrack,f.range,f.context,1).then(()=>{done=true;return null;},error=>{done=true;return error;});
  await flushRecording();t.mock.timers.tick(2001);await flushRecording();t.mock.timers.tick(2001);await flushRecording();
  assert.equal(done,true,'neither creation nor cleanup can hold a command indefinitely');assert.match((await recording).message,/PRE_ROLL_LOCATOR/);
  resolveCreation();await flushRecording();
  assert.deepEqual(f.song.cuePoints,originals);assert.equal(f.cueWrites.filter(([kind])=>kind==='delete').length,1);
  assert.equal(f.sent.some(([address])=>address===CMD.startPlaying || address===REC_PREROLL.setPunchIn),false);
});

test('REC native pre-roll STOP preempts pending deletion and a missing SDK completion stays bounded without a second delete',async t=>{
  const f=preRollFixture(t);let deletes=0,done=false;
  f.song.deleteCuePoint=()=>{deletes++;return new Promise(()=>{});};
  const recording=f.coordinator.record(recordingTrack,f.range,f.context,1).then(()=>null,error=>error);
  await flushRecording();const before=f.sent.length,stopping=f.coordinator.stop(f.context).then(()=>null,error=>{done=true;return error;});
  assert.deepEqual(f.sent.slice(before,before+2),[[CMD.stopPlaying,[]],[REC.setRecordMode,[{type:'integer',value:0}]]]);
  await flushRecording();t.mock.timers.tick(2001);await flushRecording();
  assert.equal(done,true);assert.match((await stopping).message,/PRE_ROLL_LOCATOR/);await recording;
  assert.equal(deletes,1);assert.equal(f.song.tracks[0].arm,false);
  assert.equal(f.sent.some(([address])=>address===CMD.startPlaying || address===REC_PREROLL.setPunchIn),false);
});

test('REC native pre-roll verifies original cue identities after deletion and never undoes an operator edit',async t=>{
  const f=preRollFixture(t),remove=f.song.deleteCuePoint,original=f.song.cuePoints[1];
  f.song.deleteCuePoint=async cue=>{await remove(cue);original.name='Operator edit';};
  await assert.rejects(f.coordinator.record(recordingTrack,f.range,f.context,1),/PRE_ROLL_LOCATOR/);
  assert.equal(original.name,'Operator edit');assert.ok(f.song.cuePoints.includes(original));
  assert.equal(f.cueWrites.filter(([kind])=>kind==='delete').length,1);
  assert.equal(f.sent.some(([address])=>address===CMD.startPlaying || address===REC_PREROLL.setPunchIn),false);
});

for(const loss of ['session','link','Song']) test('REC native pre-roll late creation after '+loss+' loss never cleans or starts in a retired owner',async t=>{
  const f=preRollFixture(t),create=f.song.createCuePoint;let resolveCreation;
  f.song.createCuePoint=time=>new Promise(resolve=>{resolveCreation=()=>create(time).then(resolve);});
  const recording=f.coordinator.record(recordingTrack,f.range,f.context,1).then(()=>null,error=>error);
  await flushRecording();
  if(loss==='link') {
    // Even after a bounded failure has dropped the active pre-roll object,
    // a later loss must retire its still-pending SDK resource permanently.
    t.mock.timers.tick(2001);await flushRecording();t.mock.timers.tick(2001);await flushRecording();
  }
  if(loss==='session') f.retire();
  if(loss==='link') {f.osc.state.connected=false;f.osc.emit('link-lost');f.osc.state.connected=true;}
  if(loss==='Song') {f.replaceSong({...f.song,cuePoints:[...f.song.cuePoints]});f.coordinator.snapshot();}
  resolveCreation();await flushRecording();await recording;
  assert.equal(f.cueWrites.filter(([kind])=>kind==='delete').length,0);
  Object.assign(f.osc.state,{connected:true,available:true});await f.coordinator.refresh();await flushRecording();
  assert.equal(f.cueWrites.filter(([kind])=>kind==='delete').length,0,'reconnect never replays orphan cleanup');
  assert.equal(f.sent.some(([address])=>address===CMD.startPlaying || address===CMD.cuePointJump || address===REC_PREROLL.setPunchIn),false);
});

const trackRefs=tracks=>tracks.map((track,index)=>({index,id:String(track.handle.id),name:track.name}));
function cohortFixture(t,count=10) {
  const f=preRollFixture(t);
  f.song.tracks=Array.from({length:count},(_,index)=>({name:'Input '+(index+1),handle:{id:String(index+100)},arm:true,solo:false,mute:false,canArm:true}));
  f.refs=trackRefs(f.song.tracks);return f;
}

test('REC cohort records ten observed armed inputs and STOP disarms only its original cohort while restoring direct Punch In ON',async t=>{
  const f=cohortFixture(t);f.values.punchIn=true;
  f.song.tracks.push({name:'Later',handle:{id:'third'},arm:false,solo:false,mute:false,canArm:true});
  const state=await f.coordinator.record(f.refs,f.range,f.context,0);
  assert.equal(state.transport.recordMode.value,true);assert.equal(f.values.punchIn,false);assert.deepEqual(state.lastAttempt.tracks,f.refs);
  f.song.tracks[10].arm=true;
  await f.coordinator.stop(f.context);
  assert.equal(f.values.punchIn,true);assert.ok(f.song.tracks.slice(0,10).every(track=>track.arm===false));assert.equal(f.song.tracks[10].arm,true);
  assert.deepEqual(f.sent.filter(([address])=>address===REC_PREROLL.setPunchIn).map(([,args])=>args[0].value),[0,1]);
});

test('REC cohort pre-roll and Loop retain ten armed inputs while solo/mute confirmations do not replace its running operation',async t=>{
  const f=cohortFixture(t);f.range={...f.range,end:{name:'End',time:64},loop:true};
  const state=await f.coordinator.record(f.refs,f.range,f.context,1);
  assert.equal(state.pending,'record');assert.equal(f.values.loop,true);assert.equal(f.values.punchIn,true);assert.equal(f.song.cuePoints.length,2);
  const writes=f.sent.filter(([address])=>address===CMD.startPlaying||address===REC.setRecordMode).length;
  const solo=await f.coordinator.trackControl(f.refs[2],'solo',true,'multi',f.context);
  assert.equal(solo.tracks[2].solo,true);assert.equal(solo.pending,'record');assert.equal(solo.preRoll.phase,'running');
  const mute=await f.coordinator.trackControl(f.refs[7],'mute',true,'multi',f.context);
  assert.equal(mute.tracks[7].mute,true);assert.ok(f.song.tracks.every(track=>track.arm));
  assert.equal(f.sent.filter(([address])=>address===CMD.startPlaying||address===REC.setRecordMode).length,writes);
  f.values.position+=.2;t.mock.timers.tick(100);await flushRecording();assert.equal(f.coordinator.snapshot().preRoll.phase,'running');
  await f.coordinator.stop(f.context);assert.ok(f.song.tracks.every(track=>!track.arm));assert.equal(f.song.tracks[2].solo,true);assert.equal(f.song.tracks[7].mute,true);
});

test('REC track ARM MULTI accumulates inputs; EXCLUSIVE changes other arms only in its explicit ARM action',async t=>{
  const f=cohortFixture(t,3);f.song.tracks.forEach(track=>{track.arm=false;});f.song.exclusiveArm=true;
  await f.coordinator.refresh();
  await f.coordinator.trackControl(f.refs[0],'arm',true,'multi',f.context);
  await f.coordinator.trackControl(f.refs[1],'arm',true,'multi',f.context);
  assert.deepEqual(f.song.tracks.map(track=>track.arm),[true,true,false]);assert.equal(f.song.exclusiveArm,true);
  await f.coordinator.trackControl(f.refs[2],'arm',true,'exclusive',f.context);
  assert.deepEqual(f.song.tracks.map(track=>track.arm),[false,false,true]);
  await f.coordinator.trackControl(f.refs[2],'arm',false,'exclusive',f.context);
  assert.deepEqual(f.song.tracks.map(track=>track.arm),[false,false,false]);assert.equal(f.song.exclusiveArm,true);
});

test('REC track MULTI rejects host side-effect disarming another input instead of claiming cumulative success',async t=>{
  const f=cohortFixture(t,2);let arm=false;
  Object.defineProperty(f.song.tracks[1],'arm',{get:()=>arm,set:value=>{arm=value;if(value)f.song.tracks[0].arm=false;}});
  await f.coordinator.refresh();
  await assert.rejects(f.coordinator.trackControl(f.refs[1],'arm',true,'multi',f.context),/ARM_UNCONFIRMED/);
  assert.equal(f.song.tracks[0].arm,false);assert.equal(arm,true);
});

test('REC track EXCLUSIVE stops before disarming a replaced same-name non-target identity',async t=>{
  const f=cohortFixture(t,3);f.song.tracks[2].arm=false;let arm=true;
  const replacement={...f.song.tracks[1],handle:{id:'replacement'}};
  Object.defineProperty(f.song.tracks[0],'arm',{get:()=>arm,set:value=>{arm=value;f.song.tracks[1]=replacement;}});
  await assert.rejects(f.coordinator.trackControl(f.refs[2],'arm',true,'exclusive',f.context),/IDENTITY/);
  assert.equal(replacement.arm,true);assert.equal(f.song.tracks[2].arm,false);
});

test('REC group tracks expose observed solo/mute but reject ARM and never change another track',async t=>{
  const f=cohortFixture(t,2);f.song.tracks[1].canArm=false;f.song.tracks[1].arm=false;
  await f.coordinator.refresh();await assert.rejects(f.coordinator.trackControl(f.refs[1],'arm',true,'multi',f.context),/NOT_ARMABLE/);
  await f.coordinator.trackControl(f.refs[1],'solo',true,'multi',f.context);
  const state=await f.coordinator.trackControl(f.refs[1],'mute',true,'multi',f.context);
  assert.equal(state.tracks[1].canArm,false);assert.equal(state.tracks[1].solo,true);assert.equal(state.tracks[1].mute,true);
  assert.equal(f.song.tracks[0].solo,false);assert.equal(f.song.tracks[0].mute,false);assert.equal(f.song.tracks[0].arm,true);
});

test('REC cohort rejects empty, duplicate, unordered and obsolete identities before a native write',async t=>{
  const f=cohortFixture(t,2);
  for(const refs of [[],[f.refs[0],f.refs[0]],[f.refs[1],f.refs[0]],[{...f.refs[0],name:'old'}],[{...f.refs[0],id:'old'}],[{...f.refs[0],extra:true}]]) {
    await assert.rejects(f.coordinator.record(refs,f.range,f.context),/NO_ARMED|IDENTITY/);
  }
  assert.deepEqual(preRollWrites(f),[]);assert.deepEqual(f.cueWrites,[]);
});

for(const mismatch of ['outside armed','missing arm','reordered','not armable']) test('REC cohort blocks '+mismatch+' from the observed full set without mutating arms or Punch',async t=>{
  const f=cohortFixture(t,2),refs=[...f.refs];
  if(mismatch==='outside armed')refs.pop();
  if(mismatch==='missing arm')f.song.tracks[1].arm=false;
  if(mismatch==='reordered')f.song.tracks.reverse();
  if(mismatch==='not armable')f.song.tracks[1].canArm=false;
  const arms=f.song.tracks.map(track=>track.arm);
  await assert.rejects(f.coordinator.record(refs,f.range,f.context,0),/OTHER_ARMED|TRACK_NOT_ARMED|IDENTITY|NOT_ARMABLE/);
  assert.deepEqual(f.song.tracks.map(track=>track.arm),arms);assert.equal(f.sent.some(([address])=>address.includes('/set/')||address===CMD.startPlaying),false);
});

test('REC cohort STOP skips a replaced identity, still disarms remaining owned inputs and preserves third-party arm',async t=>{
  const f=cohortFixture(t,3);await f.coordinator.record(f.refs.slice(0,2),f.range,f.context).catch(error=>{assert.match(error.message,/OTHER_ARMED/);});
  f.song.tracks[2].arm=false;await f.coordinator.record(f.refs.slice(0,2),f.range,f.context);
  f.song.tracks[0].handle.id='replacement';f.song.tracks[2].arm=true;
  await assert.rejects(f.coordinator.stop(f.context),/IDENTITY/);
  assert.equal(f.song.tracks[0].arm,true);assert.equal(f.song.tracks[1].arm,false);assert.equal(f.song.tracks[2].arm,true);
});

test('REC solo/mute serialize writes and priority STOP cancels a pending confirmation without aborting into a delayed write',async t=>{
  const f=cohortFixture(t,2);await f.coordinator.record(f.refs,f.range,f.context,1);
  f.block(REC_PREFLIGHT.trackSolo);
  const pending=f.coordinator.trackControl(f.refs[0],'solo',true,'multi',f.context),rejected=assert.rejects(pending,/STOPPED/);
  const beforePoll=f.sent.length,state=await f.coordinator.refresh();assert.equal(state.trackPending,'track-solo');assert.equal(f.sent.length,beforePoll);
  await assert.rejects(f.coordinator.trackControl(f.refs[1],'mute',true,'multi',f.context),/BUSY/);
  await assert.rejects(f.coordinator.record(f.refs,f.range,f.context),/BUSY/);
  const before=f.sent.length,stopping=f.coordinator.stop(f.context);
  assert.deepEqual(f.sent.slice(before,before+2),[[CMD.stopPlaying,[]],[REC.setRecordMode,[{type:'integer',value:0}]]]);
  f.block(undefined);await stopping;await rejected;
  assert.equal(f.song.tracks[0].solo,false);assert.equal(f.song.tracks[1].mute,false);assert.ok(f.song.tracks.every(track=>!track.arm));
});

test('REC passive poll during an isolated solo/mute confirmation returns observed pending state without an extra read',async t=>{
  const f=cohortFixture(t,2);await f.coordinator.refresh();f.block(REC_PREFLIGHT.trackMute);
  const pending=f.coordinator.trackControl(f.refs[0],'mute',true,'multi',f.context),rejected=assert.rejects(pending,/STOPPED/);
  const before=f.sent.length,state=await f.coordinator.refresh();assert.equal(state.trackPending,'track-mute');assert.equal(f.sent.length,before);
  f.block(undefined);await f.coordinator.stop(f.context);await rejected;assert.equal(f.song.tracks[0].mute,false);
});

test('REC cohort failed pre-roll with no owned resources releases baseline Punch so a corrected retry works',async t=>{
  const f=cohortFixture(t,2),send=f.osc.send;f.values.loop=true;
  f.osc.send=(address,args)=>{send(address,args);if(address===REC_LOOP.setEnabled)f.song.cuePoints[0].name='Moved';};
  await assert.rejects(f.coordinator.record(f.refs,f.range,f.context,1),/MARKER_CHANGED/);
  assert.equal(f.coordinator.snapshot().preRoll,null);assert.equal(f.sent.some(([address])=>address===REC_PREROLL.setPunchIn),false);
  f.osc.send=send;f.song.cuePoints[0].name='Take';
  await f.coordinator.record(f.refs,f.range,f.context,1);await f.coordinator.stop(f.context);
});

for(const bars of [0,1]) for(const original of [false,true]) test('REC automatic Punch In original '+original+' with pre-roll '+bars+' configures and restores only its own temporary change',async t=>{
  const f=cohortFixture(t,2);f.values.punchIn=original;
  await f.coordinator.record(f.refs,f.range,f.context,bars);
  assert.equal(f.values.punchIn,bars>0);await f.coordinator.stop(f.context);assert.equal(f.values.punchIn,original);
  assert.equal(f.sent.filter(([address])=>address===REC_PREROLL.setPunchIn).length,original===(bars>0)?0:2);
});

test('REC automatic Punch In setter needs confirmation and restores its baseline after a later native-start failure',async t=>{
  const f=cohortFixture(t,2),send=f.osc.send;f.values.punchIn=true;
  f.osc.send=(address,args)=>{if(address!==REC_PREROLL.setPunchIn)send(address,args);};
  const failed=f.coordinator.record(f.refs,f.range,f.context).then(()=>null,error=>error);
  await flushRecording();t.mock.timers.tick(2001);await flushRecording();
  assert.match((await failed).message,/PUNCH_UNCONFIRMED/);assert.equal(f.values.punchIn,true);
  f.osc.send=(address,args)=>{if(address===CMD.cuePointJump)throw Error('native jump failed');send(address,args);};
  await assert.rejects(f.coordinator.record(f.refs,f.range,f.context),/native jump failed/);
  assert.equal(f.values.punchIn,true);assert.ok(f.song.tracks.every(track=>!track.arm));
});

test('REC automatic Punch In relinquishes ownership after an external change and never restores on reconnect',async t=>{
  const f=cohortFixture(t,2);await f.coordinator.record(f.refs,f.range,f.context,1);
  f.values.punchIn=false;f.push(REC_PREFLIGHT.punchIn,[false]);f.values.punchIn=true;f.push(REC_PREFLIGHT.punchIn,[true]);
  await f.coordinator.stop(f.context);assert.equal(f.values.punchIn,true,'external re-enable is retained instead of overwritten with the original OFF');
  f.song.tracks.forEach(track=>{track.arm=true;});await f.coordinator.record(f.refs,f.range,f.context,0);
  assert.equal(f.values.punchIn,false);const setters=f.sent.filter(([address])=>address===REC_PREROLL.setPunchIn).length;
  f.osc.state.connected=false;f.osc.emit('link-lost');f.osc.state.connected=true;await f.coordinator.refresh();
  assert.equal(f.values.punchIn,false);assert.equal(f.sent.filter(([address])=>address===REC_PREROLL.setPunchIn).length,setters);
});
