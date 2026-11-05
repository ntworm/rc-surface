// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildSnapshot, setNetworkSnapshot } from '../src/server/lan-candidates.ts';
import {
  certificateCovers,
  ensureCertificateCovers,
  httpsOptions,
  loadCerts,
  mergeCertAddresses,
  onCertificateChange,
  requiredCertAddresses,
  certCoversRequiredAltNames,
  buildSubjectAltNames,
} from '../src/server/cert.ts';
import {
  chooseNetwork,
  getPublishedLan,
  lanRuntimeIdle,
  noteControllerConnection,
  refreshLanRuntime,
  startLanRuntime,
  stopLanRuntime,
} from '../src/server/lan-runtime.ts';
import { getNetworkChoice, recordNetworkProof, resetNetworkSettingsForTests, setNetworkChoice } from '../src/server/lan-settings.ts';
import { setExtensionContext } from '../src/context.ts';

const nic = (address, netmask = '255.255.255.0', mac = '08:bf:b8:13:fa:7d') => (
  { address, netmask, mac, family: 'IPv4', internal: false }
);
const hyperV = address => nic(address, '255.255.240.0', '00:15:5d:bf:ba:df');
const home = (virtual = '172.18.96.1') => ({
  Ethernet: [nic('192.168.0.10'), nic('192.168.100.200')],
  'vEthernet (Default Switch)': [hyperV(virtual)],
});
const homeRoutes = { gateways: ['192.168.100.1'], routeChecked: true };

