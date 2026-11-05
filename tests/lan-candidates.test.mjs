// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, classifyInterface, networkKey } from '../src/server/lan-candidates.js';

const nic = (address, netmask = '255.255.255.0', mac = '08:bf:b8:13:fa:7d') => (
  { address, netmask, mac, family: 'IPv4', internal: false }
);
const hyperV = nic('172.18.96.1', '255.255.240.0', '00:15:5d:bf:ba:df');
const tailscaleIdle = nic('169.254.83.107', '255.255.0.0', '00:00:00:00:00:00');
const signals = (defaultRouteIp, gateways = [], routeChecked = true) => ({ defaultRouteIp, gateways, routeChecked });
const home = () => ({
  Ethernet: [nic('192.168.0.10'), nic('192.168.100.200')],
  'vEthernet (Default Switch)': [hyperV],
  Tailscale: [tailscaleIdle],
});
const pick = (snapshot, ip) => snapshot.candidates.find(candidate => candidate.ip === ip);

test('home: one adapter with two addresses announces the one the system routes through', () => {
  const snapshot = buildSnapshot(home(), signals('192.168.100.200', ['192.168.100.1']));
  assert.equal(snapshot.primaryIp, '192.168.100.200');
  assert.equal(snapshot.selected.level, 3);
  assert.equal(snapshot.ambiguous, false);
  assert.equal(pick(snapshot, '192.168.100.200').gateway, '192.168.100.1');
  assert.equal(pick(snapshot, '192.168.0.10').gateway, null);
  assert.equal(pick(snapshot, '192.168.0.10').level, 5);
  assert.equal(pick(snapshot, '172.18.96.1').level, 7);
  assert.equal(pick(snapshot, '169.254.83.107').level, 7);
  assert.deepEqual(new Set(snapshot.otherIps), new Set(['192.168.0.10', '172.18.96.1', '169.254.83.107']));
  assert.equal(snapshot.candidates.length, 4);
});

test('home without the UDP probe: the gateway still decides, per address and not per adapter', () => {
  const snapshot = buildSnapshot(home(), signals(null, ['192.168.100.1']));
  assert.equal(snapshot.primaryIp, '192.168.100.200');
  assert.equal(snapshot.selected.level, 4);
  assert.equal(pick(snapshot, '192.168.0.10').level, 5);
  assert.equal(snapshot.ambiguous, false);
});

test('home without any route signal: deterministic, both listed and flagged as ambiguous', () => {
  const snapshot = buildSnapshot(home(), signals(null, [], false));
  assert.equal(snapshot.primaryIp, '192.168.0.10');
  assert.ok(snapshot.otherIps.includes('192.168.100.200'));
  assert.equal(snapshot.ambiguous, true);
  assert.ok(snapshot.selected.reasons.includes('route-unchecked'));
});

test('a read route table without a gateway reports no-gateway, not route-unchecked', () => {
  const snapshot = buildSnapshot({ Ethernet: [nic('192.168.0.10')] }, signals(null, [], true));
  assert.equal(snapshot.primaryIp, '192.168.0.10');
  assert.equal(snapshot.selected.level, 5);
  assert.equal(snapshot.ambiguous, false);
  assert.ok(snapshot.selected.reasons.includes('no-gateway'));
});

test('the IP tie break is numeric, not lexical', () => {
  const snapshot = buildSnapshot({ Ethernet: [nic('192.168.10.1'), nic('192.168.9.1')] }, signals(null, [], false));
  assert.equal(snapshot.primaryIp, '192.168.9.1');
});

test('the tie break prefers Ethernet over Wi-Fi at the same level', () => {
  const snapshot = buildSnapshot({ 'Wi-Fi': [nic('10.0.0.2')], Ethernet: [nic('192.168.5.2')] }, signals(null, [], false));
  assert.equal(snapshot.primaryIp, '192.168.5.2');
});

