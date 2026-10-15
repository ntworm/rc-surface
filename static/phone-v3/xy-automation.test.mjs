// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function load() {
  const root={};vm.createContext(root);
  for(const name of ['xy-engine','xy-automation','xy-automation-controller']) vm.runInContext(fs.readFileSync(new URL(`./${name}.js`,import.meta.url),'utf8'),root);
  return root;
}
const clock=(time,overrides={})=>({valid:true,playing:true,beat:time/500,bpm:120,beatsPerBar:4,epoch:1,receivedAt:time,...overrides});
const point={x:.25,y:.75};
const plain=value=>JSON.parse(JSON.stringify(value));
test('FREE countdown has three pulses, captures then loops without another command',()=>{
  const e=load().RcXYAutomation,s=e.create({timing:'free',bars:2,seconds:10});
  e.arm(s,null,0);
  assert.equal(e.tick(s,null,0,point).countdown,3);
  for(let time=50;time<=13000;time+=50) {
    const result=e.tick(s,null,time,{x:time/13000,y:1-time/13000});
    if(time===1000)assert.equal(result.countdown,2);
    if(time===2000)assert.equal(result.countdown,1);
    if(time===3000)assert.equal(s.stage,'recording');
    if(time===13000)assert.equal(result.committed,true);
  }
  assert.equal(s.stage,'playing');assert.equal(s.saved.points.length,600);
  assert.ok(s.saved.points.every(Number.isInteger));
  assert.ok(e.tick(s,null,13500,point).point);
});
test('SYNC uses actual clock, meter and bar duration, preserving phase across tempo and seek changes',()=>{
  const e=load().RcXYAutomation,s=e.create({timing:'sync',bars:1,seconds:10});
  e.arm(s,clock(0,{beatsPerBar:3.5}),0);
  for(let time=0;time<=3250;time+=50)e.tick(s,clock(time,{beatsPerBar:3.5}),time,point);
  assert.equal(s.stage,'playing');assert.equal(s.duration,3.5);
  const origin=s.origin;
  const result=e.tick(s,clock(3300,{beatsPerBar:3.5,beat:20,epoch:2,bpm:80}),3300,point);
  assert.ok(result.point);assert.equal(s.origin,origin);
  assert.deepEqual(plain(result.point),plain(e.sample(s,20/3.5)));
});
test('manual override preserves phase; release returns to the current loop point',()=>{
  const e=load().RcXYAutomation,s=e.create({timing:'free',bars:2,seconds:10,points:[0,0,65535,65535]});
  e.play(s,null,0);s.manual=true;
  assert.equal(e.tick(s,null,2500,point).point,null);
  s.manual=false;
  assert.deepEqual(plain(e.tick(s,null,2500,point).point),{x:.5,y:.5});
  assert.equal(s.origin,0);assert.equal(s.saved.points.length,4);
});
test('stale/stopped clock, capture seek, meter change and sampling gap abort without replacing the old buffer',()=>{
  const e=load().RcXYAutomation;
  for(const kind of ['stale','stop','seek','meter','gap']) {
    const s=e.create({timing:'sync',bars:2,seconds:10,points:[0,0,65535,65535]});
    const before=plain(s.saved);e.arm(s,clock(0),0);
    const time=kind==='gap'?500:100;
    const c=clock(time,kind==='stale'?{receivedAt:-2000}:kind==='stop'?{playing:false}:kind==='seek'?{epoch:2}:kind==='meter'?{beatsPerBar:3}:{});
    assert.equal(e.tick(s,c,time,point).stopped,true,kind);
    assert.deepEqual(plain(s.saved),before);assert.equal(s.stage,'stopped');
  }
  const free=e.create({timing:'free',bars:2,seconds:10});e.arm(free,null,0);
  assert.doesNotThrow(()=>e.tick(free,{valid:false,playing:false},100,point));
});
test('buffer bounds and saved-state validation exclude runtime playback and invalid positions',()=>{
  const e=load().RcXYAutomation;
  const s=e.create({timing:'sync',bars:4,seconds:20});e.arm(s,clock(0,{bpm:1,beatsPerBar:32}),0);
  assert.equal(s.pending.pairs,1024);
  for(const points of [[],[1,2,3],[0,NaN,0,0],[-1,0,0,0],Array(2050).fill(0)]) {
    assert.throws(()=>e.create({timing:'free',bars:2,seconds:10,points}));
  }
  const restored=e.create({timing:'free',bars:2,seconds:10,points:[0,0,65535,65535]});
  assert.equal(restored.stage,'stopped');
});
test('controller keeps two independent loops, rejects viewer and discards stale socket ownership',()=>{
  const root=load();let time=0,allowed=true,socket={readyState:1},changes=0;
  const storage=new Map(),emitted=[],lost=[];
  const c=root.RcXYAutomationController.create({now:()=>time,connection:()=>socket,permitted:()=>allowed,clock:()=>clock(time),
    storage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},changed:()=>changes++,loss:name=>lost.push(name)});
  const states={};
  for(const name of ['xy-1','xy-2']) {
    states[name]=root.RcXYEngine.create();c.register(name,states[name],null,()=>emitted.push(name));
    c.configure(name,{timing:'free',points:[0,0,65535,65535]});c.play(name);
  }
  time=2500;c.tick();assert.deepEqual(emitted,['xy-1','xy-2']);
  c.manual('xy-1',true);states['xy-1'].x=.9;time=3000;c.tick();assert.equal(states['xy-1'].x,.9);
  c.manual('xy-1',false);assert.ok(Math.abs(states['xy-1'].x-.6)<1e-12);
  const saved=plain(c.capture()),before=changes;
  c.apply(saved);assert.equal(c.get('xy-1').stage,'playing','own save echo cannot stop the loop');
  socket={readyState:1};c.tick();assert.equal(c.get('xy-1').stage,'stopped');assert.equal(lost.length,0);
  allowed=false;assert.throws(()=>c.arm('xy-1'));assert.throws(()=>c.clear('xy-1'));
  assert.equal(changes,before);assert.deepEqual(plain(c.capture()),saved);
  allowed=true;c.play('xy-1');c.stop('xy-1');c.stop('xy-1');assert.deepEqual(lost,['xy-1']);
  const newController=root.RcXYAutomationController.create({now:()=>time,connection:()=>socket,permitted:()=>true,
    storage:{getItem:key=>storage.get(key)},changed(){},loss(){}});
  newController.register('xy-1',root.RcXYEngine.create(),null,()=>{});
  assert.equal(newController.get('xy-1').stage,'stopped');assert.ok(newController.get('xy-1').saved.points);
});


