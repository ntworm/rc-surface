// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import * as codec from 'osc-min';
import {OSCTransport} from '../src/live/osc-transport.ts';
import {RecordingCoordinator} from '../src/live/recording-coordinator.ts';
import {CLIP,CMD,GET,REC,REC_LOOP,REC_PREFLIGHT,SESSION_REC,REC_RETURN} from '../src/osc-tokens.ts';

function fixture(t,inputs=2) {
  const osc=new OSCTransport();Object.assign(osc.state,{available:true,connected:true});
  let song={scenes:Array.from({length:10},(_,index)=>({name:'Scene '+(index+1),handle:{id:'scene-'+index}})),cuePoints:[],tracks:[]},current=true;
  const writes=[],sent=[],block=new Set(),state={playing:false,record:false,click:false,numerator:4,denominator:4,sessionRecord:false};
  const flags=Array.from({length:inputs+1},()=>({fired:-1,playing:-1,recording:false,triggered:false,active:true}));
  song.tracks=Array.from({length:inputs+1},(_,index)=>{
    const track={handle:{id:'track-'+index},name:index===inputs?'Group':index===0?'Audio':index===1?'MIDI':'Input '+(index+1),canArm:index<inputs,monitor:1,
      clipSlots:song.scenes.map((_,scene)=>({handle:{id:'slot-'+index+'-'+scene},clip:null}))};
    for(const [key,start] of [['arm',index<inputs],['solo',false],['mute',false]]){let value=start;Object.defineProperty(track,key,{enumerable:true,configurable:true,get:()=>value,set:next=>{writes.push([index,key,next]);value=next;}});}
    return track;
  });
  const push=(address,values)=>osc.handleIncoming(codec.fromBuffer(codec.toBuffer({address,args:values.map(value=>({type:typeof value==='boolean'?(value?'true':'false'):typeof value==='string'?'string':Number.isInteger(value)?'integer':'float',value}))})));
  let onSend=()=>{},mode='record',stopDelayed=false,stopIndex=-1;
  osc.send=(address,args=[])=>{
    sent.push([address,args]);onSend(address,args);
    const track=args[0]?.value,scene=args[1]?.value,slot=song.tracks[track]?.clipSlots[scene];
    if(address===CLIP.fireSlot){
      if(mode==='queued'){flags[track].fired=scene;flags[track].triggered=true;}
      else if(mode!=='ignored'){slot.clip={name:'Take '+track,handle:{id:'clip-'+track}};Object.assign(flags[track],{playing:scene,recording:mode==='record',fired:-1,triggered:false});}
    }
    if(address===CLIP.stopTrack && !stopDelayed)Object.assign(flags[track],{fired:-1,playing:stopIndex,recording:false,triggered:false});
    if(address===REC_RETURN.setBackToArranger&&!block.has(address))state.backToArranger=false;
    if(block.has(address))return;
    let response;
    if(address===GET.isPlaying)response=[state.playing];
    if(address===REC.getRecordMode)response=[state.record];
    if(address===GET.currentSongTime)response=[0];
    if(address===GET.metronome)response=[state.click];
    if(address===REC_LOOP.getStart)response=[0];if(address===REC_LOOP.getLength)response=[4];
    if(address===CLIP.getTrackNames)response=song.tracks.map(track=>track.name);
    for(const key of ['loop','punchIn','punchOut','overdub','backToArranger','sessionRecord'])if(address===REC_PREFLIGHT[key])response=[state[key]??false];
    if(address===REC_PREFLIGHT.signatureNumerator)response=[state.numerator];if(address===REC_PREFLIGHT.signatureDenominator)response=[state.denominator];
    for(const key of ['arm','solo','mute','canArm','monitor'])if(address===REC_PREFLIGHT['track'+key[0].toUpperCase()+key.slice(1)])response=[track,song.tracks[track][key]];
    if(address===SESSION_REC.firedSlot)response=[track,flags[track].fired];if(address===SESSION_REC.playingSlot)response=[track,flags[track].playing];
    if(address===SESSION_REC.hasClip)response=[track,scene,!!slot.clip];if(address===SESSION_REC.triggered)response=[track,scene,flags[track].fired===scene&&flags[track].triggered];
    if(address===SESSION_REC.recording)response=[track,scene,flags[track].playing===scene&&flags[track].recording];if(address===SESSION_REC.playing)response=[track,scene,flags[track].playing===scene&&flags[track].active];
    if(response)queueMicrotask(()=>push(address,response));
  };
  const coordinator=new RecordingCoordinator(osc,()=>song),context={clientId:'session-test',isCurrent:()=>current};
  const request=()=>{const snapshot=coordinator.snapshot().session;return {songId:snapshot.songId,scene:snapshot.scenes[1],targets:song.tracks.slice(0,inputs).map((track,index)=>({track:{index,id:track.handle.id,name:track.name},slotId:track.clipSlots[1].handle.id})),bars:4,quantization:'global'};};
  t.after(()=>{coordinator.dispose();osc.dispose();});
  return {osc,coordinator,context,state,sent,writes,flags,block,request,push,get song(){return song;},replace:value=>{song=value;},retire:()=>{current=false;},setHook:fn=>{onSend=fn;},mode:value=>{mode=value;},delayStop:value=>{stopDelayed=value;},nativeStopIndex:value=>{stopIndex=value;}};
}
const mutations=f=>f.sent.filter(([address])=>[CLIP.fireSlot,CLIP.stopTrack,CMD.startPlaying,CMD.stopPlaying,REC.setRecordMode,REC.setMetronome].includes(address)||address.includes('/set/'));
const flush=async()=>{for(let index=0;index<40;index++)await Promise.resolve();};

