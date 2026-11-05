// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanWatcher, parseMacRoutes, parseWindowsRoutes, readRouteGateways } from '../src/server/lan-probe.js';

// Real output of this PC on 30/10/2026: one adapter with two addresses, so the
// Interface column names the wrong one.
const WINDOWS_ROUTES = `===========================================================================
Interface List
  5...........................Tailscale Tunnel
 12...08 bf b8 13 fa 7d ......Realtek Gaming 2.5GbE Family Controller
===========================================================================

IPv4 Route Table
===========================================================================
Active Routes:
Network Destination        Netmask          Gateway       Interface  Metric
          0.0.0.0          0.0.0.0    192.168.100.1     192.168.0.10     75
        127.0.0.0        255.0.0.0         On-link         127.0.0.1    331
      192.168.0.0    255.255.255.0         On-link      192.168.0.10    281
===========================================================================
Persistent Routes:
  Network Address          Netmask  Gateway Address  Metric
          0.0.0.0          0.0.0.0    192.168.100.1      50
===========================================================================`;

const WINDOWS_PT = `Tabela de rotas IPv4
Rotas Ativas:
Endere\xE7o de rede       M\xE1scara de rede    Gateway        Interface  M\xE9trica
          0.0.0.0          0.0.0.0      192.168.1.1     192.168.1.40     35
          0.0.0.0          0.0.0.0         No link     192.168.137.1    331
          0.0.0.0          0.0.0.0       10.0.0.254         10.0.0.5     50
`;

const MAC_ROUTES = `Routing tables

Internet:
Destination        Gateway            Flags               Netif Expire
default            192.168.1.1        UGScg                 en0
default            10.8.0.1           UGScIg              utun3
default            link#18            UCSIg             bridge100
127                127.0.0.1          UCS                   lo0
192.168.1          link#6             UCS                   en0      !
`;

test('Windows: reads only the gateway column of default routes, once per gateway', () => {
  assert.deepEqual([...parseWindowsRoutes(WINDOWS_ROUTES)], ['192.168.100.1']);
});

test('Windows: localized headers and non numeric gateways are ignored without error', () => {
  assert.deepEqual([...parseWindowsRoutes(WINDOWS_PT)], ['192.168.1.1', '10.0.0.254']);
  assert.deepEqual([...parseWindowsRoutes('')], []);
  assert.deepEqual([...parseWindowsRoutes('garbage 0.0.0.0\n0.0.0.0 0.0.0.0\n')], []);
});

test('macOS: default rows give numeric gateways and link rows are ignored', () => {
  assert.deepEqual([...parseMacRoutes(MAC_ROUTES)], ['192.168.1.1', '10.8.0.1']);
  assert.deepEqual([...parseMacRoutes('')], []);
});

test('readRouteGateways runs a fixed argv with no shell and a 2 s limit', async () => {
  const calls = [];
  const run = async (file, args, options) => {
    calls.push({ file, args, options });
    return WINDOWS_ROUTES;
  };
  assert.deepEqual(await readRouteGateways({ platform: 'win32', run }), { gateways: ['192.168.100.1'], routeChecked: true });
  assert.deepEqual(calls[0].file, 'route');
  assert.deepEqual(calls[0].args, ['print', '-4']);
  assert.equal(calls[0].options.timeout, 2000);
  assert.ok(!calls[0].options.shell);
  assert.equal(calls[0].options.windowsHide, true);
  calls.length = 0;
  await readRouteGateways({ platform: 'darwin', run: async (file, args, options) => { calls.push({ file, args, options }); return MAC_ROUTES; } });
  assert.equal(calls[0].file, 'netstat');
  assert.deepEqual(calls[0].args, ['-rn', '-f', 'inet']);
});

test('a failed route read, or no way to run it, reports unchecked and never throws', async () => {
  const failed = await readRouteGateways({ platform: 'win32', run: async () => { throw new Error('ENOENT'); } });
  assert.deepEqual(failed, { gateways: [], routeChecked: false });
  const unavailable = await readRouteGateways({ platform: 'win32', run: null });
  assert.deepEqual(unavailable, { gateways: [], routeChecked: false });
  const other = await readRouteGateways({ platform: 'linux', run: async () => 'x' });
  assert.deepEqual(other, { gateways: [], routeChecked: false });
});

function harness() {
  const timers = [];
  const state = { interfaces: { Ethernet: [] }, udp: '192.168.100.200', routeCalls: 0, updates: [] };
  const watcher = createLanWatcher({
    readInterfaces: () => state.interfaces,
    probeUdp: async () => state.udp,
    readRoutes: async () => { state.routeCalls++; return { gateways: ['192.168.100.1'], routeChecked: true }; },
    onUpdate: update => state.updates.push(update),
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: id => { timers[id - 1].cleared = true; },
  });
  const tick = async () => {
    const timer = timers.filter(entry => !entry.cleared && !entry.fired).at(-1);
    assert.equal(timer.ms, 5000);
    timer.fired = true;
    await timer.fn();
  };
  return { state, watcher, tick, timers };
}

test('start refreshes once; a stable network spawns nothing for 30 s of ticks', async () => {
  const { state, watcher, tick } = harness();
  await watcher.start();
  assert.equal(state.routeCalls, 1);
  assert.equal(state.updates.length, 1);
  for (let i = 0; i < 6; i++) await tick();
  assert.equal(state.routeCalls, 1);
  assert.equal(state.updates.length, 1);
  watcher.stop();
});

test('one differing reading is ignored; two equal new readings refresh once', async () => {
  const { state, watcher, tick } = harness();
  await watcher.start();
  state.udp = '10.0.0.5';
  await tick();
  assert.equal(state.routeCalls, 1);
  state.udp = '192.168.100.200';
  await tick();
  assert.equal(state.routeCalls, 1);
  state.udp = '10.0.0.5';
  await tick();
  await tick();
  assert.equal(state.routeCalls, 2);
  await tick();
  assert.equal(state.routeCalls, 2);
  watcher.stop();
});

test('a changed adapter list also needs two readings', async () => {
  const { state, watcher, tick } = harness();
  await watcher.start();
  state.interfaces = { Ethernet: [], 'Wi-Fi': [] };
  await tick();
  assert.equal(state.routeCalls, 1);
  await tick();
  assert.equal(state.routeCalls, 2);
  watcher.stop();
});

test('refresh forces a new reading at once, and stop cancels the timer', async () => {
  const { state, watcher, timers } = harness();
  await watcher.start();
  await watcher.refresh();
  assert.equal(state.routeCalls, 2);
  assert.equal(state.updates.length, 2);
  watcher.stop();
  assert.equal(timers.filter(entry => !entry.cleared && !entry.fired).length, 0);
});

test('a probe failure is a null reading, not a crash', async () => {
  const timers = [];
  const updates = [];
  const watcher = createLanWatcher({
    readInterfaces: () => ({}),
    probeUdp: async () => { throw new Error('ENETUNREACH'); },
    readRoutes: async () => ({ gateways: [], routeChecked: false }),
    onUpdate: update => updates.push(update),
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => {},
  });
  await watcher.start();
  assert.equal(updates[0].signals.defaultRouteIp, null);
  assert.deepEqual([...updates[0].signals.gateways], []);
  assert.equal(updates[0].signals.routeChecked, false);
  watcher.stop();
});
