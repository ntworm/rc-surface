// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { setExtensionContext, clearExtensionContext } from '../src/context.ts';
import { applyMapping, controlMappings, eventModesState, cancelPendingMappingWrites, configureMappingStorage,
  commands, visionLossWatchdog, retireLearnedPoseSession, getProjectConfigStatus } from '../src/live/mappings.ts';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

test.afterEach(async () => {
  await cancelPendingMappingWrites();
  controlMappings.clear();
  eventModesState.clear();
  clearExtensionContext();
});

for (const neutralPolicy of ['hold', 'release']) {
  test(`pose Safe loss ${neutralPolicy}: return ON restores output without duplicate held notes`, async () => {
    const packets = [];
    const parameter = { name: 'RC MIDI Packet v2', min: 0, max: 4194303, isQuantized: false,
      setValue: async value => packets.push([Math.floor(value / 128) % 128, value % 128]) };
    setExtensionContext({ application: { song: { tempo: 120, tracks: [
      { devices: [{ name: 'RC-Midi-Receiver', parameters: [parameter] }] },
    ] } } });
    const control = 'sensor.vision.gesture.1';
    controlMappings.set(control, [{ type: 'device_param', mode: 'trigger_note', trackIndex: 0,
      midiNote: 'C3', noteTiming: 'immediate', noteGate: 'hold', neutralPolicy }]);
    await applyMapping('phone', control, 1);
    await applyMapping('phone', 'sensor.vision.active', 0, true);
    assert.deepEqual(packets, [[60, 100]], 'active loss must wait for the pose channel grace');
    await applyMapping('phone', control, 0, true);
    await applyMapping('phone', control, 1);
    await applyMapping('phone', control, 1);
    assert.deepEqual(packets, neutralPolicy === 'hold' ? [[60, 100]] : [[60, 100], [60, 0], [60, 100]]);
    await applyMapping('phone', 'sensor.vision.active', 0);
    assert.deepEqual(packets.at(-1), [60, 0], 'camera OFF still releases held notes');
  });
}

test('host owns timed learned gate: fresh samples sustain one ON, unknown expires one OFF, stop/session stay idempotent', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vision-gates-'));
  let now=0,id=0;const timers=new Map(),packets=[];
  const original={...visionLossWatchdog.options};
  Object.assign(visionLossWatchdog.options,{now:()=>now,set:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:now+ms});return key;},clear:key=>timers.delete(key)});
  const advance=async(time)=>{now=time;for(const [key,timer] of [...timers]) if(timer.at<=now){timers.delete(key);timer.fn();}await new Promise(resolve=>setImmediate(resolve));};
  const parameter={name:'RC MIDI Packet v2',min:0,max:4194303,isQuantized:false,setValue:async value=>packets.push([Math.floor(value/128)%128,value%128])};
  setExtensionContext({application:{song:{tempo:120,tracks:[{name:'MIDI',devices:[{name:'RC-Midi-Receiver',parameters:[parameter]}]}]}}});
  const control='sensor.vision.gesture.1',tracking=(seq,qualified=true,activation=false)=>({seq,qualified,activation,graceMs:140});
  try {
    await configureMappingStorage(dir);
    controlMappings.set(control,[{type:'device_param',mode:'trigger_note',trackIndex:0,midiNote:'C3',noteGate:'hold',noteTiming:'immediate',neutralPolicy:'hold'}]);
    await applyMapping('phone',control,1,false,tracking(1,true,true));
    await advance(5000);await applyMapping('phone',control,1,false,tracking(2));
    assert.deepEqual(packets,[[60,100]]);
    await advance(14999);await applyMapping('phone',control,1,false,tracking(3,false));assert.equal(packets.length,1);
    await advance(15000);assert.deepEqual(packets,[[60,100],[60,0]]);
    await applyMapping('phone',control,1,false,tracking(4));assert.equal(packets.length,2,'retained activeName cannot revive expired voice');
    await applyMapping('phone',control,1,false,tracking(5,true,true));assert.deepEqual(packets.at(-1),[60,100]);
    const stale=[...timers.values()][0].fn;
    await retireLearnedPoseSession('phone');assert.deepEqual(packets.at(-1),[60,0]);
    await applyMapping('phone',control,1,false,tracking(1,true,true));
    stale();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(packets.at(-1),[60,100]);
    await applyMapping('phone','sensor.vision.active',0);await applyMapping('phone','sensor.vision.active',0);
    assert.deepEqual(packets,[[60,100],[60,0],[60,100],[60,0],[60,100],[60,0]]);
  } finally {await cancelPendingMappingWrites();Object.assign(visionLossWatchdog.options,original);await fs.rm(dir,{recursive:true,force:true});}
});

