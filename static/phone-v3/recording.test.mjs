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
  await assert.rejects(client.command('recordingRecord',{}),/SESSION/);
  await assert.rejects(client.command('recordingSeekMarker',{name:'Verse',time:8}),/SESSION/);
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
test('REC touch page exposes honest workflow and a separate STOP, loaded after session API',() => {
  const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  for (const id of ['track','start-marker','end-marker','timeline-track','markers','cursor','loop','start','stop','click']) assert.match(html,new RegExp('id="rec-'+id+'"'));
  for(const removed of ['prepare','audition','retry','good','review','bar','beat','point']) assert.doesNotMatch(html,new RegExp('id="rec-'+removed+'"'));
  assert.ok(html.indexOf('modules/recording.js')>html.indexOf('modules/session.js'));
  assert.match(html,/data-page="recording" role="tab"/);
  const css=fs.readFileSync(new URL('./recording.css',import.meta.url),'utf8'); assert.match(css,/min-height:56px/); assert.match(css,/border-radius:0/);
  assert.match(css,/body\[data-page="recording"\] \{ touch-action:pan-y/); assert.match(css,/\.rec-main \{ position:sticky; top:0/);
  assert.ok(html.indexOf('id="rec-stop"')<html.indexOf('id="rec-track"'),'STOP precedes scrollable preparation controls');
});

test('REC actual touch wiring respects role, sends explicit actions, keeps STOP enabled, and only polls reads on visibility/reconnect',async t => {
  const events = new Map(), documentEvents = new Map(), nodes = new Map(), timers = new Map(), sent = [];
  let timerId = 0, generatedId=0, automaticRead=true;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id,{value:'',textContent:'',disabled:false,dataset:{},style:{},listeners:new Map(),children:[],
      setAttribute(name,value){this[name]=value;},addEventListener(name,handler){this.listeners.set(name,handler);}, replaceChildren(){this.children=[];},appendChild(child){this.children.push(child);}});
    return nodes.get(id);
  };
  const field = value => ({value,fresh:true,observedAt:Date.now()});
  const state = {transport:{connected:true,isPlaying:field(false),recordMode:field(false),songTimeBeats:field(0),metronome:field(false)},
    selected:{index:0,id:'11',name:'Guitar'}, point:0,preparedToken:'ready',safety:{loop:false},
    tracks:[{index:0,id:'11',name:'Guitar',arm:true,canArm:true}],locators:[{name:'Verse',time:8},{name:'Chorus',time:24}],meter:{numerator:4,denominator:4},lastAttempt:null};
  const doc = {readyState:'loading',body:{dataset:{page:'recording'}},hidden:false,
    getElementById:node,createElement:()=>node('generated-'+(++generatedId)),addEventListener:(name,handler)=>documentEvents.set(name,handler)};
  const context=vm.createContext({document:doc,Date,setTimeout:handler=>{timers.set(++timerId,handler);return timerId;},clearTimeout:id=>timers.delete(id),
    addEventListener:(name,handler)=>events.set(name,handler),RcSurfaceI18n:{t:key=>key},
    sendPhoneCommand:(cmd,args,cb)=>{sent.push({cmd,args,cb}); if(cmd==='getRecordingState' && automaticRead) cb({ok:true,result:state});}});
  vm.runInContext(source,context); const client=context.RcRecording.setup(); t.after(()=>client.session(false));
  events.get('ableton-rc:phone-client-id')({detail:{role:'viewer'}});
  assert.equal(node('rec-start').disabled,true); assert.equal(node('rec-stop').disabled,true);
  events.get('ableton-rc:phone-client-id')({detail:{role:'controller'}});
  assert.equal(node('rec-start').disabled,false); assert.equal(node('rec-stop').disabled,false);
  const marker=node('rec-markers').children[0],trackOption=node('rec-track').children[1];
  automaticRead=false;events.get('ableton-rc:page-change')();
  const read=sent.at(-1);assert.equal(read.cmd,'getRecordingState');
  assert.equal(node('rec-start').disabled,false);assert.equal(node('rec-track').disabled,false);
  assert.equal(node('rec-markers').children[0],marker);assert.equal(node('rec-track').children[1],trackOption);
  marker.listeners.get('click')();assert.equal(sent.at(-1).cmd,'recordingSeekMarker');assert.equal(sent.at(-1).args.time,8);
  sent.at(-1).cb({ok:true,result:state});read.cb({ok:true,result:{...state,selected:null}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(client.view().state.selected.id,'11');
  automaticRead=true;
  node('rec-loop').listeners.get('click')();assert.equal(node('rec-end-field').hidden,false);
  node('rec-start').listeners.get('click')(); assert.equal(sent.at(-1).cmd,'recordingRecord'); assert.equal(sent.at(-1).args.range.start.time,8); assert.equal(sent.at(-1).args.track.id,'11');
  assert.equal(sent.at(-1).args.range.end.time,24);assert.equal(sent.at(-1).args.range.loop,true);
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


test('REC background reads never lock the UI and an older read cannot replace a newer explicit action',async t=>{
  const {client,calls}=api(t);client.session(true,'controller');
  const first=client.command('getRecordingState');calls[0].cb({ok:true,result:{selected:{id:'one'},transport:{}}});await first;
  const background=client.command('getRecordingState'),oldRead=assert.rejects(background,/SESSION/);
  const joined=client.command('getRecordingState');assert.equal(joined,background);
  assert.equal(client.view().busy,false);assert.equal(client.view().state.selected.id,'one');assert.equal(calls.length,2);
  const action=client.command('recordingSeekMarker',{name:'Verse',time:8});
  assert.equal(calls.at(-1).cmd,'recordingSeekMarker');assert.equal(client.view().busy,true);
  calls.at(-1).cb({ok:true,result:{selected:{id:'two'},transport:{}}});await action;
  calls[1].cb({ok:true,result:{selected:{id:'old'},transport:{}}});await oldRead;
  assert.equal(client.view().state.selected.id,'two');assert.equal(client.view().busy,false);
});

test('REC preserves actionable errors across successful passive refreshes until the next user action',async t=>{
  const {client,calls}=api(t);client.session(true,'controller');
  const action=client.command('recordingRecord',{}),failure=assert.rejects(action,/OTHER_ARMED/);
  calls.at(-1).cb({ok:false,error:'REC:OTHER_ARMED'});await failure;
  const read=client.command('getRecordingState');calls.at(-1).cb({ok:true,result:{transport:{}}});await read;
  assert.equal(client.view().error,'REC:OTHER_ARMED');
});

test('REC timeline geometry covers real marker times and bounds zoom without modifying the Set',t=>{
  const {api:a,calls}=api(t);
  assert.equal(a.timelineBounds([{time:8},{time:24}],2).end,28);
  assert.equal(a.timelineBounds([],0).width,100);assert.equal(a.timelineBounds([],99).width,800);
  assert.equal(calls.length,0);
});

test('REC read jitter preserves valid state while real expiry still blocks stale playback evidence',async t=>{
  t.mock.timers.enable({apis:['Date'],now:10000});
  const {client,calls}=api(t);client.session(true,'controller');
  const observed={transport:{isPlaying:{value:false,fresh:true},recordMode:{value:false,fresh:true}}};
  const seed=client.command('getRecordingState');calls.at(-1).cb({ok:true,result:observed});await seed;
  t.mock.timers.setTime(10750);
  const read=client.command('getRecordingState');assert.equal(client.view().busy,false);
  t.mock.timers.setTime(10950);assert.equal(client.view().state.transport.isPlaying.fresh,true);
  calls.at(-1).cb({ok:true,result:observed});await read;
  t.mock.timers.setTime(12951);assert.equal(client.view().state.transport.isPlaying.fresh,false);
  assert.equal(client.view().state.transport.isPlaying.value,false,'retain last known value without calling it fresh');
});

test('REC Loop can be switched off at the last marker so a non-loop recording remains reachable',async t=>{
  const nodes=new Map(),calls=[];let generated=0;
  const node=id=>{
    if(!nodes.has(id)) nodes.set(id,{value:'',textContent:'',disabled:false,hidden:false,dataset:{},style:{},children:[],listeners:new Map(),
      setAttribute(name,value){this[name]=value;},addEventListener(name,handler){this.listeners.set(name,handler);},
      replaceChildren(){this.children=[];},appendChild(child){this.children.push(child);}});
    return nodes.get(id);
  };
  const field=value=>({value,fresh:true,observedAt:Date.now()});
  const state={transport:{connected:true,isPlaying:field(false),recordMode:field(false),songTimeBeats:field(8),metronome:field(false)},
    selected:{index:0,id:'11',name:'Guitar'},range:null,pending:null,safety:{loop:false},
    tracks:[{index:0,id:'11',name:'Guitar',canArm:true,arm:false}],
    locators:[{name:'Verse',time:8},{name:'Chorus',time:24}],meter:{numerator:4,denominator:4}};
  const doc={readyState:'loading',body:{dataset:{page:'recording'}},hidden:false,getElementById:node,
    createElement:()=>node('generated-'+(++generated)),addEventListener(){}};
  const context=vm.createContext({document:doc,Date,setTimeout:()=>1,clearTimeout(){},addEventListener(){},RcSurfaceI18n:{t:key=>key},
    sendPhoneCommand:(name,args,cb)=>{calls.push({name,args});cb({ok:true,result:state});}});
  vm.runInContext(source,context);const client=context.RcRecording.setup();t.after(()=>client.session(false));
  client.session(true,'controller');await client.command('getRecordingState');
  assert.equal(node('rec-loop').disabled,false);node('rec-loop').listeners.get('click')();
  assert.equal(node('rec-loop')['aria-pressed'],'true');assert.equal(node('rec-end-marker').value,'1');
  node('rec-start-marker').value='1';node('rec-start-marker').listeners.get('change')();
  assert.equal(calls.at(-1).name,'recordingSeekMarker');assert.equal(calls.at(-1).args.time,24);
  assert.equal(node('rec-end-marker').value,'');assert.equal(node('rec-start').disabled,true);
  assert.equal(node('rec-loop').disabled,false,'Loop OFF stays available when no later marker exists');
  node('rec-loop').listeners.get('click')();
  assert.equal(node('rec-loop')['aria-pressed'],'false');assert.equal(node('rec-end-field').hidden,true);
  assert.equal(node('rec-loop').disabled,true,'enabling Loop still requires an end marker');
  assert.equal(node('rec-start').disabled,false);
  node('rec-start').listeners.get('click')();
  assert.equal(calls.at(-1).name,'recordingRecord');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).args.range)),{start:{name:'Chorus',time:24},end:null,loop:false});
});

