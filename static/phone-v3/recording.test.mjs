// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('./modules/recording.js',import.meta.url),'utf8');
// The pure range selection is a real dependency of the recording module:
// every harness that sets the page up loads it first.
const rangeSource = fs.readFileSync(new URL('./modules/recording-range-selection.js',import.meta.url),'utf8');
function api(t) {
  const context = vm.createContext({setTimeout,clearTimeout,Date});
  vm.runInContext(source,context);
  const calls = [], client = context.RcRecording.createClient({timeoutMs:20,send:(cmd,args,cb)=>calls.push({cmd,args,cb})});
  t.after(()=>client.session(false));
  return {api:context.RcRecording,client,calls};
}
/** A track card holds a disclosure, a name, the controls and the reserved
 * lane. The parts are addressed by their own classes, never by position. */
function partOf(card,className) {
  return card.children.find(child=>child.className===className);
}
function actionOf(card,property) {
  const actions=partOf(card,'rec-track-actions');
  return actions&&actions.children.find(child=>child.dataset&&child.dataset.property===property);
}
function faderOf(card) {
  const actions=partOf(card,'rec-track-actions');
  return actions&&actions.children.find(child=>child.className==='rec-track-vol');
}
function nameOf(card) {
  return partOf(card,'rec-track-name');
}
function toggleOf(card) {
  return partOf(card,'rec-track-group-toggle');
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

test('REC phone keeps passive observations fresh while recordingRecord is awaiting confirmation',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});
  const context=vm.createContext({setTimeout,clearTimeout,Date});vm.runInContext(source,context);
  const calls=[],client=context.RcRecording.createClient({send:(cmd,args,cb)=>calls.push({cmd,args,cb})});
  client.session(true,'controller');t.after(()=>client.session(false));
  const start=client.command('recordingRecord',{});
  t.mock.timers.tick(5500);
  const read=client.command('getRecordingState');
  assert.equal(calls.at(-1).cmd,'getRecordingState','busy REC must not suppress passive phone reads');
  const observed={transport:{connected:true,isPlaying:{value:true,fresh:true},recordMode:{value:true,fresh:true}},tracks:[{volume:.39}],pending:'record'};
  calls.at(-1).cb({ok:true,result:observed});await read;
  assert.equal(client.view().fresh,true);assert.equal(client.view().state.tracks[0].volume,.39);
  assert.equal(client.view().busy,true);assert.equal(client.view().pendingCommand,'recordingRecord');
  calls[0].cb({ok:true,result:observed});await start;
  assert.equal(client.view().busy,false);assert.equal(calls.filter(call=>call.cmd==='recordingRecord').length,1);
});
test('REC phone STOP stays immediate while preparation is pending and ignores old callback',async t => {
  const {client,calls}=api(t); client.session(true,'controller');
  const prep=client.command('recordingPrepare'), rejected=assert.rejects(prep,/SESSION/);
  const stop=client.command('recordingStop'); assert.equal(calls[1].cmd,'recordingStop');
  calls[1].cb({ok:true,result:{stopped:true}}); await stop;
  calls[0].cb({ok:true,result:{preparedToken:'late'}}); await rejected;
  assert.equal(client.view().state.stopped,true); assert.equal(client.view().state.preparedToken,undefined);
});

test('REC phone retires a passive reply older than the confirmed recording action',async t=>{
  const {client,calls}=api(t);client.session(true,'controller');
  const recording=client.command('recordingRecord');const read=client.command('getRecordingState');
  const retired=assert.rejects(read,/SESSION/);
  calls[0].cb({ok:true,result:{transport:{recordMode:{value:true,fresh:true}},tracks:[{volume:.4}]}});await recording;
  calls[1].cb({ok:true,result:{transport:{recordMode:{value:false,fresh:true}},tracks:[{volume:0}]}});await retired;
  assert.equal(client.view().state.transport.recordMode.value,true);assert.equal(client.view().state.tracks[0].volume,.4);
  assert.equal(client.view().busy,false);
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
  for (const id of ['track-grid','arm-mode','start-marker','end-marker','timeline-track','markers','cursor','passages','start','stop','click','return-arrangement','session-bars','session-quantization','zoom']) assert.match(html,new RegExp('id="rec-'+id+'"'));
  assert.doesNotMatch(html,/id="rec-loop"/);
  for(const removed of ['prepare','audition','retry','good','review','bar','beat','point']) assert.doesNotMatch(html,new RegExp('id="rec-'+removed+'"'));
  // The page owns no marker action and no free block: the END menu owns the
  // "until STOP" value and the marker is created in Live.
  for(const removed of ['free-mode','add-marker','marker-status','marker-result','session-settings']) assert.doesNotMatch(html,new RegExp('id="rec-'+removed+'"'));
  assert.ok(html.indexOf('modules/recording.js')>html.indexOf('modules/session.js'));
  assert.match(html,/data-page="recording" role="tab"/);
  const css=fs.readFileSync(new URL('./recording.css',import.meta.url),'utf8'); assert.match(css,/min-height:56px/); assert.match(css,/border-radius:0/);
  assert.match(css,/body\[data-page="recording"\] \{ touch-action:pan-y/);
  // The capture band is outside the editor content: the transport never
  // scrolls with the editor.
  assert.ok(html.indexOf('id="rec-capture-band"')<html.indexOf('id="rec-content"'),'the capture band is outside the editor content');
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
  vm.runInContext(rangeSource,context); vm.runInContext(source,context); const client=context.RcRecording.setup(); t.after(()=>client.session(false));
  events.get('ableton-rc:phone-client-id')({detail:{role:'viewer'}});
  assert.equal(node('rec-start').disabled,true); assert.equal(node('rec-stop').disabled,true);
  events.get('ableton-rc:phone-client-id')({detail:{role:'controller'}});
  assert.equal(node('rec-start').disabled,false); assert.equal(node('rec-stop').disabled,false);
  const marker=node('rec-markers').children[0],trackCard=node('rec-track-grid').children[0];
  automaticRead=false;events.get('ableton-rc:page-change')();
  const read=sent.at(-1);assert.equal(read.cmd,'getRecordingState');
  assert.equal(node('rec-start').disabled,false);assert.equal(actionOf(trackCard,'arm').disabled,false);
  assert.equal(node('rec-markers').children[0],marker);assert.equal(node('rec-track-grid').children[0],trackCard);
  const writes=sent.length;node('rec-markers').children[1].listeners.get('click')();
  assert.equal(sent.length,writes,'a marker tap is a local decision and never writes to the host');
  assert.equal(node('rec-end-marker').value,'1','a marker after the start becomes the explicit end');
  read.cb({ok:true,result:state});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(client.view().state.selected.id,'11');
  automaticRead=true;
  node('rec-end-marker').value='1';node('rec-end-marker').listeners.get('change')();
  node('rec-passages').listeners.get('click')();assert.equal(node('rec-end-field').hidden,false);
  node('rec-start').listeners.get('click')(); assert.equal(sent.at(-1).cmd,'recordingRecord'); assert.equal(sent.at(-1).args.range.start.source,'cursor'); assert.equal(sent.at(-1).args.range.start.time,0); assert.equal(sent.at(-1).args.tracks[0].id,'11');
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

test('REC adopts a session whose hello arrived before setup, and stays closed without one',t=>{
  // Reload race: the socket handshake can finish while later scripts still load,
  // so ableton-rc:phone-client-id fires before REC registers its listener.
  for(const open of [{clientId:'early',role:'controller'},null]) {
    const nodes=new Map(),sent=[],events=new Map();
    const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false,hidden:false,dataset:{},style:{},children:[],
      setAttribute(){},addEventListener(){},replaceChildren(...children){this.children=children;},appendChild(child){this.children.push(child);}});return nodes.get(id);};
    const field=value=>({value,fresh:true,observedAt:Date.now()});
    const state={transport:{connected:true,isPlaying:field(true),recordMode:field(true),songTimeBeats:field(16),metronome:field(false)},
      tracks:[{index:0,id:'d',name:'Drums',arm:true,canArm:true,solo:false,mute:false,volume:.5}],locators:[{name:'A',time:8},{name:'B',time:32}],
      meter:{numerator:4,denominator:4},range:{start:{source:'cursor',time:16},end:{name:'B',time:32},loop:true},capture:{phase:'recording',pass:1,total:4},session:{songId:'s',scenes:[],rows:[],owned:[]}};
    let generated=0;
    const doc={readyState:'loading',body:{dataset:{page:'recording'}},hidden:false,getElementById:node,createElement:()=>node('g'+(++generated)),addEventListener(){}};
    const context=vm.createContext({document:doc,Date,setTimeout:()=>0,clearTimeout(){},addEventListener:(name,handler)=>events.set(name,handler),RcSurfaceI18n:{t:key=>key},
      RCSurface:{getPhoneSession:()=>open},sendPhoneCommand:(cmd,args,cb)=>{sent.push(cmd);if(cmd==='getRecordingState')cb({ok:true,result:state});}});
    vm.runInContext(rangeSource,context);vm.runInContext(source,context);const client=context.RcRecording.setup();t.after(()=>client.session(false));
    if(open){
      assert.deepEqual(sent,['getRecordingState'],'setup reads once for the already-open session');
      assert.equal(client.view().connected,true);assert.equal(client.view().writable,true);
      assert.equal(node('rec-passages-value').textContent,'1','a pass count outside 1/2/3 is normalized to one');
      assert.equal(node('rec-range-note').textContent,'rec.passagesNormalized','the normalization is reported, never hidden');
      assert.equal(node('rec-stop').disabled,false);
    } else {
      assert.deepEqual(sent,[],'no open session means no read and no invented connection');
      assert.equal(client.view().connected,false);assert.equal(node('rec-stop').disabled,true);
    }
  }
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
  vm.runInContext(rangeSource,context);vm.runInContext(source,context);const client=context.RcRecording.setup();t.after(()=>client.session(false));
  client.session(true,'controller');await client.command('getRecordingState');
  const cards=[...node('rec-track-grid').children],arm=index=>actionOf(cards[index],'arm');
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
  t.mock.timers.setTime(15951);assert.equal(client.view().state.transport.isPlaying.fresh,false);
  assert.equal(client.view().state.transport.isPlaying.value,false,'retain last known value without calling it fresh');
});