for(const playing of [false,true])test('REC explicit Arrangement return confirms native flag without changing transport '+playing,async t=>{
  const f=fixture(t);f.state.playing=playing;f.state.backToArranger=true;await f.coordinator.refreshSession(0);assert.deepEqual(mutations(f),[]);
  const result=await f.coordinator.returnToArrangement(f.context);assert.equal(result.safety.backToArranger,false);assert.equal(f.state.playing,playing);
  assert.deepEqual(mutations(f),[[REC_RETURN.setBackToArranger,[{type:'integer',value:0}]]]);assert.deepEqual(f.writes,[]);
  await f.coordinator.returnToArrangement(f.context);assert.equal(mutations(f).length,1,'confirmed return is a no-op');
});
for(const conflict of ['recording','queued','foreign','unknown'])test('REC Arrangement return rejects '+conflict+' Session state without stopping or overriding it',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});const f=fixture(t);f.state.backToArranger=true;
  if(conflict==='recording')f.state.record=true;
  if(conflict==='queued')f.flags[2].fired=-2;
  if(conflict==='foreign'){f.flags[2].playing=0;f.song.tracks[2].clipSlots[0].clip={name:'Foreign',handle:{id:'foreign'}};}
  if(conflict==='unknown')f.block.add(SESSION_REC.playingSlot);
  const returned=f.coordinator.returnToArrangement(f.context),rejected=assert.rejects(returned,/SESSION_CONFLICT|SESSION_UNKNOWN/);await flush();if(conflict==='unknown')t.mock.timers.tick(2001);await rejected;assert.deepEqual(mutations(f),[]);
});
test('REC Arrangement return recovers confirmed stopped ownership and never replays an unconfirmed write',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});const f=fixture(t);await f.coordinator.recordSession(f.request(),f.context);f.state.backToArranger=true;
  for(let index=0;index<2;index++)Object.assign(f.flags[index],{playing:-2,fired:-1,recording:false,active:false});
  await f.coordinator.returnToArrangement(f.context);assert.equal(f.coordinator.snapshot().attemptActive,false);
  f.state.backToArranger=true;f.block.add(REC_RETURN.setBackToArranger);
  const pending=f.coordinator.returnToArrangement(f.context),rejected=assert.rejects(pending,/RETURN_UNCONFIRMED/);await flush();t.mock.timers.tick(2101);await flush();await rejected;
  const count=mutations(f).length;await f.coordinator.refreshSession(0);assert.equal(mutations(f).length,count);
});

