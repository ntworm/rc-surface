// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('./modules/recording.js',import.meta.url),'utf8');
function api(t) {
  const context = vm.createContext({setTimeout,clearTimeout,Date});
  vm.runInContext(source,context);
  const calls = [], client = context.RcRecording.createClient({timeoutMs:20,send:(cmd,args,cb)=>calls.push({cmd,args,cb})});
  t.after(()=>client.session(false));
  return {api:context.RcRecording,client,calls};
}
test('REC bar/beat conversion follows observed denominator and rejects invalid meter/position',t => {
  const {api:a}=api(t);
  assert.equal(a.positionToBeats(3,2,{numerator:3,denominator:8}),3.5);
  const pos=a.beatsToPosition(3.5,{numerator:3,denominator:8}); assert.equal(pos.bar,3); assert.equal(pos.beat,2);
  for (const args of [[0,1,{numerator:4,denominator:4}],[1,5,{numerator:4,denominator:4}],[1,1,{numerator:null,denominator:4}]]) assert.throws(()=>a.positionToBeats(...args),/POSITION/);
});
test('REC phone viewer/read-only guard sends reads but blocks every write locally',async t => {
  const {client,calls}=api(t); client.session(true,'viewer');
  await assert.rejects(client.command('recordingStart',{token:'x'}),/SESSION/);
  assert.equal(calls.length,0);
  const read=client.command('getRecordingState'); calls[0].cb({ok:true,result:{transport:{}}}); await read;
  assert.equal(calls[0].cmd,'getRecordingState');
});
test('REC phone STOP stays immediate while preparation is pending and ignores old callback',async t => {
  const {client,calls}=api(t); client.session(true,'controller');
  const prep=client.command('recordingPrepare'), rejected=assert.rejects(prep,/SESSION/);
  const stop=client.command('recordingStop'); assert.equal(calls[1].cmd,'recordingStop');
  calls[1].cb({ok:true,result:{stopped:true}}); await stop;
  calls[0].cb({ok:true,result:{preparedToken:'late'}}); await rejected;
  assert.equal(client.view().state.stopped,true); assert.equal(client.view().state.preparedToken,undefined);
});
test('REC phone reconnect/timeout do not replay writes or fabricate successful state',async t => {
  const {client,calls}=api(t); client.session(true,'controller');
  const start=client.command('recordingStart',{token:'one'}), rejected=assert.rejects(start,/SESSION/);
  client.session(false); client.session(true,'controller'); calls[0].cb({ok:true,result:{recording:true}}); await rejected;
  assert.equal(client.view().state,null); assert.equal(calls.length,1);
  await assert.rejects(client.command('recordingPrepare'),/UNKNOWN/);
  assert.equal(client.view().state,null); assert.equal(calls.length,2);
});
test('REC STOP between retry arm acknowledgement and continuation prevents late prepare',async t => {
  const {client,calls}=api(t); client.session(true,'controller');
  const retry=client.retry(), rejected=assert.rejects(retry,/SESSION/);
  calls[0].cb({ok:true,result:{armed:true}});
  const stop=client.command('recordingStop'); calls[1].cb({ok:true,result:{stopped:true}});
  await stop; await rejected;
  assert.deepEqual(calls.map(call=>call.cmd),['recordingArm','recordingStop']);
});
test('REC touch page exposes honest workflow and a separate STOP, loaded after session API',() => {
  const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  for (const id of ['track','arm','point','prepare','start','stop','audition','retry','good','review','click']) assert.match(html,new RegExp('id="rec-'+id+'"'));
  assert.ok(html.indexOf('modules/recording.js')>html.indexOf('modules/session.js'));
  assert.match(html,/data-page="recording" role="tab"/);
  const css=fs.readFileSync(new URL('./recording.css',import.meta.url),'utf8'); assert.match(css,/min-height:56px/); assert.match(css,/border-radius:0/);
  assert.match(css,/body\[data-page="recording"\] \{ touch-action:pan-y/); assert.match(css,/\.rec-main \{ position:sticky; top:0/);
  assert.ok(html.indexOf('id="rec-stop"')<html.indexOf('id="rec-track"'),'STOP precedes scrollable preparation controls');
});

test('REC actual touch wiring respects role, sends explicit actions, keeps STOP enabled, and only polls reads on visibility/reconnect',async t => {
  const events = new Map(), documentEvents = new Map(), nodes = new Map(), timers = new Map(), sent = [];
  let timerId = 0;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id,{value:'',textContent:'',disabled:false,dataset:{},listeners:new Map(),children:[],
      addEventListener(name,handler){this.listeners.set(name,handler);}, replaceChildren(){this.children=[];},appendChild(child){this.children.push(child);}});
    return nodes.get(id);
  };
  const field = value => ({value,fresh:true,observedAt:Date.now()});
  const state = {transport:{connected:true,isPlaying:field(false),recordMode:field(false),songTimeBeats:field(0),metronome:field(false)},
    selected:{index:0,id:'11',name:'Guitar'}, point:0,preparedToken:'ready',safety:{loop:false},
    tracks:[{index:0,id:'11',name:'Guitar',arm:true,canArm:true}],locators:[{name:'Verse',time:8}],meter:{numerator:4,denominator:4},lastAttempt:null};
  const doc = {readyState:'loading',body:{dataset:{page:'recording'}},hidden:false,
    getElementById:node,createElement:()=>({}),addEventListener:(name,handler)=>documentEvents.set(name,handler)};
  const context=vm.createContext({document:doc,Date,setTimeout:handler=>{timers.set(++timerId,handler);return timerId;},clearTimeout:id=>timers.delete(id),
    addEventListener:(name,handler)=>events.set(name,handler),RcSurfaceI18n:{t:key=>key},
    sendPhoneCommand:(cmd,args,cb)=>{sent.push({cmd,args,cb}); if(cmd==='getRecordingState') cb({ok:true,result:state});}});
  vm.runInContext(source,context); const client=context.RcRecording.setup(); t.after(()=>client.session(false));
  events.get('ableton-rc:phone-client-id')({detail:{role:'viewer'}});
  assert.equal(node('rec-start').disabled,true); assert.equal(node('rec-stop').disabled,true);
  events.get('ableton-rc:phone-client-id')({detail:{role:'controller'}});
  assert.equal(node('rec-start').disabled,false); assert.equal(node('rec-stop').disabled,false);
  node('rec-start').listeners.get('click')(); assert.equal(sent.at(-1).cmd,'recordingStart'); assert.equal(sent.at(-1).args.token,'ready');
  assert.equal(node('rec-stop').disabled,false,'STOP never waits for start confirmation');
  node('rec-stop').listeners.get('click')(); assert.equal(sent.at(-1).cmd,'recordingStop');
  sent.at(-1).cb({ok:true,result:state}); sent.at(-2).cb({ok:true,result:{...state,preparedToken:'late'}});
  await new Promise(resolve=>setImmediate(resolve)); assert.equal(client.view().state.preparedToken,'ready');
  events.get('ableton-rc:phone-ws-close')(); assert.equal(node('rec-stop').disabled,true);
  const before=sent.length; events.get('ableton-rc:phone-client-id')({detail:{role:'controller'}});
  assert.deepEqual(sent.slice(before).map(call=>call.cmd),['getRecordingState']);
  doc.hidden=true; documentEvents.get('visibilitychange')(); const hiddenCalls=sent.length;
  for (const handler of timers.values()) handler(); assert.equal(sent.length,hiddenCalls);
  doc.hidden=false; documentEvents.get('visibilitychange')(); assert.equal(sent.at(-1).cmd,'getRecordingState');
});