test('REC optional end supports free capture and never silently clears an invalid bounded range',async t=>{
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
  vm.runInContext(rangeSource,context);vm.runInContext(source,context);const client=context.RcRecording.setup();t.after(()=>client.session(false));
  client.session(true,'controller');await client.command('getRecordingState');
  // The free block is gone: the END menu owns the "until STOP" value.
  node('rec-end-marker').value='1';node('rec-end-marker').listeners.get('change')();
  node('rec-passages').listeners.get('click')();
  node('rec-start-marker').value='1';node('rec-start-marker').listeners.get('change')();
  assert.equal(calls.filter(call=>call.name==='recordingSeekMarker').length,0,'a local selection never seeks the host');
  assert.equal(node('rec-end-marker').value,'1');assert.equal(node('rec-start').disabled,true);
  node('rec-end-marker').value='';node('rec-end-marker').listeners.get('change')();
  assert.equal(node('rec-passages').hidden,false);assert.equal(node('rec-passages').disabled,true);
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
  vm.runInContext(rangeSource,context);vm.runInContext(source,context);const client=context.RcRecording.setup();t.after(()=>client.session(false));
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
  const nodes=new Map(),events=new Map(),documentEvents=new Map(),calls=[],saved=[],frames=[];let generated=0,now=10000;
  class ClockDate extends Date {static now(){return now;}}
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false,dataset:{},style:{},children:[],listeners:new Map(),
      setAttribute(name,value){this[name]=value;},addEventListener(name,handler){this.listeners.set(name,handler);},
      replaceChildren(...children){this.children=children;this.replacements=(this.replacements||0)+1;},appendChild(child){this.children.push(child);}});
    return nodes.get(id);
  };
  const field=value=>({value,fresh:true,observedAt:now});
  const state=()=>({transport:{connected:true,isPlaying:field(false),recordMode:field(false),songTimeBeats:field(32),metronome:field(false)},pending:null,range:null,
    scope:'scope-1',trackTreeValid:true,
    tracks:Array.from({length:10},(_,index)=>({index,id:String(index+11),name:'Input '+(index+1),arm:false,canArm:true,solo:false,mute:false})),
    locators:[{name:'REC',time:32},{name:'REC2',time:48}],meter:{numerator:4,denominator:4}});
  /** A tree with a group, a nested group, plain tracks and an empty lane. */
  const groupTracks=()=>[
    {index:0,id:'t-0',name:'Drums',arm:false,canArm:true,solo:false,mute:false,volume:0.5,groupId:null,isGroup:false},
    {index:1,id:'g-a',name:'Group A',arm:false,canArm:false,solo:false,mute:false,volume:0.4,groupId:null,isGroup:true},
    {index:2,id:'t-2',name:'Kick',arm:false,canArm:true,solo:false,mute:false,volume:0.3,groupId:'g-a',isGroup:false},
    {index:3,id:'t-3',name:'Snare',arm:false,canArm:true,solo:false,mute:false,volume:0.2,groupId:'g-a',isGroup:false},
    {index:4,id:'g-b',name:'Sub Group',arm:false,canArm:false,solo:false,mute:false,volume:0.2,groupId:'g-a',isGroup:true},
    {index:5,id:'t-5',name:'Bass',arm:false,canArm:true,solo:false,mute:false,volume:0.1,groupId:'g-b',isGroup:false},
    {index:6,id:'t-6',name:'Guitar',arm:false,canArm:true,solo:false,mute:false,volume:0.6,groupId:null,isGroup:false},
  ];
  const groupState=()=>({...state(),tracks:groupTracks()});
  const doc={readyState:'loading',body:{dataset:{page:'recording'}},hidden:false,activeElement:null,getElementById:node,createElement:()=>node('generated-'+(++generated)),
    addEventListener:(name,handler)=>documentEvents.set(name,handler)};
  const context=vm.createContext({document:doc,Date:ClockDate,performance:{now:()=>now},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},addEventListener:(name,handler)=>events.set(name,handler),
    localStorage:{getItem:()=>null,setItem:(...args)=>saved.push(args)},RcSurfaceI18n:{t:key=>key},sendPhoneCommand:(name,args,cb)=>calls.push({name,args,cb})});
  vm.runInContext(rangeSource,context);vm.runInContext(source,context);const client=context.RcRecording.setup();t.after(()=>client.session(false));
  const seed=async result=>{const reading=client.command('getRecordingState');calls.at(-1).cb({ok:true,result});await reading;};
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  const card=index=>node('rec-track-grid').children[index];
  const buttons=index=>partOf(card(index),'rec-track-actions').children.filter(c=>c.dataset&&c.dataset.property);
  return {node,client,state,groupState,groupTracks,seed,calls,events,documentEvents,saved,buttons,card,flush,frames,tick:ms=>{now+=ms;},age:()=>{now+=5001;},
    focus:id=>{doc.activeElement=id?node(id):null;}};
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
  assert.equal(nameOf(cards[0]).textContent,'1 \u00b7 Input 1');
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
  const card=h.node('rec-track-grid').children[0],name=nameOf(card),event=key=>({key,preventDefault(){},stopPropagation(){}});
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
  const name=nameOf(h.node('rec-track-grid').children[0]);name.listeners.get('dblclick')();const input=name.children[0];input.value='Draft';
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
  const name=nameOf(h.node('rec-track-grid').children[0]);name.listeners.get('dblclick')();assert.equal(name.children.length,0);
  h.client.session(true,'controller');await h.seed({...state,attemptActive:true});
  const current=nameOf(h.node('rec-track-grid').children[0]);current.listeners.get('dblclick')();assert.equal(current.children.length,0);
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

