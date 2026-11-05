// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { provesNetwork } from '../src/server/ws.ts';
import { actualPort, serverInstance, startServer, stopServer } from '../src/server/state.ts';
import { getAdminToken, getControllerToken } from '../src/server/session-auth.ts';
import { buildSnapshot, setNetworkSnapshot } from '../src/server/lan-candidates.ts';
import { getNetworkProofs, resetNetworkSettingsForTests } from '../src/server/lan-settings.ts';
import { clearExtensionContext, setExtensionContext } from '../src/context.ts';

test('only a controller with a valid token on the performance socket proves a network', () => {
  assert.equal(provesNetwork(false, 'controller', true), true);
});

test('an admin page, a viewer or a stale token proves nothing', () => {
  const refused = [
    [true, 'admin', true],
    [true, 'controller', true],
    [false, 'admin', true],
    [false, 'viewer', true],
    [false, 'viewer', false],
    [false, 'controller', false],
  ];
  for (const [isAdminPath, role, tokenValid] of refused) {
    assert.equal(provesNetwork(isAdminPath, role, tokenValid), false, `${isAdminPath} ${role} ${tokenValid}`);
  }
});

const LOCAL = '192.168.100.200';
const REMOTE = '192.168.100.50';

/** A real server whose sockets look like a phone on the LAN: a connection
 *  from loopback proves nothing whatever its role, so it would prove nothing
 *  about the role check either. */
async function lanServer(t) {
  resetNetworkSettingsForTests();
  setExtensionContext({ application: { song: { tempo: 120, tracks: [], scenes: [] } } });
  t.after(async () => {
    await stopServer();
    clearExtensionContext();
    resetNetworkSettingsForTests();
  });
  await startServer();
  serverInstance.prependListener('connection', socket => {
    Object.defineProperty(socket, 'localAddress', { value: LOCAL, configurable: true });
    Object.defineProperty(socket, 'remoteAddress', { value: REMOTE, configurable: true });
  });
  const wired = { address: LOCAL, netmask: '255.255.255.0', mac: '08:bf:b8:13:fa:7d', family: 'IPv4', internal: false };
  setNetworkSnapshot(buildSnapshot({ Ethernet: [wired] }, { defaultRouteIp: LOCAL, gateways: ['192.168.100.1'], routeChecked: true }));
}

/** Opens a socket and waits until the server has handled the connection. */
async function connect(path) {
  const socket = new WebSocket(`ws://127.0.0.1:${actualPort}${path}`);
  await new Promise(resolve => {
    socket.once('message', resolve);
    socket.once('error', resolve);
    socket.once('close', resolve);
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  socket.terminate();
}

const proofs = () => getNetworkProofs(Date.now()).length;

test('on the real sockets only the controller writes a proof', async t => {
  await lanServer(t);
  await connect(`/admin/ws?token=${getAdminToken()}`);
  assert.equal(proofs(), 0, 'admin page');
  await connect(`/ws?token=${getAdminToken()}`);
  assert.equal(proofs(), 0, 'admin token on the performance socket');
  await connect('/ws');
  assert.equal(proofs(), 0, 'viewer');
  await connect('/ws?token=stale-token');
  assert.equal(proofs(), 0, 'stale token');
  await connect(`/ws?token=${getControllerToken()}`);
  assert.equal(proofs(), 1, 'controller');
});
