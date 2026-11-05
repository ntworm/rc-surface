// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchCommand, COMMAND_SIDE_EFFECTS } from '../src/server/command-dispatch.ts';
import { commands } from '../src/live/mappings.ts';
import { AudioTrack, AudioClip } from '@ableton-extensions/sdk';

test('the waveform wiring proves the audio types with the real SDK classes', () => {
  assert.equal(typeof AudioTrack, 'function', 'the SDK exports the audio track class');
  assert.equal(typeof AudioClip, 'function', 'the SDK exports the audio clip class');
  assert.notEqual(AudioTrack, AudioClip);
  // A shaped object is never an SDK audio track or clip: only the real
  // classes are a proof, never a name of a class and never an invented
  // property.
  const shaped = { handle: { id: 'track-1' }, name: 'Guitar', arrangementClips: [], audioClips: [] };
  assert.equal(shaped instanceof AudioTrack, false);
  assert.equal(shaped instanceof AudioClip, false);
});
import { recordingCoordinator, recordingCue, recordingMarker, recordingTakeMarking, recordingTakeNotes, recordingArrangement, recordingWaveform } from '../src/live/recording-commands.ts';

const originalCoordinatorSnapshot = recordingCoordinator.snapshot;
const originalMarkerCreate = recordingMarker.create;

const writes = {
  recordingSelectTrack:{index:0,id:'1',name:'Track'}, recordingSetPoint:{beats:0}, recordingLocator:{direction:'next'},
  recordingArm:{enabled:true,track:{index:0,id:'1',name:'Track'}},recordingPrepare:{},recordingStart:{token:'test'},recordingStop:{},
  recordingTrackControl:{track:{index:0,id:'1',name:'Track'},property:'arm',enabled:true,armMode:'multi'},
  recordingArmTracks:{scope:'scope-token',group:null,tracks:[{index:0,id:'1',name:'Track'}],enabled:true,armMode:'multi'},
  recordingRenameTrack:{track:{index:0,id:'1',name:'Track'},name:'Renamed'},
  recordingAudition:{disarm:true},recordingClick:{enabled:true},recordingMark:{mark:'good'},
  recordingRecord:{track:{index:0,id:'1',name:'Track'},range:{start:{name:'Start',time:0},end:null,loop:false}},
  recordingSeekMarker:{name:'Start',time:0},
  recordingSessionRecord:{songId:'test',scene:{index:0,id:'scene',name:'Scene'},targets:[{track:{index:0,id:'1',name:'Track'},slotId:'slot'}],bars:4,quantization:'global'},recordingSessionStop:{},
  recordingReturnToArrangement:{},
  recordingCreateMarker:{scope:'scope-token'},
  recordingMarkTake:{scope:'scope-token',track:{index:0,id:'1',name:'Track'},lane:{index:0,id:'2',name:'Lane'},
    clip:{index:0,id:'3',name:'Take',startTime:0,endTime:4,reference:'scope-token#o1.o2.o3'},mark:'good'},
};
test('REC commands are in the actual mappings registry and viewer cannot invoke any mutation',async () => {
  assert.equal(COMMAND_SIDE_EFFECTS.getRecordingState,'read');
  assert.ok(commands.getRecordingState);
  for (const [cmd,args] of Object.entries(writes)) {
    assert.ok(commands[cmd],cmd); assert.equal(COMMAND_SIDE_EFFECTS[cmd],'live-write',cmd);
    const denied = await dispatchCommand('viewer',{cmd,args},{clientId:'viewer',isCurrent:()=>true});
    assert.equal(denied.ok,false); assert.match(denied.error,/Unauthorized/);
    const noSocket = await dispatchCommand('controller',{cmd,args});
    assert.equal(noSocket.ok,false); assert.match(noSocket.error,/REC:SESSION/,cmd);
  }
});