test('REC disconnect disables existing timeline markers and retires queued clicks and callbacks without replacing DOM',async t=>{
  const nodes=new Map(),events=new Map(),calls=[];let generated=0;
  const node=id=>{
    if(!nodes.has(id)) nodes.set(id,{value:'',textContent:'',disabled:false,hidden:false,dataset:{},style:{},children:[],listeners:new Map(),
      setAttribute(name,value){this[name]=value;},addEventListener(name,handler){this.listeners.set(name,handler);},
      replaceChildren(){this.children=[];},appendChild(child){this.children.push(child);}});
    return nodes.get(id);
  };
  const field=value=>({value,fresh:true,observedAt:Date.now()});
  const state={transport:{connected:true,isPlaying:field(false),recordMode:field(false),songTimeBeats:field(8),metronome:field(false)},
    selected:{index:0,id:'11',name:'Guitar'},range:null,pending:null,safety:{loop:false},
    tracks:[{index:0,id:'11',name:'Guitar',canArm:true,arm:false}],
    locators:[{name:'Verse',time:8},{name:'Chorus',time:24}],meter:{numerator:4,denominator:4}};
  const doc={readyState:'loading',body:{dataset:{page:'recording'}},hidden:false,getElementById:node,
    createElement:()=>node('generated-'+(++generated)),addEventListener(){}};
  const context=vm.createContext({document:doc,Date,setTimeout:()=>1,clearTimeout(){},addEventListener:(name,handler)=>events.set(name,handler),
    RcSurfaceI18n:{t:key=>key},sendPhoneCommand:(name,args,cb)=>calls.push({name,args,cb})});
  vm.runInContext(source,context);const client=context.RcRecording.setup();t.after(()=>client.session(false));
  events.get('ableton-rc:phone-client-id')({detail:{role:'controller'}});
  calls.at(-1).cb({ok:true,result:state});
  await new Promise(resolve=>setImmediate(resolve));
  const markers=[...node('rec-markers').children],queuedClick=markers[0].listeners.get('click');
  assert.equal(markers.length,2);assert.ok(markers.every(marker=>marker.disabled===false));
  const reading=client.command('getRecordingState'),retired=assert.rejects(reading,/SESSION/),oldReply=calls.at(-1).cb;
  events.get('ableton-rc:phone-ws-close')();
  assert.deepEqual(node('rec-markers').children,markers,'disconnect retains the existing timeline DOM');
  assert.ok(markers.every(marker=>marker.disabled===true),'every marker must be disabled before render returns without state');
  const before=calls.length;
  assert.doesNotThrow(()=>queuedClick(),'a click already queued before disconnect must be inert');
  assert.equal(calls.length,before);
  oldReply({ok:true,result:state});await retired;
  assert.equal(client.view().state,null);assert.equal(client.view().connected,false);
  assert.ok(markers.every(marker=>marker.disabled===true),'retired read cannot reactivate markers');
  assert.equal(calls.length,before);
});
