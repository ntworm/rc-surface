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
  await assert.rejects(client.command('recordingTrackControl',{}),/SESSION/);
  await assert.rejects(client.command('recordingRenameTrack',{}),/SESSION/);
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
  for (const id of ['track-grid','arm-mode','start-marker','end-marker','timeline-track','markers','cursor','loop','start','stop','click']) assert.match(html,new RegExp('id="rec-'+id+'"'));
  for(const removed of ['prepare','audition','retry','good','review','bar','beat','point']) assert.doesNotMatch(html,new RegExp('id="rec-'+removed+'"'));
  assert.ok(html.indexOf('modules/recording.js')>html.indexOf('modules/session.js'));
  assert.match(html,/data-page="recording" role="tab"/);
  const css=fs.readFileSync(new URL('./recording.css',import.meta.url),'utf8'); assert.match(css,/min-height:56px/); assert.match(css,/border-radius:0/);
  assert.match(css,/body\[data-page="recording"\] \{ touch-action:pan-y/); assert.match(css,/\.rec-main \{ position:sticky; top:0/);
  assert.ok(html.indexOf('id="rec-stop"')<html.indexOf('id="rec-track-grid"'),'STOP precedes scrollable preparation controls');
});

test('REC actual touch wiring respects role, sends explicit actions, keeps STOP enabled, and only polls reads on visibility/reconnect',async t => {
  const events = new Map(), documentEvents = new Map(), nodes = new Map(), timers = new Map(), sent = [];
  let timerId = 0, generatedId=0, automaticRead=true;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id,{value:'',textContent:'',disabled:false,dataset:{},style:{},listeners:new Map(),children:[],
      setAttribute(name,value){this[name]=value;},addEventListener(name,handler){this.listeners.set(name,handler);}, replaceChildren(...children){this.children=children;},appendChild(child){this.children.push(child);}});
    return nodes.get(id);
  };
  const field = value => ({value,fresh:true,observedAt:Date.now()});
  const state = {transport:{connected:true,isPlaying:field(false),recordMode:field(false),songTimeBeats:field(0),metronome:field(false)},
    selected:{index:0,id:'11',name:'Guitar'}, point:0,preparedToken:'ready',safety:{loop:false},
    tracks:[{index:0,id:'11',name:'Guitar',arm:true,canArm:true,solo:false,mute:false}],locators:[{name:'Verse',time:8},{name:'Chorus',time:24}],meter:{numerator:4,denominator:4},lastAttempt:null};
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
  const marker=node('rec-markers').children[0],trackCard=node('rec-track-grid').children[0];
  automaticRead=false;events.get('ableton-rc:page-change')();
  const read=sent.at(-1);assert.equal(read.cmd,'getRecordingState');
  assert.equal(node('rec-start').disabled,false);assert.equal(trackCard.children[1].children[0].disabled,false);
  assert.equal(node('rec-markers').children[0],marker);assert.equal(node('rec-track-grid').children[0],trackCard);
  marker.listeners.get('click')();assert.equal(sent.at(-1).cmd,'recordingSeekMarker');assert.equal(sent.at(-1).args.time,8);
  sent.at(-1).cb({ok:true,result:state});read.cb({ok:true,result:{...state,selected:null}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(client.view().state.selected.id,'11');
  automaticRead=true;
  node('rec-loop').listeners.get('click')();assert.equal(node('rec-end-field').hidden,false);
  node('rec-start').listeners.get('click')(); assert.equal(sent.at(-1).cmd,'recordingRecord'); assert.equal(sent.at(-1).args.range.start.time,8); assert.equal(sent.at(-1).args.tracks[0].id,'11');
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

test('REC ARM recovery DOM marks an unconfirmed vector unknown and reconciles before another exact card action',async t=>{
  t.mock.timers.enable({apis:['Date'],now:10000});
  const nodes=new Map(),calls=[];let generated=0;
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false,dataset:{},style:{},children:[],listeners:new Map(),
      setAttribute(name,value){this[name]=value;},addEventListener(name,handler){this.listeners.set(name,handler);},replaceChildren(...children){this.children=children;},appendChild(child){this.children.push(child);}});
    return nodes.get(id);
  };
  const field=value=>({value,fresh:true,observedAt:Date.now()});
  let observed={transport:{connected:true,isPlaying:field(false),recordMode:field(false),songTimeBeats:field(8),metronome:field(false)},
    pending:null,attemptActive:false,safety:{loop:false},meter:{numerator:4,denominator:4},locators:[{name:'Start',time:8}],
    tracks:[{index:0,id:'a',name:'Input A',arm:false,canArm:true,solo:false,mute:false},{index:1,id:'b',name:'Input B',arm:false,canArm:true,solo:false,mute:false},{index:2,id:'group',name:'Group',arm:null,canArm:false,solo:false,mute:false}]};
  const doc={readyState:'loading',body:{dataset:{page:'recording'}},hidden:false,getElementById:node,createElement:()=>node('generated-'+(++generated)),addEventListener(){}};
  const context=vm.createContext({document:doc,Date,setTimeout:()=>1,clearTimeout(){},addEventListener(){},RcSurfaceI18n:{t:key=>key},
    sendPhoneCommand:(name,args,cb)=>{calls.push({name,args,cb});if(name==='getRecordingState')cb({ok:true,result:observed});}});
  vm.runInContext(source,context);const client=context.RcRecording.setup();t.after(()=>client.session(false));
  client.session(true,'controller');await client.command('getRecordingState');
  const cards=[...node('rec-track-grid').children],arm=index=>cards[index].children[1].children.find(c=>c.dataset?.property==='arm');
  arm(0).listeners.get('click')();const first=calls.at(-1);assert.equal(first.name,'recordingTrackControl');assert.equal(first.args.track.id,'a');assert.equal(first.args.enabled,true);
  first.cb({ok:false,error:'REC:UNKNOWN'});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(client.view().error,'REC:UNKNOWN');assert.equal(arm(0)['aria-pressed'],'mixed');assert.equal(arm(1)['aria-pressed'],'mixed');assert.equal(arm(0).disabled,true);assert.equal(arm(1).disabled,true);
  const before=calls.length;arm(1).listeners.get('click')();assert.equal(calls.length,before,'no toggle from the preceding unconfirmed boolean');
  observed={...observed,tracks:observed.tracks.map(track=>({...track,arm:track.index===0?true:track.index===2?null:false}))};
  await client.command('getRecordingState');assert.equal(client.view().error,'REC:UNKNOWN','a read does not fabricate a successful action');
  assert.equal(arm(0)['aria-pressed'],'true');assert.equal(arm(1)['aria-pressed'],'false');assert.equal(arm(1).disabled,false);assert.equal(arm(2).disabled,true);
  assert.equal(node('rec-start').disabled,false,'fresh non-armable group capability does not require an invented ARM observation for the UI cohort');
  assert.deepEqual(node('rec-track-grid').children,cards,'polling retains cards');
  t.mock.timers.setTime(12001);await client.command('getRecordingState');
  // A server snapshot carrying stale transport must still lock the card.
  observed={...observed,transport:{...observed.transport,isPlaying:{...field(false),fresh:false}}};await client.command('getRecordingState');assert.equal(arm(1).disabled,true);
  observed={...observed,transport:{...observed.transport,isPlaying:field(false),recordMode:field(false)}};await client.command('getRecordingState');
  arm(1).listeners.get('click')();const second=calls.at(-1);assert.equal(second.args.track.index,1);assert.equal(second.args.track.id,'b');assert.equal(second.args.track.name,'Input B');assert.equal(second.args.enabled,true);
  second.cb({ok:true,result:{...observed,tracks:observed.tracks.map(track=>({...track,arm:track.index===1?true:track.arm}))}});await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls.filter(call=>call.name==='recordingTrackControl').map(call=>call.args.track.id),['a','b']);
  observed={...observed,tracks:observed.tracks.map(track=>({...track,canArm:track.index===2?null:track.canArm,arm:track.index===2?false:track.arm}))};await client.command('getRecordingState');assert.equal(node('rec-start').disabled,true,'unknown capability may conceal another armed input');
});