test('Session native Clip Stop index -2 completes STOP and permits another scene without reload',async t=>{
  const f=fixture(t);f.nativeStopIndex(-2);await f.coordinator.recordSession(f.request(),f.context);
  f.setHook(address=>{if(address===CLIP.stopTrack){f.block.add(SESSION_REC.recording);f.block.add(SESSION_REC.playing);}});
  await f.coordinator.stopSession(f.context);const stopped=await f.coordinator.refreshSession(0);
  assert.equal(stopped.attemptActive,false);assert.equal(stopped.session.active,false);assert.ok(stopped.session.rows.every(row=>row.ready));
  const request=f.request();request.scene=stopped.session.scenes[2];request.targets=request.targets.map(target=>({...target,slotId:f.song.tracks[target.track.index].clipSlots[2].handle.id}));
  f.block.clear();f.setHook(()=>{});
  await f.coordinator.recordSession(request,f.context);assert.equal(f.flags[0].playing,2);
  assert.deepEqual(f.writes,[]);
});

for(const retained of [false,true])test('Session fresh external stop '+(retained?'with retained indices':'at native -2')+' releases ownership in polling without repeating STOP',async t=>{
  const f=fixture(t);await f.coordinator.recordSession(f.request(),f.context);f.delayStop(true);
  await assert.rejects(f.coordinator.stopSession(f.context),/SESSION_STOP_PENDING/);const before=f.sent.length;
  f.state.playing=false;for(let index=0;index<2;index++)Object.assign(f.flags[index],{fired:-1,playing:retained?1:-2,recording:false,active:false,triggered:false});
  const result=await f.coordinator.refreshSession(0);assert.equal(result.attemptActive,false);assert.equal(result.session.active,false);assert.ok(result.session.rows.every(row=>row.ready));
  assert.equal(f.sent.slice(before).some(([address])=>address===CLIP.stopTrack),false);
});

test('Session fired -2 is a pending stop, and transport pause or unknown clip flags cannot retire ownership',async t=>{
  const f=fixture(t);await f.coordinator.recordSession(f.request(),f.context);f.state.playing=false;
  for(let index=0;index<2;index++)Object.assign(f.flags[index],{fired:-2,playing:-2,recording:false,active:false,triggered:false});
  let result=await f.coordinator.refreshSession(0);assert.equal(result.session.active,true);assert.ok(result.session.rows.slice(0,2).every(row=>!row.ready));
  for(let index=0;index<2;index++)Object.assign(f.flags[index],{fired:-1,playing:1,recording:false,active:true});
  result=await f.coordinator.refreshSession(0);assert.equal(result.session.active,true,'normal native capture completion into PLAY remains owned');
  f.block.add(SESSION_REC.playing);f.flags[0].active=false;
  t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});
  const pending=f.coordinator.refreshSession(0),unknown=assert.rejects(pending,/SESSION_UNKNOWN/);await flush();t.mock.timers.tick(2001);await unknown;assert.equal(f.coordinator.snapshot().session.active,true);
});

test('Session inventory is paged SDK metadata with ordinary Audio/MIDI states; passive reads never fire or arm',async t=>{
  const f=fixture(t),result=await f.coordinator.refreshSession(0);
  assert.equal(result.session.scenes.length,8);assert.equal(result.session.totalScenes,10);assert.equal(result.session.rows.length,3);
  assert.ok(result.session.rows.every(row=>row.slots.every(slot=>slot.state==='stopped')));assert.deepEqual(mutations(f),[]);assert.deepEqual(f.writes,[]);
  assert.equal(f.sent.filter(([address])=>address===SESSION_REC.hasClip).length,0,'no per-cell emptiness polling');
  assert.equal((await f.coordinator.refreshSession(8)).session.scenes[0].index,8);
  for(const offset of [-1,1,16,'0',null])await assert.rejects(f.coordinator.refreshSession(offset),/ARGUMENTS/);
});

for(const quantization of ['global','none','bar','beat'])test('Session REC native '+quantization+' records exactly the armed cohort with beat duration and no global preference/transport writes',async t=>{
  const f=fixture(t);f.state.numerator=3;f.state.denominator=8;
  const request={...f.request(),bars:8,quantization},result=await f.coordinator.recordSession(request,f.context);
  const fires=mutations(f);assert.equal(fires.length,2);
  fires.forEach(([address,args],index)=>{assert.equal(address,CLIP.fireSlot);assert.deepEqual(args.map(arg=>arg.value),[index,1,12,...quantization==='global'?[]:[{none:0,bar:4,beat:7}[quantization]]]);});
  assert.equal(result.session.active,true);assert.ok(result.session.owned.every(target=>target.state==='recording'));assert.deepEqual(f.writes,[]);
  assert.deepEqual(f.song.tracks.map(track=>track.arm),[true,true,false]);
  await assert.rejects(f.coordinator.renameTrack(request.targets[0].track,'New',f.context),/STOP_REQUIRED/);
  await assert.rejects(f.coordinator.record(request.targets.map(target=>target.track),{start:{name:'Missing',time:0},end:null,loop:false},f.context),/STOP_REQUIRED/);
  await f.coordinator.trackControl(request.targets[0].track,'solo',true,'multi',f.context);assert.deepEqual(f.writes,[[0,'solo',true]]);
});