test('Session REC dispatch forwards strict request/current context and keeps reads viewer-safe',async t=>{
  const originals={recordSession:recordingCoordinator.recordSession,stopSession:recordingCoordinator.stopSession,refreshSession:recordingCoordinator.refreshSession},calls=[];
  for(const method of Object.keys(originals))recordingCoordinator[method]=async(...args)=>{calls.push([method,...args]);return {session:{active:false}};};
  t.after(()=>Object.assign(recordingCoordinator,originals));const context={clientId:'session',isCurrent:()=>true};
  for(const role of ['controller','admin']){
    assert.equal((await dispatchCommand(role,{cmd:'recordingSessionRecord',args:writes.recordingSessionRecord},context)).ok,true);
    assert.deepEqual(calls.at(-1),['recordSession',writes.recordingSessionRecord,context]);
  }
  assert.equal((await dispatchCommand('controller',{cmd:'recordingSessionStop',args:{}},context)).ok,true);assert.deepEqual(calls.at(-1),['stopSession',context]);
  assert.equal(COMMAND_SIDE_EFFECTS.getSessionRecordingState,'read');
  assert.equal((await dispatchCommand('viewer',{cmd:'getSessionRecordingState',args:{offset:8}})).ok,true);assert.deepEqual(calls.at(-1),['refreshSession',8]);
  const before=calls.length;
  for(const [cmd,args] of [['recordingSessionRecord',{...writes.recordingSessionRecord,preRollBars:1}],['recordingSessionStop',{all:true}],['getSessionRecordingState',{}]])assert.equal((await dispatchCommand('admin',{cmd,args},context)).ok,false);
  assert.equal(calls.length,before);
});
test('REC explicit Arrangement return dispatch is controller/admin only with an exact empty schema',async t=>{
  const original=recordingCoordinator.returnToArrangement,calls=[];recordingCoordinator.returnToArrangement=async context=>{calls.push(context);return {observed:true};};t.after(()=>{recordingCoordinator.returnToArrangement=original;});
  const context={clientId:'return',isCurrent:()=>true};assert.equal((await dispatchCommand('controller',{cmd:'recordingReturnToArrangement',args:{}},context)).ok,true);assert.deepEqual(calls,[context]);
  assert.equal((await dispatchCommand('controller',{cmd:'recordingReturnToArrangement',args:{enabled:true}},context)).ok,false);assert.equal(calls.length,1);
});

test('REC grid dispatch forwards exact cohort and track controls and rejects mixed or extra schemas',async t=>{
  const originals={record:recordingCoordinator.record,trackControl:recordingCoordinator.trackControl},calls=[];
  for(const method of Object.keys(originals))recordingCoordinator[method]=async (...args)=>{calls.push({method,args});return {observed:true};};
  t.after(()=>Object.assign(recordingCoordinator,originals));
  const context={clientId:'grid',isCurrent:()=>true},track={index:0,id:'11',name:'Input'},range=writes.recordingRecord.range;
  let result=await dispatchCommand('controller',{cmd:'recordingRecord',args:{tracks:[track],range,preRollBars:1}},context);
  assert.equal(result.ok,true);assert.deepEqual(calls.at(-1),{method:'record',args:[[track],range,context,1]});
  for(const property of ['arm','solo','mute']) {
    const args={track,property,enabled:true,...(property==='arm'?{armMode:'exclusive'}:{})};
    result=await dispatchCommand('controller',{cmd:'recordingTrackControl',args},context);
    assert.equal(result.ok,true);assert.deepEqual(calls.at(-1),{method:'trackControl',args:[track,property,true,property==='arm'?'exclusive':'multi',context]});
  }
  const count=calls.length;
  for(const [cmd,args] of [['recordingRecord',{tracks:[track],track,range}],['recordingTrackControl',{track,property:'arm',enabled:true}],['recordingTrackControl',{track,property:'solo',enabled:true,armMode:'exclusive'}]]) {
    result=await dispatchCommand('controller',{cmd,args},context);assert.equal(result.ok,false);assert.match(result.error,/ARGUMENTS/);
  }
  assert.equal(calls.length,count);
});