test('REC a group owns only its exact handle and arms one collective cohort',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');
  await h.seed(h.groupState());
  const cards=[...h.node('rec-track-grid').children];
  const group=cards.find(card=>card.dataset.id==='g-a');
  const groupArm=actionOf(group,'arm');
  assert.equal(groupArm.disabled,false,'a known tree arms the descendants of its group');
  groupArm.listeners.get('click')();
  const write=h.calls.at(-1);
  assert.equal(write.name,'recordingArmTracks');
  assert.equal(write.args.scope,'scope-1');
  assert.deepEqual(JSON.parse(JSON.stringify(write.args.group)),{index:1,id:'g-a',name:'Group A'});
  assert.deepEqual(JSON.parse(JSON.stringify(write.args.tracks)),[
    {index:2,id:'t-2',name:'Kick'},{index:3,id:'t-3',name:'Snare'},{index:5,id:'t-5',name:'Bass'}]);
  assert.equal(write.args.enabled,true);
  assert.equal(h.calls.filter(call=>call.name==='recordingTrackControl').length,0,'a group never fans out to its children');
});

test('REC a group ARM shows the confirmed all, mixed and none state from the host',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');
  let state=h.groupState();await h.seed(state);
  const groupArm=actionOf([...h.node('rec-track-grid').children].find(card=>card.dataset.id==='g-a'),'arm');
  assert.equal(groupArm['aria-pressed'],'false','no armed descendant is a confirmed none');
  state={...state,tracks:state.tracks.map(track=>track.id==='t-2'?{...track,arm:true}:track)};
  await h.seed(state);
  assert.equal(groupArm['aria-pressed'],'mixed','one armed descendant is a mixed cohort');
  state={...state,tracks:state.tracks.map(track=>['t-2','t-3','t-5'].includes(track.id)?{...track,arm:true}:track)};
  await h.seed(state);
  assert.equal(groupArm['aria-pressed'],'true','every armable descendant is armed');
});

test('REC a foreign group handle never claims a track by its position',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');
  const state=h.groupState();
  // The handle names the position of a group instead of its identity.
  const foreign={...state,tracks:state.tracks.map(track=>track.id==='t-6'?{...track,groupId:'1'}:track)};
  await h.seed(foreign);
  const groupArm=actionOf([...h.node('rec-track-grid').children].find(card=>card.dataset.id==='g-a'),'arm');
  groupArm.listeners.get('click')();
  const write=h.calls.at(-1);
  assert.equal(write.name,'recordingArmTracks');
  assert.deepEqual(JSON.parse(JSON.stringify(write.args.tracks)),[
    {index:2,id:'t-2',name:'Kick'},{index:3,id:'t-3',name:'Snare'},{index:5,id:'t-5',name:'Bass'}],
    'a handle that matches an index owns nothing');
});

test('REC a group can be renamed and its collective ARM carries the current name',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');
  const state=h.groupState();await h.seed(state);
  const group=[...h.node('rec-track-grid').children].find(card=>card.dataset.id==='g-a');
  const name=nameOf(group);
  name.listeners.get('dblclick')();
  const input=name.children[0];
  assert.equal(input.value,'Group A');
  input.value='Drum Bus';
  input.listeners.get('keydown')({key:'Enter',preventDefault(){},stopPropagation(){}});
  const rename=h.calls.at(-1);
  assert.equal(rename.name,'recordingRenameTrack');
  assert.deepEqual(JSON.parse(JSON.stringify(rename.args)),{track:{index:1,id:'g-a',name:'Group A'},name:'Drum Bus'});
  rename.cb({ok:true,result:{...state,tracks:state.tracks.map(track=>track.id==='g-a'?{...track,name:'Drum Bus'}:track)}});
  await h.flush();
  assert.equal(name.textContent,'2 · Drum Bus');
  actionOf(group,'arm').listeners.get('click')();
  const write=h.calls.at(-1);
  assert.equal(write.name,'recordingArmTracks');
  assert.deepEqual(JSON.parse(JSON.stringify(write.args.group)),{index:1,id:'g-a',name:'Drum Bus'},
    'the collective write carries the name the host confirmed');
});

test('REC an invalid tree renders honest flat tracks and disables the collective ARM',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');
  let state=h.groupState();await h.seed(state);
  assert.equal(h.node('rec-arm-all').disabled,false);
  state={...state,trackTreeValid:false};
  await h.seed(state);
  assert.equal(h.node('rec-arm-all').disabled,true,'an invalid tree never arms a guessed cohort');
  const group=[...h.node('rec-track-grid').children].find(card=>card.dataset.id==='g-a');
  assert.equal(toggleOf(group).hidden,true,'an invalid tree has no honest disclosure');
  assert.equal(actionOf(group,'arm').disabled,true);
});

test('REC a group disclosure is a local view choice and never writes to Live',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');
  await h.seed(h.groupState());
  const cards=[...h.node('rec-track-grid').children];
  const group=cards.find(card=>card.dataset.id==='g-a');
  const toggle=toggleOf(group);
  const child=cards.find(card=>card.dataset.id==='t-2');
  const nested=cards.find(card=>card.dataset.id==='t-5');
  assert.equal(toggle.hidden,false,'a known tree discloses its group');
  const before=h.calls.length;
  toggle.listeners.get('click')();
  await h.flush();
  assert.equal(h.calls.length,before,'collapsing a group never writes to Live');
  assert.equal(child.hidden,true,'a collapsed group hides its children');
  assert.equal(nested.hidden,true,'a collapsed group hides the nested group too');
  toggle.listeners.get('click')();
  await h.flush();
  assert.equal(child.hidden,false);
  assert.equal(nested.hidden,false);
  assert.equal(h.calls.length,before);
});