test('Session queued/recording/playing/stopped follows native observations rather than elapsed time',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});
  const f=fixture(t);f.mode('queued');await f.coordinator.recordSession(f.request(),f.context);
  assert.ok(f.coordinator.snapshot().session.owned.every(target=>target.state==='queued'));
  t.mock.timers.tick(100000);assert.ok(f.coordinator.snapshot().session.owned.every(target=>target.state==='unknown'));
  for(let index=0;index<2;index++){Object.assign(f.flags[index],{playing:1,fired:-1,triggered:false,recording:true});f.song.tracks[index].clipSlots[1].clip={name:'Take',handle:{id:'created-'+index}};}
  assert.ok((await f.coordinator.refreshSession(0)).session.owned.every(target=>target.state==='recording'));
  f.flags[0].recording=false;assert.equal((await f.coordinator.refreshSession(0)).session.owned[0].state,'playing');
  Object.assign(f.flags[0],{playing:-1,fired:-1});assert.ok((await f.coordinator.refreshSession(0)).session.owned.every(target=>target.track.index!==0));
});

test('Session native fire can confirm on a later host callback without a repeated fire or inferred REC',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});const f=fixture(t);f.mode('ignored');
  let complete=false;const start=f.coordinator.recordSession(f.request(),f.context).then(value=>{complete=true;return value;});
  await flush();assert.equal(complete,false);assert.equal(f.sent.filter(([address])=>address===CLIP.fireSlot).length,2);
  for(let index=0;index<2;index++)Object.assign(f.flags[index],{fired:1,triggered:true});
  t.mock.timers.tick(51);await flush();const result=await start;
  assert.ok(result.session.owned.every(target=>target.state==='queued'));assert.equal(f.sent.filter(([address])=>address===CLIP.fireSlot).length,2);
});

test('Session native fire confirmation expires without refiring and STOP cancels the wait before a late ACK',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});
  const f=fixture(t);f.mode('ignored');const start=f.coordinator.recordSession(f.request(),f.context),expired=assert.rejects(start,/SESSION_UNCONFIRMED/);
  await flush();t.mock.timers.tick(2001);await flush();await expired;
  assert.equal(f.sent.filter(([address])=>address===CLIP.fireSlot).length,2);assert.equal(f.coordinator.snapshot().pending,null);
  const g=fixture(t);g.mode('ignored');const pending=g.coordinator.recordSession(g.request(),g.context),stopped=assert.rejects(pending,/STOPPED/);
  await flush();await g.coordinator.stopSession(g.context);await stopped;
  g.flags[0].fired=1;g.flags[0].triggered=true;await g.coordinator.refreshSession(0);
  assert.equal(g.coordinator.snapshot().session.active,false);assert.equal(g.sent.filter(([address])=>address===CLIP.fireSlot).length,2);
  assert.equal(g.sent.some(([address])=>address===CLIP.stopTrack),false,'an unobserved late start is never adopted or blindly stopped');
});

test('Session STOP only stops observed owned tracks; leaves arms, global transport and other track clips alone',async t=>{
  const f=fixture(t);f.flags[2].playing=0;f.song.tracks[2].clipSlots[0].clip={name:'Other',handle:{id:'other'}};
  await f.coordinator.recordSession(f.request(),f.context);const before=f.sent.length;
  await f.coordinator.stop(f.context);
  assert.deepEqual(f.sent.slice(before).filter(([address])=>address===CLIP.stopTrack).map(([,args])=>args[0].value),[0,1]);
  assert.equal(f.flags[2].playing,0);assert.equal(f.coordinator.snapshot().session.active,false);assert.deepEqual(f.writes,[]);
  assert.deepEqual(mutations(f).map(([address])=>address),[CLIP.fireSlot,CLIP.fireSlot,CLIP.stopTrack,CLIP.stopTrack]);
});