const cases = [
  ['show: Wi-Fi with gateway beats the LumiKit cable', { 'Wi-Fi': [nic('192.168.1.40')], Ethernet: [nic('192.168.0.10')] }, signals('192.168.1.40', ['192.168.1.1']), '192.168.1.40'],
  ['Hyper-V never beats Wi-Fi', { 'vEthernet (WSL)': [nic('172.23.240.1', '255.255.240.0', '00:15:5d:00:00:01')], 'Wi-Fi': [nic('10.0.0.5')] }, signals('10.0.0.5', ['10.0.0.1']), '10.0.0.5'],
  ['a tunnel holding the default route loses to Wi-Fi with a gateway', { Tailscale: [nic('100.101.102.103', '255.192.0.0', '00:00:00:00:00:00')], 'Wi-Fi': [nic('192.168.1.40')] }, signals('100.101.102.103', ['192.168.1.1']), '192.168.1.40'],
  ['a CGNAT LAN with the default route beats Hyper-V', { Ethernet: [nic('100.70.1.20')], 'vEthernet (Default Switch)': [hyperV] }, signals('100.70.1.20', ['100.70.1.1']), '100.70.1.20'],
  ['Mac: en0 beats bridge100 and utun', { en0: [nic('10.0.1.5', '255.255.255.0', 'a4:83:e7:00:00:01')], bridge100: [nic('192.168.64.1', '255.255.255.0', 'a6:83:e7:00:00:64')], utun3: [nic('10.8.0.2', '255.255.255.255', '00:00:00:00:00:00')] }, signals('10.0.1.5', ['10.0.1.1']), '10.0.1.5'],
  ['the PC hotspot is listed and Ethernet still wins', { Ethernet: [nic('192.168.100.200')], 'Local Area Connection* 10': [nic('192.168.137.1')] }, signals('192.168.100.200', ['192.168.100.1']), '192.168.100.200'],
];

for (const [title, interfaces, routeSignals, expected] of cases) {
  test(title, () => assert.equal(buildSnapshot(interfaces, routeSignals).primaryIp, expected));
}

test('the hotspot sits on level 6 even with a gateway on its subnet', () => {
  const snapshot = buildSnapshot({ Ethernet: [nic('192.168.5.2')], 'Local Area Connection* 10': [nic('192.168.137.1')] }, signals(null, ['192.168.137.254']));
  assert.equal(pick(snapshot, '192.168.137.1').kind, 'hotspot');
  assert.equal(pick(snapshot, '192.168.137.1').level, 6);
  assert.equal(snapshot.primaryIp, '192.168.5.2');
});

test('the hotspot stays on level 6 even when the probe returns its address', () => {
  const snapshot = buildSnapshot({ Ethernet: [nic('192.168.5.2')], 'Local Area Connection* 10': [nic('192.168.137.1')] }, signals('192.168.137.1', ['192.168.5.1']));
  assert.equal(pick(snapshot, '192.168.137.1').level, 6);
  assert.equal(snapshot.primaryIp, '192.168.5.2');
});

test('a phone proof lifts the hotspot, because the phone is really on it', () => {
  const interfaces = { Ethernet: [nic('192.168.5.2')], 'Local Area Connection* 10': [nic('192.168.137.1')] };
  const base = buildSnapshot(interfaces, signals('192.168.5.2', ['192.168.5.1']));
  const key = networkKey(pick(base, '192.168.137.1'));
  assert.equal(buildSnapshot(interfaces, signals('192.168.5.2', ['192.168.5.1']), { proofs: [{ key, at: 1000 }], now: 2000 }).primaryIp, '192.168.137.1');
});

test('a pin beats a phone proof', () => {
  const base = buildSnapshot(home(), signals('192.168.100.200', ['192.168.100.1']));
  const key = networkKey(pick(base, '192.168.100.200'));
  const snapshot = buildSnapshot(home(), signals('192.168.100.200', ['192.168.100.1']), {
    choice: { mode: 'pinned', id: 'Ethernet|192.168.0.0/24' }, proofs: [{ key, at: 1000 }], now: 2000,
  });
  assert.equal(snapshot.primaryIp, '192.168.0.10');
});

test('a public address is listed but never announced by itself', () => {
  const snapshot = buildSnapshot({ Ethernet: [nic('25.10.1.20')], 'vEthernet (Default Switch)': [hyperV] }, signals('25.10.1.20', ['25.10.1.1']));
  assert.notEqual(snapshot.primaryIp, '25.10.1.20');
  assert.equal(pick(snapshot, '25.10.1.20').level, 8);
  assert.equal(pick(snapshot, '25.10.1.20').public, true);
  assert.equal(snapshot.needsPublicChoice, true);
  assert.equal(snapshot.otherIps.includes('25.10.1.20'), false);
});