test('REC a failed collective ARM leaves the arm state unknown and is never retried',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');
  await h.seed(h.groupState());
  const groupArm=actionOf([...h.node('rec-track-grid').children].find(card=>card.dataset.id==='g-a'),'arm');
  groupArm.listeners.get('click')();
  const write=h.calls.at(-1);
  assert.equal(write.name,'recordingArmTracks');
  write.cb({ok:false,error:'REC:UNKNOWN'});
  await h.flush();
  assert.equal(h.client.view().error,'REC:UNKNOWN');
  assert.equal(groupArm['aria-pressed'],'mixed','an unknown arm observation is never a confirmed state');
  assert.equal(groupArm.disabled,true,'the collective waits for a fresh read');
  const before=h.calls.length;
  groupArm.listeners.get('click')();
  assert.equal(h.calls.length,before,'an unknown collective ARM is never retried');
});

test('REC a late collective ARM error never clears the arms of a new Set',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');
  await h.seed(h.groupState());
  const groupArm=actionOf([...h.node('rec-track-grid').children].find(card=>card.dataset.id==='g-a'),'arm');
  groupArm.listeners.get('click')();
  const write=h.calls.at(-1);
  assert.equal(write.name,'recordingArmTracks');
  // A new Set replaces the cohort before the answer arrives.
  h.client.session(true,'controller');
  const armed={...h.groupState(),tracks:h.groupTracks().map(track=>track.id==='t-2'?{...track,arm:true}:track)};
  const reading=h.client.command('getRecordingState');h.calls.at(-1).cb({ok:true,result:armed});await reading;
  write.cb({ok:false,error:'REC:UNKNOWN'});
  await h.flush();
  const observed=h.client.view().state.tracks.find(track=>track.id==='t-2');
  assert.equal(observed.arm,true,'a late cohort error never clears the arms of the new Set');
  assert.equal(h.calls.filter(call=>call.name==='recordingArmTracks').length,1,'the failed cohort is never retried');
});

test('REC a late collective ARM error never clears the arms of a confirmed STOP',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');
  await h.seed(h.groupState());
  const groupArm=actionOf([...h.node('rec-track-grid').children].find(card=>card.dataset.id==='g-a'),'arm');
  groupArm.listeners.get('click')();
  const write=h.calls.at(-1);
  // STOP is confirmed while the cohort is still pending.
  h.node('rec-stop').listeners.get('click')();
  const stop=h.calls.at(-1);
  assert.equal(stop.name,'recordingStop');
  const stopped={...h.groupState(),tracks:h.groupTracks().map(track=>track.id==='t-3'?{...track,arm:true}:track)};
  stop.cb({ok:true,result:stopped});
  await h.flush();
  write.cb({ok:false,error:'REC:UNKNOWN'});
  await h.flush();
  const observed=h.client.view().state.tracks.find(track=>track.id==='t-3');
  assert.equal(observed.arm,true,'a late cohort error never clears the arms of the confirmed STOP');
});

test('REC the fader follows the horizontal axis only',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');const state=h.state();
  state.tracks[0].volume=0.3;await h.seed(state);
  const box=faderOf(h.node('rec-track-grid').children[0]);
  const event=(x,y)=>({button:0,pointerId:4,clientX:x,clientY:y,preventDefault(){},stopPropagation(){}});
  box.listeners.get('pointerdown')(event(100,20));
  box.listeners.get('pointermove')(event(100,120));
  assert.equal(box['aria-valuenow'],'0.3','a vertical drag never changes the level');
  const first=h.calls.at(-1);
  first.cb({ok:true,result:state});await h.flush();
  box.listeners.get('pointermove')(event(124,20));
  assert.equal(h.calls.at(-1).args.volume,0.5,'a horizontal drag moves the level');
  box.listeners.get('pointerup')(event(124,20));
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
  const context=vm.createContext({document:doc,Date,setTimeout:()=>1,clearTimeout(){},addEventListener(){},RcSurfaceI18n:{t:key=>key==='rec.preRollOff'?'OFF':key},
    localStorage:{getItem:()=> '4',setItem:(key,value)=>saved.push([key,value])},sendPhoneCommand:(name,args,cb)=>calls.push({name,args,cb})});
  vm.runInContext(rangeSource,context);vm.runInContext(source,context);const client=context.RcRecording.setup();t.after(()=>client.session(false));
  client.session(true,'viewer');let reading=client.command('getRecordingState');calls.at(-1).cb({ok:true,result:state});await reading;
  let before=calls.length;node('rec-pre-roll-inline').listeners.get('click')();assert.equal(calls.length,before);assert.deepEqual(saved,[]);
  client.session(true,'controller');reading=client.command('getRecordingState');calls.at(-1).cb({ok:true,result:state});await reading;
  assert.equal(node('rec-pre-roll-value').textContent,'4');assert.equal(node('rec-pre-roll-inline').disabled,false);
  before=calls.length;node('rec-pre-roll-inline').listeners.get('click')();assert.equal(calls.length,before,'segment changes never send Live writes');
  // The cycle is OFF, 1, 2, 4 and back to OFF.
  assert.deepEqual(saved,[['rc-surface-v2.rec.preRollBars','0']]);assert.equal(node('rec-pre-roll-value').textContent,'OFF');
  node('rec-pre-roll-inline').listeners.get('click')();node('rec-pre-roll-inline').listeners.get('click')();
  assert.deepEqual(saved.at(-1),['rc-surface-v2.rec.preRollBars','2']);assert.equal(node('rec-pre-roll-value').textContent,'2');
  const markers=node('rec-markers').children;
  // The axis of the editor belongs to the Arrangement: the compact Record
  // mode never measures a hidden row.
  node('rec-arrangement-mode').listeners.get('click')();
  assert.deepEqual(markers.map(marker=>marker.children.map(child=>child.textContent)),[['1.1','First'],['1025.1','Last']]);
  // The opening with Até STOP frames sixteen bars from the resolved start:
  // the axis opens on the window of the capture and not on the whole
  // catalog, so the track is wider than the surface from the first render.
  assert.equal(markers[0].style.left,'0%');assert.equal(node('rec-timeline-track').style.width,'calc(4600% - 2*var(--rec-gutter,48px))');
  node('rec-zoom').value='8';node('rec-zoom').listeners.get('input')();assert.equal(node('rec-timeline-track').style.width,'calc(800% - 2*var(--rec-gutter,48px))');
  assert.equal(node('rec-markers').children[0],markers[0],'zoom keeps the timeline/marker binding and proportional scale');
  node('rec-start').listeners.get('click')();assert.equal(calls.at(-1).name,'recordingRecord');assert.equal(calls.at(-1).args.preRollBars,2);
  const pending={...state,pending:'record',preRoll:{phase:'running',bars:2},transport:{...state.transport,isPlaying:field(true),recordMode:field(true)}};
  calls.at(-1).cb({ok:true,result:pending});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(client.view().busy,false,'host monitoring does not hold the command callback for the whole lead-in');
  assert.equal(node('rec-status').textContent,'rec.preRolling');assert.equal(node('rec-pre-roll-inline').disabled,true);assert.equal(node('rec-stop').disabled,false);
  before=calls.length;node('rec-pre-roll-inline').listeners.get('click')();assert.equal(calls.length,before);assert.equal(saved.length,3);
  node('rec-stop').listeners.get('click')();assert.equal(calls.at(-1).name,'recordingStop');calls.at(-1).cb({ok:true,result:state});
  await new Promise(resolve=>setImmediate(resolve));client.session(false);client.session(true,'controller');
  assert.equal(calls.at(-1).name,'recordingStop','session reset does not replay the browser preference as a command');
  assert.equal(node('rec-pre-roll-value').textContent,'2','preference survives a session reset in the same browser');
});