test('REC timeline geometry covers real marker times and bounds zoom without modifying the Set',t=>{
  const {api:a,calls}=api(t);
  assert.equal(a.timelineBounds([{time:8},{time:24}],2).end,28);
  assert.equal(a.timelineBounds([],0).width,100);assert.equal(a.timelineBounds([],99).width,9900);assert.equal(a.timelineBounds([],500).width,30000);
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
      replaceChildren(...children){this.children=children;},appendChild(child){this.children.push(child);}});
    return nodes.get(id);
  };
  const field=value=>({value,fresh:true,observedAt:Date.now()});
  const state={transport:{connected:true,isPlaying:field(false),recordMode:field(false),songTimeBeats:field(8),metronome:field(false)},
    selected:{index:0,id:'11',name:'Guitar'},range:null,pending:null,safety:{loop:false},
    tracks:[{index:0,id:'11',name:'Guitar',canArm:true,arm:true,solo:false,mute:false}],
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
      replaceChildren(...children){this.children=children;},appendChild(child){this.children.push(child);}});
    return nodes.get(id);
  };
  const field=value=>({value,fresh:true,observedAt:Date.now()});
  const state={transport:{connected:true,isPlaying:field(false),recordMode:field(false),songTimeBeats:field(8),metronome:field(false)},
    selected:{index:0,id:'11',name:'Guitar'},range:null,pending:null,safety:{loop:false},
    tracks:[{index:0,id:'11',name:'Guitar',canArm:true,arm:true,solo:false,mute:false}],
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

function gridHarness(t) {
  const nodes=new Map(),events=new Map(),documentEvents=new Map(),calls=[],saved=[];let generated=0,now=10000;
  class ClockDate extends Date {static now(){return now;}}
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false,dataset:{},style:{},children:[],listeners:new Map(),
      setAttribute(name,value){this[name]=value;},addEventListener(name,handler){this.listeners.set(name,handler);},
      replaceChildren(...children){this.children=children;this.replacements=(this.replacements||0)+1;},appendChild(child){this.children.push(child);}});
    return nodes.get(id);
  };
  const field=value=>({value,fresh:true,observedAt:now});
  const state=()=>({transport:{connected:true,isPlaying:field(false),recordMode:field(false),songTimeBeats:field(32),metronome:field(false)},pending:null,range:null,
    tracks:Array.from({length:10},(_,index)=>({index,id:String(index+11),name:'Input '+(index+1),arm:false,canArm:true,solo:false,mute:false})),
    locators:[{name:'REC',time:32},{name:'REC2',time:48}],meter:{numerator:4,denominator:4}});
  const doc={readyState:'loading',body:{dataset:{page:'recording'}},hidden:false,getElementById:node,createElement:()=>node('generated-'+(++generated)),
    addEventListener:(name,handler)=>documentEvents.set(name,handler)};
  const context=vm.createContext({document:doc,Date:ClockDate,setTimeout:()=>1,clearTimeout(){},addEventListener:(name,handler)=>events.set(name,handler),
    localStorage:{getItem:()=>null,setItem:(...args)=>saved.push(args)},RcSurfaceI18n:{t:key=>key},sendPhoneCommand:(name,args,cb)=>calls.push({name,args,cb})});
  vm.runInContext(source,context);const client=context.RcRecording.setup();t.after(()=>client.session(false));
  const seed=async result=>{const reading=client.command('getRecordingState');calls.at(-1).cb({ok:true,result});await reading;};
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  const buttons=index=>node('rec-track-grid').children[index].children[1].children.filter(c=>c.dataset?.property);
  return {node,client,state,seed,calls,events,documentEvents,saved,buttons,flush,age:()=>{now+=2001;}};
}
test('REC polling retains 202 marker menus, full names, selection and scroll when the observed meter becomes stale',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');const state=h.state();
  state.locators=Array.from({length:202},(_,index)=>({name:'Água > [bpm 121] · '+index,time:index*16}));await h.seed(state);
  const select=h.node('rec-start-marker'),markers=h.node('rec-markers'),options=[...select.children],buttons=[...markers.children],rebuilds=select.replacements;
  select.focused=true;select.scrollTop=420;select.value='123';select.listeners.get('change')();h.calls.at(-1).cb({ok:true,result:state});await h.flush();
  await h.seed({...state,meter:{numerator:null,denominator:null}});
  assert.equal(select.replacements,rebuilds);assert.deepEqual(select.children,options);assert.deepEqual(markers.children,buttons);assert.equal(select.value,'123');assert.equal(select.scrollTop,420);assert.equal(select.focused,true);
  assert.equal(buttons[123].children[0].textContent,'493.1');assert.equal(buttons[123].children[1].textContent,state.locators[123].name);
  assert.equal(h.node('rec-position')['data-meter-stale'],'true');
  await h.seed(state);assert.equal(select.replacements,rebuilds);assert.equal(h.node('rec-position')['data-meter-stale'],'false');
});
test('REC Session viewer blocks mutations, reads remain passive, and STOP retires an in-flight Session command',async t=>{
  const {client,calls}=api(t);client.session(true,'viewer');
  for(const name of ['recordingSessionRecord','recordingSessionStop','recordingReturnToArrangement'])await assert.rejects(client.command(name,{}),/SESSION/);
  assert.equal(calls.length,0);const read=client.command('getSessionRecordingState',{offset:0});calls.at(-1).cb({ok:true,result:{session:{active:false}}});await read;
  client.session(true,'controller');const start=client.command('recordingSessionRecord',{}),retired=assert.rejects(start,/SESSION/),old=calls.at(-1).cb;
  const stop=client.command('recordingSessionStop');assert.equal(calls.at(-1).cmd,'recordingSessionStop');calls.at(-1).cb({ok:true,result:{session:{active:false}}});await stop;
  old({ok:true,result:{session:{active:true}}});await retired;assert.equal(client.view().state.session.active,false);
});