test('SYNC Play at beat five starts at the Arrangement phase, STOP pauses and Play resumes without reset',()=>{
  const e=load().RcXYAutomation,s=e.create({timing:'sync',bars:1,seconds:10,points:[0,0,65535,65535]});
  e.play(s,clock(0,{beat:5}),0);
  assert.equal(e.tick(s,clock(0,{beat:5}),0,point).point.x,.5);
  assert.equal(e.tick(s,clock(100,{playing:false,valid:false,reason:'stopped'}),100,point).suspended,true);
  assert.equal(s.stage,'paused');
  assert.equal(e.tick(s,clock(200,{playing:false,valid:false,reason:'stopped'}),200,point).suspended,false);
  const resumed=e.tick(s,clock(300,{beat:8,epoch:3}),300,point);
  assert.equal(resumed.resumed,true);assert.equal(resumed.point.x,0);
  assert.equal(e.tick(s,clock(400,{beat:9,epoch:4}),400,point).point.x,.5);
});

test('constant loops emit fresh after Play, manual release and transport resume',()=>{
  const root=load();let time=0,playing=true;const emitted=[],lost=[],socket={};
  const c=root.RcXYAutomationController.create({now:()=>time,connection:()=>socket,permitted:()=>true,
    clock:()=>clock(time,{playing,valid:playing,...playing?{}:{reason:'stopped'}}),changed(){},loss:name=>lost.push(name)});
  c.register('xy-1',root.RcXYEngine.create(),null,()=>emitted.push(time));
  c.configure('xy-1',{points:[32768,32768,32768,32768]});c.play('xy-1');c.tick();
  c.manual('xy-1',true);c.manual('xy-1',false);assert.equal(emitted.length,2);
  playing=false;time=100;c.tick();assert.deepEqual(lost,['xy-1']);
  playing=true;time=200;c.tick();assert.equal(emitted.length,3);
});


