// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { buildSnapshot, getNetworkSnapshot, networkKey, setNetworkSnapshot } from '../src/server/lan-candidates.ts';
import { getPublishedLan, startLanRuntime, stopLanRuntime } from '../src/server/lan-runtime.ts';
import { resetNetworkSettingsForTests } from '../src/server/lan-settings.ts';
import { deferred, isolatedModule, settle } from './helpers/isolated-module.mjs';

const nic = address => ({ address, netmask: '255.255.255.0', mac: '08:bf:b8:13:fa:7d', family: 'IPv4', internal: false });
const signals = { defaultRouteIp: null, gateways: [], routeChecked: true };

test('with two proven networks the newest proof wins', () => {
  const interfaces = { Ethernet: [nic('192.168.0.10'), nic('192.168.100.200')] };
  const base = buildSnapshot(interfaces, signals);
  const key = ip => networkKey(base.candidates.find(candidate => candidate.ip === ip));
  const now = 10_000_000;
  const proofs = [{ key: key('192.168.0.10'), at: now - 5000 }, { key: key('192.168.100.200'), at: now - 1000 }];
  assert.equal(buildSnapshot(interfaces, signals, { proofs, now }).primaryIp, '192.168.100.200');
  const older = [{ key: key('192.168.0.10'), at: now - 1000 }, { key: key('192.168.100.200'), at: now - 5000 }];
  assert.equal(buildSnapshot(interfaces, signals, { proofs: older, now }).primaryIp, '192.168.0.10');
});

function fakeDeps(extra = {}) {
  return {
    readInterfaces: () => ({ 'Wi-Fi': [nic('10.77.1.2')] }),
    probeUdp: async () => '10.77.1.2',
    readRoutes: async () => ({ gateways: ['10.77.1.1'], routeChecked: true }),
    setTimer: () => 1,
    clearTimer: () => {},
    ...extra,
  };
}

const lists = ip => getPublishedLan().network.candidates.some(candidate => candidate.ip === ip);

test('stopping forgets the snapshot, so the next start reads the machine again', async t => {
  resetNetworkSettingsForTests();
  setNetworkSnapshot(null);
  t.after(() => { stopLanRuntime(); setNetworkSnapshot(null); });
  await startLanRuntime(fakeDeps());
  assert.equal(lists('10.77.1.2'), true);
  stopLanRuntime();
  assert.equal(lists('10.77.1.2'), false);
});

test('a reading that lands after Stop does not bring the snapshot back', async t => {
  resetNetworkSettingsForTests();
  setNetworkSnapshot(null);
  t.after(() => { stopLanRuntime(); setNetworkSnapshot(null); });
  const gate = deferred();
  const starting = startLanRuntime(fakeDeps({ readRoutes: () => gate.promise }));
  await settle();
  stopLanRuntime();
  gate.resolve({ gateways: ['10.77.1.1'], routeChecked: true });
  await starting;
  await settle();
  assert.equal(lists('10.77.1.2'), false);
  assert.equal(getNetworkSnapshot().candidates.some(candidate => candidate.ip === '10.77.1.2'), false);
});

function stateHarness(extra = {}) {
  const servers = [];
  const listener = { current: null };
  class Server extends EventEmitter {
    listen(port) { this.port = port; this.active = true; queueMicrotask(() => this.emit('listening')); }
    address() { return this.active ? { port: this.port } : null; }
    closeAllConnections() {}
    close(callback) { this.active = false; callback(); }
    setSecureContext(options) { this.context = options; }
  }
  const createServer = () => { const server = new Server(); servers.push(server); return server; };
  const options = { key: 'new-key', cert: 'new-cert' };
  const api = isolatedModule('src/server/state.ts', {
    http: { createServer }, https: { createServer }, process: { env: {} },
    useHttps: true, httpsOptions: {},
    loadCerts: async () => {}, regenerateTokens() {},
    handleHttp() {}, handleUpgrade() {}, wssInit() {}, stopAllWsClients() {},
    onCertificateChange(fn) { listener.current = fn; },
    getPublishedLan: () => ({ primaryIp: '192.168.100.200', otherIps: ['192.168.0.10'] }),
    startLanRuntime: async () => { listener.current(options); },
    stopLanRuntime: () => {},
    ...extra,
  });
  return { api, servers, listener, options };
}

test('a certificate issued while the server starts reaches the HTTPS listener', async () => {
  const h = stateHarness();
  await h.api.startServer();
  assert.equal(h.servers[1].context, h.options);
  await h.api.stopServer();
});

test('the log names what the phone is told, the QR address first', async () => {
  const lines = [];
  const h = stateHarness({ console: { log: line => lines.push(String(line)), warn() {}, error() {} } });
  await h.api.startServer();
  await h.api.stopServer();
  const urls = lines.filter(line => line.includes('LAN phone URL')).map(line => line.trim());
  assert.equal(urls.length, 2);
  assert.ok(urls[0].includes('LAN phone URL (QR): https://192.168.100.200:'), urls[0]);
  assert.ok(urls[1].includes('LAN phone URL: https://192.168.0.10:'), urls[1]);
});

test('a certificate issued after Stop goes nowhere and does not throw', async () => {
  const h = stateHarness();
  await h.api.startServer();
  await h.api.stopServer();
  h.servers[1].context = null;
  h.listener.current(h.options);
  assert.equal(h.servers[1].context, null);
});