test('REC Session mode and scene selection are passive, include all ten arms, and lock modes/ARM during queued ownership',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');const state=h.state();state.tracks.forEach(track=>track.arm=true);
  state.session={songId:'song',offset:0,totalScenes:1,active:false,scenes:[{index:0,id:'scene',name:'Scene'}],rows:state.tracks.map(track=>({track,ready:true,slots:[{index:0,id:'slot-'+track.id,clip:null,state:'stopped'}]})),owned:[]};
  await h.seed(state);const before=h.calls.length;h.node('rec-clip-mode').listeners.get('click')();
  assert.equal(h.calls.length,before+1);assert.equal(h.calls.at(-1).name,'getSessionRecordingState');h.calls.at(-1).cb({ok:true,result:state});await h.flush();
  assert.equal(h.node('rec-arrangement-panel').hidden,true);assert.equal(h.node('rec-start').disabled,true);
  h.node('rec-session-grid').children[11].listeners.get('click')();assert.equal(h.calls.length,before+1);assert.equal(h.node('rec-start').disabled,false);
  await h.seed({...state,session:{...state.session,rows:state.session.rows.map(row=>({...row,ready:false}))}});assert.equal(h.node('rec-start').disabled,true,'unknown or non-idle track indices never authorize REC');await h.seed(state);
  h.node('rec-session-bars').value='4';h.node('rec-session-quantization').value='global';h.node('rec-start').listeners.get('click')();
  const action=h.calls.at(-1);assert.equal(action.name,'recordingSessionRecord');assert.equal(action.args.targets.length,10);assert.equal(action.args.targets[9].track.id,'20');
  const owned={...state,attemptActive:true,session:{...state.session,active:true,owned:state.tracks.map(track=>({track,scene:0,state:'queued'}))}};
  action.cb({ok:true,result:owned});await h.flush();assert.equal(h.node('rec-arrangement-mode').disabled,true);assert.equal(h.node('rec-arm-mode').disabled,true);assert.equal(h.buttons(0)[0].disabled,true);assert.equal(h.buttons(0)[1].disabled,false);
  assert.equal(h.node('rec-status').textContent,'rec.sessionState.queued');
  await h.seed({...owned,session:{...owned.session,owned:owned.session.owned.map(target=>({...target,state:'stopped'}))}});assert.equal(h.node('rec-status').textContent,'rec.finishSession');assert.equal(h.node('rec-start').disabled,true);
  h.node('rec-stop').listeners.get('click')();assert.equal(h.calls.at(-1).name,'recordingSessionStop');h.calls.at(-1).cb({ok:true,result:state});await h.flush();
});
test('REC a confirmed passive Session stop clears only its pending STOP error without another write',async t=>{
  const {client,calls}=api(t);client.session(true,'controller');
  const stop=client.command('recordingSessionStop'),rejected=assert.rejects(stop,/SESSION_STOP_PENDING/);calls.at(-1).cb({ok:false,error:'REC:SESSION_STOP_PENDING'});await rejected;
  let reading=client.command('getSessionRecordingState',{offset:0});calls.at(-1).cb({ok:true,result:{session:{active:true}}});await reading;assert.match(client.view().error,/SESSION_STOP_PENDING/);
  reading=client.command('getSessionRecordingState',{offset:0});calls.at(-1).cb({ok:true,result:{session:{active:false}}});await reading;assert.equal(client.view().error,null);
  assert.equal(calls.filter(call=>call.cmd==='recordingSessionStop').length,1);
});
test('REC grid observes ten inputs, preserves cards/focus on polling and sends exact visible armed cohort',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');let state=h.state();await h.seed(state);
  const cards=[...h.node('rec-track-grid').children],arm=h.buttons(0)[0];arm.focused=true;h.node('rec-track-grid').scrollTop=67;
  assert.equal(cards.length,10);assert.equal(h.node('rec-start').disabled,true);assert.equal(h.node('rec-status').textContent,'rec.armTracks');
  assert.equal(h.node('rec-arm-mode').textContent,'rec.armMulti');
  assert.equal(cards[0].children[0].textContent,'1 \u00b7 Input 1');
  let before=h.calls.length;h.node('rec-arm-mode').listeners.get('click')();assert.equal(h.calls.length,before);assert.equal(h.saved[0][1],'exclusive');
  arm.listeners.get('click')();assert.equal(h.calls.at(-1).name,'recordingTrackControl');assert.equal(h.calls.at(-1).args.armMode,'exclusive');
  assert.equal(arm['aria-pressed'],'false','no optimistic host state');assert.equal(arm.disabled,true);
  state=h.state();state.tracks.forEach(track=>track.arm=true);h.calls.at(-1).cb({ok:true,result:state});await h.flush();
  const count=h.node('rec-track-grid').replacements;await h.seed({...state,tracks:state.tracks.map(track=>({...track,solo:true}))});
  h.documentEvents.get('rcsurface:languagechange')();
  assert.deepEqual(h.node('rec-track-grid').children,cards);assert.equal(h.node('rec-track-grid').replacements,count);assert.equal(arm.focused,true);assert.equal(h.node('rec-track-grid').scrollTop,67);
  h.node('rec-start').listeners.get('click')();assert.equal(h.calls.at(-1).name,'recordingRecord');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.at(-1).args.tracks)),state.tracks.map(({index,id,name})=>({index,id,name})));
  assert.equal(h.node('rec-stop').disabled,false);
  h.calls.at(-1).cb({ok:true,result:{...state,pending:'record',preRoll:{phase:'running'},transport:{...state.transport,isPlaying:{value:true,fresh:true},recordMode:{value:true,fresh:true}}}});await h.flush();
  assert.equal(arm.disabled,true);assert.equal(h.buttons(0)[1].disabled,false);assert.equal(h.buttons(0)[2].disabled,false);
  h.buttons(0)[2].listeners.get('click')();assert.equal(h.calls.at(-1).args.property,'mute');assert.equal(h.calls.at(-1).args.enabled,true);
});

