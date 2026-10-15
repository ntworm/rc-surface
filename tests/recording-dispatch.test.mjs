// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchCommand, COMMAND_SIDE_EFFECTS } from '../src/server/command-dispatch.ts';
import { commands } from '../src/live/mappings.ts';
import { recordingCoordinator } from '../src/live/recording-commands.ts';

const writes = {
  recordingSelectTrack:{index:0,id:'1',name:'Track'}, recordingSetPoint:{beats:0}, recordingLocator:{direction:'next'},
  recordingArm:{enabled:true,track:{index:0,id:'1',name:'Track'}},recordingPrepare:{},recordingStart:{token:'test'},recordingStop:{},
  recordingTrackControl:{track:{index:0,id:'1',name:'Track'},property:'arm',enabled:true,armMode:'multi'},
  recordingRenameTrack:{track:{index:0,id:'1',name:'Track'},name:'Renamed'},
  recordingAudition:{disarm:true},recordingClick:{enabled:true},recordingMark:{mark:'good'},
  recordingRecord:{track:{index:0,id:'1',name:'Track'},range:{start:{name:'Start',time:0},end:null,loop:false}},
  recordingSeekMarker:{name:'Start',time:0},
  recordingSessionRecord:{songId:'test',scene:{index:0,id:'scene',name:'Scene'},targets:[{track:{index:0,id:'1',name:'Track'},slotId:'slot'}],bars:4,quantization:'global'},recordingSessionStop:{},
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
