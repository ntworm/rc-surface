// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const context = {};
vm.runInNewContext(fs.readFileSync(new URL('./xy-engine.js',import.meta.url),'utf8'),context);
const engine = context.RcXYEngine;
const physics = {...engine.defaults, behavior:'physics'};
test('a corner keeps its velocity on both axes instead of sticking there',()=>{
  const state = {...engine.create(),x:.9999,y:.9999,vx:.075,vy:.075,time:0};
  engine.tick(state,physics,17);assert.ok(state.vx < 0 && state.vy < 0);
  engine.tick(state,physics,34);assert.ok(state.x < 1 && state.y < 1);
});
for(const first of ['static','physics']) for(const second of ['static','physics']) {
  test(`independent XY behavior: ${first} / ${second}`,()=>{
    const a={...engine.create(),vx:1,time:0}, b={...engine.create(),vx:1,time:0};
    engine.tick(a,{...physics,behavior:first},17);engine.tick(b,{...physics,behavior:second},17);
    assert.equal(a.x > .5,first==='physics');assert.equal(b.x > .5,second==='physics');
  });
}
test('friction and speed independently change displacement and decay',()=>{
  const run=settings=>{
    const state={...engine.create(),x:.1,vx:.2,time:0};
    for(let t=17;t<=170;t+=17) engine.tick(state,{...physics,...settings},t);
    return state;
  };
  const slow=run({speed:.5}),fast=run({speed:2});assert.ok(fast.x > slow.x);
  const loose=run({friction:.002}),tight=run({friction:.05});assert.ok(tight.vx < loose.vx);
});
test('static switch and explicit stop cancel residual velocity; stalled frames remain bounded',()=>{
  const state={...engine.create(),vx:4,vy:-4,time:0};
  engine.tick(state,physics,100000);assert.ok(state.x<=1 && state.y>=0);
  engine.tick(state,{...physics,behavior:'static'},100017);assert.equal(state.vx,0);assert.equal(state.vy,0);
  state.vx=1;engine.stop(state);assert.equal(state.vx,0);
});

test('render frames during a drag do not change the measured release velocity',()=>{
  const sample=frames=>{
    const state=engine.create();state.dragging=true;
    engine.move(state,.2,.5,0);
    for(const t of frames)engine.tick(state,physics,t);
    engine.move(state,.22,.5,20);
    return state.vx;
  };
  assert.equal(sample([]),sample([5,10,15,19]));
  assert.ok(Math.abs(sample([])-1)<1e-9);
});

test('holding the puck then releasing does not replay an old fling',()=>{
  const state=engine.create();state.dragging=true;engine.move(state,.2,.5,0);engine.move(state,.3,.5,20);
  engine.tick(state,physics,150);engine.release(state,151);assert.equal(state.vx,0);
});
test('friction displacement is independent of 30/60/120 FPS away from walls',()=>{
  const run=frames=>{const state={...engine.create(),x:.1,vx:.1,time:0};for(let i=1;i<=frames;i++)engine.tick(state,physics,i*1000/frames);return state;};
  const a=run(30),b=run(60),c=run(120);
  assert.ok(Math.abs(a.x-b.x)<.00001);assert.ok(Math.abs(a.x-c.x)<.00001);
});
