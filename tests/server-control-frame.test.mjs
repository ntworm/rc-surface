import test from 'node:test';
import assert from 'node:assert/strict';
import { boundControlFrame, boundFrameTiming } from '../src/server/ws-bounds.ts';

test('control frames admit bounded scalar/XY batches and reject the entire malformed frame', () => {
  const valid = [{ name: 'xy-1', x: 0.2, y: 0.9 }, { name: 'sensor.audio.transient', value: 0.5, lost: false }];
  assert.deepEqual(boundControlFrame(valid), valid);
  assert.ok(boundControlFrame([{ name: 'pad-1', value: 1 }, { name: 'pad-1', value: 0 }]), 'ordered edges may repeat a name');
  for (const invalid of [null, [], [{ name: 'x', value: Infinity }], [{ name: 'x', x: 0.5 }], [{ name: 'x', value: 2 }], [{ name: 'x', value: 1, lost: 'yes' }], Array.from({ length: 129 }, (_, i) => ({ name: `fader-${i}`, value: 1 }))]) {
    assert.equal(boundControlFrame(invalid), null);
  }
});
test('fresh vision metadata is admitted only on learned poses with bounded monotonic fields',()=>{
  const sample={name:'sensor.vision.gesture.1',value:1,tracking:{seq:1,qualified:true,graceMs:140,activation:true}};
  assert.deepEqual(boundControlFrame([sample]),[sample]);
  for(const tracking of [{seq:0,qualified:true,graceMs:140},{seq:2,qualified:'yes',graceMs:140},
    {seq:2,qualified:true,graceMs:2001},{seq:2,qualified:true,graceMs:140,activation:'true'}]) assert.equal(boundControlFrame([{...sample,tracking}]),null);
  assert.equal(boundControlFrame([{...sample,name:'pad-1'}]),null);
  assert.equal(boundControlFrame([{...sample,value:0}]),null);
  assert.equal(boundControlFrame([{...sample,lost:true}]),null);
});
test('frame timing keeps the numbers that hold up and drops the ones that do not',()=>{
  assert.deepEqual(boundFrameTiming({seq:0,age_ms:12,rtt_ms:20}),{seq:0,ageMs:12,rttMs:20});
  assert.deepEqual(boundFrameTiming({seq:7}),{seq:7});
  assert.deepEqual(boundFrameTiming({seq:7,age_ms:0,rtt_ms:10000}),{seq:7,ageMs:0,rttMs:10000});
  for(const seq of ['5',1.5,-1,2**31,undefined,null,NaN]) assert.equal(boundFrameTiming({seq,age_ms:12}),null);
  assert.equal(boundFrameTiming(null),null);
  assert.equal(boundFrameTiming(undefined),null);
  for(const bad of [-1,10001,NaN,Infinity,'12',null]){
    assert.deepEqual(boundFrameTiming({seq:3,age_ms:bad,rtt_ms:bad}),{seq:3});
  }
});
