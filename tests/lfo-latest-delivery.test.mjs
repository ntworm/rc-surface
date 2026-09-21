// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { clearExtensionContext, setExtensionContext } from '../src/context.ts';
import { ContinuousTargetActuator, continuousTargetActuator } from '../src/live/continuous-target-actuator.ts';
import {
  activeSmooths, controlMappings, eventModesState, hostModulators, lastMappedValues,
  stopHostModulatorLoop, tickHostModulators, updateHostModulator,
} from '../src/live/mappings.ts';
import { globalWriteScheduler } from '../src/server/write-scheduler.ts';

async function drainMicrotasks() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}

function slowParameter() {
  const writes = [], pending = [];
  let inFlight = 0, maxInFlight = 0;
  return {
    writes, pending,
    maxInFlight: () => maxInFlight,
    param: {
      name: 'Gain', min: 0, max: 1, isQuantized: false,
      setValue(value) {
        writes.push({ value, at: Date.now() });
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise(resolve => pending.push(() => { inFlight--; resolve(); }));
      },
    },
    async acknowledge() {
      assert.ok(pending.length > 0, 'the SDK must have a write awaiting completion');
      pending.shift()();
      await drainMicrotasks();
    },
  };
}

function resetState() {
  stopHostModulatorLoop(); hostModulators.clear(); continuousTargetActuator.stop();
  controlMappings.clear(); activeSmooths.clear(); eventModesState.clear(); lastMappedValues.clear();
  globalWriteScheduler.clear(); clearExtensionContext();
}

function lfoHarness(smooth = 0) {
  resetState();
  const realNow = Date.now;
  let now = 10_000;
  Date.now = () => now;
  const sdk = slowParameter();
  setExtensionContext({ application: { song: { tempo: 120,
    tracks: [{ devices: [{ parameters: [sdk.param] }] }], returnTracks: [],
  } } });
  controlMappings.set('toggle-1', [{ type: 'device_param', trackIndex: 0,
    deviceIndex: 0, paramIndex: 0, smooth, targetScale: 'linear', takeoverMode: 'jump' }]);
  const update = payload => updateHostModulator('slow-lfo', {
    kind: 'lfo', name: 'toggle-1', syncMode: 'free', ...payload,
  });
  update({ active: true, rate: 1, depth: 1, shape: 'sine' });
  stopHostModulatorLoop();
  return {
    ...sdk, update,
    elapsed: () => now - 10_000,
    async advance(ms) {
      now += ms;
      await tickHostModulators(now);
      await drainMicrotasks();
    },
    async close() {
      resetState();
      while (sdk.pending.length) sdk.pending.shift()();
      await drainMicrotasks();
      Date.now = realNow;
    },
  };
}

test('sustained 4Hz LFO delivers the newest sample after each slow SDK completion', async () => {
  const h = lfoHarness();
  try {
    await h.advance(0);
    // Synthetic completion stalls, not a claim about actual Live throughput.
    // A FIFO, an implicit smooth=0 ramp, or waiting for SDK completion before
    // generating again would fail the sample-at-completion assertions below.
    const stalls = [28, 76, 132, 704, 44, 212];
    for (let cycle = 0; cycle < 24; cycle++) {
      const countBefore = h.writes.length;
      for (let ms = 0; ms < stalls[cycle % stalls.length]; ms += 4) await h.advance(4);
      assert.equal(h.writes.length, countBefore, 'only one write may remain in flight');
      await h.acknowledge();
      assert.equal(h.writes.length, countBefore + 1, 'the newest sample drains without a timer tick');
      const ideal = 0.5 - 0.5 * Math.cos(2 * Math.PI * 4 * h.elapsed() / 1000);
      assert.ok(Math.abs(h.writes.at(-1).value - ideal) < 1e-7,
        `stale LFO sample after ${h.elapsed()} ms: ${h.writes.at(-1).value}, expected ${ideal}`);
      assert.equal(h.maxInFlight(), 1);
    }
    await h.acknowledge();
    const settledCount = h.writes.length;
    await drainMicrotasks();
    assert.equal(h.writes.length, settledCount, 'no historical samples remain to drain');
  } finally { await h.close(); }
});

for (const smooth of [0, 0.8]) test(`LFO OFF discards a sustained 4Hz pending tail with Smooth=${smooth}`, async () => {
  const h = lfoHarness(smooth);
  try {
    h.update({ active: true, depth: 0.6 });
    stopHostModulatorLoop();
    await h.advance(0);
    // Two seconds of generation while the first SDK promise remains blocked.
    for (let elapsed = 0; elapsed < 2032; elapsed += 4) await h.advance(4);
    assert.equal(h.writes.length, 1);
    h.update({ active: false });
    await drainMicrotasks();
    assert.equal(hostModulators.size, 0);
    await h.acknowledge();
    assert.deepEqual(h.writes.map(write => write.value), [0.2, 0],
      'OFF must be next after the already-sent sample, without a smoothing tail');
    while (h.pending.length) await h.acknowledge();
    const stoppedCount = h.writes.length;
    await h.advance(5000);
    assert.equal(h.writes.length, stoppedCount);
    assert.equal(h.maxInFlight(), 1);
  } finally { await h.close(); }
});

for (const cancelAll of [false, true]) test(`LFO target restart preserves a slow in-flight SDK write (cancel all=${cancelAll})`, async () => {
  const actuator = new ContinuousTargetActuator();
  const sdk = slowParameter();
  const request = value => actuator.request({ targetKey: 'gain', value,
    immediate: true, write: value => sdk.param.setValue(value) });
  try {
    request(0.2); await drainMicrotasks();
    request(0.4);
    actuator.cancel(cancelAll ? undefined : 'gain');
    request(0.6); await drainMicrotasks();
    request(0.9); await drainMicrotasks();
    assert.equal(sdk.maxInFlight(), 1, 'cancellation cannot cancel an SDK call already sent');
    assert.deepEqual(sdk.writes.map(write => write.value), [0.2]);
    await sdk.acknowledge();
    assert.deepEqual(sdk.writes.map(write => write.value), [0.2, 0.9]);
    await sdk.acknowledge();
    await actuator.settle();
    assert.equal(sdk.maxInFlight(), 1);
  } finally {
    actuator.stop();
    while (sdk.pending.length) sdk.pending.shift()();
    await drainMicrotasks();
  }
});