test('REC name editor preserves its draft through polling, saves only Enter and cancels with Escape',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');const state=h.state();await h.seed(state);
  const card=h.node('rec-track-grid').children[0],name=card.children[0],event=key=>({key,preventDefault(){},stopPropagation(){}});
  let before=h.calls.length;name.listeners.get('dblclick')();assert.equal(h.calls.length,before);
  const input=name.children[0];assert.equal(input.value,'Input 1');input.value='Drum Bus';
  await h.seed({...state,tracks:state.tracks.map(track=>({...track,solo:true}))});
  assert.equal(name.children[0],input);assert.equal(input.value,'Drum Bus');
  input.listeners.get('keydown')(event('Escape'));assert.equal(name.children.length,0);
  name.listeners.get('dblclick')();const retry=name.children[0];retry.value='Drum Bus';
  before=h.calls.length;retry.listeners.get('keydown')(event('Enter'));
  assert.equal(h.calls.length,before+1);assert.equal(h.calls.at(-1).name,'recordingRenameTrack');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.at(-1).args)),{track:{index:0,id:'11',name:'Input 1'},name:'Drum Bus'});
  assert.equal(retry.readOnly,true);await h.client.command('getRecordingState');assert.equal(h.calls.length,before+1);
  const updated={...state,tracks:state.tracks.map((track,index)=>index?track:{...track,name:'Drum Bus'})};
  h.calls.at(-1).cb({ok:true,result:updated});await h.flush();
  assert.equal(name.children.length,0);assert.equal(name.textContent,'1 · Drum Bus');assert.equal(h.node('rec-track-grid').children[0],card);
});