test('Session STOP refreshes each target boundary and skips a foreign clip started during another target stop',async t=>{
  const f=fixture(t);await f.coordinator.recordSession(f.request(),f.context);
  f.setHook((address,args)=>{if(address===CLIP.stopTrack&&args[0].value===0)f.flags[1].playing=2;});
  await f.coordinator.stopSession(f.context);
  assert.deepEqual(f.sent.filter(([address])=>address===CLIP.stopTrack).map(([,args])=>args[0].value),[0]);assert.equal(f.flags[1].playing,2);
});

for(const phase of ['general STOP read','per-target STOP read','refresh flag read'])for(const property of ['playingSlot','firedSlot'])test('Session ownership retires '+property+' foreign-return observations during '+phase,async t=>{
  const f=fixture(t);await f.coordinator.recordSession(f.request(),f.context);
  let indexReads=0,injected=false;
  f.setHook((address,args)=>{
    if(args[0]?.value!==0)return;
    if(address===SESSION_REC[property])indexReads++;
    const inject=phase==='refresh flag read'?address===SESSION_REC.recording:address===SESSION_REC[property]&&indexReads===(phase==='general STOP read'?1:2);
    if(injected||!inject)return;
    injected=true;
    // Both real OSC observations arrive before this read finishes. The last
    // sample alone agrees with the former owner, but cannot restore ownership.
    f.push(SESSION_REC[property],[0,2]);f.push(SESSION_REC[property],[0,1]);
  });
  const before=f.sent.length;
  if(phase==='refresh flag read')await f.coordinator.refreshSession(0);
  await f.coordinator.stopSession(f.context);assert.equal(injected,true);
  assert.deepEqual(f.sent.slice(before).filter(([address])=>address===CLIP.stopTrack).map(([,args])=>args[0].value),[1],'only the unaffected target remains authorized for track stop');
  assert.equal(f.flags[0].playing,1);assert.equal(f.flags[1].playing,-1);assert.deepEqual(f.writes,[]);
  const stopped=f.sent.length;await f.coordinator.refreshSession(0);await f.coordinator.stopSession(f.context);
  assert.equal(f.sent.slice(stopped).some(([address])=>address===CLIP.stopTrack),false,'returning to the same clip cannot reacquire retired ownership');
});

test('Session ten-input cohort and STOP include every armed input independently of the visible grid window',async t=>{
  const f=fixture(t,10),request=f.request();await f.coordinator.refreshSession(8);
  const result=await f.coordinator.recordSession(request,f.context);assert.equal(result.session.owned.length,10);
  assert.deepEqual(f.sent.filter(([address])=>address===CLIP.fireSlot).map(([,args])=>args[0].value),Array.from({length:10},(_,index)=>index));
  await f.coordinator.stopSession(f.context);assert.deepEqual(f.sent.filter(([address])=>address===CLIP.stopTrack).map(([,args])=>args[0].value),Array.from({length:10},(_,index)=>index));
  assert.deepEqual(f.writes,[]);
});

test('Session SDK lag keeps STOP pending until fresh recording identity is observed, without adopting at STOP',async t=>{
  const f=fixture(t);f.mode('queued');await f.coordinator.recordSession(f.request(),f.context);
  for(let index=0;index<2;index++){Object.assign(f.flags[index],{fired:-1,playing:1,triggered:false,recording:true});f.song.tracks[index].clipSlots[1].clip={name:'Created',handle:{id:'late-'+index}};}
  await assert.rejects(f.coordinator.stopSession(f.context),/SESSION_STOP_PENDING/);assert.equal(f.sent.some(([address])=>address===CLIP.stopTrack),false);
  await f.coordinator.refreshSession(0);await f.coordinator.stopSession(f.context);assert.equal(f.coordinator.snapshot().session.active,false);
});

