// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function fixture() {
  const listeners={},timers=new Map(),arms=[],opened=[];
  let timerId=0,opts;
  const mode={state:{on:false},register(){},attach(){},
    on(){this.state.on=true;opts.onActivate();},
    off(){this.state.on=false;opts.onDeactivate();},
    open(name){opened.push(name);},
  };
  const root={XYAutomation:{arm:name=>arms.push(name)},RcConfigMode:{create(options){opts=options;return mode;}},
    addEventListener(){},RcConfigModeInstance:{off(){}},
    document:{readyState:'complete',addEventListener(type,fn){(listeners[type] ||= []).push(fn);},getElementById:()=>null}};
  const context={window:root,document:root.document,setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(fs.readFileSync(new URL('./automation-mode.js',import.meta.url),'utf8'),context);
  const xy={dataset:{name:'xy-2'},getBoundingClientRect:()=>({}),setPointerCapture(){}};
  const dispatch=(type,patch={})=>{
    const event={button:0,pointerId:1,clientX:10,clientY:10,target:{closest:()=>xy},preventDefault(){},stopImmediatePropagation(){},...patch};
    for(const fn of listeners[type] || [])fn(event);
  };
  return {mode,timers,arms,opened,dispatch};
}
test('AUT tap selects one XY, turns selection off and leaves subsequent gestures manual',()=>{
  const f=fixture();f.mode.on();f.dispatch('pointerdown');f.dispatch('pointerup');
  assert.deepEqual(f.arms,['xy-2']);assert.equal(f.mode.state.on,false);assert.equal(f.timers.size,0);
  f.dispatch('pointerdown');f.dispatch('pointerup');assert.equal(f.arms.length,1);
});
test('AUT long press opens loop configuration without recording; moving or cancelling never arms',()=>{
  const f=fixture();f.mode.on();f.dispatch('pointerdown');
  [...f.timers.values()][0]();f.dispatch('pointerup');
  assert.deepEqual(f.opened,['xy-2']);assert.equal(f.mode.state.contextMenuOpen,true);assert.equal(f.arms.length,0);
  f.mode.off();f.mode.on();f.dispatch('pointerdown');f.dispatch('pointermove',{clientX:30});f.dispatch('pointerup');
  assert.equal(f.arms.length,0);assert.equal(f.timers.size,0);
  f.dispatch('pointerdown');f.dispatch('pointercancel');assert.equal(f.arms.length,0);
});
test('turning AUT off while a pointer is down cancels both the pending arm and the long-press timer',()=>{
  const f=fixture();f.mode.on();f.dispatch('pointerdown');assert.equal(f.timers.size,1);
  f.mode.off();assert.equal(f.timers.size,0);f.dispatch('pointerup');
  assert.equal(f.arms.length,0);assert.equal(f.opened.length,0);
});


test('a second finger cannot replace the pending target or leave an orphan long-press timer',()=>{
  const f=fixture();f.mode.on();f.dispatch('pointerdown');
  f.dispatch('pointerdown',{pointerId:2});assert.equal(f.timers.size,1);
  [...f.timers.values()][0]();assert.deepEqual(f.opened,['xy-2']);
  f.dispatch('pointerup',{pointerId:2});assert.equal(f.arms.length,0);
  f.dispatch('pointerup');assert.equal(f.arms.length,0);
  f.mode.off();assert.equal(f.timers.size,0);
});