test('REC rename dispatch preserves exact reference and name and rejects extra mutation arguments',async t=>{
  const original=recordingCoordinator.renameTrack,calls=[],context={clientId:'rename',isCurrent:()=>true};
  recordingCoordinator.renameTrack=async(...args)=>{calls.push(args);return {observed:true};};
  t.after(()=>{recordingCoordinator.renameTrack=original;});
  const args=writes.recordingRenameTrack;
  assert.equal((await dispatchCommand('controller',{cmd:'recordingRenameTrack',args},context)).ok,true);
  assert.deepEqual(calls[0],[args.track,args.name,context]);
  for(const invalid of [{track:args.track},{...args,enabled:true},{...args,armMode:'exclusive'}]) {
    const result=await dispatchCommand('controller',{cmd:'recordingRenameTrack',args:invalid},context);
    assert.equal(result.ok,false);assert.match(result.error,/ARGUMENTS/);
  }
  assert.equal(calls.length,1);
});
test('REC real dispatch routes STOP with the current socket and rejects extra arguments',async t => {
  const original = recordingCoordinator.stop;
  let called = 0;
  recordingCoordinator.stop = async context => { assert.equal(context.clientId,'current'); called++; return {observed:true}; };
  t.after(()=>{recordingCoordinator.stop=original;});
  const result = await dispatchCommand('controller',{cmd:'recordingStop',args:{}},{clientId:'current',isCurrent:()=>true});
  assert.deepEqual(result.result,{observed:true}); assert.equal(called,1);
  const invalid = await dispatchCommand('controller',{cmd:'recordingStop',args:{toggle:true}},{clientId:'current',isCurrent:()=>true});
  assert.equal(invalid.ok,false); assert.match(invalid.error,/ARGUMENTS/); assert.equal(called,1);
});

test('REC manual arm dispatch requires the viewed track reference and forwards it with the current client',async t=>{
  const original=recordingCoordinator.arm,track={index:0,id:'11',name:'Guitar'};let called=0;
  recordingCoordinator.arm=async (enabled,expected,context)=>{
    called++;assert.equal(enabled,true);assert.deepEqual(expected,track);assert.equal(context.clientId,'phone-a');return {observed:true};
  };
  t.after(()=>{recordingCoordinator.arm=original;});
  const context={clientId:'phone-a',isCurrent:()=>true};
  const invalid=await dispatchCommand('controller',{cmd:'recordingArm',args:{enabled:true}},context);
  assert.equal(invalid.ok,false);assert.match(invalid.error,/ARGUMENTS/);assert.equal(called,0);
  const result=await dispatchCommand('controller',{cmd:'recordingArm',args:{enabled:true,track}},context);
  assert.equal(result.ok,true);assert.equal(called,1);
});

test('REC dispatch forwards optional pre-roll bars explicitly and preserves legacy OFF calls while rejecting extras',async t=>{
  const original=recordingCoordinator.record,calls=[];
  recordingCoordinator.record=async (...args)=>{calls.push(args);return {observed:true};};
  t.after(()=>{recordingCoordinator.record=original;});
  const args=writes.recordingRecord,context={clientId:'phone-a',isCurrent:()=>true};
  for(const bars of [undefined,0,1,2,4,null]) {
    const result=await dispatchCommand('controller',{cmd:'recordingRecord',args:{...args,...(bars===undefined?{}:{preRollBars:bars})}},context);
    assert.equal(result.ok,true);assert.deepEqual(calls.at(-1),[args.track,args.range,context,bars===undefined?0:bars]);
  }
  const before=calls.length;
  const denied=await dispatchCommand('controller',{cmd:'recordingRecord',args:{...args,preRollBars:1,toggle:true}},context);
  assert.equal(denied.ok,false);assert.match(denied.error,/ARGUMENTS/);assert.equal(calls.length,before);
});

test('REC marker dispatch is controller/admin only with an exact schema and forwards the scope and context',async t=>{
  const originalCreate=recordingMarker.create,originalSnapshot=recordingCoordinator.snapshot,calls=[];
  recordingMarker.create=async(scope,context)=>{
    if(typeof scope!=='string'||!scope)throw Error('REC:ARGUMENTS');
    if(!context)throw Error('REC:SESSION');
    calls.push([scope,context]);
    return {name:'Mark 1',time:8,existing:false,observedAt:42};
  };
  recordingCoordinator.snapshot=()=>({scope:'scope-token'});
  t.after(()=>{recordingMarker.create=originalCreate;recordingCoordinator.snapshot=originalSnapshot;});
  const context={clientId:'marker',isCurrent:()=>true};
  assert.equal(COMMAND_SIDE_EFFECTS.recordingCreateMarker,'live-write');
  assert.ok(commands.recordingCreateMarker);
  const denied=await dispatchCommand('viewer',{cmd:'recordingCreateMarker',args:{scope:'scope-token'}},context);
  assert.equal(denied.ok,false);assert.match(denied.error,/Unauthorized/);
  for(const role of ['controller','admin']) {
    const result=await dispatchCommand(role,{cmd:'recordingCreateMarker',args:{scope:'scope-token'}},context);
    assert.equal(result.ok,true);
    assert.deepEqual(calls.at(-1),['scope-token',context]);
    assert.deepEqual(result.result.markerResult,{name:'Mark 1',time:8,existing:false,observedAt:42});
    assert.equal(result.result.scope,'scope-token','the marker result carries the coordinator snapshot');
  }
  const count=calls.length;
  for(const args of [{},{scope:'scope-token',extra:true},{token:'x'},{scope:7}]) {
    const bad=await dispatchCommand('controller',{cmd:'recordingCreateMarker',args},context);
    assert.equal(bad.ok,false);assert.match(bad.error,/ARGUMENTS/);
  }
  assert.equal(calls.length,count);
  const noSocket=await dispatchCommand('controller',{cmd:'recordingCreateMarker',args:{scope:'scope-token'}});
  assert.equal(noSocket.ok,false);assert.match(noSocket.error,/REC:SESSION/);
});

