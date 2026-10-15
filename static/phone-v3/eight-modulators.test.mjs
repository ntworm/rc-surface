// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

function makeElement(dataset = {}) {
  const listeners = {};
  const classes = new Set();
  return {
    dataset,
    listeners,
    style: {
      values: new Map(),
      setProperty(name, value) { this.values.set(name, value); },
      removeProperty(name) { this.values.delete(name); },
      getPropertyValue(name) { return this.values.get(name) || ''; },
      get backgroundColor() { return this.values.get('backgroundColor') || ''; },
      set backgroundColor(value) { this.values.set('backgroundColor', value); },
    },
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      toggle(name, force) {
        const enabled = typeof force === 'boolean' ? force : !classes.has(name);
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      },
      contains(name) { return classes.has(name); },
    },
    addEventListener(type, cb) { listeners[type] = cb; },
    removeEventListener(type, cb) { if (listeners[type] === cb) delete listeners[type]; },
    setPointerCapture() {},
    setAttribute() {},
    querySelector() { return null; },
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 100 }),
    clientHeight: 100,
  };
}

function loadControls(pulseName = 'toggle-5', { snapshots = true, syncPanel = false, pulseBar = null, saved = {}, withXY = false, visuals = false, withPads = false, withAutomation = false } = {}) {
  const engineFile = path.join(import.meta.dirname, 'mode-engine.js');
  const controlsFile = path.join(import.meta.dirname, 'controls.js');
  const engineSource = fs.readFileSync(engineFile, 'utf8');
  const controlsSource = fs.readFileSync(controlsFile, 'utf8');

  const pulse = makeElement({ name: pulseName });
  // P04 (rc-surface-modulator-quality-2026-09-16): inject an optional
  // .mod-val-bar child on the pulse gate so makePulseButton can capture
  // it via el.querySelector('.mod-val-bar'). The override must land BEFORE
  // controls.js runs, otherwise the closure already bound `bar` to null.
  if (pulseBar) {
    pulse.querySelector = (selector) => (selector === '.mod-val-bar' ? pulseBar : null);
  }
  const lfo = makeElement({ name: 'toggle-1' });
  const lfos = [lfo, ...[2,3,4].map(i => makeElement({name: `toggle-${i}`}))];
  const pulses = [pulse, ...[2,3,4].map(i => makeElement({name: `toggle-${i+4}`}))];
  const all = [...lfos, ...pulses];
  const paints={height:0,transform:0,text:0,trail:0,queries:0};
  if(visuals) for(const el of all) {
    const style={};
    for(const key of ['height','transform']) Object.defineProperty(style,key,{get(){return this['_'+key];},set(value){paints[key]++;this['_'+key]=value;}});
    el.fill={style};el.rate={_text:'',get textContent(){return this._text;},set textContent(value){paints.text++;this._text=value;}};
    el.querySelector=selector=>selector==='.mod-val-bar'?el.fill:selector==='.modulator-rate-readout'?el.rate:null;
  }
  lfos.forEach(el => el.classList.add('toggle'));
  pulses.forEach(el => el.classList.add('toggle'));
  const storage = new Map(Object.entries(saved));
  const xy = [1,2].map(i => makeElement({name:`xy-${i}`}));
  const pads=Array.from({length:12},(_,i)=>makeElement({name:`pad-${i+1}`}));
  xy.forEach(el=>{el.trail={points:'',setAttribute(key,value){paints.trail++;this[key]=value;}};el.querySelector=selector=>selector==='.xy-dot'?{style:{}}:selector==='.xy-trail-line'?el.trail:null;});
  const overlay = makeElement();
  const rateReadout = makeElement();
  const modeButtons = ['A', 'B', 'C', 'D'].map((mode) => makeElement({ padModeSet: mode }));
  let rafCallbacks = [];
  let now = 0;
  const emitted = [];
  const modulatorStates = [];

  const context = {
    window: null,
    document: {
      body: { dataset: {} },
      getElementById: id => syncPanel && id === 'sync-settings-overlay' ? overlay
        : syncPanel && id === 'lfo-effective-rate' ? rateReadout : null,
      querySelector(selector) {
        paints.queries++;
        const xyEl=xy.find(el=>selector===`.xy-pad[data-name="${el.dataset.name}"]`);
        if(xyEl)return xyEl;
        const slot = all.find(el => selector === `.toggle[data-name="${el.dataset.name}"]`);
        if (slot) return slot;
        return null;
      },
      querySelectorAll(selector) {
        if (selector === '.pad') return withPads ? pads : [];
        if (selector === '.xy-pad') return withXY ? xy : [];
        if (selector === '[data-pad-mode-set]') return modeButtons;
        if (selector === '.toggle') return all;
        if (selector === '.button') return all.filter(el => el.classList.contains('button'));
        return [];
      },
      addEventListener() {},
    },
    navigator: { vibrate: () => {} },
    performance: { now: () => now },
    Date: { now: () => 100000 + now },
    requestAnimationFrame(cb) { rafCallbacks.push(cb); },
    cancelAnimationFrame() {},
    addEventListener() {},
    dispatchEvent() {},
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    setTimeout() {},
    clearTimeout() {},
    setInterval() {},
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    onControl(ctrl) { emitted.push(ctrl); },
    onModulatorState(state) { modulatorStates.push(state); },
  };
  context.window = context;

  vm.runInNewContext(fs.readFileSync(path.join(import.meta.dirname, 'control-config.js'), 'utf8'), context);
  vm.runInNewContext(engineSource, context, { filename: engineFile });
  if (snapshots) vm.runInNewContext(fs.readFileSync(path.join(import.meta.dirname, 'modules/snapshots.js'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(path.join(import.meta.dirname, 'xy-engine.js'), 'utf8'), context);
  if(withAutomation) {
    context.phoneWs={readyState:1};context.state={role:'controller'};
    for(const name of ['xy-automation','xy-automation-controller']) vm.runInNewContext(fs.readFileSync(path.join(import.meta.dirname,name+'.js'),'utf8'),context);
  }
  vm.runInNewContext(controlsSource, context, { filename: controlsFile });

  return {
    context,
    paints,
    all,
    pads,
    xy,
    storage,
    pulse,
    lfo,
    rateReadout,
    modeButtons,
    emitted,
    modulatorStates,
    setTime(at) { now = at; },
    tick(at) {
      now = at;
      const callbacks = rafCallbacks; rafCallbacks = [];
      callbacks.forEach(cb => cb());
    },
  };
}

function pointer(pointerId, clientY) {
  return { pointerId, clientX: 50, clientY, button: 0, preventDefault() {} };
}

const names = Array.from({length:8}, (_,i)=>`toggle-${i+1}`);
for (let n = 0; n <= 8; n++) {
  test(`phone runs ${n} LFOs / ${8-n} Pulses through the real CFG store`, () => {
    const app = loadControls(); const ctx = app.context;
    names.forEach((name, i) => ctx.RcControlConfig.set(name, {shape: i < n ? 'triangle' : 'square'}));
    names.forEach(name => ctx.controlSetters[name](1));
    assert.equal([...ctx.modulatorStates.values()].filter(v=>v.kind==='lfo').length,n);
    assert.equal(ctx.modulatorStates.size,8);
    names.forEach((name, i) => assert.equal(app.modulatorStates.findLast(v => v.name === name)?.kind, i < n ? 'lfo' : 'pulse'));
    assert.equal(new Set(app.modulatorStates.filter(v => v.active).map(v => v.name)).size, 8);
  });
}
test('slot switch keeps activation and rate/depth/count, and clear restores inherited kind', () => {
  const app=loadControls(); const ctx=app.context;
  ctx.controlSetters['toggle-1.rate'](.73); ctx.controlSetters['toggle-1.depth'](.42);
  ctx.controlSetters['toggle-1.count'](.66); ctx.controlSetters['toggle-1'](1);
  ctx.RcControlConfig.set('toggle-1', {shape:'square'});
  assert.equal(app.modulatorStates.at(-1).kind, 'pulse'); assert.equal(app.modulatorStates.at(-1).active, true);
  const state=ctx.modulatorStates.get('toggle-1');
  assert.equal(state.active,true); assert.equal(state.rate,.73); assert.equal(state.depth,.42); assert.equal(state.count,.66);
  assert.equal(ctx.currentControlStates['toggle-1'],1);
  ctx.RcControlConfig.clear('toggle-1');
  assert.equal(ctx.modulatorStates.get('toggle-1').kind,'lfo');
  app.lfo.listeners.pointerdown(pointer(1,100));
  assert.equal(app.modulatorStates.at(-1).kind,'lfo'); assert.equal(app.modulatorStates.at(-1).active,true);
});

for(const mode of ['A','B','C','D']) test(`${mode} live waveform swaps keep gate state and original burst deadline`,()=>{
  const app=loadControls();const ctx=app.context;
  ctx.RcControlConfig.set('toggle-1',{mode,syncMode:'free'});
  ctx.controlSetters['toggle-1'](1);app.tick(100);
  const state=ctx.modulatorStates.get('toggle-1');const deadline=state.burstUntil;
  for(const shape of ['square','triangle','square','sine']) {
    ctx.RcControlConfig.set('toggle-1',{shape});
    assert.equal(state.active,true);assert.equal(state.burstUntil,deadline);
    assert.equal(app.modulatorStates.at(-1).active,true);
  }
  ctx.controlSetters['toggle-1'](0);
  ctx.RcControlConfig.set('toggle-1',{shape:'square'});assert.equal(state.active,false);
  if(mode==='D') {
    ctx.controlSetters['toggle-1'](1);const end=state.burstUntil;
    app.setTime(end+1);ctx.RcControlConfig.set('toggle-1',{shape:'triangle'});
    assert.equal(state.active,false,'an expired burst must not restart before the next frame');
  }
});

test('steady visual frames use transforms, cache slot elements and skip unchanged labels and trails',t=>{
  const app=loadControls('toggle-5',{visuals:true,withXY:true});
  for(const name of names) app.context.controlSetters[name](1);
  for(const key of Object.keys(app.paints)) app.paints[key]=0;
  for(let i=1;i<=120;i++)app.tick(i*1000/120);
  t.diagnostic(JSON.stringify(app.paints));
  assert.equal(app.paints.height,0,'value animation must not resize layout');
  assert.ok(app.paints.transform>0);
  assert.ok(app.paints.text<=8,'stable rate labels change once, not each frame');
  assert.equal(app.paints.trail,0,'stationary Static XY must not repaint an empty trail');
  assert.ok(app.paints.queries<=16,'slot DOM lookup must not repeat every frame');
});

test('individual pad touch/drag, latch tap reset, and toggle level reach real handlers',()=>{
  const app=loadControls('toggle-5',{withPads:true});const ctx=app.context;
  const send=(i,type,y=100)=>app.pads[i].listeners[type](pointer(1,y));
  ctx.RcControlConfig.set('pad-1',{mode:'A',padRange:100,padCurve:'fine',padTouchValue:.2});
  send(0,'pointerdown');assert.equal(app.emitted.at(-1).value,.2);
  send(0,'pointermove',50);assert.equal(app.emitted.at(-1).value,.45);
  send(0,'pointerup');assert.equal(app.emitted.at(-1).value,0);
  ctx.RcControlConfig.set('pad-2',{mode:'B',padLatchTapReset:true,padRange:100});
  ctx.controlSetters['pad-2'](.7);send(1,'pointerdown');send(1,'pointercancel');assert.equal(app.emitted.at(-1).value,.7);
  send(1,'pointerdown');send(1,'pointerup');assert.equal(app.emitted.at(-1).value,0);
  ctx.RcControlConfig.set('pad-3',{mode:'C',padToggleValue:.6});
  send(2,'pointerdown');assert.equal(app.emitted.at(-1).value,.6);send(2,'pointerup');
  send(2,'pointerdown');send(2,'pointerup');assert.equal(app.emitted.at(-1).value,0);
  send(2,'pointerdown');assert.equal(app.emitted.at(-1).value,.6);
});

test('two custom D pads use independent duration, attack and peak; disconnect respects effective mode',()=>{
  const app=loadControls('toggle-5',{withPads:true});const ctx=app.context;
  ctx.setPadMode('B');
  ctx.RcControlConfig.set('pad-1',{mode:'D',syncMode:'sync',burstSubdivision:1,burstAttackRatio:.2,burstPeak:.4});
  ctx.RcControlConfig.set('pad-2',{mode:'D',syncMode:'free',burstDurationMs:1000,burstAttackRatio:.5,burstPeak:.8});
  for(const pad of app.pads.slice(0,2))pad.listeners.pointerdown(pointer(1,100));
  app.tick(100);
  assert.equal(app.emitted.findLast(v=>v.name==='pad-1').value,.4);
  assert.equal(app.emitted.findLast(v=>v.name==='pad-2').value,.16);
  ctx.resetTransientControls();app.tick(150);
  for(const name of ['pad-1','pad-2']) assert.equal(app.emitted.findLast(v=>v.name===name).value,0);
  ctx.RcControlConfig.set('pad-3',{mode:'B'});ctx.controlSetters['pad-3'](.7);
  ctx.setPadMode('A');ctx.controlSetters['pad-3'](.7);ctx.resetTransientControls();
  assert.equal(app.emitted.findLast(v=>v.name==='pad-3').value,.7);
});

test('pad configuration round-trips Global/sparse overrides and snapshots',()=>{
  const app=loadControls('toggle-5',{withPads:true});const ctx=app.context;
  const config={mode:'D',syncMode:'free',burstDurationMs:750,burstAttackRatio:.3,burstPeak:.6};
  ctx.RcControlConfig.set('pad-1',config);
  const saved=JSON.parse(JSON.stringify(ctx.PerformanceSettings.capture()));
  assert.deepEqual(saved.pads['pad-1'],config);assert.deepEqual(saved.pads['pad-2'],{});
  ctx.RcControlConfig.clear('pad-1');ctx.PerformanceSettings.applyHost(saved);
  for(const [key,value] of Object.entries(config))assert.equal(ctx.RcControlConfig.get('pad-1',key,null),value);
  const snapshots=ctx.RCSurface.snapshots;snapshots.setSnapshotCaptureMode(true);snapshots.handleSnapshotSlot(0);
  assert.equal(snapshots.getSnapshots()[0].__performance.pads['pad-1'].burstPeak,.6);
});

test('pad CFG exposes only effective mode settings and opening never emits controls',()=>{
  const app=loadControls('toggle-5',{withPads:true});const ctx=app.context;
  for(const mode of ['A','B','C','D']) {
    ctx.RcControlConfig.set('pad-1',{mode});const before=app.emitted.length;
    const rows=configRows(ctx,'pad-1');assert.equal(app.emitted.length,before);
    const labels=rows.map(row=>row.slider?.label || row.segment?.label || row.details?.label);
    assert.equal(labels.includes('Attack'),mode==='D');assert.equal(labels.includes('Drag travel'),mode!=='D');
    assert.equal(labels.includes('Touch level'),mode==='A');assert.equal(labels.includes('Tap without drag'),mode==='B');
    assert.equal(labels.includes('On level'),mode==='C');
  }
});
test('independent subdivision/swing/phase/sync/ratchet reach both host and preview', () => {
  const app=loadControls(); const ctx=app.context;
  ctx.RcControlConfig.set('toggle-1',{shape:'square',syncMode:'sync',subdivision:1,swing:.3,phaseOffset:-.5,count:1});
  ctx.RcControlConfig.set('toggle-5',{shape:'square',syncMode:'free',subdivision:3,phaseOffset:1.25,rate:.5});
  ctx.controlSetters['toggle-1'](1); ctx.controlSetters['toggle-5'](1);
  const stut=app.modulatorStates.findLast(v=>v.name==='toggle-1'); const lfo=app.modulatorStates.findLast(v=>v.name==='toggle-5');
  assert.equal(stut.swing,.3); assert.equal(stut.count,1); assert.equal(stut.phaseOffsetBeats,-.5); assert.equal(stut.syncSubdivisionBeats,1);
  assert.equal(lfo.shape,'square'); assert.equal(lfo.syncMode,'free'); assert.equal(lfo.phaseOffsetBeats,1.25);
  app.tick(20); assert.equal(ctx.modulatorStates.get('toggle-5').phaseFrequency,8);
  ctx.RcControlConfig.set('toggle-1',{subdivision:0});
  assert.equal(app.modulatorStates.at(-1).syncSubdivisionBeats,null);
});
test('old browser modulation keys are ignored; fresh state has eight sine LFOs', () => {
  const saved={'ableton-rc:control_config':JSON.stringify({'button-1':{shape:'square'}}),
    'ableton-rc:sync_settings':JSON.stringify({lfoShape:'square'})};
  const ctx=loadControls('toggle-5',{saved}).context;
  assert.equal(ctx.modulatorStates.size,8);
  for (const state of ctx.modulatorStates.values()) assert.equal(state.kind,'lfo');
  assert.equal(ctx.getModulatorShape('toggle-5'),'sine');
});
test('new snapshots restore categorical configuration before morphing slot values', () => {
  const app=loadControls();const ctx=app.context; const sn=ctx.RCSurface.snapshots;
  ctx.RcControlConfig.set('toggle-5',{shape:'triangle',syncMode:'free',mode:'C'});
  ctx.controlSetters['toggle-5.depth'](.61);ctx.controlSetters['toggle-5'](1);
  sn.setSnapshotCaptureMode(true);sn.handleSnapshotSlot(0);
  assert.equal(sn.getSnapshots()[0].__performance.slots['toggle-5'].shape,'triangle');
  ctx.RcControlConfig.set('toggle-5',{shape:'square'});assert.equal(ctx.modulatorStates.get('toggle-5').kind,'pulse');
  sn.handleSnapshotSlot(0);app.tick(1000);
  assert.equal(ctx.modulatorStates.get('toggle-5').kind,'lfo');assert.equal(ctx.modulatorStates.get('toggle-5').depth,.61);
  const msg=app.modulatorStates.findLast(v=>v.name==='toggle-5' && v.morphMs);
  assert.equal(msg.kind,'lfo');assert.equal(msg.depth,.61);assert.equal(msg.active,true);
});
test('clearing a phase override updates a running motor immediately',()=>{
  const app=loadControls();const ctx=app.context;
  ctx.RcControlConfig.set('toggle-1',{phaseOffset:2,shape:'triangle'});ctx.controlSetters['toggle-1'](1);
  ctx.RcControlConfig.set('toggle-1',{phaseOffset:null});
  assert.equal(app.modulatorStates.at(-1).phaseOffsetBeats,0);
});

for(const shape of ['sine','square']) test(`mode D ${shape} expires without stale mode color or active gate`,()=>{
 const app=loadControls();const ctx=app.context;
 ctx.RcControlConfig.set('toggle-1',{shape,mode:'D',syncMode:'free'});
 ctx.controlSetters['toggle-1'](1);app.tick(521);
 assert.equal(ctx.modulatorStates.get('toggle-1').active,false);
 assert.equal(app.lfo.classList.contains('mode-d'),false);
 assert.equal(app.modulatorStates.at(-1).active,false);
});

for(const first of ['static','physics']) for(const second of ['static','physics']) {
 test(`two real XY handlers support ${first}/${second} independently`,()=>{
  const app=loadControls('toggle-5',{withXY:true});const ctx=app.context;
  ctx.RcControlConfig.set('xy-1',{behavior:first,friction:.005,speed:.5});
  ctx.RcControlConfig.set('xy-2',{behavior:second,friction:.04,speed:2});
  assert.equal(app.emitted.length,0,'opening/editing CFG must not emit position');
  app.xy.forEach((el,i)=>el.listeners.pointerdown({...pointer(i+1,50),clientX:20}));
  app.setTime(17);
  app.xy.forEach((el,i)=>el.listeners.pointermove({...pointer(i+1,50),clientX:30}));
  app.xy.forEach((el,i)=>el.listeners.pointerup({...pointer(i+1,50),clientX:30}));
  app.emitted.length=0;app.tick(34);
  for(const [index,behavior] of [[1,first],[2,second]]){
   const event=app.emitted.findLast(v=>v.name===`xy-${index}`);
   assert.equal(!!event,behavior==='physics');
  }
  const saved=ctx.PerformanceSettings.capture();
  assert.equal(saved.xy['xy-1'].speed,.5);assert.equal(saved.xy['xy-2'].speed,2);
  ctx.RcControlConfig.set('xy-1',{behavior:'static'});ctx.PerformanceSettings.apply(saved);
  assert.equal(ctx.RcControlConfig.get('xy-1','behavior'),first);
  ctx.controlSetters['xy-1.speed'](3);assert.equal(ctx.RcControlConfig.get('xy-1','speed'),3);
  assert.equal(ctx.RcControlConfig.get('xy-2','speed'),2);
 });
}

for (const shape of ['sine', 'square']) test(`released ${shape} drag persists rate/depth for reload without changing slot kind`, () => {
  const app = loadControls(); const ctx = app.context;
  ctx.RcControlConfig.set('toggle-1', {shape, mode:'B', rate:.2, depth:.3});
  app.lfo.listeners.pointerdown({...pointer(1, 50), clientX:30});
  app.lfo.listeners.pointermove({...pointer(1, 20), clientX:60});
  app.lfo.listeners.pointerup(pointer(1,20));
  const expected = ctx.PerformanceSettings.capture().slots['toggle-1'];
  const restored = loadControls('toggle-5', {saved:Object.fromEntries(app.storage)}).context;
  assert.equal(restored.modulatorStates.get('toggle-1').rate, expected.rate);
  assert.equal(restored.modulatorStates.get('toggle-1').depth, expected.depth);
  assert.equal(restored.modulatorStates.get('toggle-1').kind, shape === 'square' ? 'pulse' : 'lfo');
  assert.equal(restored.modulatorStates.get('toggle-1').active, false);
});
test('clearing slot overrides resets rate/depth/count together with categorical settings', () => {
  const ctx=loadControls().context;
  ctx.RcControlConfig.set('toggle-8', {shape:'square',rate:.9,depth:.8,count:1});
  ctx.RcControlConfig.clear('toggle-8');
  const state=ctx.modulatorStates.get('toggle-8');
  assert.equal(state.kind,'lfo');
  assert.equal(state.rate,.5); assert.equal(state.depth,.5); assert.equal(state.count,0);
});

for (const shape of ['sine','square']) for (const mode of ['B','C','D']) test(`Global ${mode} ${shape} survives the real performance save/host echo`, () => {
  const app=loadControls(); const ctx=app.context;
  ctx.RcControlConfig.set('toggle-1',{shape});
  ctx.PerformanceSettings.applyHost(JSON.parse(JSON.stringify(ctx.PerformanceSettings.capture())));
  for (const name of names) assert.equal(ctx.RcControlConfig.get(name,'mode',null),null);
  app.modeButtons.find(b=>b.dataset.padModeSet===mode).listeners.click();
  app.lfo.listeners.pointerdown(pointer(1,50));
  if (mode==='B') app.lfo.listeners.pointermove({...pointer(1,20),clientX:60});
  app.lfo.listeners.pointerup(pointer(1,20));
  const state=ctx.modulatorStates.get('toggle-1');
  assert.equal(state.active,true);
  assert.equal(app.lfo.classList.contains('mode-'+mode.toLowerCase()),true);
  if (mode==='C') {app.lfo.listeners.pointerdown(pointer(2,50));app.lfo.listeners.pointerup(pointer(2,50));assert.equal(state.active,false);}
  if (mode==='D') {assert.ok(state.burstUntil>0);app.tick(600);assert.equal(state.active,false);}
});
test('CFG rhythm choices respect the current waveform bandwidth and BPM', () => {
  const ctx=loadControls().context;ctx.currentBpm=120;
  for(const shape of ['sine','triangle','ramp_up','ramp_down','square']) {
    ctx.RcControlConfig.set('toggle-1',{shape});
    for(const option of ctx.getModulatorRhythms('toggle-1')) assert.ok(2/option.value <= ctx.getLfoMaxHz(shape),`${shape} offered ${option.label}`);
  }
});

function configRows(context,name) {
  let build;
  context.RcConfigMode={create:()=>({register:(pattern,builder)=>{if(pattern.test(name))build=builder;},attach(){}})};
  const source=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
  const start=source.indexOf('  function setupConfigMode()');const end=source.indexOf('  function setupAudioUI()',start);
  vm.runInNewContext(source.slice(start,end)+';setupConfigMode();',context);
  return build(name);
}
test('real CFG offers five waveforms, touch-owned rate/depth absent, advanced settings collapsed',()=>{
  const ctx=loadControls().context;
  const rows=configRows(ctx,'toggle-1');
  assert.equal(rows[0].segment.options.length,6);
  assert.deepEqual(Array.from(rows[0].segment.options,v=>v.value),['Global','sine','triangle','ramp_up','ramp_down','square']);
  assert.equal(rows[0].segment.get(),'Global');assert.equal(rows[1].segment.get(),'Global');
  assert.equal(rows.some(row=>row.select),false);
  assert.equal(rows.some(row=>row.slider),false);
  assert.equal(rows.at(-2).details.items.length,1);
  ctx.RcControlConfig.set('toggle-1',{shape:'square',count:1,swing:.5});
  const pulseRows=configRows(ctx,'toggle-1');
  assert.equal(pulseRows.at(-2).details.items.length,3);
  assert.equal(pulseRows.at(-2).details.items.at(-1).segment.options.length,4);
  ctx.RcControlConfig.set('toggle-1',{syncMode:'free'});
  assert.equal(configRows(ctx,'toggle-1').some(row=>row.details?.label.startsWith('Subdivision')),false);
});

test('rhythm editor preserves every valid choice through base and feel, following effective Global wave',()=>{
  const ctx=loadControls().context;
  const editor=()=>configRows(ctx,'toggle-1').find(row=>row.details?.label.startsWith('Subdivision')).details;
  for(const shape of ['sine','triangle','ramp_up','ramp_down','square']) {
    ctx.syncSettings.lfoShape=shape;
    ctx.RcControlConfig.clear('toggle-1');
    const offered=Array.from(ctx.getModulatorRhythms('toggle-1'),option=>option.value);
    const visited=[];
    const bases=editor().items[1].grid;
    for(const base of bases.options) {
      bases.set(base.value);
      const feel=editor().items[2].segment;
      for(const option of feel.options.filter(option=>!option.disabled)) {
        feel.set(option.value);
        const value=ctx.RcControlConfig.get('toggle-1','subdivision',null);
        assert.ok(offered.some(allowed=>Math.abs(allowed-value)<1e-8),`${shape} invalid ${value}`);
        visited.push(value);
      }
    }
    for(const value of offered) assert.ok(visited.some(seen=>Math.abs(value-seen)<1e-8),`${shape} missing ${value}`);
    const inheritance=editor().items[0].segment;
    inheritance.set(0);assert.equal(ctx.RcControlConfig.get('toggle-1','subdivision',null),0);
    inheritance.set('Global');assert.equal(ctx.RcControlConfig.get('toggle-1','subdivision',null),null);
    assert.ok(editor().label.includes('Global'));
  }
  ctx.syncMode='free';
  assert.equal(configRows(ctx,'toggle-1').some(row=>row.details?.label.startsWith('Subdivision')),false);
});

test('Static XY hides physics controls without discarding independent physics settings',()=>{
  const ctx=loadControls().context;
  for(const name of ['xy-1','xy-2']) {
    ctx.RcControlConfig.set(name,{behavior:'static',friction:.04,speed:2});
    let rows=configRows(ctx,name);
    assert.equal(rows.some(row=>row.slider),false);
    rows[0].segment.set('physics');rows=configRows(ctx,name);
    assert.equal(rows.filter(row=>row.slider).length,3);
    assert.equal(rows[1].slider.get(),.04);assert.equal(rows[3].slider.get(),2);
    rows[0].segment.set('static');
    assert.equal(configRows(ctx,name).some(row=>row.slider),false);
    assert.equal(ctx.RcControlConfig.get(name,'friction',null),.04);
  }
});

test('toggle value fill spans full width with mode colour and live height',()=>{
  const css=fs.readFileSync(new URL('./style.css',import.meta.url),'utf8');
  const rule=css.match(/\.toggle \.mod-val-bar\s*\{([^}]+)\}/)[1];
  assert.match(rule,/left:\s*0/);assert.match(rule,/right:\s*0/);assert.doesNotMatch(rule,/width:\s*4px/);
  assert.match(rule,/var\(--modulator-mode-color\)/);
});

test('both physics XY draw their own trail and clear it for Static and after expiry',()=>{
  const app=loadControls('toggle-5',{withXY:true});
  for(let i=0;i<2;i++) {
    app.context.RcControlConfig.set(`xy-${i+1}`,{behavior:'physics'});
    app.xy[i].listeners.pointerdown({...pointer(i+1,50),clientX:20});
    app.setTime(20);app.xy[i].listeners.pointermove({...pointer(i+1,50),clientX:25});
    app.xy[i].listeners.pointerup(pointer(i+1,50));
  }
  app.tick(40);
  assert.ok(app.xy[0].trail.points.length>0);assert.ok(app.xy[1].trail.points.length>0);
  app.context.RcControlConfig.set('xy-1',{behavior:'static'});assert.equal(app.xy[0].trail.points,'');
  app.context.controlSetters['xy-2.x'](.5);app.tick(400);assert.equal(app.xy[1].trail.points,'');
});

test('first candidate forced mode overrides and retired waveform are not restored',()=>{
 const saved={'ableton-rc:v2:control_config':JSON.stringify({'toggle-1':{mode:'A',shape:'stutter'}})};
 const ctx=loadControls('toggle-5',{saved}).context;
 ctx.PerformanceSettings.applyHost({version:1,slots:{'toggle-1':{mode:'A',shape:'stutter'}}});
 assert.equal(ctx.RcControlConfig.get('toggle-1','mode',null),null);
 assert.equal(ctx.getModulatorShape('toggle-1'),'sine');
});


test('pad travel and touch level are four direct choices without sliders or helper copy',()=>{
  const ctx=loadControls('toggle-5',{withPads:true}).context;
  ctx.RcControlConfig.set('pad-1',{mode:'A'});
  const rows=configRows(ctx,'pad-1');
  const travel=rows.find(row=>row.segment?.label==='Drag travel').segment;
  const touch=rows.find(row=>row.segment?.label==='Touch level').segment;
  assert.deepEqual(Array.from(travel.options,option=>option.value),[60,100,150,300]);
  assert.deepEqual(Array.from(touch.options,option=>option.value),[0,.25,.5,1]);
  travel.set(60);touch.set(.5);
  assert.equal(ctx.RcControlConfig.get('pad-1','padRange'),60);
  assert.equal(ctx.RcControlConfig.get('pad-1','padTouchValue'),.5);
  assert.equal(rows.some(row=>row.info || row.slider),false);
});

test('toggle D burst duration is separate from wave subdivision and survives restore',()=>{
  const app=loadControls();const ctx=app.context;
  ctx.RcControlConfig.set('toggle-1',{mode:'D',syncMode:'sync',subdivision:.5});
  const burst=()=>configRows(ctx,'toggle-1').find(row=>row.details?.label.startsWith('Burst length'))?.details;
  burst().items[0].segment.set(32);
  burst().items[1].slider.set(.5);
  assert.equal(ctx.RcControlConfig.get('toggle-1','subdivision'),.5);
  ctx.controlSetters['toggle-1'](1);
  assert.equal(ctx.modulatorStates.get('toggle-1').burstUntil,16000);
  const saved=JSON.parse(JSON.stringify(ctx.PerformanceSettings.capture()));
  assert.equal(saved.slots['toggle-1'].burstSubdivision,32);
  assert.equal(saved.slots['toggle-1'].burstAttackRatio,.5);
  ctx.RcControlConfig.clear('toggle-1');ctx.PerformanceSettings.applyHost(saved);
  assert.equal(ctx.RcControlConfig.get('toggle-1','burstSubdivision'),32);
  ctx.RcControlConfig.set('toggle-1',{syncMode:'free'});
  burst().items[0].slider.set(2000);
  assert.equal(ctx.RcControlConfig.get('toggle-1','burstDurationMs'),2000);
  ctx.RcControlConfig.set('toggle-1',{mode:'A'});
  assert.equal(burst(),undefined);
  ctx.RcControlConfig.set('toggle-1',{mode:null});ctx.setPadMode('D');
  assert.ok(burst(),'Global D also exposes its burst settings');
});


test('AUT uses the real XY output, pointer override, restore and global frame loop',()=>{
  const app=loadControls('toggle-5',{withXY:true,withAutomation:true});const ctx=app.context;
  const automation=ctx.XYAutomation;
  automation.configure('xy-1',{timing:'free',points:[0,0,65535,65535]});automation.play('xy-1');
  app.tick(2500);assert.equal(ctx.currentControlStates['xy-1.x'],.5);
  const xy=app.xy[0];xy.listeners.pointerdown({...pointer(1,20),clientX:90});
  assert.equal(ctx.currentControlStates['xy-1.x'],.9);
  app.tick(3000);assert.equal(ctx.currentControlStates['xy-1.x'],.9);
  ctx.controlSetters['xy-1.x'](.1);assert.equal(ctx.currentControlStates['xy-1.x'],.9,'remote echo cannot steal manual ownership');
  xy.listeners.pointerup(pointer(1,20));assert.ok(Math.abs(ctx.currentControlStates['xy-1.x']-.6)<1e-12);
  const saved=JSON.parse(JSON.stringify(ctx.PerformanceSettings.capture()));
  assert.deepEqual(saved.automation.xy['xy-1'].points,[0,0,65535,65535]);
  ctx.resetTransientControls();assert.equal(automation.get('xy-1').stage,'stopped');
  ctx.PerformanceSettings.applyHost(saved);assert.equal(automation.get('xy-1').stage,'stopped');
  assert.equal(app.emitted.filter(event=>event.name==='xy-1' && event.lost).length,0,'disconnect does not send stale loss into another session');
});

test('PerformanceSettings snapshot restores expanded AUT duration settings without starting a loop',()=>{
  const app=loadControls('toggle-5',{withXY:true,withAutomation:true}),ctx=app.context;
  ctx.XYAutomation.configure('xy-1',{timing:'free',seconds:30,bars:5,points:[0,0,65535,65535]});
  ctx.XYAutomation.configure('xy-2',{timing:'sync',seconds:1,bars:3,points:[65535,0,0,65535]});
  const saved=JSON.parse(JSON.stringify(ctx.PerformanceSettings.capture()));
  ctx.XYAutomation.configure('xy-1',{seconds:10,bars:2});
  ctx.PerformanceSettings.applyHost(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.PerformanceSettings.capture())),saved);
  for(const name of ['xy-1','xy-2'])assert.equal(ctx.XYAutomation.get(name).stage,'stopped');
  assert.equal(app.emitted.filter(event=>/^xy-[12]$/.test(event.name)).length,0);
});
