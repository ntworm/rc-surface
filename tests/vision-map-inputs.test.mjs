// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setExtensionContext, clearExtensionContext } from '../src/context.ts';
import { applyMapping, commands, controlMappings, cancelPendingMappingWrites, setMappingsFilePath, lastMappedInputAt, lastMappedValues } from '../src/live/mappings.ts';
import { continuousTargetActuator } from '../src/live/continuous-target-actuator.ts';
import { oscTransport } from '../src/live/osc-transport.ts';
import { clipLaunchEngine } from '../src/live/clip-launch.ts';

const app=fs.readFileSync(new URL('../static/phone-v3/app.js',import.meta.url),'utf8');
const contract=fs.readFileSync(new URL('../static/phone-v3/mapping-input-contract.js',import.meta.url),'utf8');
function phoneEntry() {
  const events=[],pending=[],ctx={state:{controls:[]},currentControlStates:{},data:{}};ctx.window=ctx;ctx.globalThis=ctx;
  vm.runInNewContext(contract,ctx);
  vm.runInNewContext(app.slice(app.indexOf('  function normalizeVisionPalm('),app.indexOf('  function setTextIfChanged(')),ctx);
  vm.runInNewContext(app.slice(app.indexOf('window.currentControlLost = window.currentControlLost'),app.indexOf('window.onModulatorState')),ctx);
  const onControl=ctx.onControl;
  ctx.onControl=event=>{onControl(event);const normalized=ctx.MappingInputContract.normalizeControl(event);events.push(normalized);pending.push(applyMapping('palm-face',normalized.name,normalized.value,Boolean(normalized.lost)));};
  const emission=app.split('\n').filter(line=>line.includes('window.onControl({ name:')&&/sensor\.vision\.(palm|face)'/.test(line)).join('\n');
  assert.equal(emission.split('\n').length,2,'test must consume both real phone emission lines');
  const loss=app.slice(app.indexOf('    const VISION_LOSS_CHANNELS'),app.indexOf('    const VISION_DETECTOR_NAMES'));
  vm.runInNewContext(loss+'\nwindow.lose=emitVisionSignalLoss;',ctx);
  const settle=async()=>{await Promise.all(pending.splice(0));await new Promise(resolve=>setImmediate(resolve));};
  return {events,ctx,async sample(palmSize,facing){ctx.data={palmSize,facing};vm.runInNewContext(emission,ctx);await settle();},async lost(){ctx.lose();await settle();}};
}
const realSend=oscTransport.send;
test.afterEach(async()=>{await cancelPendingMappingWrites();controlMappings.clear();lastMappedInputAt.clear();lastMappedValues.clear();continuousTargetActuator.stop();clipLaunchEngine.reset();oscTransport.setClipLaunchActive(false);oscTransport.send=realSend;setMappingsFilePath(null);clearExtensionContext();});

for(const channel of ['palm','face']) for(const kind of ['parameter','note','clip']) test(`phone ${channel} emission reaches existing MAP ${kind} and loss cannot invent an ON`,async()=>{
  const writes=[],packets=[],sent=[];
  const parameter={name:'Cutoff',min:0,max:1,isQuantized:false,setValue:async value=>writes.push(value)};
  const receiver={name:'RC-Midi-Receiver',parameters:[{name:'RC MIDI Packet v2',min:0,max:4194303,isQuantized:false,setValue:async value=>packets.push([Math.floor(value/128)%128,value%128])}]};
  const clip={handle:{id:'102'},name:'Beat',startMarker:0,endMarker:4,loopStart:0,loopEnd:4,looping:true};
  const song={tempo:120,tracks:[{handle:{id:'101'},name:'Input',groupTrack:null,devices:[{parameters:[parameter]},receiver],clipSlots:[{clip}]}],returnTracks:[],mainTrack:null};
  setExtensionContext({application:{song}});setMappingsFilePath(null);
  Object.assign(oscTransport.state,{available:true,connected:true,isPlaying:true,tempo:120,signatureNumerator:4,signatureDenominator:4,lastSeenAt:Date.now()});
  oscTransport.globalQuantization=4;oscTransport.lastSongTimeUpdateAt=Date.now();
  oscTransport.send=(address,args=[])=>{sent.push([address,...args.map(arg=>arg?.value??arg)]);if(address==='/live/song/get/track_names')queueMicrotask(()=>oscTransport.handleIncoming({oscType:'message',address,args:[{value:'Input'}]}));};
  const name='sensor.vision.'+channel;
  if(kind==='clip') {
    const {tracks}=await commands.getClipTargets.handler({}),track=tracks[0],target=track.clips[0];
    await commands.setMapping.handler({control:name,targets:[{type:'clip_launch',trackIndex:0,track:{trackIndex:0,trackName:track.name,trackSessionId:track.sessionId},launchMode:'clip',clip:{slotIndex:0,clipName:target.name,clipSessionId:target.sessionId},threshold:.7}]});
  } else controlMappings.set(name,[{type:'device_param',trackIndex:0,deviceIndex:0,paramIndex:0,takeoverMode:'jump',neutralPolicy:'hold',...(kind==='note'?{mode:'trigger_note',midiNote:'C3',midiVelocity:100,noteTiming:'immediate',noteGate:'hold',threshold:.7}:{})}]);
  const phone=phoneEntry();await phone.lost();assert.equal(writes.length,0);assert.equal(packets.length,0);assert.equal(sent.some(([address])=>address==='/live/clip_slot/fire'),false);
  await phone.sample(.2,-.6);await phone.sample(.9,.8);
  await continuousTargetActuator.settle('device_param::0::0::0');
  const emitted=phone.events.filter(event=>event.name===name&&!event.lost);assert.ok(Math.abs(emitted.at(-1).value-.9)<1e-9);
  if(kind==='parameter')assert.ok(Math.abs(writes.at(-1)-.9)<1e-9);
  if(kind==='note')assert.deepEqual(packets.filter(([,velocity])=>velocity>0),[[60,100]]);
  if(kind==='clip')assert.deepEqual(sent.filter(([address])=>address==='/live/clip_slot/fire'),[['/live/clip_slot/fire',0,0]]);
  const onCount=()=>packets.filter(([,velocity])=>velocity>0).length+sent.filter(([address])=>address==='/live/clip_slot/fire').length;
  const before=onCount(),last=phone.ctx.currentControlStates[name];await phone.sample(NaN,Infinity);await phone.lost();
  assert.equal(phone.ctx.currentControlStates[name],last);assert.equal(phone.ctx.currentControlLost[name],true);assert.equal(onCount(),before);
  assert.ok(phone.events.some(event=>event.name===name&&event.lost&&event.value===(channel==='palm'?0:.5)));
  const again=phoneEntry();await again.lost();assert.equal(onCount(),before,'reloading without a hand cannot replay an activation');
});
