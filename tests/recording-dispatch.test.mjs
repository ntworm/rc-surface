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
  recordingAudition:{disarm:true},recordingClick:{enabled:true},recordingMark:{mark:'good'},
  recordingRecord:{track:{index:0,id:'1',name:'Track'},range:{start:{name:'Start',time:0},end:null,loop:false}},
  recordingSeekMarker:{name:'Start',time:0},
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