test('a public address alone leaves no QR address', () => {
  const snapshot = buildSnapshot({ Ethernet: [nic('25.10.1.20')] }, signals('25.10.1.20', ['25.10.1.1']));
  assert.equal(snapshot.primaryIp, '');
  assert.equal(snapshot.selected, null);
  assert.equal(snapshot.needsPublicChoice, true);
});

test('only an explicit pin announces a public address, and a proof never does', () => {
  const interfaces = { Ethernet: [nic('25.10.1.20')] };
  const id = 'Ethernet|25.10.1.0/24';
  assert.equal(buildSnapshot(interfaces, signals(null), { choice: { mode: 'pinned', id } }).primaryIp, '25.10.1.20');
  const key = networkKey(buildSnapshot(interfaces, signals(null)).candidates[0]);
  assert.equal(buildSnapshot(interfaces, signals(null), { proofs: [{ key, at: 1000 }], now: 2000 }).primaryIp, '');
});

test('no network leaves an empty address and no selection', () => {
  for (const interfaces of [{}, { lo: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', internal: true, mac: '00:00:00:00:00:00' }] }]) {
    const snapshot = buildSnapshot(interfaces, signals(null, [], false));
    assert.equal(snapshot.primaryIp, '');
    assert.deepEqual([...snapshot.otherIps], []);
    assert.equal(snapshot.selected, null);
    assert.equal(snapshot.ambiguous, false);
  }
});

test('IPv6 and internal entries are ignored', () => {
  const snapshot = buildSnapshot({ en0: [{ address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', internal: false, mac: 'a4:83:e7:00:00:01' }, nic('10.0.1.5')] }, signals(null));
  assert.equal(snapshot.candidates.length, 1);
});

test('a virtual adapter alone is still announced', () => {
  assert.equal(buildSnapshot({ vmnet8: [nic('192.168.64.1', '255.255.255.0', '00:50:56:c0:00:08')] }, signals(null)).primaryIp, '192.168.64.1');
});

test('a link-local address on a real adapter is listed on level 7 and flagged', () => {
  const snapshot = buildSnapshot({ Ethernet: [nic('169.254.10.20', '255.255.0.0')] }, signals(null));
  assert.equal(snapshot.primaryIp, '169.254.10.20');
  assert.equal(snapshot.selected.kind, 'ethernet');
  assert.equal(snapshot.selected.linkLocal, true);
  assert.equal(snapshot.selected.level, 7);
});

test('a pin survives DHCP because it names the adapter and the subnet', () => {
  const choice = { mode: 'pinned', id: 'Ethernet|192.168.0.0/24' };
  const snapshot = buildSnapshot({ Ethernet: [nic('192.168.0.77'), nic('192.168.100.200')] }, signals('192.168.100.200', ['192.168.100.1']), { choice });
  assert.equal(snapshot.primaryIp, '192.168.0.77');
  assert.equal(snapshot.selected.level, 1);
  assert.equal(snapshot.mode, 'pinned');
  assert.equal(snapshot.pinMissing, false);
});

test('a missing pin falls back to automatic, warns and leaves the choice untouched', () => {
  const choice = { mode: 'pinned', id: 'Wi-Fi|10.0.0.0/24' };
  const snapshot = buildSnapshot(home(), signals('192.168.100.200', ['192.168.100.1']), { choice });
  assert.equal(snapshot.primaryIp, '192.168.100.200');
  assert.equal(snapshot.mode, 'auto');
  assert.equal(snapshot.pinMissing, true);
  assert.equal(choice.id, 'Wi-Fi|10.0.0.0/24');
});

test('a phone proof beats the default route for 30 days on the same network only', () => {
  const day = 86_400_000;
  const now = 100 * day;
  const base = buildSnapshot(home(), signals('192.168.100.200', ['192.168.100.1']));
  const key = networkKey(pick(base, '192.168.0.10'));
  const proven = buildSnapshot(home(), signals('192.168.100.200', ['192.168.100.1']), { proofs: [{ key, at: now - day }], now });
  assert.equal(proven.primaryIp, '192.168.0.10');
  assert.equal(proven.selected.level, 2);
  assert.equal(proven.selected.proven, true);
  assert.equal(proven.selected.provenUntil, now - day + 30 * day);
  const expired = buildSnapshot(home(), signals('192.168.100.200', ['192.168.100.1']), { proofs: [{ key, at: now - 31 * day }], now });
  assert.equal(expired.primaryIp, '192.168.100.200');
  const wifi = { 'Wi-Fi': [nic('192.168.1.40')] };
  const proofKey = networkKey(buildSnapshot(wifi, signals('192.168.1.40', ['192.168.1.1'])).candidates[0]);
  const otherGateway = networkKey(buildSnapshot(wifi, signals('192.168.1.40', ['192.168.1.254'])).candidates[0]);
  assert.notEqual(proofKey, otherGateway);
});

test('the candidate id is the adapter plus the subnet', () => {
  const snapshot = buildSnapshot(home(), signals('192.168.100.200', ['192.168.100.1']));
  assert.equal(pick(snapshot, '192.168.0.10').id, 'Ethernet|192.168.0.0/24');
  assert.equal(pick(snapshot, '192.168.100.200').id, 'Ethernet|192.168.100.0/24');
});

test('a candidate without a netmask gets no gateway and does not throw', () => {
  const snapshot = buildSnapshot({ Ethernet: [{ address: '192.168.0.10', family: 'IPv4', internal: false, mac: '08:bf:b8:13:fa:7d' }] }, signals(null, ['192.168.0.1']));
  assert.equal(snapshot.selected.gateway, null);
});

test('classification by name, then MAC, then address', () => {
  const phys = '08:bf:b8:13:fa:7d';
  const table = [
    ['Ethernet', phys, 'ethernet'], ['Ethernet 2', phys, 'ethernet'], ['eth0', phys, 'ethernet'], ['en0', phys, 'ethernet'],
    ['Wi-Fi', phys, 'wifi'], ['Wi-Fi 2', phys, 'wifi'], ['wlan0', phys, 'wifi'], ['wlp3s0', phys, 'wifi'],
    ['vEthernet (WSL)', phys, 'virtual'], ['VMware Network Adapter VMnet8', phys, 'virtual'], ['VirtualBox Host-Only Network', phys, 'virtual'],
    ['vboxnet0', phys, 'virtual'], ['docker0', phys, 'virtual'], ['br-1a2b', phys, 'virtual'], ['veth1234', phys, 'virtual'],
    ['Tailscale', phys, 'vpn'], ['ZeroTier One [abc]', phys, 'vpn'], ['WireGuard Tunnel', phys, 'vpn'], ['OpenVPN TAP-Windows6', phys, 'vpn'],
    ['Kaspersky VPN', phys, 'vpn'], ['utun3', phys, 'vpn'], ['tun0', phys, 'vpn'], ['tap0', phys, 'vpn'], ['ppp0', phys, 'vpn'], ['ipsec0', phys, 'vpn'], ['wg0', phys, 'vpn'],
    ['Ethernet 3', '00:15:5d:aa:bb:cc', 'virtual'], ['Ethernet 4', '00:50:56:aa:bb:cc', 'virtual'], ['Ethernet 5', '00:0c:29:aa:bb:cc', 'virtual'],
    ['Ethernet 6', '00:05:69:aa:bb:cc', 'virtual'], ['Ethernet 7', '08:00:27:aa:bb:cc', 'virtual'], ['Ethernet 8', '00:1c:42:aa:bb:cc', 'virtual'],
    ['Ethernet 9', '02:42:ac:11:00:02', 'virtual'], ['Local Area Connection', '00:00:00:00:00:00', 'vpn'],
    ['Local Area Connection* 10', phys, 'other'], ['custom', phys, 'other'],
  ];
  for (const [name, mac, kind] of table) assert.equal(classifyInterface(name, mac, '10.0.0.2'), kind, name);
  assert.equal(classifyInterface('Local Area Connection* 10', phys, '192.168.137.1'), 'hotspot');
  assert.equal(classifyInterface('bridge100', phys, '192.168.2.1'), 'hotspot');
});

test('RFC 1918 ranges never decide the kind', () => {
  const phys = '08:bf:b8:13:fa:7d';
  for (const ip of ['192.168.56.1', '172.16.0.1', '10.0.2.2']) assert.equal(classifyInterface('Ethernet', phys, ip), 'ethernet');
});
