// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, setNetworkSnapshot } from '../src/server/lan-candidates.ts';
import { loadCerts, onCertificateChange } from '../src/server/cert.ts';
import {
  chooseNetwork,
  getNetworkSearch,
  getPublishedLan,
  lanRuntimeIdle,
  nextNetworkAddress,
  noteControllerConnection,
  noteHttpsConnection,
  startLanRuntime,
  startNetworkSearch,
  stopLanRuntime,
  stopNetworkSearch,
} from '../src/server/lan-runtime.ts';
import { resetNetworkSettingsForTests } from '../src/server/lan-settings.ts';

const nic = (address, netmask = '255.255.255.0', mac = '08:bf:b8:13:fa:7d') => (
  { address, netmask, mac, family: 'IPv4', internal: false }
);
const hyperV = address => nic(address, '255.255.240.0', '00:15:5d:bf:ba:df');
const home = () => ({
  Ethernet: [nic('192.168.0.10'), nic('192.168.100.200')],
  'vEthernet (Default Switch)': [hyperV('172.18.96.1')],
});
const homeRoutes = { gateways: ['192.168.100.1'], routeChecked: true };

function rig() {
  const state = { interfaces: home(), udp: '192.168.100.200', routes: homeRoutes, routeReads: 0, ticks: [] };
  return {
    state,
    deps: {
      readInterfaces: () => state.interfaces,
      probeUdp: async () => state.udp,
      readRoutes: async () => { state.routeReads += 1; return state.routes; },
      setTimer: fn => { state.ticks.push(fn); return state.ticks.length; },
      clearTimer: () => {},
    },
  };
}

async function fresh(t) {
  resetNetworkSettingsForTests();
  setNetworkSnapshot(null);
  t.after(() => {
    stopLanRuntime();
    onCertificateChange(null);
    resetNetworkSettingsForTests();
    setNetworkSnapshot(null);
  });
  const { state, deps } = rig();
  setNetworkSnapshot(buildSnapshot(state.interfaces, { defaultRouteIp: null, gateways: [], routeChecked: false }));
  await loadCerts();
  await startLanRuntime(deps);
  return state;
}

/** Runs the last timer the watcher armed, the way the 5 s clock would. */
async function tick(state) {
  await state.ticks.at(-1)();
}

const elsewhere = () => ({
  Ethernet: [nic('10.20.0.5')],
  'vEthernet (Default Switch)': [hyperV('172.18.96.1')],
});

test('there is no search without a running server', async () => {
  resetNetworkSettingsForTests();
  stopLanRuntime();
  await assert.rejects(startNetworkSearch());
  assert.equal(getNetworkSearch(), null);
});

test('the search walks the real candidates and leaves the published address alone', async t => {
  await fresh(t);
  await startNetworkSearch();
  const view = getNetworkSearch();
  assert.equal(view.state, 'running');
  assert.equal(view.ip, '192.168.100.200');
  assert.equal(view.total, 2);
  await nextNetworkAddress();
  assert.equal(getNetworkSearch().ip, '192.168.0.10');
  assert.equal(getPublishedLan().primaryIp, '192.168.100.200');
});

test('next is refused outside a search', async t => {
  await fresh(t);
  await assert.rejects(nextNetworkAddress());
});

test('a network change during the search waits for the end of the search', async t => {
  const state = await fresh(t);
  await startNetworkSearch();
  const reads = state.routeReads;
  state.interfaces = elsewhere();
  state.udp = '10.20.0.5';
  await tick(state);
  await tick(state);
  assert.equal(state.routeReads, reads + 1);
  assert.equal(getPublishedLan().primaryIp, '192.168.100.200');
  assert.equal(getNetworkSearch().total, 2);
  await stopNetworkSearch();
  await lanRuntimeIdle();
  assert.equal(getNetworkSearch(), null);
  assert.equal(getPublishedLan().primaryIp, '10.20.0.5');
});

test('an outside connection pauses the search and a connection from this PC does not', async t => {
  await fresh(t);
  await startNetworkSearch();
  noteHttpsConnection('192.168.100.200', '192.168.100.200');
  assert.equal(getNetworkSearch().state, 'running');
  noteHttpsConnection('192.168.100.200', '::ffff:192.168.100.50');
  assert.equal(getNetworkSearch().state, 'arrived');
});

test('a connection with no search running does nothing', async t => {
  await fresh(t);
  noteHttpsConnection('192.168.100.200', '192.168.100.50');
  assert.equal(getNetworkSearch(), null);
});

test('a proof ends the search and the proven address is published at once', async t => {
  await fresh(t);
  await startNetworkSearch();
  await nextNetworkAddress();
  assert.equal(getPublishedLan().primaryIp, '192.168.100.200');
  await noteControllerConnection('192.168.0.10', '::ffff:192.168.0.30', Date.now());
  assert.equal(getNetworkSearch().state, 'proved');
  assert.equal(getNetworkSearch().ip, '192.168.0.10');
  assert.equal(getPublishedLan().primaryIp, '192.168.0.10');
  assert.equal(getPublishedLan().network.mode, 'auto');
});

test('a phone back on a network proven within the hour still ends the search', async t => {
  await fresh(t);
  await noteControllerConnection('192.168.0.10', '::ffff:192.168.0.30', Date.now());
  await lanRuntimeIdle();
  await startNetworkSearch();
  await noteControllerConnection('192.168.0.10', '::ffff:192.168.0.30', Date.now());
  assert.equal(getNetworkSearch().state, 'proved');
});

test('a proof does not beat a pin, and the search still ends', async t => {
  await fresh(t);
  const pinned = getPublishedLan().network.candidates.find(candidate => candidate.ip === '192.168.100.200');
  await chooseNetwork({ mode: 'pinned', id: pinned.id });
  await startNetworkSearch();
  await noteControllerConnection('192.168.0.10', '::ffff:192.168.0.30', Date.now());
  assert.equal(getNetworkSearch().state, 'proved');
  assert.equal(getPublishedLan().primaryIp, '192.168.100.200');
});

test('choosing an address by hand ends the search and applies the choice', async t => {
  await fresh(t);
  await startNetworkSearch();
  const row = getPublishedLan().network.candidates.find(candidate => candidate.ip === '192.168.0.10');
  await chooseNetwork({ mode: 'pinned', id: row.id });
  await lanRuntimeIdle();
  assert.equal(getNetworkSearch(), null);
  assert.equal(getPublishedLan().primaryIp, '192.168.0.10');
});

test('stopping the server cancels the search', async t => {
  await fresh(t);
  await startNetworkSearch();
  stopLanRuntime();
  assert.equal(getNetworkSearch(), null);
});

test('starting the server again cancels the search', async t => {
  await fresh(t);
  await startNetworkSearch();
  await startLanRuntime(rig().deps);
  assert.equal(getNetworkSearch(), null);
});

test('a stable network costs no process while the panel polls', async t => {
  const state = await fresh(t);
  const reads = state.routeReads;
  for (let elapsed = 0; elapsed < 30_000; elapsed += 3000) {
    getPublishedLan();
    if (elapsed % 6000 === 0) await tick(state);
  }
  assert.equal(state.routeReads, reads);
  state.udp = '192.168.0.10';
  await tick(state);
  assert.equal(state.routeReads, reads);
  state.udp = '192.168.100.200';
  await tick(state);
  assert.equal(state.routeReads, reads);
});