test('SYNC completed capture is aligned to the song grid without a jump at the first loop boundary',()=>{
  const e=load().RcXYAutomation,s=e.create({timing:'sync',bars:1,seconds:10});e.arm(s,clock(0),0);
  let result;
  for(let time=0;time<=3500;time+=50)result=e.tick(s,clock(time),time,{x:Math.max(0,(time-1500)/2000),y:.5});
  assert.equal(result.committed,true);assert.ok(result.point.x<.0001);
  e.stop(s);e.play(s,clock(3600,{beat:4}),3600);
  assert.ok(Math.abs(e.tick(s,clock(3600,{beat:4}),3600,point).point.x-.25)<.02);
});


test('only observed transport STOP/count-in suspend SYNC; disconnected clock stops without later autoplay',()=>{
  const e=load().RcXYAutomation,s=e.create({timing:'sync',bars:1,seconds:10,points:[0,0,65535,65535]});
  e.play(s,clock(0),0);
  assert.equal(e.tick(s,clock(50,{valid:false,reason:'count_in'}),50,point).suspended,true);
  assert.equal(e.tick(s,clock(100,{valid:false,playing:false,reason:'disconnected'}),100,point).stopped,true);
  assert.equal(s.stage,'stopped');assert.equal(e.tick(s,clock(200),200,point).point,undefined);
});


test('manual hold survives Live STOP and Play; only releasing the pointer restores the loop',()=>{
  const e=load().RcXYAutomation,s=e.create({timing:'sync',bars:1,seconds:10,points:[0,0,65535,65535]});
  e.play(s,clock(0),0);s.manual=true;
  e.tick(s,clock(50,{playing:false,valid:false,reason:'stopped'}),50,point);
  assert.equal(s.manual,true);assert.equal(e.tick(s,clock(100,{beat:8,epoch:3}),100,point).point,null);
  s.manual=false;assert.equal(e.tick(s,clock(150,{beat:8}),150,point).point.x,0);
});

test('SYNC projects a fresh host observation using its actual BPM between messages',()=>{
  const e=load().RcXYAutomation,s=e.create({timing:'sync',bars:1,seconds:10,points:[0,0,65535,65535]});
  const observation=clock(0,{beat:5,bpm:60});e.play(s,observation,0);
  assert.equal(e.tick(s,observation,500,point).point.x,.75);
});


test('confirmed stationary STOP survives quiet host polling, then fresh Play resumes the song phase',()=>{
  const e=load().RcXYAutomation,s=e.create({timing:'sync',bars:1,seconds:10,points:[0,0,65535,65535]});
  e.play(s,clock(0),0);
  const stopped=clock(100,{playing:false,valid:false,reason:'stopped',epoch:2});
  assert.equal(e.tick(s,stopped,100,point).suspended,true);
  for(const time of [1200,1600,5000,30000]) {
    assert.equal(e.tick(s,stopped,time,point).point,undefined);assert.equal(s.stage,'paused');
  }
  const resumed=e.tick(s,clock(30100,{beat:9,epoch:3}),30100,point);
  assert.equal(resumed.resumed,true);assert.equal(resumed.point.x,.5);
});