test('REC editor keeps an externally stale name as a draft and sends its original identity, never a blur save',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');const state=h.state();await h.seed(state);
  const name=h.node('rec-track-grid').children[0].children[0];name.listeners.get('dblclick')();const input=name.children[0];input.value='Draft';
  await h.seed({...state,tracks:state.tracks.map((track,index)=>index?track:{...track,name:'External'})});
  assert.equal(name.children[0],input);assert.equal(input.value,'Draft');assert.equal(input.listeners.has('blur'),false);
  input.listeners.get('keydown')({key:'Enter',preventDefault(){},stopPropagation(){}});
  assert.equal(h.calls.at(-1).args.track.name,'Input 1');
  h.calls.at(-1).cb({ok:false,error:'REC:IDENTITY'});await h.flush();assert.equal(input.value,'Draft');
  input.listeners.get('keydown')({key:'Escape',preventDefault(){},stopPropagation(){}});
  assert.equal(name.textContent,'1 · External');
});

test('REC name editing rechecks permissions, stale state and active ownership without blocking a cached cohort',async t=>{
  const h=gridHarness(t);h.client.session(true,'viewer');const state=h.state();await h.seed(state);
  const name=h.node('rec-track-grid').children[0].children[0];name.listeners.get('dblclick')();assert.equal(name.children.length,0);
  h.client.session(true,'controller');await h.seed({...state,attemptActive:true});
  const current=h.node('rec-track-grid').children[0].children[0];current.listeners.get('dblclick')();assert.equal(current.children.length,0);
  await h.seed({...state,attemptActive:false,cohort:[state.tracks[0]]});h.age();current.listeners.get('dblclick')();assert.equal(current.children.length,0);
  await h.seed({...state,attemptActive:false,cohort:[state.tracks[0]]});current.listeners.get('dblclick')();assert.equal(current.children.length,1);
});
test('REC grid rejects viewer/stale/busy/playing ARM, keeps group SOLO/MUTE, and retires old clicks',async t=>{
  const h=gridHarness(t);h.client.session(true,'viewer');let state=h.state();state.tracks[1].canArm=false;await h.seed(state);
  const arm=h.buttons(0)[0],click=arm.listeners.get('click');let before=h.calls.length;click();assert.equal(h.calls.length,before);assert.equal(arm.disabled,true);
  h.client.session(true,'controller');await h.seed(state);const currentArm=h.buttons(0)[0],tap=currentArm.listeners.get('click');
  assert.equal(h.buttons(1)[0].disabled,true);assert.equal(h.buttons(1)[1].disabled,false);assert.equal(h.buttons(1)[2].disabled,false);
  h.buttons(1)[1].listeners.get('click')();assert.equal(h.calls.at(-1).args.property,'solo');assert.equal(h.calls.at(-1).args.armMode,undefined);
  before=h.calls.length;tap();assert.equal(h.calls.length,before,'pending mutation blocks ARM');h.calls.at(-1).cb({ok:true,result:state});await h.flush();
  h.age();before=h.calls.length;tap();h.buttons(1)[1].listeners.get('click')();assert.equal(h.calls.length,before,'queued ARM and SOLO taps recheck elapsed freshness');
  state={...state,transport:{...state.transport,isPlaying:{value:true,fresh:true}}};await h.seed(state);before=h.calls.length;tap();assert.equal(h.calls.length,before);
  state=h.state();state.tracks[0].arm=null;await h.seed(state);assert.equal(h.buttons(0)[0].disabled,true);assert.equal(h.node('rec-start').disabled,true);
  h.events.get('ableton-rc:phone-ws-close')();before=h.calls.length;assert.doesNotThrow(tap);assert.equal(h.calls.length,before);
});

