import test from 'node:test';
import assert from 'node:assert/strict';
import { isolatedModule, deferred, settle } from './helpers/isolated-module.mjs';

function harness() {
  const autostarts = [], storage = [];
  const calls = { starts: 0, loads: 0, initialized: 0, safety: 0, cancellations: 0, serverGeneration: 0 };
  const api = isolatedModule('src/extension.ts', {
    initialize() {
      calls.initialized++;
      if (calls.failInitialize) throw new Error('SDK unavailable');
      return { environment: { storageDirectory: 'test-only' } };
    },
    setExtensionContext() {}, clearExtensionContext() {}, registerPanelCommand() {},
    installRuntimeSafety() { calls.safety++; }, uninstallRuntimeSafety() { calls.safety--; },
    startLiveStateBroadcastLoop() {}, stopLiveStateBroadcastLoop() {},
    startSmoothTimer() {}, stopSmoothTimer() {}, startHostReconcileTimer() {}, stopHostReconcileTimer() {},
    continuousTargetActuator: { start() {}, stop() {} }, detectedNoteVoice: { releaseAll() {} },
    configureMappingStorage() { const gate = deferred(); storage.push(gate); return gate.promise; },
    loadMappings() { calls.loads++; },
    cancelPendingMappingWrites: async () => { calls.cancellations++; },
    configureAutostartStorage() { const gate = deferred(); autostarts.push(gate); return gate.promise; },
    DEFAULT_AUTOSTART: true,
    startServer: async () => { calls.starts++; }, stopServer: async () => {},
    getServerGeneration: () => calls.serverGeneration,
    closeUdpSocket() {}, oscTransport: { start() {}, dispose() {} },
    require: () => ({ configureLocaleStorage() {} }),
  });
  return { api, calls, autostarts, storage };
}

test('deactivation invalidates delayed autostart and storage callbacks', async () => {
  const h = harness();
  h.api.activate({});
  h.api.deactivate();
  h.autostarts[0].resolve(true); h.storage[0].resolve();
  await settle();
  assert.equal(h.calls.starts, 0);
  assert.equal(h.calls.loads, 0);
  assert.equal(h.calls.cancellations, 1);
});

test('reactivation does not make an older activation callback current again', async () => {
  const h = harness();
  h.api.activate({}); h.api.deactivate(); h.api.activate({});
  h.autostarts[0].resolve(true); h.storage[0].resolve();
  await settle();
  assert.equal(h.calls.starts, 0);
  assert.equal(h.calls.loads, 0);
  h.autostarts[1].resolve(true); h.storage[1].resolve();
  await settle();
  assert.equal(h.calls.starts, 1);
  assert.equal(h.calls.loads, 1);
  h.api.deactivate();
});

test('an SDK initialization failure is retryable and removes installed safety hooks', () => {
  const h = harness();
  h.calls.failInitialize = true;
  assert.throws(() => h.api.activate({}), /SDK unavailable/);
  assert.equal(h.calls.safety, 0);
  h.calls.failInitialize = false;
  h.api.activate({});
  assert.equal(h.calls.initialized, 2);
  h.api.deactivate();
});

test('autostart off suppresses automatic startup but an explicit reactivation can start', async () => {
  const h = harness();
  h.api.activate({});
  h.autostarts[0].resolve(false); h.storage[0].resolve(); await settle();
  assert.equal(h.calls.starts, 0);
  h.api.activate({}); await settle();
  assert.equal(h.calls.starts, 1);
  h.api.deactivate();
});

test('a panel Stop also cancels an automatic start still waiting for storage', async () => {
  const h = harness();
  h.api.activate({});
  h.calls.serverGeneration++; // The server's Stop boundary, not a deactivation.
  h.autostarts[0].resolve(true); await settle();
  assert.equal(h.calls.starts, 0);
  h.api.deactivate();
});
