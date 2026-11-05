// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMAND_SIDE_EFFECTS, isRoleAuthorized } from '../src/server/command-dispatch.ts';
import { buildNetworkInfo, networkCommands } from '../src/live/network-commands.ts';

const NAMES = ['getNetworkInfo', 'setNetworkChoice', 'runNetworkCheck', 'startNetworkSearch', 'stopNetworkSearch', 'nextNetworkAddress'];

test('the six network commands exist and only an admin may call them', () => {
  assert.deepEqual(Object.keys(networkCommands).sort(), [...NAMES].sort());
  for (const name of NAMES) {
    assert.equal(COMMAND_SIDE_EFFECTS[name], 'server-admin', name);
    assert.equal(isRoleAuthorized('viewer', COMMAND_SIDE_EFFECTS[name]), false, name);
    assert.equal(isRoleAuthorized('controller', COMMAND_SIDE_EFFECTS[name]), false, name);
    assert.equal(isRoleAuthorized('admin', COMMAND_SIDE_EFFECTS[name]), true, name);
  }
});

const published = {
  primaryIp: '192.168.100.200',
  otherIps: ['192.168.0.10'],
  certificatePending: false,
  network: { mode: 'auto', pinMissing: false, ambiguous: false, needsPublicChoice: false, certificatePending: false, certificateFailed: false, candidates: [] },
};
const server = { isRunning: true, httpPort: 8730, httpsPort: 8731, useHttps: true };
const tokens = { controllerToken: 'c0ntr0l', adminToken: 'adm1n' };
const info = overrides => buildNetworkInfo({ published, search: null, check: null, server, tokens, locale: 'pt-BR', ...overrides });
const view = overrides => ({ state: 'running', ip: '192.168.0.10', position: 2, total: 3, deadline: 5000, skipped: [], ...overrides });

test('without a search the info carries the published address and no search', () => {
  const result = info();
  assert.equal(result.primaryIp, '192.168.100.200');
  assert.deepEqual(result.otherIps, ['192.168.0.10']);
  assert.equal(result.phoneUrl, 'https://192.168.100.200:8731/?token=c0ntr0l&lang=pt-BR');
  assert.equal(result.search, null);
  assert.equal(result.check, null);
  assert.equal(result.isRunning, true);
  assert.equal(result.httpsPort, 8731);
  assert.equal(result.network, published.network);
});

test('during a search only search.phoneUrl names the candidate, in the current language', () => {
  const result = info({ search: view() });
  assert.equal(result.search.phoneUrl, 'https://192.168.0.10:8731/?token=c0ntr0l&lang=pt-BR');
  assert.equal(result.phoneUrl, 'https://192.168.100.200:8731/?token=c0ntr0l&lang=pt-BR');
  assert.equal(result.primaryIp, '192.168.100.200');
  assert.equal(result.search.position, 2);
  assert.equal(result.search.total, 3);
  assert.equal(result.search.deadline, 5000);
  assert.equal(info({ search: view(), locale: 'en' }).search.phoneUrl, 'https://192.168.0.10:8731/?token=c0ntr0l&lang=en');
});

test('a search that has no certificate yet, or is over, has no QR', () => {
  for (const state of ['preparing', 'exhausted', 'proved']) {
    assert.equal(info({ search: view({ state }) }).search.phoneUrl, null, state);
  }
  assert.ok(info({ search: view({ state: 'arrived' }) }).search.phoneUrl);
});

test('HTTPS off leaves every phone URL empty', () => {
  const result = info({ search: view(), server: { ...server, httpsPort: null } });
  assert.equal(result.phoneUrl, null);
  assert.equal(result.search.phoneUrl, null);
});

test('the choice command refuses an unknown candidate', async () => {
  await assert.rejects(networkCommands.setNetworkChoice.handler({ mode: 'pinned', id: 'nobody|10.0.0.0/8' }, {}));
});

test('next is refused when nothing is being searched', async () => {
  await assert.rejects(networkCommands.nextNetworkAddress.handler({}, {}));
});