test('coordinator snapshot and marker create were restored to their original owners after marker dispatch test', () => {
  assert.equal(recordingCoordinator.snapshot, originalCoordinatorSnapshot);
  assert.equal(recordingMarker.create, originalMarkerCreate);
});

test('REC stop and sessionStop validate context before canceling marker and reject missing/stale context', async t => {
  const cancel = recordingMarker.cancel, markCancel = recordingTakeMarking.cancel;
  const stop = recordingCoordinator.stop, stopSession = recordingCoordinator.stopSession;
  const calls = [];
  recordingMarker.cancel = () => { calls.push('cancel'); };
  recordingTakeMarking.cancel = () => { calls.push('mark-cancel'); };
  recordingCoordinator.stop = async context => { calls.push(['stop', context]); return { observed: true }; };
  recordingCoordinator.stopSession = async context => { calls.push(['stopSession', context]); return { observed: true }; };
  t.after(() => {
    recordingMarker.cancel = cancel;
    recordingTakeMarking.cancel = markCancel;
    recordingCoordinator.stop = stop;
    recordingCoordinator.stopSession = stopSession;
  });

  for (const cmd of ['recordingStop', 'recordingSessionStop']) {
    const missing = await dispatchCommand('controller', { cmd, args: {} });
    assert.equal(missing.ok, false);
    assert.match(missing.error, /REC:SESSION/);
    assert.equal(calls.length, 0, cmd + ' missing context does not cancel marker or invoke coordinator');

    const staleContext = { clientId: 'stale', isCurrent: () => false };
    const stale = await dispatchCommand('controller', { cmd, args: {} }, staleContext);
    assert.equal(stale.ok, false);
    assert.match(stale.error, /REC:SESSION/);
    assert.equal(calls.length, 0, cmd + ' stale context does not cancel marker or invoke coordinator');
  }
});

test('REC stop retires a pending marker, a pending take mark and a pending waveform before the coordinator stop and never awaits it',async t=>{
  const cancel=recordingMarker.cancel,markCancel=recordingTakeMarking.cancel,waveCancel=recordingWaveform.cancel;
  const stop=recordingCoordinator.stop,stopSession=recordingCoordinator.stopSession,calls=[];
  recordingMarker.cancel=()=>{calls.push('cancel');};
  recordingTakeMarking.cancel=()=>{calls.push('mark-cancel');};
  recordingWaveform.cancel=()=>{calls.push('waveform-cancel');};
  recordingCoordinator.stop=async context=>{calls.push(['stop',context]);return {observed:true};};
  recordingCoordinator.stopSession=async context=>{calls.push(['stopSession',context]);return {observed:true};};
  t.after(()=>{recordingMarker.cancel=cancel;recordingTakeMarking.cancel=markCancel;recordingWaveform.cancel=waveCancel;recordingCoordinator.stop=stop;recordingCoordinator.stopSession=stopSession;});
  const context={clientId:'stop',isCurrent:()=>true};
  const stopped=await dispatchCommand('controller',{cmd:'recordingStop',args:{}},context);
  assert.equal(stopped.ok,true);
  assert.deepEqual(calls[0],'cancel','the marker is retired before the coordinator stop');
  assert.deepEqual(calls[1],'mark-cancel','the take mark is retired before the coordinator stop');
  assert.deepEqual(calls[2],'waveform-cancel','the waveform is retired before the coordinator stop');
  assert.deepEqual(calls[3],['stop',context]);
  calls.length=0;
  const session=await dispatchCommand('controller',{cmd:'recordingSessionStop',args:{}},context);
  assert.equal(session.ok,true);
  assert.deepEqual(calls[0],'cancel');
  assert.deepEqual(calls[1],'mark-cancel');
  assert.deepEqual(calls[2],'waveform-cancel');
  assert.deepEqual(calls[3],['stopSession',context]);
});