test('REC timeline uses fixed gutters for both end cards and separate bar.beat labels above marker names',()=>{
  const css=fs.readFileSync(new URL('./recording.css',import.meta.url),'utf8');
  assert.match(css,/\.page-recording\s*\{[^}]*--rec-gutter:48px/);
assert.match(css,/\.rec-timeline-track\s*\{[^}]*min-width:0[^}]*margin:0 var\(--rec-gutter\) 0/);
  assert.match(css,/\.rec-workspace \.rec-marker\s*\{[^}]*width:76px[^}]*translateX\(-50%\)/);
  assert.match(css,/\.rec-marker-position,\.rec-marker-name\s*\{[^}]*display:block/);
  // The combined band is one row of the ruler with the arming controls on
  // the left and the ruler on the right, and a footer of 12. The ruler owns
  // a real height and a short surface keeps a shorter one.
  assert.match(css,/\.page-recording\s*\{[^}]*--rec-ruler-h:64px/);
  assert.match(css,/\.rec-combined-main\s*\{[^}]*height:var\(--rec-ruler-h\)/);
  assert.match(css,/\.rec-combined-controls\s*\{[^}]*flex:0 0 244px/);
  assert.match(css,/\.rec-combined-footer\s*\{[^}]*height:12px/);
  const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  for(const bars of [0,1,2,4]) assert.doesNotMatch(html,new RegExp('id="rec-pre-roll-'+bars+'"'));
  assert.match(html,/id="rec-pre-roll-inline"/);
  assert.match(html,/id="rec-passages"/);
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
  vm.runInContext(rangeSource,context);
  vm.runInContext(source,context);
  const client=context.RcRecording.setup();
  t.after(()=>client.session(false));
  client.session(true,'controller');
  await client.command('getRecordingState');

  // The measured axis belongs to the visible editor: the Arrangement owns
  // the timeline of the capture.
  node('rec-arrangement-mode').listeners.get('click')();
  node('rec-start-marker').value='1';
  node('rec-start-marker').listeners.get('change')();
  node('rec-end-marker').value='2';
  node('rec-end-marker').listeners.get('change')();

  assert.ok(timers.length>0,'auto-zoom scheduled after loop markers selected');
  timers[timers.length-1]();

  assert.equal(node('rec-zoom').value,'36','target zoom automatically zoomed into small loop section');
  assert.equal(node('rec-timeline-track').style.width,'calc(3600% - 2*var(--rec-gutter,48px))');
  assert.ok(node('rec-timeline').scrollLeft>0,'timeline scroll centered on loop midpoint');

  node('rec-zoom').value='2';
  node('rec-zoom').listeners.get('input')();
  assert.equal(node('rec-timeline-track').style.width,'calc(200% - 2*var(--rec-gutter,48px))');

  timers.length=0;
  await client.command('getRecordingState');
  assert.equal(node('rec-zoom').value,'2','manual zoom retained and not overwritten');
});

test('REC cursor moves between received positions and freezes on stop or stale connection',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');const state=h.state();
  state.transport.isPlaying.value=true;state.transport.recordMode.value=true;state.tempo=120;
  await h.seed(state);h.events.get('ableton-rc:page-change')();
  const initial=parseFloat(h.node('rec-cursor').style.left);
  h.tick(250);h.frames.at(-1)();
  assert.ok(Math.abs(parseFloat(h.node('rec-cursor').style.left)-initial-.5/52*100)<.001,'cursor advances at observed tempo between network polls');
  state.transport.isPlaying.value=false;await h.seed(state);
  const stopped=h.node('rec-cursor').style.left;h.tick(250);h.frames.at(-1)();
  assert.equal(h.node('rec-cursor').style.left,stopped);
  h.age();h.frames.at(-1)();assert.equal(h.node('rec-cursor').hidden,true,'stale replies never simulate live movement');
});

test('REC passes button cycles one, two, three and unlimited',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');const state=h.state();await h.seed(state);
  h.node('rec-end-marker').value='1';h.node('rec-end-marker').listeners.get('change')();
  assert.equal(h.node('rec-passages').hidden,false);
  const values=()=>h.node('rec-passages-value').textContent;
  assert.equal(values(),'1');
  h.node('rec-passages').listeners.get('click')();assert.equal(values(),'2');
  h.node('rec-passages').listeners.get('click')();assert.equal(values(),'3');
  h.node('rec-passages').listeners.get('click')();assert.equal(values(),'∞');
  h.node('rec-passages').listeners.get('click')();assert.equal(values(),'1');
  const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  // The passes control is one button: an unrelated later select never counts.
  const control=html.match(/<button[^>]*id="rec-passages"[^>]*>[\s\S]*?<\/button>/);
  assert.ok(control,'the passes control is a button');
  assert.doesNotMatch(control[0],/<select/);
});

test('REC manual zoom centers a selected marker and the midpoint of a wider-than-viewport selection',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');await h.seed(h.state());
  const timeline=h.node('rec-timeline'),track=h.node('rec-timeline-track');
  Object.assign(timeline,{clientWidth:400,scrollLeft:0});Object.assign(track,{offsetLeft:48,offsetWidth:2000});
  const select=(id,value)=>{h.node(id).value=value;h.node(id).listeners.get('change')();};
  const zoom=()=>{h.node('rec-zoom').value='8';h.node('rec-zoom').listeners.get('input')();};
  select('rec-start-marker','1');h.calls.length=0;zoom();
  assert.ok(Math.abs(timeline.scrollLeft-(48+48/52*2000-200))<.001,'selected marker stays centered');
  assert.equal(h.calls.length,0,'marker zoom never writes to Live');
  select('rec-start-marker','0');select('rec-end-marker','1');h.calls.length=0;timeline.scrollLeft=0;zoom();
  assert.ok(Math.abs(timeline.scrollLeft-(48+40/52*2000-200))<.001,'wide selection centers its midpoint, rather than pinning its start');
  assert.equal(h.calls.length,0,'selection zoom never writes to Live');
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
  const volBox=faderOf(card);
  assert.ok(volBox,'the track fader follows the ARM, SOLO and MUTE buttons');
  assert.equal(volBox.role,'slider');
  const order=partOf(card,'rec-track-actions').children.map(child=>child.dataset&&child.dataset.property||child.className);
  assert.deepEqual(order,['arm','solo','mute','rec-track-vol'],'the horizontal fader follows ARM, SOLO and MUTE');
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
  const box=faderOf(h.node('rec-track-grid').children[0]);
  const event=(x=100)=>({button:0,pointerId:9,clientX:x,preventDefault(){},stopPropagation(){}});
  box.listeners.get('pointerdown')(event());box.listeners.get('pointermove')(event(112));
  const first=h.calls.at(-1);assert.equal(first.args.volume,0.4);
  box.listeners.get('pointermove')(event(136));box.listeners.get('pointerup')(event(136));
  first.cb({ok:true,result:{...state,tracks:state.tracks.map((track,index)=>index?track:{...track,volume:0.4})}});await h.flush();
  assert.equal(h.calls.at(-1).args.volume,0.6,'final movement reaches native command after in-flight write');
  h.calls.at(-1).cb({ok:true,result:state});await h.flush();
  box.listeners.get('pointerdown')(event());box.listeners.get('pointermove')(event(112));const old=h.calls.at(-1);
  box.listeners.get('pointermove')(event(130));h.client.session(false);h.client.session(true,'controller');
  await h.seed({...state,session:{...state.session,songId:'replacement'}});const count=h.calls.length;
  old.cb({ok:true,result:state});await h.flush();box.listeners.get('pointermove')(event(150));
  assert.equal(h.calls.length,count,'stale pointer cannot write into replacement Set');
});

