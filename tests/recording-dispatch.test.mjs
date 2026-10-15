// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchCommand, COMMAND_SIDE_EFFECTS } from '../src/server/command-dispatch.ts';
import { commands } from '../src/live/mappings.ts';
import { recordingCoordinator } from '../src/live/recording-commands.ts';

const writes = {
  recordingSelectTrack:{index:0,id:'1',name:'Track'}, recordingSetPoint:{beats:0}, recordingLocator:{direction:'next'},
  recordingArm:{enabled:true},recordingPrepare:{},recordingStart:{token:'test'},recordingStop:{},
  recordingAudition:{disarm:true},recordingClick:{enabled:true},recordingMark:{mark:'good'},
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