test('REC take mark dispatch is a live write with one exact schema and forwards the clip reference',async t=>{
  const original=recordingTakeMarking.mark,calls=[];
  recordingTakeMarking.mark=async(request,context)=>{
    calls.push([request,context]);
    if(!context)throw Error('REC:SESSION');
    return {scope:request.scope,track:request.track,lane:request.lane,clip:{...request.clip,mark:request.mark}};
  };
  t.after(()=>{recordingTakeMarking.mark=original;});
  const context={clientId:'takes',isCurrent:()=>true},args=writes.recordingMarkTake;
  assert.equal(COMMAND_SIDE_EFFECTS.recordingMarkTake,'live-write');
  assert.ok(commands.recordingMarkTake);
  const denied=await dispatchCommand('viewer',{cmd:'recordingMarkTake',args},context);
  assert.equal(denied.ok,false);assert.match(denied.error,/Unauthorized/);
  for(const role of ['controller','admin']){
    const result=await dispatchCommand(role,{cmd:'recordingMarkTake',args},context);
    assert.equal(result.ok,true,result.error);
    assert.deepEqual(calls.at(-1)[0],args,'the request reaches the service unchanged');
    assert.deepEqual(calls.at(-1)[1],context,'the current context reaches the service');
    assert.equal(result.result.clip.mark,'good');
    assert.equal(result.result.clip.reference,args.clip.reference);
  }
  const count=calls.length;
  for(const bad of [{},{...args,extra:true},{scope:args.scope,track:args.track,lane:args.lane,clip:args.clip}]){
    const result=await dispatchCommand('controller',{cmd:'recordingMarkTake',args:bad},context);
    assert.equal(result.ok,false,JSON.stringify(bad));
    assert.match(result.error,/ARGUMENTS/);
  }
  assert.equal(calls.length,count,'a wrong schema never reaches the service');
  // The nested schema is the service's own contract, refused before the host.
  recordingTakeMarking.mark=original;
  for(const bad of [{...args,mark:'maybe'},{...args,mark:undefined},{...args,clip:{...args.clip,reference:''}}]){
    const nested=await dispatchCommand('controller',{cmd:'recordingMarkTake',args:bad},context);
    assert.equal(nested.ok,false,JSON.stringify(bad));
    assert.match(nested.error,/ARGUMENTS/);
  }
  const noSocket=await dispatchCommand('controller',{cmd:'recordingMarkTake',args});
  assert.equal(noSocket.ok,false);assert.match(noSocket.error,/REC:SESSION/);
});

test('the take-lane catalog is a viewer-safe read with one exact request schema',async t=>{
  const original=recordingTakeNotes.list,calls=[];
  const canned={scope:'scope-token',track:{index:0,id:'1',name:'Track'},lanes:[],page:{laneOffset:0,clipOffset:0,next:null}};
  recordingTakeNotes.list=request=>{
    calls.push(request);
    try{return original.call(recordingTakeNotes,request);}
    catch(error){
      // The real service needs a host Song; the request itself is still checked.
      if(error instanceof Error&&/extension context not ready|no song loaded/.test(error.message))return canned;
      throw error;
    }
  };
  t.after(()=>{recordingTakeNotes.list=original;});
  const context={clientId:'takes',isCurrent:()=>true};
  const args={scope:'scope-token',track:{index:0,id:'1',name:'Track'},laneOffset:0,clipOffset:0};
  assert.equal(COMMAND_SIDE_EFFECTS.getRecordingTakes,'read');
  assert.ok(commands.getRecordingTakes);
  for(const role of ['viewer','controller','admin']){
    const result=await dispatchCommand(role,{cmd:'getRecordingTakes',args},context);
    assert.equal(result.ok,true,result.error);
    assert.deepEqual(calls.at(-1),args,'the request reaches the service unchanged');
    assert.deepEqual(result.result,canned);
  }
  const count=calls.length;
  for(const bad of [{},{...args,extra:true},{scope:args.scope,track:args.track}]){
    const result=await dispatchCommand('viewer',{cmd:'getRecordingTakes',args:bad},context);
    assert.equal(result.ok,false,JSON.stringify(bad));
    assert.match(result.error,/ARGUMENTS/);
  }
  assert.equal(calls.length,count,'a wrong schema never reaches the service');
  for(const bad of [{...args,laneOffset:-1},{...args,clipOffset:'0'},{...args,scope:7},{...args,scope:undefined},{...args,track:{index:0,id:'',name:'Track'}}]){
    const result=await dispatchCommand('viewer',{cmd:'getRecordingTakes',args:bad},context);
    assert.equal(result.ok,false,JSON.stringify(bad));
    assert.match(result.error,/ARGUMENTS/);
  }
  assert.equal(calls.length,count+5,'a malformed value is refused by the service itself');
});