test('Session contradictory has_clip cannot bind or stop a clip whose SDK and playing index disagree',async t=>{
  const f=fixture(t);await f.coordinator.recordSession(f.request(),f.context);f.block.add(SESSION_REC.hasClip);
  f.setHook((address,args)=>{if(address===SESSION_REC.hasClip)f.push(address,[args[0].value,args[1].value,false]);});
  const before=f.sent.length;await assert.rejects(f.coordinator.stopSession(f.context),/SESSION_STOP_PENDING/);
  assert.equal(f.sent.slice(before).some(([address])=>address===CLIP.stopTrack),false);
  f.setHook(()=>{});f.block.clear();await f.coordinator.stopSession(f.context);assert.equal(f.coordinator.snapshot().session.active,false);
  const g=fixture(t);g.block.add(SESSION_REC.hasClip);g.setHook((address,args)=>{if(address===SESSION_REC.hasClip)g.push(address,[args[0].value,args[1].value,false]);});
  await assert.rejects(g.coordinator.recordSession(g.request(),g.context),/SESSION_UNCONFIRMED/);
  assert.equal(g.sent.some(([address])=>address===CLIP.stopTrack),false);
});

for(const change of ['slot filled','OSC filled','meter changed','session retired','Set changed'])test('Session rechecks '+change+' between sequential fires and cleans only its first target',async t=>{
  const f=fixture(t);f.setHook((address,args)=>{if(address===CLIP.fireSlot&&args[0].value===0){
    if(change==='slot filled')f.song.tracks[1].clipSlots[1].clip={name:'Foreign',handle:{id:'foreign'}};
    if(change==='OSC filled')f.push(SESSION_REC.hasClip,[1,1,true]);
    if(change==='meter changed')f.push(REC_PREFLIGHT.signatureNumerator,[7]);
    if(change==='session retired')f.retire();
    if(change==='Set changed')f.replace({...f.song});
  }});
  await assert.rejects(f.coordinator.recordSession(f.request(),f.context),/SLOT_NOT_EMPTY|SESSION_CONFLICT|SESSION|IDENTITY/);
  assert.equal(f.sent.filter(([address])=>address===CLIP.fireSlot).length,1);
  assert.deepEqual(f.sent.filter(([address])=>address===CLIP.stopTrack).map(([,args])=>args[0].value),['session retired','Set changed'].includes(change)?[]:[0]);
});

for(const change of ['foreign index','replacement','track replacement','scene replacement'])test('Session STOP preserves '+change+' and cannot reacquire a foreign-returned target',async t=>{
  const f=fixture(t);await f.coordinator.recordSession(f.request(),f.context);
  if(change==='foreign index')f.flags[0].playing=2;
  if(change==='replacement')f.song.tracks[0].clipSlots[1].clip={name:'Foreign',handle:{id:'foreign'}};
  if(change==='track replacement')f.song.tracks[0]={...f.song.tracks[0],handle:{id:'new-track'}};
  if(change==='scene replacement')f.song.scenes[1]={name:'Other scene',handle:{id:'new-scene'}};
  await f.coordinator.refreshSession(0);f.flags[0].playing=1;
  const before=f.sent.length;await f.coordinator.stopSession(f.context);
  const stopped=f.sent.slice(before).filter(([address])=>address===CLIP.stopTrack).map(([,args])=>args[0].value);
  assert.deepEqual(stopped,change==='scene replacement'?[]:[1]);assert.equal(f.flags[0].playing,1);
});

test('Session STOP retains observed pending ownership for a bounded explicit retry without writing global quantization',async t=>{
  const f=fixture(t);await f.coordinator.recordSession(f.request(),f.context);f.delayStop(true);
  await assert.rejects(f.coordinator.stopSession(f.context),/SESSION_STOP_PENDING/);
  assert.equal(f.coordinator.snapshot().session.stopping,true);const before=f.sent.length;
  await f.coordinator.refreshSession(0);assert.equal(f.sent.slice(before).some(([address])=>address===CLIP.stopTrack),false);
  f.delayStop(false);await f.coordinator.stopSession(f.context);assert.equal(f.coordinator.snapshot().session.active,false);
});

