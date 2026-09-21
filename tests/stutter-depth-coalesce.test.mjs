// Copyright (c) 2026 Gabriel Worm
// tests/stutter-depth-coalesce.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { setExtensionContext, clearExtensionContext } from '../src/context.ts';
import { applyMapping, updateHostModulator, tickHostModulators, stopHostModulatorLoop, controlMappings, eventModesState } from '../src/live/mappings.ts';
import { hostModulators } from '../src/live/host-modulators.ts';
import { continuousTargetActuator } from '../src/live/continuous-target-actuator.ts';
import { globalWriteScheduler } from '../src/server/write-scheduler.ts';

function installFakeClock(initial = 0) {
  const realNow = Date.now.bind(Date);
  let now = initial;
  Date.now = () => now;
  return { advance: (ms) => { now += ms; }, restore: () => { Date.now = realNow; }, get: () => now };
}
function setupMappedParam(controlName) {
  const writes = [];
  const param = { name: controlName, min: 0, max: 1, setValue(value) { writes.push({ t: Date.now(), value }); } };
  setExtensionContext({ application: { song: { tempo: 120, tracks: [{ devices: [{ parameters: [param] }] }] } } });
  controlMappings.set(controlName, [{ type: 'device_param', trackIndex: 0, deviceIndex: 0, paramIndex: 0 }]);
  return { writes };
}
function teardown() {
  stopHostModulatorLoop(); hostModulators.clear(); controlMappings.clear();
  eventModesState.clear(); continuousTargetActuator.stop(); globalWriteScheduler.clear(); clearExtensionContext();
}
function upd(id, p) { return updateHostModulator('client-stut', { name: id, ...p }); }

test('stutter suppresses identical gate values between edges (not an SDK backlog test)', async () => {
  const clock = installFakeClock(0);
  try {
    const { writes } = setupMappedParam('button-1');
    upd('button-1', { kind: 'stutter', active: true, rate: 0.6, depth: 0.8, syncMode: 'free' });
    for (let i = 0; i < 125; i++) { clock.advance(4); await tickHostModulators(clock.get()); }
    assert.ok(writes.length < 50, 'expected coalesced writes (<50) but got ' + writes.length);
    assert.ok(writes.length > 0, 'no writes at all');
  } finally { teardown(); clock.restore(); }
});

test('stutter gate-open value equals state.depth (depth scaling)', async () => {
  const clock = installFakeClock(0);
  try {
    const { writes } = setupMappedParam('button-10');
    upd('button-10', { kind: 'stutter', active: true, rate: 0.05, depth: 0.5, syncMode: 'free' });
    clock.advance(4); await tickHostModulators(clock.get());
    const gateOpenWritten = writes.find((w) => w.value > 0);
    assert.ok(gateOpenWritten !== undefined, 'no gate-open write found');
    assert.ok(Math.abs(gateOpenWritten.value - 0.5) < 0.01, 'expected 0.5 (depth), got ' + gateOpenWritten.value);
  } finally { teardown(); clock.restore(); }
});

test('updateHostModulator parses depth field for stutter', async () => {
  const clock = installFakeClock(0);
  try {
    setupMappedParam('button-20');
    upd('button-20', { kind: 'stutter', active: true, rate: 0.3, depth: 0.75, syncMode: 'free' });
    const key = 'client-stut::button-20';
    const state = hostModulators.get(key);
    assert.ok(state !== undefined, 'modulator state not found');
    assert.ok(Math.abs((state.depth ?? -1) - 0.75) < 0.001, 'expected depth=0.75, got ' + state.depth);
  } finally { teardown(); clock.restore(); }
});

async function drainMicrotasks() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

function slowSdk(target = {}) {
  teardown();
  const writes = [], releases = [];
  let inFlight = 0, maxInFlight = 0;
  const param = { min: 0, max: 1, setValue(value) {
    writes.push(value); inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    return new Promise(resolve => releases.push(() => { inFlight--; resolve(); }));
  } };
  setExtensionContext({ application: { song: { tempo: 120, tracks: [{ devices: [{ parameters: [param] }] }] } } });
  const binding = { type: 'device_param', trackIndex: 0, deviceIndex: 0, paramIndex: 0, ...target };
  controlMappings.set('button-1', [binding]);
  return { writes, releases, binding, maxInFlight: () => maxInFlight,
    async close() { teardown(); releases.forEach(release => release()); await drainMicrotasks(); } };
}

test('stutter analog depth keeps only newest value while SDK is busy', async () => {
  const sdk = slowSdk();
  try {
    for (const value of [0.1, 0.2, 0.4, 0.7, 0.9]) {
      void applyMapping('slow-stutter', 'button-1', value); await drainMicrotasks();
    }
    assert.deepEqual(sdk.writes, [0.1]);
    sdk.releases[0](); await drainMicrotasks();
    assert.deepEqual(sdk.writes, [0.1, 0.9], 'old depth trajectory must not replay');
    assert.equal(sdk.maxInFlight(), 1);
  } finally { await sdk.close(); }
});

test('host stutter OFF supersedes every unsent pulse even with explicit smoothing', async () => {
  for (const smooth of [0, 0.8]) {
    const sdk = slowSdk({ smooth });
    const clock = installFakeClock(1000);
    try {
      upd('button-1', { kind: 'stutter', active: true, rate: 1, depth: 0.8, syncMode: 'free' });
      stopHostModulatorLoop();
      for (const ms of [0, 40, 40, 40, 40, 40]) {
        clock.advance(ms); void tickHostModulators(clock.get()); await drainMicrotasks();
      }
      assert.deepEqual(sdk.writes, [0.8]);
      upd('button-1', { kind: 'stutter', active: false }); await drainMicrotasks();
      assert.equal(hostModulators.size, 0);
      sdk.releases[0](); await drainMicrotasks();
      assert.deepEqual(sdk.writes, [0.8, 0], 'OFF must be next, not an old gate or a smoothing tail');
      sdk.releases[1](); await drainMicrotasks();
      clock.advance(5000); await tickHostModulators(clock.get()); await drainMicrotasks();
      assert.deepEqual(sdk.writes, [0.8, 0], 'no writes after the final release');
    } finally { await sdk.close(); clock.restore(); }
  }
});

test('LFO and stutter bound to same parameter share one SDK writer', async () => {
  const sdk = slowSdk();
  controlMappings.set('toggle-1', [sdk.binding]);
  try {
    void applyMapping('shared-modulator', 'toggle-1', 0.2); await drainMicrotasks();
    void applyMapping('shared-modulator', 'button-1', 0.9); await drainMicrotasks();
    assert.deepEqual(sdk.writes, [0.2], 'stutter must not start a second writer beside LFO');
    sdk.releases[0](); await drainMicrotasks();
    assert.deepEqual(sdk.writes, [0.2, 0.9]);
    assert.equal(sdk.maxInFlight(), 1);
  } finally { await sdk.close(); }
});

test('explicit toggle mappings still retain every switch edge', async () => {
  const sdk = slowSdk({ mode: 'toggle' });
  try {
    for (const value of [1, 0, 1, 0, 1]) {
      void applyMapping('event-stutter', 'button-1', value); await drainMicrotasks();
    }
    assert.deepEqual(sdk.writes, [1]);
    sdk.releases[0](); await drainMicrotasks();
    assert.deepEqual(sdk.writes, [1, 1]);
    sdk.releases[1](); await drainMicrotasks();
    sdk.releases[2](); await drainMicrotasks();
    sdk.releases[3](); await drainMicrotasks();
    assert.deepEqual(sdk.writes, [1, 1, 0, 0, 1]);
  } finally { await sdk.close(); }
});