test('REC unknown volume, stale snapshot and viewer disable keyboard and reset writes',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');let state=h.state();await h.seed(state);
  const box=()=>faderOf(h.node('rec-track-grid').children[0]);
  const event={key:'ArrowUp',preventDefault(){},stopPropagation(){}};
  let count=h.calls.length;box().listeners.get('keydown')(event);assert.equal(h.calls.length,count);
  assert.equal(box()['aria-disabled'],'true');
  state.tracks[0].volume=0.2;await h.seed(state);h.age();count=h.calls.length;
  box().listeners.get('keydown')(event);assert.equal(h.calls.length,count);
  h.client.session(true,'viewer');await h.seed(state);count=h.calls.length;
  box().listeners.get('dblclick')(event);assert.equal(h.calls.length,count);
});

test('REC inline pre-roll changes only the shared local preference and reflects locked state',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');const state=h.state();await h.seed(state);
  const inline=h.node('rec-pre-roll-inline'),before=h.calls.length;
  inline.listeners.get('click')();
  assert.equal(h.calls.length,before);assert.equal(h.node('rec-pre-roll-value').textContent,'1');
  assert.deepEqual(h.saved.at(-1),['rc-surface-v2.rec.preRollBars','1']);
  await h.seed({...state,pending:'record'});assert.equal(inline.disabled,true);
  inline.listeners.get('click')();assert.equal(h.saved.at(-1)[1],'1');
});

test('REC phone CLICK neither waits for nor retires a pending REC action',async t => {
  const context = vm.createContext({setTimeout,clearTimeout,Date});
  vm.runInContext(source,context);
  const calls=[],client=context.RcRecording.createClient({send:(cmd,args,cb)=>calls.push({cmd,args,cb})});
  t.after(()=>client.session(false));
  client.session(true,'controller');
  // The click inverts an observation the host actually made: a connected
  // transport with a fresh boolean metronome.
  const known={transport:{connected:true,metronome:{value:false,fresh:true,observedAt:Date.now()}}};
  const reading=client.command('getRecordingState');
  calls.at(-1).cb({ok:true,result:known});await reading;
  const recording=client.command('recordingRecord',{});
  assert.equal(client.view().busy,true);
  await assert.rejects(client.command('recordingArm',{}),/BUSY/,'other writes still wait for REC');
  const clicking=client.command('recordingClick',{enabled:false});
  assert.equal(calls.at(-1).cmd,'recordingClick');assert.equal(client.view().clicking,true);
  await assert.rejects(client.command('recordingClick',{enabled:true}),/BUSY/,'one click change at a time');
  calls.at(-1).cb({ok:true,result:{transport:{connected:true,metronome:{value:false,fresh:true}}}});
  assert.equal((await clicking).transport.metronome.value,false);
  assert.equal(client.view().clicking,false);assert.equal(client.view().busy,true,'REC is still pending');
  calls.find(call=>call.cmd==='recordingRecord').cb({ok:true,result:{transport:{connected:true,metronome:{value:false,fresh:true}},pending:null}});
  assert.equal((await recording).pending,null,'the REC callback was not retired by CLICK');
  const late=client.command('recordingClick',{enabled:true});client.session(false);
  calls.at(-1).cb({ok:true,result:{}});await assert.rejects(late,/SESSION/);
});
test('REC CLICK never writes without a fresh known metronome observation',async t=>{
  const {client,calls}=api(t);client.session(true,'controller');
  await assert.rejects(client.command('recordingClick',{enabled:true}),/UNOBSERVED/);
  assert.equal(calls.length,0,'an unknown observation never reaches the host');
  // A metronome without a boolean value is not a known metronome.
  let reading=client.command('getRecordingState');
  calls.at(-1).cb({ok:true,result:{transport:{connected:true,metronome:{value:undefined,fresh:true}}}});
  await reading;
  await assert.rejects(client.command('recordingClick',{enabled:true}),/UNOBSERVED/);
  assert.equal(calls.length,1,'only the read reached the host');
  // A stale observation is not a known metronome either.
  reading=client.command('getRecordingState');
  calls.at(-1).cb({ok:true,result:{transport:{connected:true,metronome:{value:false,fresh:false}}}});
  await reading;
  await assert.rejects(client.command('recordingClick',{enabled:true}),/UNOBSERVED/);
  assert.equal(calls.length,2);
  // A disconnected transport never carries a click.
  reading=client.command('getRecordingState');
  calls.at(-1).cb({ok:true,result:{transport:{connected:false,metronome:{value:false,fresh:true}}}});
  await reading;
  await assert.rejects(client.command('recordingClick',{enabled:true}),/UNOBSERVED/);
  assert.equal(calls.length,3);
  // A known, fresh observation sends the click.
  reading=client.command('getRecordingState');
  calls.at(-1).cb({ok:true,result:{transport:{connected:true,metronome:{value:false,fresh:true}}}});
  await reading;
  const clicking=client.command('recordingClick',{enabled:true});
  assert.equal(calls.at(-1).cmd,'recordingClick');
  calls.at(-1).cb({ok:true,result:{transport:{connected:true,metronome:{value:true,fresh:true}}}});
  await clicking;
  assert.equal(client.view().state.transport.metronome.value,true);
});
test('REC CLICK is disabled without a known metronome and its handler never writes one',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');await h.seed(h.state());
  const click=h.node('rec-click');
  assert.equal(click.disabled,false,'a fresh known metronome enables CLICK');
  assert.ok(!click.textContent.includes('?'),'a known metronome is labelled with its state');
  click.listeners.get('click')();
  assert.equal(h.calls.at(-1).name,'recordingClick');
  assert.equal(h.calls.at(-1).args.enabled,true,'the click inverts the observed metronome');
  // The observation ages: the control and the handler both refuse it.
  h.age();
  h.events.get('ableton-rc:page-change')();
  assert.equal(click.disabled,true,'an aged observation never leaves CLICK enabled');
  assert.ok(click.textContent.includes('?'),'an unknown metronome is labelled as unknown');
  const count=h.calls.length;
  click.listeners.get('click')();
  assert.equal(h.calls.length,count,'the handler refuses an unknown metronome');
});
test('REC an explicit pass count clears the host normalization notice',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');
  const state={...h.state(),range:{start:{source:'cursor',time:32},end:{name:'REC2',time:48},loop:true},capture:{phase:'recording',pass:1,total:4}};
  await h.seed(state);
  assert.equal(h.node('rec-range-note').textContent,'rec.passagesNormalized','a pass count outside 1/2/3 is reported');
  assert.equal(h.node('rec-passages-value').textContent,'1','the count is normalized to one');
  h.node('rec-passages').listeners.get('click')();
  assert.equal(h.node('rec-passages-value').textContent,'2','the reader chose the pass count');
  assert.equal(h.node('rec-range-note').textContent,'','an explicit choice clears the normalization notice');
});