test('REC pre-roll preference defaults OFF, validates stored bars and tolerates disabled local storage',t=>{
  const {api:a,calls}=api(t);
  for(const raw of [null,undefined,'','3','8','-1','01','NaN']) assert.equal(a.preRollPreference({getItem:()=>raw}),0,String(raw));
  for(const raw of ['0','1','2','4']) assert.equal(a.preRollPreference({getItem:()=>raw}),Number(raw));
  assert.equal(a.preRollPreference({getItem(){throw Error('disabled');}}),0);
  assert.equal(a.preRollPreference(undefined),0);assert.equal(calls.length,0,'reading the browser preference never contacts Live');
});

test('REC pre-roll segment wiring persists only a browser preference, sends its chosen bars and leaves STOP available',async t=>{
  const nodes=new Map(),calls=[],saved=[];let generated=0;
  const node=id=>{
    if(!nodes.has(id)) nodes.set(id,{value:'',textContent:'',disabled:false,dataset:{},style:{},children:[],listeners:new Map(),
      setAttribute(name,value){this[name]=value;},addEventListener(name,handler){this.listeners.set(name,handler);},
      replaceChildren(...children){this.children=children;},appendChild(child){this.children.push(child);}});
    return nodes.get(id);
  };
  const field=value=>({value,fresh:true,observedAt:Date.now()});
  const state={transport:{connected:true,isPlaying:field(false),recordMode:field(false),songTimeBeats:field(0),metronome:field(false)},
    selected:{index:0,id:'11',name:'Guitar'},pending:null,range:null,
    tracks:[{index:0,id:'11',name:'Guitar',arm:true,canArm:true,solo:false,mute:false}],locators:[{name:'First',time:0},{name:'Last',time:4096}],meter:{numerator:4,denominator:4}};
  const doc={readyState:'loading',body:{dataset:{page:'recording'}},hidden:false,getElementById:node,
    createElement:()=>node('generated-'+(++generated)),addEventListener(){}};
  const context=vm.createContext({document:doc,Date,setTimeout:()=>1,clearTimeout(){},addEventListener(){},RcSurfaceI18n:{t:key=>key},
    localStorage:{getItem:()=> '4',setItem:(key,value)=>saved.push([key,value])},sendPhoneCommand:(name,args,cb)=>calls.push({name,args,cb})});
  vm.runInContext(source,context);const client=context.RcRecording.setup();t.after(()=>client.session(false));
  client.session(true,'viewer');let reading=client.command('getRecordingState');calls.at(-1).cb({ok:true,result:state});await reading;
  let before=calls.length;node('rec-pre-roll-1').listeners.get('click')();assert.equal(calls.length,before);assert.deepEqual(saved,[]);
  client.session(true,'controller');reading=client.command('getRecordingState');calls.at(-1).cb({ok:true,result:state});await reading;
  assert.equal(node('rec-pre-roll-4')['aria-pressed'],'true');assert.equal(node('rec-pre-roll-4').disabled,false);
  before=calls.length;node('rec-pre-roll-2').listeners.get('click')();assert.equal(calls.length,before,'segment changes never send Live writes');
  assert.deepEqual(saved,[['rc-surface-v2.rec.preRollBars','2']]);assert.equal(node('rec-pre-roll-2')['aria-pressed'],'true');
  const markers=node('rec-markers').children;
  assert.deepEqual(markers.map(marker=>marker.children.map(child=>child.textContent)),[['1.1','First'],['1025.1','Last']]);
  assert.equal(markers[0].style.left,'0%');assert.equal(node('rec-timeline-track').style.width,'calc(100% - 96px)');
  node('rec-zoom').value='8';node('rec-zoom').listeners.get('input')();assert.equal(node('rec-timeline-track').style.width,'calc(800% - 96px)');
  assert.equal(node('rec-markers').children[0],markers[0],'zoom keeps the timeline/marker binding and proportional scale');
  node('rec-start').listeners.get('click')();assert.equal(calls.at(-1).name,'recordingRecord');assert.equal(calls.at(-1).args.preRollBars,2);
  const pending={...state,pending:'record',preRoll:{phase:'running',bars:2},transport:{...state.transport,isPlaying:field(true),recordMode:field(true)}};
  calls.at(-1).cb({ok:true,result:pending});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(client.view().busy,false,'host monitoring does not hold the command callback for the whole lead-in');
  assert.equal(node('rec-status').textContent,'rec.preRolling');assert.equal(node('rec-pre-roll-2').disabled,true);assert.equal(node('rec-stop').disabled,false);
  before=calls.length;node('rec-pre-roll-1').listeners.get('click')();assert.equal(calls.length,before);assert.equal(saved.length,1);
  node('rec-stop').listeners.get('click')();assert.equal(calls.at(-1).name,'recordingStop');calls.at(-1).cb({ok:true,result:state});
  await new Promise(resolve=>setImmediate(resolve));client.session(false);client.session(true,'controller');
  assert.equal(calls.at(-1).name,'recordingStop','session reset does not replay the browser preference as a command');
  assert.equal(node('rec-pre-roll-2')['aria-pressed'],'true','preference survives a session reset in the same browser');
});