test('the cue diagnostic state is a viewer-safe read with one exact request schema',async t=>{
  const original=recordingCue.getState,calls=[];
  const canned={scope:'scope-token',returns:[{index:0,id:'ret-1',name:'Return A'}],returnTrack:{index:0,id:'ret-1',name:'Return A'},tracks:[],nextOffset:null,writeEnabled:false};
  recordingCue.getState=async request=>{
    calls.push(request);
    try{return await original.call(recordingCue,request);}
    catch(error){
      if(error instanceof Error&&/extension context not ready|no song loaded/.test(error.message))return canned;
      throw error;
    }
  };
  t.after(()=>{recordingCue.getState=original;});
  const context={clientId:'cue',isCurrent:()=>true};
  const args={scope:'scope-token',returnTrack:{index:0,id:'ret-1',name:'Return A'},offset:0};
  assert.equal(COMMAND_SIDE_EFFECTS.getRecordingCueState,'read');
  assert.ok(commands.getRecordingCueState);
  for(const role of ['viewer','controller','admin']){
    const result=await dispatchCommand(role,{cmd:'getRecordingCueState',args},context);
    assert.equal(result.ok,true,result.error);
    assert.deepEqual(calls.at(-1),args,'the request reaches the service unchanged');
    assert.deepEqual(result.result,canned);
  }
  const count=calls.length;
  for(const bad of [{},{...args,extra:true},{scope:args.scope,returnTrack:args.returnTrack}]){
    const result=await dispatchCommand('viewer',{cmd:'getRecordingCueState',args:bad},context);
    assert.equal(result.ok,false,JSON.stringify(bad));
    assert.match(result.error,/ARGUMENTS/);
  }
  assert.equal(calls.length,count,'a wrong schema never reaches the service');
  for(const bad of [{...args,offset:-1},{...args,offset:'0'},{...args,scope:7},{...args,returnTrack:{index:0,id:''}}]){
    const result=await dispatchCommand('viewer',{cmd:'getRecordingCueState',args:bad},context);
    assert.equal(result.ok,false,JSON.stringify(bad));
    assert.match(result.error,/ARGUMENTS/);
  }
  assert.equal(calls.length,count+4,'a malformed value is refused by the service itself');
});

test('the Arrangement catalog is a viewer-safe read with one exact request schema',async t=>{
  const original=recordingArrangement.list,calls=[];
  const canned={scope:'scope-token',track:{index:0,id:'1',name:'Track'},clips:[],page:{offset:0,next:null}};
  recordingArrangement.list=request=>{
    calls.push(request);
    try{return original.call(recordingArrangement,request);}
    catch(error){
      if(error instanceof Error&&/extension context not ready|no song loaded/.test(error.message))return canned;
      throw error;
    }
  };
  t.after(()=>{recordingArrangement.list=original;});
  const context={clientId:'arrangement',isCurrent:()=>true};
  const args={scope:'scope-token',track:{index:0,id:'1',name:'Track'},offset:0};
  assert.equal(COMMAND_SIDE_EFFECTS.getRecordingArrangement,'read');
  assert.ok(commands.getRecordingArrangement);
  for(const role of ['viewer','controller','admin']){
    const result=await dispatchCommand(role,{cmd:'getRecordingArrangement',args},context);
    assert.equal(result.ok,true,result.error);
    assert.deepEqual(calls.at(-1),args,'the request reaches the service unchanged');
    assert.deepEqual(result.result,canned);
  }
  const count=calls.length;
  for(const bad of [{},{...args,extra:true},{scope:args.scope,track:args.track}]){
    const result=await dispatchCommand('viewer',{cmd:'getRecordingArrangement',args:bad},context);
    assert.equal(result.ok,false,JSON.stringify(bad));
    assert.match(result.error,/ARGUMENTS/);
  }
  assert.equal(calls.length,count,'a wrong schema never reaches the service');
});

