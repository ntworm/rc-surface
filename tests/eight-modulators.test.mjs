// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { hostModulators, updateHostModulator, stopHostModulatorLoop,
  clearHostModulatorsForClient } from '../src/live/host-modulators.ts';

const names = ['toggle-1', 'toggle-2', 'toggle-3', 'toggle-4',
  'toggle-5', 'toggle-6', 'toggle-7', 'toggle-8'];

for (let lfos = 0; lfos <= 8; lfos++) {
  test(`host accepts ${lfos} LFOs and ${8 - lfos} Pulses on uniform slot IDs`, () => {
    try {
      names.forEach((name, i) => updateHostModulator('eight', {
        name, kind: i < lfos ? 'lfo' : 'pulse', active: true,
        rate: .37, depth: .72, count: .5, syncMode: 'free', shape: 'triangle',
      }));
      assert.equal(hostModulators.size, 8);
      names.forEach((name, i) => {
        const state = hostModulators.get(`eight::${name}`);
        assert.equal(state.kind, i < lfos ? 'lfo' : 'pulse');
        assert.equal(state.depth, .72);
      });
    } finally {
      hostModulators.clear(); stopHostModulatorLoop();
    }
  });
}

test('changing engine on one ID resets phase/morph instead of retaining the previous kind', () => {
  try {
    updateHostModulator('eight', { name: 'toggle-1', kind: 'lfo', active: true, shape: 'triangle' });
    hostModulators.get('eight::toggle-1').phase = 2.5;
    updateHostModulator('eight', { name: 'toggle-1', kind: 'pulse', active: true, depth: .3 });
    const state = hostModulators.get('eight::toggle-1');
    assert.equal(hostModulators.size, 1);
    assert.equal(state.kind, 'pulse');
    assert.equal(state.phase, 0);
    clearHostModulatorsForClient('eight');
    assert.equal(hostModulators.size, 0);
  } finally { hostModulators.clear(); stopHostModulatorLoop(); }
});

test('live engine replacement preserves host burst origin and deadline',t=>{
  t.mock.timers.enable({apis:['Date'],now:10000});
  try {
    const payload={name:'toggle-1',active:true,syncMode:'free',burstDurationMs:520,burstAttackMs:70};
    updateHostModulator('burst-swap',{...payload,kind:'lfo',shape:'sine'});
    t.mock.timers.tick(200);
    updateHostModulator('burst-swap',{...payload,kind:'pulse',shape:'square'});
    let state=hostModulators.get('burst-swap::toggle-1');
    assert.equal(state.active,true);assert.equal(state.burstStartMs,10000);assert.equal(state.burstDurationMs,520);
    t.mock.timers.tick(100);
    updateHostModulator('burst-swap',{...payload,kind:'lfo',shape:'triangle'});
    state=hostModulators.get('burst-swap::toggle-1');
    assert.equal(state.burstStartMs,10000);assert.equal(state.burstAttackMs,70);
  } finally {hostModulators.clear();stopHostModulatorLoop();}
});

test('Square host keeps the long, dotted and triplet pins offered by its CFG',()=>{
  try {
    for(const subdivision of [32,16,8,3,8/3,1.5,4/3,.75,2/3,.375,1/3,.25]) {
      updateHostModulator('pins',{name:'toggle-1',kind:'pulse',shape:'square',active:true,syncMode:'sync',syncSubdivisionBeats:subdivision});
      assert.equal(hostModulators.get('pins::toggle-1').syncSubdivisionBeats,subdivision);
    }
  } finally {hostModulators.clear();stopHostModulatorLoop();}
});