test('REC timeline uses fixed gutters for both end cards and separate bar.beat labels above marker names',()=>{
  const css=fs.readFileSync(new URL('./recording.css',import.meta.url),'utf8');
  assert.match(css,/\.rec-timeline-track\s*\{[^}]*min-width:0[^}]*margin:12px 48px 0/);
  assert.match(css,/\.rec-workspace \.rec-marker\s*\{[^}]*width:88px[^}]*translateX\(-50%\)/);
  assert.match(css,/\.rec-marker-position,\.rec-marker-name\s*\{[^}]*display:block/);
  const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  for(const bars of [0,1,2,4]) assert.match(html,new RegExp('id="rec-pre-roll-'+bars+'"'));
  assert.match(html,/class="rec-row rec-pre-roll" role="group"/);
});

test('REC loop auto-zoom calculates target zoom and centers timeline, respecting manual zoom override',async t=>{
  const nodes=new Map(),calls=[];let generated=0;
  const node=id=>{
    if(!nodes.has(id)) nodes.set(id,{
      id,value:'',textContent:'',disabled:false,hidden:false,dataset:{},style:{},
      children:[],listeners:new Map(),clientWidth:400,scrollWidth:1000,scrollLeft:0,offsetWidth:800,
      setAttribute(name,value){this[name]=value;},
      addEventListener(name,handler){this.listeners.set(name,handler);},
      replaceChildren(...children){this.children=children;},
      appendChild(child){this.children.push(child);}
    });
    return nodes.get(id);
  };
  const field=value=>({value,fresh:true,observedAt:Date.now()});
  const state={
    transport:{connected:true,isPlaying:field(false),recordMode:field(false),songTimeBeats:field(0),metronome:field(false)},
    selected:{index:0,id:'1',name:'Audio'},range:null,pending:null,safety:{loop:true},
    tracks:[{index:0,id:'1',name:'Audio',canArm:true,arm:true,solo:false,mute:false}],
    locators:[
      {name:'Intro',time:0},
      {name:'Verse',time:1000},
      {name:'Chorus',time:1040},
      {name:'Outro',time:2000}
    ],
    meter:{numerator:4,denominator:4}
  };
  const doc={
    readyState:'loading',body:{dataset:{page:'recording'}},hidden:false,getElementById:node,
    createElement:()=>node('generated-'+(++generated)),addEventListener(){}
  };
  const timers=[];
  const fakeSetTimeout=(fn,ms)=>{timers.push(fn);return timers.length;};
  const fakeClearTimeout=id=>{};
  const context=vm.createContext({
    document:doc,Date,setTimeout:fakeSetTimeout,clearTimeout:fakeClearTimeout,addEventListener(){},
    RcSurfaceI18n:{t:key=>key},
    sendPhoneCommand:(name,args,cb)=>{calls.push({name,args});cb({ok:true,result:state});}
  });
  vm.runInContext(source,context);
  const client=context.RcRecording.setup();
  t.after(()=>client.session(false));
  client.session(true,'controller');
  await client.command('getRecordingState');

  node('rec-start-marker').value='1';
  node('rec-start-marker').listeners.get('change')();
  node('rec-loop').listeners.get('click')();
  node('rec-end-marker').value='2';
  node('rec-end-marker').listeners.get('change')();

  assert.ok(timers.length>0,'auto-zoom scheduled after loop markers selected');
  timers[timers.length-1]();

  assert.equal(node('rec-zoom').value,'36','target zoom automatically zoomed into small loop section');
  assert.equal(node('rec-timeline-track').style.width,'calc(3600% - 96px)');
  assert.ok(node('rec-timeline').scrollLeft>0,'timeline scroll centered on loop midpoint');

  node('rec-zoom').value='2';
  node('rec-zoom').listeners.get('input')();
  assert.equal(node('rec-timeline-track').style.width,'calc(200% - 96px)');

  timers.length=0;
  await client.command('getRecordingState');
  assert.equal(node('rec-zoom').value,'2','manual zoom retained and not overwritten');
});