test('the Arrangement waveform is a viewer-safe read with one exact request schema',async t=>{
  const original=recordingWaveform.get,calls=[];
  const canned={scope:'scope-token',track:{index:0,id:'1',name:'Track'},clip:{index:0,id:'2',name:'Clip',startTime:0,endTime:4},startTime:0,endTime:4,peaks:[0,0.5]};
  recordingWaveform.get=async(request,context)=>{calls.push([request,context]);return canned;};
  t.after(()=>{recordingWaveform.get=original;});
  const context={clientId:'waveform',isCurrent:()=>true};
  const args={scope:'scope-token',track:{index:0,id:'1',name:'Track'},clip:{index:0,id:'2',name:'Clip',startTime:0,endTime:4},startTime:0,endTime:4};
  assert.equal(COMMAND_SIDE_EFFECTS.getRecordingWaveform,'read');
  assert.ok(commands.getRecordingWaveform);
  for(const role of ['viewer','controller','admin']){
    const result=await dispatchCommand(role,{cmd:'getRecordingWaveform',args},context);
    assert.equal(result.ok,true,result.error);
    assert.deepEqual(calls.at(-1)[0],args,'the request reaches the service unchanged');
    assert.deepEqual(calls.at(-1)[1],context,'the current execution context reaches the service');
    assert.deepEqual(result.result,canned);
  }
  const count=calls.length;
  for(const bad of [{},{...args,extra:true},{scope:args.scope,track:args.track,clip:args.clip,startTime:0},{scope:args.scope,track:args.track,clip:args.clip}]){
    const result=await dispatchCommand('viewer',{cmd:'getRecordingWaveform',args:bad},context);
    assert.equal(result.ok,false,JSON.stringify(bad));
    assert.match(result.error,/ARGUMENTS/);
  }
  assert.equal(calls.length,count,'a wrong schema never reaches the service');
  const noSocket=await dispatchCommand('viewer',{cmd:'getRecordingWaveform',args});
  assert.equal(noSocket.ok,false);
  assert.match(noSocket.error,/REC:SESSION/);
  const staleSocket=await dispatchCommand('viewer',{cmd:'getRecordingWaveform',args},{clientId:'stale',isCurrent:()=>false});
  assert.equal(staleSocket.ok,false);
  assert.match(staleSocket.error,/REC:SESSION/);
  assert.equal(calls.length,count,'a missing or stale context never reaches the service');
});

test('the cohort ARM is a live write with one exact schema and forwards the request',async t=>{
  const original=recordingCoordinator.armTracks,calls=[];
  recordingCoordinator.armTracks=async(...args)=>{calls.push(args);return {observed:true};};
  t.after(()=>{recordingCoordinator.armTracks=original;});
  const context={clientId:'cohort',isCurrent:()=>true};
  const args={scope:'scope-token',group:null,tracks:[{index:0,id:'1',name:'Track'}],enabled:true,armMode:'multi'};
  assert.equal(COMMAND_SIDE_EFFECTS.recordingArmTracks,'live-write');
  assert.ok(commands.recordingArmTracks);
  const denied=await dispatchCommand('viewer',{cmd:'recordingArmTracks',args},context);
  assert.equal(denied.ok,false);assert.match(denied.error,/Unauthorized/);
  for(const role of ['controller','admin']){
    const result=await dispatchCommand(role,{cmd:'recordingArmTracks',args},context);
    assert.equal(result.ok,true,result.error);
    assert.deepEqual(calls.at(-1),[args,context],'the request and the current context reach the coordinator');
  }
  const count=calls.length;
  for(const bad of [{},{...args,extra:true},{scope:args.scope,group:args.group,tracks:args.tracks,enabled:args.enabled}]){
    const result=await dispatchCommand('controller',{cmd:'recordingArmTracks',args:bad},context);
    assert.equal(result.ok,false,JSON.stringify(bad));
    assert.match(result.error,/ARGUMENTS/);
  }
  assert.equal(calls.length,count,'a wrong schema never reaches the coordinator');
});