function rig() {
  const state = { interfaces: home(), udp: '192.168.100.200', routes: homeRoutes };
  return {
    state,
    deps: {
      readInterfaces: () => state.interfaces,
      probeUdp: async () => state.udp,
      readRoutes: async () => state.routes,
      setTimer: () => 1,
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

test('required certificate addresses skip virtual and VPN adapters and keep the one in use', () => {
  const snapshot = buildSnapshot({ ...home(), Tailscale: [nic('100.100.1.2', '255.192.0.0', '00:00:00:00:00:00')], Lumi: [nic('10.0.0.2')] },
    { defaultRouteIp: '192.168.100.200', gateways: ['192.168.100.1'], routeChecked: true });
  assert.deepEqual(new Set(requiredCertAddresses(snapshot)), new Set(['192.168.100.200', '192.168.0.10', '10.0.0.2']));
  const pinned = buildSnapshot(home(), { defaultRouteIp: null, gateways: [], routeChecked: true },
    { choice: { mode: 'pinned', id: 'vEthernet (Default Switch)|172.18.96.0/20' } });
  assert.ok(requiredCertAddresses(pinned).includes('172.18.96.1'));
  const publicAddress = buildSnapshot({ Ethernet: [nic('25.10.1.20')] }, { defaultRouteIp: null, gateways: [], routeChecked: true });
  assert.deepEqual(requiredCertAddresses(publicAddress), []);
});

test('merged addresses keep the required ones and drop the oldest past 32', () => {
  assert.deepEqual([...mergeCertAddresses(['1.1.1.1', '2.2.2.2'], ['2.2.2.2', '3.3.3.3'])], ['1.1.1.1', '2.2.2.2', '3.3.3.3']);
  const previous = Array.from({ length: 40 }, (_, i) => `10.0.0.${i + 1}`);
  const merged = mergeCertAddresses(previous, ['192.168.0.1']);
  assert.equal(merged.length, 32);
  assert.ok(merged.includes('192.168.0.1'));
  assert.equal(merged.includes('10.0.0.1'), false);
  assert.ok(merged.includes('10.0.0.40'));
});

test('a new address is covered in live TLS without restarting the server', async t => {
  await fresh(t);
  const server = https.createServer(httpsOptions, (_req, res) => res.end('ok'));
  onCertificateChange(options => server.setSecureContext(options));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { port } = server.address();
  const san = () => new Promise((resolve, reject) => {
    const socket = tls.connect({ port, host: '127.0.0.1', rejectUnauthorized: false }, () => {
      const value = socket.getPeerCertificate().subjectaltname;
      socket.destroy();
      resolve(value);
    });
    socket.on('error', reject);
  });
  assert.doesNotMatch(await san(), /10\.9\.8\.7/);
  assert.equal(certificateCovers('10.9.8.7'), false);
  assert.equal(await ensureCertificateCovers(['10.9.8.7']), true);
  assert.equal(certificateCovers('10.9.8.7'), true);
  assert.match(await san(), /10\.9\.8\.7/);
  assert.match(await san(), /192\.168\.100\.200/);
});

test('the persisted certificate survives a new virtual IP and a return to a known network', async t => {
  const storageDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-cert-'));
  setExtensionContext({ environment: { storageDirectory } });
  t.after(() => setExtensionContext(null));
  setNetworkSnapshot(null);
  t.after(() => setNetworkSnapshot(null));
  const load = async interfaces => {
    setNetworkSnapshot(buildSnapshot(interfaces, { defaultRouteIp: null, gateways: [], routeChecked: true }));
    await loadCerts();
    return fs.readFile(path.join(storageDirectory, 'certs', 'ableton-rc-server.crt'), 'utf8');
  };
  const first = await load(home('172.18.96.1'));
  assert.equal(await load(home('172.23.240.1')), first, 'a Hyper-V reboot keeps the certificate');
  const away = await load({ 'Wi-Fi': [nic('10.0.0.5')] });
  assert.notEqual(away, first);
  assert.ok(certCoversRequiredAltNames(away, ['10.0.0.5', '192.168.100.200', '192.168.0.10']), 'old addresses stay');
  assert.equal(await load(home('172.20.0.1')), away, 'coming home keeps the certificate');
});

test('the published address follows the signals', async t => {
  await fresh(t);
  const lan = getPublishedLan();
  assert.equal(lan.primaryIp, '192.168.100.200');
  assert.ok(lan.otherIps.includes('192.168.0.10'));
  assert.equal(lan.certificatePending, false);
  assert.equal(lan.network.mode, 'auto');
  const row = lan.network.candidates.find(candidate => candidate.ip === '192.168.100.200');
  assert.equal(row.id, 'Ethernet|192.168.100.0/24');
  assert.equal(row.kind, 'ethernet');
  assert.equal(row.gateway, '192.168.100.1');
  assert.equal(row.level, 3);
  assert.equal(Object.hasOwn(row, 'mac'), false);
});

test('a new network is not published until the certificate covers it', async t => {
  const state = await fresh(t);
  state.interfaces = { 'Wi-Fi': [nic('10.1.2.3')] };
  state.udp = '10.1.2.3';
  state.routes = { gateways: ['10.1.2.1'], routeChecked: true };
  await refreshLanRuntime();
  const during = getPublishedLan();
  assert.equal(during.primaryIp, '');
  assert.equal(during.certificatePending, true);
  await lanRuntimeIdle();
  const after = getPublishedLan();
  assert.equal(after.primaryIp, '10.1.2.3');
  assert.equal(after.certificatePending, false);
});

test('no network publishes nothing and is not a pending certificate', async t => {
  const state = await fresh(t);
  state.interfaces = {};
  state.udp = null;
  state.routes = { gateways: [], routeChecked: true };
  await refreshLanRuntime();
  await lanRuntimeIdle();
  const lan = getPublishedLan();
  assert.equal(lan.primaryIp, '');
  assert.deepEqual([...lan.otherIps], []);
  assert.equal(lan.certificatePending, false);
});

test('chooseNetwork accepts automatic or a current candidate only', async t => {
  await fresh(t);
  await chooseNetwork({ mode: 'pinned', id: 'Ethernet|192.168.0.0/24' });
  await lanRuntimeIdle();
  assert.equal(getPublishedLan().primaryIp, '192.168.0.10');
  assert.equal(getPublishedLan().network.mode, 'pinned');
  for (const bad of [{ mode: 'pinned', id: 'Wi-Fi|10.0.0.0/24' }, { mode: 'manual', host: 'evil.example' }, null]) {
    await assert.rejects(() => chooseNetwork(bad));
  }
  assert.deepEqual(getNetworkChoice(), { mode: 'pinned', id: 'Ethernet|192.168.0.0/24' });
  await chooseNetwork({ mode: 'auto' });
  await lanRuntimeIdle();
  assert.equal(getPublishedLan().primaryIp, '192.168.100.200');
});

test('choosing a virtual adapter issues its certificate once', async t => {
  await fresh(t);
  assert.equal(certificateCovers('172.18.96.1'), false);
  await chooseNetwork({ mode: 'pinned', id: 'vEthernet (Default Switch)|172.18.96.0/20' });
  await lanRuntimeIdle();
  assert.equal(certificateCovers('172.18.96.1'), true);
  assert.equal(getPublishedLan().primaryIp, '172.18.96.1');
});

test('a controller connection from another device proves its network and lifts it', async t => {
  await fresh(t);
  await noteControllerConnection('192.168.0.10', '::ffff:192.168.0.30', Date.now());
  await lanRuntimeIdle();
  const lan = getPublishedLan();
  assert.equal(lan.primaryIp, '192.168.0.10');
  const row = lan.network.candidates.find(candidate => candidate.ip === '192.168.0.10');
  assert.equal(row.proven, true);
  assert.equal(row.level, 2);
});

test('a connection from this PC, or to an unknown address, proves nothing', async t => {
  await fresh(t);
  for (const [local, remote] of [
    ['192.168.0.10', '192.168.100.200'],
    ['192.168.0.10', '192.168.0.10'],
    ['192.168.0.10', '::ffff:192.168.0.10'],
    ['127.0.0.1', '127.0.0.1'],
    ['192.168.0.10', '::1'],
    ['10.9.9.9', '10.9.9.8'],
    [undefined, undefined],
  ]) {
    await noteControllerConnection(local, remote, Date.now());
  }
  await lanRuntimeIdle();
  assert.equal(getPublishedLan().primaryIp, '192.168.100.200');
  assert.equal(getPublishedLan().network.candidates.some(candidate => candidate.proven), false);
});

test('a pin beats a proof, and proofs load into the first snapshot', async t => {
  resetNetworkSettingsForTests();
  await recordNetworkProof('Ethernet|192.168.0.0/24|', Date.now());
  await setNetworkChoice({ mode: 'pinned', id: 'Ethernet|192.168.100.0/24' });
  setNetworkSnapshot(null);
  t.after(() => { stopLanRuntime(); resetNetworkSettingsForTests(); setNetworkSnapshot(null); });
  const { state, deps } = rig();
  setNetworkSnapshot(buildSnapshot(state.interfaces, { defaultRouteIp: null, gateways: [], routeChecked: false }));
  await loadCerts();
  await startLanRuntime(deps);
  assert.equal(getPublishedLan().primaryIp, '192.168.100.200');
  assert.equal(getPublishedLan().network.candidates.find(candidate => candidate.ip === '192.168.0.10').proven, true);
});

test('a public IP on a VPN adapter is still never automatic', () => {
  const snapshot = buildSnapshot({ 'Kaspersky VPN': [nic('25.10.1.20', '255.255.255.0', '00:00:00:00:00:00')] },
    { defaultRouteIp: '25.10.1.20', gateways: [], routeChecked: true });
  assert.equal(snapshot.candidates[0].level, 8);
  assert.equal(snapshot.primaryIp, '');
});

test('buildSubjectAltNames stays the source of the SAN list', () => {
  assert.equal(buildSubjectAltNames(['10.0.0.1']).length, 3);
});