test('REC volume label reports native normalized units without inventing a dB curve',t=>{
  const {api:a}=api(t);
  assert.equal(a.formatVolumeDb(null),'?');
  assert.equal(a.formatVolumeDb(0),'0%');
  assert.equal(a.formatVolumeDb(0.85),'85%');
  assert.equal(a.formatVolumeDb(1),'100%');
});

test('REC track volume knob adjusts native mixer volume and resets on double click',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');const state=h.state();
  state.tracks[0].volume=0.85;state.tracks[0].volumeDefault=0.73;await h.seed(state);
  const card=h.node('rec-track-grid').children[0];
  const volBox=card.children[1].children.find(c=>c.className==='rec-track-vol' || c.role==='slider');
  assert.ok(volBox,'track volume knob exists immediately before arm button');
  assert.equal(volBox.role,'slider');
  assert.equal(volBox['aria-valuenow'],'0.85');
  assert.equal(volBox['aria-valuetext'],'85%');

  volBox.listeners.get('dblclick')({stopPropagation(){},preventDefault(){}});
  assert.equal(h.calls.at(-1).name,'recordingTrackVolume');
  assert.equal(h.calls.at(-1).args.track.id,state.tracks[0].id);
  assert.equal(h.calls.at(-1).args.volume,0.73);
  h.calls.at(-1).cb({ok:true,result:state});await h.flush();

  volBox.listeners.get('keydown')({key:'ArrowUp',preventDefault(){},stopPropagation(){}});
  assert.equal(h.calls.at(-1).name,'recordingTrackVolume');
  assert.equal(h.calls.at(-1).args.volume,0.87);
  h.calls.at(-1).cb({ok:true,result:state});await h.flush();

  volBox.listeners.get('keydown')({key:'Home',preventDefault(){},stopPropagation(){}});
  assert.equal(h.calls.at(-1).args.volume,0);
  h.calls.at(-1).cb({ok:true,result:state});await h.flush();

  volBox.listeners.get('keydown')({key:'End',preventDefault(){},stopPropagation(){}});
  assert.equal(h.calls.at(-1).args.volume,1);
  h.calls.at(-1).cb({ok:true,result:state});
});

test('REC volume gesture keeps final target but never replays after disconnect or Set change',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');const state=h.state();
  state.session={songId:'original',scenes:[],rows:[],owned:[]};state.tracks[0].volume=0.3;await h.seed(state);
  const box=h.node('rec-track-grid').children[0].children[1].children[0];
  const event=(y=100)=>({button:0,pointerId:9,clientY:y,preventDefault(){},stopPropagation(){}});
  box.listeners.get('pointerdown')(event());box.listeners.get('pointermove')(event(85));
  const first=h.calls.at(-1);assert.equal(first.args.volume,0.4);
  box.listeners.get('pointermove')(event(55));box.listeners.get('pointerup')(event(55));
  first.cb({ok:true,result:{...state,tracks:state.tracks.map((track,index)=>index?track:{...track,volume:0.4})}});await h.flush();
  assert.equal(h.calls.at(-1).args.volume,0.6,'final movement reaches native command after in-flight write');
  h.calls.at(-1).cb({ok:true,result:state});await h.flush();
  box.listeners.get('pointerdown')(event());box.listeners.get('pointermove')(event(85));const old=h.calls.at(-1);
  box.listeners.get('pointermove')(event(55));h.client.session(false);h.client.session(true,'controller');
  await h.seed({...state,session:{...state.session,songId:'replacement'}});const count=h.calls.length;
  old.cb({ok:true,result:state});await h.flush();box.listeners.get('pointermove')(event(25));
  assert.equal(h.calls.length,count,'stale pointer cannot write into replacement Set');
});

test('REC unknown volume, stale snapshot and viewer disable keyboard and reset writes',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');let state=h.state();await h.seed(state);
  const box=()=>h.node('rec-track-grid').children[0].children[1].children[0];
  const event={key:'ArrowUp',preventDefault(){},stopPropagation(){}};
  let count=h.calls.length;box().listeners.get('keydown')(event);assert.equal(h.calls.length,count);
  assert.equal(box()['aria-disabled'],'true');
  state.tracks[0].volume=0.2;await h.seed(state);h.age();count=h.calls.length;
  box().listeners.get('keydown')(event);assert.equal(h.calls.length,count);
  h.client.session(true,'viewer');await h.seed(state);count=h.calls.length;
  box().listeners.get('dblclick')(event);assert.equal(h.calls.length,count);
});

