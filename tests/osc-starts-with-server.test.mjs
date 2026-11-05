// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// With autostart off, the extension used to start the AbletonOSC transport at
// activation anyway. Nobody had pressed Start, no phone could connect, and
// AbletonOSC still pushed every playhead change to the extension, logging
// each one on Live's main thread (measured on a MacBook Air: 9,736 pushes in
// one morning with the server never started). The transport now follows the
// server: state.ts announces when the server is published and when it stops,
// and the bootstrap starts or releases the transport on those events. The
// server module itself never touches OSC, so a test that runs a real server
// never talks to a Live that happens to be open on the same machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { isolatedModule, deferred, settle } from './helpers/isolated-module.mjs';
import { OSCTransport } from '../src/live/osc-transport.ts';

function extensionHarness() {
  const autostarts = [], storage = [];
  const osc = { starts: 0, disposes: 0 };
  const lifecycle = new Set();
  const api = isolatedModule('src/extension.ts', {
    onServerLifecycle(listener) { lifecycle.add(listener); return () => { lifecycle.delete(listener); }; },
    initialize() { return { environment: { storageDirectory: 'test-only' } }; },
    setExtensionContext() {}, clearExtensionContext() {}, registerPanelCommand() {},
    installRuntimeSafety() {}, uninstallRuntimeSafety() {},
    startLiveStateBroadcastLoop() {}, stopLiveStateBroadcastLoop() {},
    startSmoothTimer() {}, stopSmoothTimer() {}, startHostReconcileTimer() {}, stopHostReconcileTimer() {},
    continuousTargetActuator: { start() {}, stop() {} }, detectedNoteVoice: { releaseAll() {} },
    configureMappingStorage() { const gate = deferred(); storage.push(gate); return gate.promise; },
    loadMappings() {},
    cancelPendingMappingWrites: async () => {},
    configureAutostartStorage() { const gate = deferred(); autostarts.push(gate); return gate.promise; },
    DEFAULT_AUTOSTART: true,
    startServer: async () => {}, stopServer: async () => {},
    getServerGeneration: () => 0,
    closeUdpSocket() {},
    oscTransport: { start() { osc.starts++; }, dispose() { osc.disposes++; } },
    require: () => ({ configureLocaleStorage() {} }),
  });
  const emit = (event) => { for (const listener of [...lifecycle]) listener(event); };
  return { api, osc, autostarts, storage, lifecycle, emit };
}

function serverHarness() {
  const certs = [], servers = [];
  const events = [];
  class Server extends EventEmitter {
    active = false;
    listen(port) { this.port = port; queueMicrotask(() => { this.active = true; this.emit('listening'); }); }
    address() { return this.active ? { port: this.port } : null; }
    closeAllConnections() {}
    close(callback) { this.active = false; callback(); }
  }
  const createServer = () => { const server = new Server(); servers.push(server); return server; };
  const api = isolatedModule('src/server/state.ts', {
    http: { createServer }, https: { createServer }, process: { env: {} },
    useHttps: false, httpsOptions: null,
    loadCerts() { const gate = deferred(); certs.push(gate); return gate.promise; },
    regenerateTokens() {},
    handleHttp() {}, handleUpgrade() {}, wssInit() {}, stopAllWsClients() {}, getLanAddresses: () => [],
    onCertificateChange() {},
    getPublishedLan: () => ({ primaryIp: '', otherIps: [] }),
    startLanRuntime: async () => {}, stopLanRuntime: () => {},
    noteHttpsConnection() {},
  });
  api.onServerLifecycle((event) => events.push(event));
  async function start() {
    const starting = api.startServer();
    await settle();
    for (const cert of certs.splice(0)) cert.resolve();
    await starting;
  }
  return { api, events, servers, certs, start };
}

test('activation with autostart off leaves the OSC transport stopped', async () => {
  const h = extensionHarness();
  h.api.activate({});
  h.autostarts[0].resolve(false); h.storage[0].resolve();
  await settle();
  assert.equal(h.osc.starts, 0, 'no Start, no AbletonOSC listeners');
  h.api.deactivate();
});

test('activation with autostart on leaves the start to the server publication', async () => {
  const h = extensionHarness();
  h.api.activate({});
  h.autostarts[0].resolve(true); h.storage[0].resolve();
  await settle();
  assert.equal(h.osc.starts, 0, 'activate() itself never starts the transport');
  h.emit('published');
  assert.equal(h.osc.starts, 1, 'the published server brings AbletonOSC up');
  h.emit('stopped');
  assert.equal(h.osc.disposes, 1, 'Stop takes it down');
  h.emit('published');
  assert.equal(h.osc.starts, 2, 'a second Start brings it up again');
  h.api.deactivate();
});

test('deactivation releases the transport and stops following the server', async () => {
  const h = extensionHarness();
  h.api.activate({});
  h.emit('published');
  h.api.deactivate();
  assert.ok(h.osc.disposes >= 1, 'deactivate releases the transport');
  assert.equal(h.lifecycle.size, 0, 'no lifecycle listener survives deactivation');
  const starts = h.osc.starts;
  h.emit('published');
  assert.equal(h.osc.starts, starts, 'a late publication of an old activation starts nothing');
});

test('the server announces publication and Stop, once each', async () => {
  const h = serverHarness();
  await h.start();
  assert.deepEqual(h.events, ['published']);
  await h.api.stopServer();
  assert.deepEqual(h.events, ['published', 'stopped']);
});

test('Start, Stop and Start again announce in order', async () => {
  const h = serverHarness();
  await h.start();
  await h.api.stopServer();
  await h.start();
  await h.api.stopServer();
  assert.deepEqual(h.events, ['published', 'stopped', 'published', 'stopped']);
});

test('a Start cancelled before publication never announces publication', async () => {
  const h = serverHarness();
  const starting = h.api.startServer();
  await settle();
  const stopping = h.api.stopServer();
  for (const cert of h.certs.splice(0)) cert.resolve();
  await Promise.all([starting, stopping]);
  assert.ok(!h.events.includes('published'));
});

test('a Stop with nothing running announces nothing', async () => {
  const h = serverHarness();
  await h.api.stopServer();
  assert.deepEqual(h.events, []);
});

// Stop now disposes the transport while Launch Clip may be running. dispose()
// clears the Launch Clip flag and its slot listeners; clip-launch.ts only
// turns them back on when it sees the link go from down to up, so the
// release has to be announced like any other loss of the link.
test('disposing a connected transport announces the lost link', () => {
  const transport = new OSCTransport();
  transport.state.connected = true;
  transport.state.available = true;
  const events = [];
  transport.on('link-lost', () => events.push('link-lost'));
  transport.on('update', (state) => events.push(`update:${state.connected}`));
  transport.dispose();
  assert.ok(events.includes('link-lost'), 'link-lost reaches clip-launch and recording');
  assert.ok(events.includes('update:false'), 'an update with connected false lets clip-launch re-arm on the next connection');
  assert.equal(transport.state.connected, false);
});

test('disposing a transport that never connected stays quiet about the link', () => {
  const transport = new OSCTransport();
  const events = [];
  transport.on('link-lost', () => events.push('link-lost'));
  transport.dispose();
  assert.deepEqual(events, []);
});