test('REC timeline grid marks bars and beats from the observed meter and thins out when zoomed out',t => {
  const {api:rec}=api(t),a={timelineGrid:(...args)=>JSON.parse(JSON.stringify(rec.timelineGrid(...args)))};
  const four={numerator:4,denominator:4},bounds={start:0,end:16,width:100};
  // 16 beats over 640 px: every beat 40 px apart, every bar numbered.
  let ticks=a.timelineGrid(bounds,four,640);
  assert.deepEqual(ticks.filter(tick=>tick.kind==='bar').map(tick=>[tick.time,tick.label]),[[0,'1'],[4,'2'],[8,'3'],[12,'4'],[16,'5']]);
  assert.deepEqual(ticks.filter(tick=>tick.kind==='beat').map(tick=>tick.time),[1,2,3,5,6,7,9,10,11,13,14,15]);
  // 6/8: bars of three quarter notes, beats every eighth.
  ticks=a.timelineGrid({start:0,end:6},{numerator:6,denominator:8},600);
  assert.deepEqual(ticks.filter(tick=>tick.kind==='bar').map(tick=>tick.time),[0,3,6]);
  assert.equal(ticks.filter(tick=>tick.kind==='beat').length,10);
  // 400 bars on 600 px: no beats, bar lines at least 6 px apart, labels at least 28 px apart.
  ticks=a.timelineGrid({start:0,end:1600},four,600);
  const bars=ticks.filter(tick=>tick.kind==='bar'),labels=bars.filter(tick=>tick.label);
  assert.equal(ticks.some(tick=>tick.kind==='beat'),false);
  assert.ok(bars.length<=101 && (bars[1].time-bars[0].time)*600/1600>=6);
  assert.ok((labels[1].time-labels[0].time)*600/1600>=28);
  assert.equal(labels[1].label,String(labels[1].time/4+1),'labels are real bar numbers');
  for(const meter of [null,{numerator:4,denominator:3},{numerator:0,denominator:4}]) assert.deepEqual(a.timelineGrid(bounds,meter,640),[],'unknown meter draws nothing');
  assert.deepEqual(a.timelineGrid(bounds,four,0),[],'hidden timeline draws nothing');
});

test('REC an open selector chooses the marker it displays, not the one at that index now',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');
  const state=h.state();state.tracks.forEach(track=>track.arm=true);
  state.locators=[{name:'A8',time:8},{name:'B24',time:24}];
  await h.seed(state);
  const start=h.node('rec-start-marker');
  const displayed=start.children.find(option=>option.value==='0');
  assert.match(displayed.textContent,/A8/);
  h.focus('rec-start-marker');
  // The Set gains a marker ahead of the catalog while the selector is open.
  await h.seed({...state,locators:[{name:'X4',time:4},{name:'A8',time:8},{name:'B24',time:24}]});
  assert.equal(start.children.find(option=>option.value==='0').textContent,displayed.textContent,'the open selector keeps the options it shows');
  start.value='0';start.listeners.get('change')();
  assert.equal(h.node('rec-markers').children[0]['aria-pressed'],'true','the marker keeps the node it represents');
  h.node('rec-start').listeners.get('click')();
  const write=h.calls.at(-1);
  assert.equal(write.name,'recordingRecord');
  assert.deepEqual(JSON.parse(JSON.stringify(write.args.range.start)),{name:'A8',time:8},'the capture starts at the marker the option showed');
});

test('REC the frozen range of the host owns the display while it captures',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');
  const state=h.state();state.tracks.forEach(track=>track.arm=true);
  state.locators=[{name:'A8',time:8},{name:'B24',time:24}];
  await h.seed(state);
  h.node('rec-start-marker').value='0';h.node('rec-start-marker').listeners.get('change')();
  h.node('rec-end-marker').value='next';h.node('rec-end-marker').listeners.get('change')();
  // The host takes the capture with the range it froze.
  const owned={...state,range:{start:{name:'A8',time:8},end:{name:'B24',time:24},loop:true},capture:{phase:'recording',pass:1,total:2},pending:'record'};
  await h.seed(owned);
  // A new marker arrives in the Set: the capture of the host does not move.
  await h.seed({...owned,locators:[{name:'A8',time:8},{name:'New16',time:16},{name:'B24',time:24}]});
  const markers=h.node('rec-markers').children;
  assert.equal(markers.length,3);
  assert.equal(markers[2]['data-end'],'true','the frozen end of the host stays the end');
  assert.equal(markers[1]['data-end'],'false','a new marker never becomes the end of a capture the host owns');
  assert.equal(markers[0]['aria-pressed'],'true','the frozen start of the host stays the start');
});

test('REC an end that left the Set blocks the capture instead of widening it',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');
  const state=h.state();state.tracks.forEach(track=>track.arm=true);
  state.locators=[{name:'A8',time:8},{name:'B24',time:24}];
  await h.seed(state);
  h.focus('rec-end-marker');
  h.node('rec-end-marker').value='1';
  // The end marker leaves the Set while the selector is open.
  await h.seed({...state,locators:[{name:'A8',time:8}]});
  h.node('rec-end-marker').listeners.get('change')();
  assert.equal(h.node('rec-range-note').textContent,'rec.reason.END_MISSING','the vanished end is reported, never widened');
  assert.equal(h.node('rec-start').disabled,true,'a vanished end never widens the range to Until STOP');
});

test('REC a keyboard activation moves the selection after a pointer gesture',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');
  const state=h.state();state.tracks.forEach(track=>track.arm=true);
  state.locators=[{name:'A8',time:8},{name:'B24',time:24}];
  await h.seed(state);
  h.node('rec-start-marker').value='0';h.node('rec-start-marker').listeners.get('change')();
  const markers=h.node('rec-markers').children;
  // A pointer gesture on the start marker arms the start.
  markers[0].listeners.get('pointerdown')({clientX:100,clientY:100});
  markers[0].listeners.get('click')({clientX:100,clientY:100,detail:1});
  assert.equal(h.node('rec-range-note').textContent,'rec.editStart');
  // A pointer that stays down on that marker never blocks the keyboard
  // activation of another marker.
  markers[0].listeners.get('pointerdown')({clientX:100,clientY:100});
  markers[1].listeners.get('keydown')({key:'Enter'});
  markers[1].listeners.get('click')({detail:0,clientX:0,clientY:0});
  assert.equal(h.node('rec-start-marker').value,'1','the keyboard moves the start to the chosen marker');
  assert.notEqual(h.node('rec-range-note').textContent,'rec.editStart','the armed start follows the keyboard');
});