for(const kind of ['occupied','OSC occupied','outside arm','missing arm','group','reorder','slot replacement','duplicate','wrong scene','old Song token'])test('Session REC rejects '+kind+' before firing any slot',async t=>{
  const f=fixture(t),request=f.request();
  if(kind==='occupied')f.song.tracks[1].clipSlots[1].clip={name:'Do not replace',handle:{id:'existing'}};
  if(kind==='OSC occupied')f.setHook((address,args)=>{if(address===SESSION_REC.hasClip)f.push(address,[args[0].value,1,true]);});
  if(kind==='outside arm')f.song.tracks[2].arm=true;
  if(kind==='missing arm')f.song.tracks[1].arm=false;
  if(kind==='group')f.song.tracks[1].canArm=false;
  if(kind==='reorder')f.song.tracks.reverse();
  if(kind==='slot replacement')f.song.tracks[1].clipSlots[1]={handle:{id:'new-slot'},clip:null};
  if(kind==='duplicate')request.targets[1]=request.targets[0];
  if(kind==='wrong scene')request.scene={...request.scene,id:'old'};
  if(kind==='old Song token')f.replace({...f.song});
  if(kind==='OSC occupied')f.block.add(SESSION_REC.hasClip);
  await assert.rejects(f.coordinator.recordSession(request,f.context),/SLOT_NOT_EMPTY|OTHER_ARMED|TRACK_NOT_ARMED|IDENTITY/);
  assert.deepEqual(mutations(f),[]);
});

test('Session strict duration/quantization/reference schema rejects invalid values without writes',async t=>{
  const f=fixture(t);
  for(const invalid of [{bars:3},{bars:'4'},{bars:0},{bars:4.5},{quantization:0},{quantization:'clip-global'},{extra:true},{targets:[]},{scene:{index:1,id:'scene-1',name:'Scene 2',extra:true}}])await assert.rejects(f.coordinator.recordSession({...f.request(),...invalid},f.context),/ARGUMENTS|IDENTITY/);
  assert.deepEqual(mutations(f),[]);
});

for(const kind of ['link','Set','session'])test('Session '+kind+' loss retires ownership without any stop or replay after recovery',async t=>{
  const f=fixture(t);await f.coordinator.recordSession(f.request(),f.context);const before=f.sent.length;
  if(kind==='link'){f.osc.state.connected=false;f.osc.emit('link-lost');f.osc.state.connected=true;}
  if(kind==='Set')f.replace({...f.song});
  if(kind==='session')f.retire();
  await f.coordinator.refreshSession(0);assert.equal(f.coordinator.snapshot().session.active,false);
  assert.equal(f.sent.slice(before).some(([address])=>[CLIP.fireSlot,CLIP.stopTrack].includes(address)),false);
});

test('Session STOP interrupts preflight without waiting for a missing GET and cannot leak a late fire',async t=>{
  const f=fixture(t);f.block.add(SESSION_REC.hasClip);
  const start=f.coordinator.recordSession(f.request(),f.context),rejected=assert.rejects(start,/STOPPED/);await flush();
  await f.coordinator.stopSession(f.context);await rejected;f.block.clear();await f.coordinator.refreshSession(0);
  assert.deepEqual(mutations(f),[]);assert.equal(f.coordinator.snapshot().pending,null);
});

test('Session partial fire failure cleans only emitted confirmed targets, preserving untouched clips',async t=>{
  const f=fixture(t);f.setHook((address,args)=>{if(address===CLIP.fireSlot&&args[0].value===1)throw Error('second send failed');});
  await assert.rejects(f.coordinator.recordSession(f.request(),f.context),/second send failed/);
  assert.equal(f.flags[0].playing,-1);assert.equal(f.song.tracks[1].clipSlots[1].clip,null);
  assert.deepEqual(f.sent.filter(([address])=>address===CLIP.stopTrack).map(([,args])=>args[0].value),[0]);assert.deepEqual(f.writes,[]);
});

test('Session a false playing ACK cannot adopt a foreign nonrecording clip for STOP',async t=>{
  const f=fixture(t);f.mode('foreign-playing');
  await assert.rejects(f.coordinator.recordSession(f.request(),f.context),/SESSION_UNCONFIRMED/);
  assert.equal(f.sent.some(([address])=>address===CLIP.stopTrack),false);assert.equal(f.flags[0].playing,1);
});

test('Session missing observations are unknown and time out without sending a fire',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});const f=fixture(t);f.block.add(SESSION_REC.playingSlot);
  const start=f.coordinator.recordSession(f.request(),f.context),rejected=assert.rejects(start,/SESSION_UNKNOWN/);await flush();t.mock.timers.tick(2001);await rejected;
  assert.deepEqual(mutations(f),[]);assert.equal(f.coordinator.snapshot().pending,null);
});
