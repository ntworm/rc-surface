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