test('host validates loss policy atomically and preserves legacy safe-loss targets on import',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vision-policy-'));
  setExtensionContext({application:{song:{tracks:[],returnTracks:[],mainTrack:{devices:[]}}}});
  try {
    await configureMappingStorage(dir);
    assert.equal(getProjectConfigStatus().preferences.visionLoss.mode,'timeout');
    await commands.saveProjectClientState.handler({preferences:{visionLoss:{version:1,mode:'hold',timeoutMs:10000,legacy:false},unknownPreserved:7}});
    for(const value of [null,{version:1,mode:'magic',timeoutMs:10000,legacy:false}, {version:1,mode:'timeout',timeoutMs:NaN,legacy:false}]) {
      await assert.rejects(commands.saveProjectClientState.handler({preferences:{visionLoss:value,unknownPreserved:99},camera:{confidence:'low'}}));
      assert.equal(getProjectConfigStatus().preferences.unknownPreserved,7);
      assert.equal(getProjectConfigStatus().preferences.visionLoss.mode,'hold');
    }
    const exported=await commands.exportProjectConfig.handler({});
    const content=JSON.parse(exported.content);delete content.preferences.visionLoss;
    content.preferences.unknownPreserved=8;
    await commands.importProjectConfig.handler({content});
    assert.equal(getProjectConfigStatus().preferences.visionLoss.legacy,true);
    assert.equal(getProjectConfigStatus().preferences.unknownPreserved,8);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('VID card removal sends a deliberate release through real mappings even with Hold indefinitely', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vision-remove-'));
  const packets=[],pending=[];
  const parameter={name:'RC MIDI Packet v2',min:0,max:4194303,isQuantized:false,
    setValue:async value=>packets.push([Math.floor(value/128)%128,value%128])};
  setExtensionContext({application:{song:{tempo:120,tracks:[{devices:[{name:'RC-Midi-Receiver',parameters:[parameter]}]}]}}});
  try {
    await configureMappingStorage(dir);
    await commands.saveProjectClientState.handler({preferences:{visionLoss:{version:1,mode:'hold',timeoutMs:10000,legacy:false}}});
    const control='sensor.vision.gesture.2';
    controlMappings.set(control,[{type:'device_param',mode:'trigger_note',trackIndex:0,midiNote:'C3',noteGate:'hold',noteTiming:'immediate',neutralPolicy:'hold'}]);
    await applyMapping('phone',control,1);
    assert.deepEqual(packets,[[60,100]]);
    const app=await fs.readFile(new URL('../static/phone-v3/app.js',import.meta.url),'utf8');
    const start=app.indexOf('    function removeGestureSlot('),end=app.indexOf('    function bindGestureSlotCard(',start);
    const context={window:{onControl:message=>pending.push(applyMapping('phone',message.name,message.value,Boolean(message.lost)))},
      visionControls:{slotById:()=>({id:2,name:'Gesture 2'}),controlForSlot:()=>control,removeSlot(){}},
      visionGestureLearnSlot:null,visionGestureTestSlot:null,liveGestureSlots:new Set([2]),visionPoseActivations:new Map(),badgePose:null,
      deleteStoredGesture(){},dismissedPoseWarnings:new Set(),poseWarnings:new Map(),syncGestureSlotCards(){},persistVisionSafety(){},renderVisionControlState(){}};
    vm.runInNewContext(app.slice(start,end),context);context.removeGestureSlot(2);await Promise.all(pending);
    assert.deepEqual(packets,[[60,100],[60,0]],'removing the card must not be treated as tracking loss with indefinite hold');
    assert.ok(controlMappings.has(control),'removing a pose never renumbers or silently deletes its destination');
  } finally {await cancelPendingMappingWrites();await fs.rm(dir,{recursive:true,force:true});}
});
