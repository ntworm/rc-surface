import test from 'node:test';
import assert from 'node:assert/strict';
import {VisionLossWatchdog, visionLossPolicy, validVisionTracking} from '../src/live/vision-loss.ts';
function rig(mode='timeout') {
  let now=0, policy=visionLossPolicy(), seq=0, id=0;
  policy.mode=mode;
  const timers = new Map(), released=[], feedback=[];
  const watchdog = new VisionLossWatchdog({policy:()=>policy, now:()=>now,
    set:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:now+ms});return key;}, clear:id=>timers.delete(id),
    release:(...args)=>released.push(args), feedback:(...args)=>feedback.push(args)});
  const sample=(qualified=true, lost=false)=>watchdog.observe('a','sensor.vision.gesture.1',1,lost,{seq:++seq,qualified,graceMs:140});
  const advance=(time)=>{now=time; for(let guard=0;guard<10;guard++){const due=[...timers].filter(([,t])=>t.at<=now);if(!due.length)break;for(const [id,t]of due){timers.delete(id);t.fn();}}};
  return {watchdog,sample,advance,released,feedback,policy,timers,time:value=>{now=value;}};
}
test('ten-second watchdog expires without frames at absolute deadline, once',()=>{
  const r=rig();assert.equal(r.sample(),true);r.advance(9999);assert.equal(r.released.length,0);
  r.advance(10000);assert.equal(r.released.length,1);r.advance(20000);assert.equal(r.released.length,1);
  assert.equal(r.watchdog.observe('a','sensor.vision.gesture.1',1,false),false);
});
test('unknown return never renews but fresh accepted same pose renews without release',()=>{
  const r=rig();r.sample();r.advance(9000);assert.equal(r.sample(false),false);r.advance(10000);assert.equal(r.released.length,1);
  const s=rig();s.sample();s.advance(9000);s.sample();s.advance(10000);assert.equal(s.released.length,0);s.advance(19000);assert.equal(s.released.length,1);
});
test('release respects grace; indefinite hold has no deadline; policy change retains original anchor',()=>{
  const r=rig('release');r.sample();r.advance(139);assert.equal(r.released.length,0);r.advance(140);assert.equal(r.released.length,1);
  const h=rig('hold');h.sample();h.advance(30000);assert.equal(h.released.length,0);
  h.policy.mode='timeout';h.watchdog.refresh();h.advance(30000);assert.equal(h.released.length,1);
  h.policy.timeoutMs=30000;h.watchdog.refresh();h.advance(60000);assert.equal(h.released.length,1);
});
test('retired callback, malformed and repeated sequence cannot interfere with a new session',()=>{
  const r=rig();r.sample();const old=[...r.timers.values()][0].fn;r.watchdog.forget('a');r.sample();old();assert.equal(r.released.length,0);
  assert.equal(r.watchdog.observe('a','sensor.vision.gesture.1',1,false,{seq:1,qualified:true,graceMs:140}),false);
  assert.equal(validVisionTracking({seq:NaN,qualified:true,graceMs:140}),false);
  r.advance(10000);assert.equal(r.released.length,1);
});
test('new/legacy policy normalization is idempotent and rejects malformed updates',()=>{
  assert.deepEqual(visionLossPolicy(undefined,true),{version:1,mode:'hold',timeoutMs:10000,legacy:true});
  assert.deepEqual(visionLossPolicy(visionLossPolicy()),visionLossPolicy());
  for(const ms of [0,99,101,30001,Infinity])assert.throws(()=>visionLossPolicy({version:1,mode:'timeout',timeoutMs:ms,legacy:false}));
});
test('new mapping identity gets a fresh watchdog, and unknown legacy metadata cannot activate',()=>{
  const r=rig(); let current=true;
  r.watchdog.observe('a','sensor.vision.gesture.1',1,false,{seq:1,qualified:true,graceMs:140},()=>current);
  current=false;r.time(1000);
  assert.equal(r.watchdog.observe('a','sensor.vision.gesture.1',1,false,{seq:2,qualified:true,graceMs:140}),true);
  r.advance(10999);assert.equal(r.released.length,0);r.advance(11000);assert.equal(r.released.length,1);
  for(const mode of ['hold','timeout','release']) {
    const x=rig(mode);x.policy.legacy=mode==='hold';
    assert.equal(x.sample(false),false);
  }
});
test('expiry requires new activation, not a fresh sample of retained activeName',()=>{
  const r=rig();r.sample();r.advance(10000);
  assert.equal(r.sample(),false);
  assert.equal(r.watchdog.observe('a','sensor.vision.gesture.1',1,false,{seq:3,qualified:true,graceMs:140,activation:true}),true);
});
test('shortening/increasing/switching policy keeps the original qualified deadline',()=>{
  const short=rig();short.sample();short.advance(9000);short.policy.timeoutMs=5000;short.watchdog.refresh();short.advance(9000);
  assert.equal(short.released.length,1);
  const long=rig();long.sample();long.advance(1000);long.policy.timeoutMs=20000;long.watchdog.refresh();long.advance(10000);
  assert.equal(long.released.length,0);long.advance(20000);assert.equal(long.released.length,1);
  const hold=rig();hold.sample();hold.advance(1000);hold.policy.mode='hold';hold.watchdog.refresh();hold.advance(30000);
  assert.equal(hold.released.length,0);hold.policy.mode='release';hold.watchdog.refresh();hold.advance(30000);assert.equal(hold.released.length,1);
});