test('REC a disabled selector never changes the capture range',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');
  const state=h.state();await h.seed(state);
  const start=h.node('rec-start-marker'),end=h.node('rec-end-marker');
  // The host owns the capture: the selectors are locked.
  await h.seed({...state,pending:'record'});
  assert.equal(start.disabled,true);
  start.value='1';start.listeners.get('change')();
  end.value='1';end.listeners.get('change')();
  await h.seed({...state,pending:'record'});
  assert.equal(start.value,'cursor','a queued change never moves the start');
  assert.equal(end.value,'','a queued change never moves the end');
});

test('REC opens in the Record mode and the local mode switch never writes to the host',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');await h.seed(h.state());
  assert.equal(h.node('page-recording').dataset.recMode,'record','a fresh load opens in the Record mode');
  assert.equal(h.node('rec-record-mode')['aria-pressed'],'true');
  assert.equal(h.node('rec-arrangement-mode')['aria-pressed'],'false');
  assert.equal(h.node('rec-clip-mode')['aria-pressed'],'false');
  assert.equal(h.node('rec-arrangement-panel').hidden,false,'the ruler of the capture is visible in the Record mode');
  const before=h.calls.length;
  h.node('rec-arrangement-mode').listeners.get('click')();
  assert.equal(h.calls.length,before+1,'the mode switch reads and never writes');
  assert.equal(h.calls.at(-1).name,'getRecordingState');
  h.calls.at(-1).cb({ok:true,result:h.state()});await h.flush();
  assert.equal(h.node('page-recording').dataset.recMode,'arrangement');
  assert.equal(h.node('rec-arrangement-mode')['aria-pressed'],'true');
  assert.equal(h.node('rec-arrangement-panel').hidden,false);
  h.node('rec-clip-mode').listeners.get('click')();
  assert.equal(h.calls.at(-1).name,'getSessionRecordingState','the Clip keeps the Session contract');
  assert.equal(h.node('page-recording').dataset.recMode,'clip');
  assert.equal(h.node('rec-session-panel').hidden,false);
  assert.equal(h.calls.filter(call=>/^recording/.test(call.name)).length,0,'a local mode never writes to the host');
});

test('REC locks the local modes while the host owns the capture',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');const state=h.state();await h.seed(state);
  assert.equal(h.node('rec-record-mode').disabled,false);
  for(const locked of [{pending:'record'},{preRoll:{phase:'running'}},{attemptActive:true},
    {session:{songId:'song',active:true,scenes:[],rows:[],owned:[],totalScenes:0}},
    {capture:{phase:'recording'}},{transport:{...state.transport,recordMode:{value:true,fresh:true}}}]) {
    await h.seed({...state,...locked});
    assert.equal(h.node('rec-record-mode').disabled,true,JSON.stringify(Object.keys(locked)));
    assert.equal(h.node('rec-arrangement-mode').disabled,true);
    assert.equal(h.node('rec-clip-mode').disabled,true);
  }
  const before=h.calls.length;
  h.node('rec-clip-mode').listeners.get('click')();
  assert.equal(h.calls.length,before,'a locked mode never switches');
  assert.equal(h.node('page-recording').dataset.recMode,'record');
});

test('REC the click knob is gone in every mode and the real CLICK stays',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');await h.seed(h.state());
  const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/id="rec-click-volume"/,'the unsupported knob is not in the page');
  assert.doesNotMatch(html,/rec-click-vol/,'the unsupported knob leaves every mode');
  assert.equal(h.node('rec-click').disabled,false,'the observed CLICK stays available');
  h.node('rec-arrangement-mode').listeners.get('click')();
  assert.equal(h.node('rec-click').disabled,false,'the Arrangement keeps the real CLICK');
  h.node('rec-clip-mode').listeners.get('click')();
  assert.equal(h.node('rec-click').disabled,false,'the Clip keeps the real CLICK');
});

test('REC the take inspection belongs to the Arrangement alone',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');await h.seed(h.state());
  assert.equal(h.node('rec-takes').hidden,true,'the Record mode hides the take lanes');
  assert.equal(h.node('rec-focus').hidden,true,'the Record mode hides the take focus');
  h.node('rec-arrangement-mode').listeners.get('click')();
  assert.equal(h.node('rec-takes').hidden,true,'the Arrangement shows no empty take list of its own');
  assert.equal(h.node('rec-focus').hidden,true,'a closed focus is never unhidden');
  h.node('rec-clip-mode').listeners.get('click')();
  assert.equal(h.node('rec-takes').hidden,true,'the Clip hides the take lanes');
  assert.equal(h.node('rec-focus').hidden,true,'the Clip hides the take focus');
});

test('REC the selectors map through the catalog they display',async t=>{
  const h=gridHarness(t);h.client.session(true,'controller');
  const state=h.state();state.tracks.forEach(track=>track.arm=true);
  state.locators=[{name:'A8',time:8},{name:'B24',time:24}];
  await h.seed(state);
  const end=h.node('rec-end-marker');
  h.node('rec-start-marker').value='0';h.node('rec-start-marker').listeners.get('change')();
  end.value='1';end.listeners.get('change')();
  // The end selector holds its options while the Set gains a marker.
  h.focus('rec-end-marker');
  await h.seed({...state,locators:[{name:'X4',time:4},{name:'A8',time:8},{name:'B24',time:24}]});
  assert.equal(h.node('rec-start-marker').value,'0','the start shows the marker it owns');
  assert.equal(end.value,'1','the end shows the marker it owns');
});

test('REC the shared range and the marker live outside the editor of a take',()=>{
  const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  assert.match(html,/id="rec-record-mode"/);
  assert.match(html,/id="rec-range-row"/);
  assert.ok(html.indexOf('id="rec-range-row"')<html.indexOf('id="rec-arrangement-panel"'),'the shared range is outside the editor');
  assert.ok(html.indexOf('id="rec-capture-band"')<html.indexOf('id="rec-arrangement-panel"'),'the capture band is outside the editor');
  assert.ok(html.indexOf('id="rec-combined-band"')<html.indexOf('id="rec-content"'),'the combined band is outside the editor content');
  assert.equal((html.match(/id="rec-arm-all"/g)||[]).length,1,'the collective arming control is one instance');
  assert.equal((html.match(/id="rec-arm-mode"/g)||[]).length,1,'the arming mode is one instance');
  assert.equal((html.match(/id="rec-status"/g)||[]).length,1,'the status of the page is one instance');
  assert.doesNotMatch(html,/rec-track-heading/,'the track heading is gone: the arming controls live in the combined band');
  assert.doesNotMatch(html,/id="rec-add-marker"/,'the page owns no marker action');
  assert.equal((html.match(/id="rec-capture-band"/g)||[]).length,1,'the capture band is one instance');
  assert.equal((html.match(/id="rec-start-marker"/g)||[]).length,1,'the start of the range is one instance');
  assert.equal((html.match(/id="rec-end-marker"/g)||[]).length,1,'the end of the range is one instance');
});
