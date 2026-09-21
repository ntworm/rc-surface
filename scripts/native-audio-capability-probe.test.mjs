// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { startCapabilityProbe } from './native-audio-capability-probe.mjs';
import { stageNativeDevice } from './build-audio-descriptors.mjs';
import { makeExchange, ids } from '../tests/helpers/native-audio-fixtures.mjs';

test('Max entry registers its handlers when required by a runner, not only as the main module', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-native-entry-'));
  try {
    await stageNativeDevice(dir);
    const handlers = new Map(), messages = [];
    const maxApi = { addHandler: (name, fn) => handlers.set(name, fn), post: value => messages.push(value), outlet() {} };
    const load = createRequire(path.join(dir, 'rc-bridge.cjs'));
    const entryRequire = name => name === 'max-api' ? maxApi : load(name);
    entryRequire.main = { id: 'external-runner' };
    vm.runInNewContext(await fs.readFile(path.join(dir, 'rc-bridge.cjs'), 'utf8'), {
      require: entryRequire, module: { exports: {} }, process,
    });
    assert.deepEqual([...handlers.keys()].sort(), ['connect', 'identity', 'nonce', 'stop']);
    assert.ok(messages.some(s => s.includes('Node ' + process.versions.node)));
    handlers.get('stop')();
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('isolated probe accepts authenticated contract only, never browser origins or forged epochs', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-native-probe-'));
  const privateDir = path.join(dir, 'private');
  let probe;
  try {
    probe = await startCapabilityProbe({ privateDir });
    const rendezvous = JSON.parse(await fs.readFile(path.join(privateDir, 'bridge.json'), 'utf8'));
    assert.equal(rendezvous.port, probe.port); assert.equal(rendezvous.host, '127.0.0.1');
    const url = 'http://127.0.0.1:' + probe.port + '/native-audio/probe';
    const body = makeExchange({ hostEpoch: rendezvous.hostEpoch });
    body.frame.hostEpoch = rendezvous.hostEpoch;
    // Raw HTTP is necessary: fetch replaces Host and cannot exercise spoofing.
    const send = (value = body, headers = {}, route = url) => new Promise((resolve, reject) => {
      const raw = typeof value === 'string' ? value : JSON.stringify(value);
      const request = http.request(route, { method: 'POST', headers: {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw),
        Authorization: 'Bearer ' + rendezvous.token, ...headers,
      } }, response => {
        const chunks = []; response.on('data', c => chunks.push(c));
        response.on('end', () => resolve({ status: response.statusCode,
          json: async () => JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
      });
      request.on('error', reject); request.end(raw);
    });
    assert.equal((await send()).status, 200);
    assert.equal((await send(body, { Authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await send(body, { Origin: 'http://localhost' })).status, 403);
    assert.equal((await send(body, { Host: 'example.invalid' })).status, 403);
    assert.equal((await send(makeExchange())).status, 400);
    assert.equal((await send({ ...body, privateToken: 'hidden' })).status, 400);
    assert.equal((await send('x'.repeat(17000))).status, 413);
    assert.equal((await send(body, {}, url + '/extra')).status, 404);
    await assert.rejects(() => startCapabilityProbe({ privateDir }), /probe_directory_exists/);
    const identityOnly = { version: 1, hostEpoch: rendezvous.hostEpoch, instanceId: ids.instance, pairNonce: 12345678 };
    const reply = await (await send(identityOnly)).json();
    assert.equal(reply.acceptedSeq, null); assert.equal(reply.version, 1);
    await probe.stop(); probe = null;
    await assert.rejects(fs.access(path.join(privateDir, 'bridge.json')));
  } finally { if (probe) await probe.stop(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('Node companion uses same decoder, handshake without audio or parameter writes, bounded pending request', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-native-client-'));
  let probe;
  try {
    probe = await startCapabilityProbe({ privateDir: path.join(dir, 'private') });
    await stageNativeDevice(dir);
    const { createProbeClient } = createRequire(import.meta.url)(path.join(dir, 'rc-probe-client.cjs'));
    const output = [];
    const client = createProbeClient({ outlet: (...args) => output.push(args) });
    client.identity(ids.device, ids.instance);
    await client.connect(path.join(dir, 'private', 'bridge.json'));
    assert.ok(output.some(e => e[0] === 'pairnonce' && Number.isInteger(e[1]) && e[1] < 16777216));
    await client.ping();
    assert.ok(output.some(e => e[0] === 'status' && e[1] === 'probe_connected'));
    const connected = () => output.filter(e => e[0] === 'status' && e[1] === 'probe_connected').length;
    const before = connected();
    client.nonce(16777215); await Promise.all([client.ping(), client.ping(), client.ping()]);
    assert.equal(connected(), before + 1, 'concurrent heartbeats must share one in-flight request');
    client.stop();
    const count = output.length; await client.ping(); assert.equal(output.length, count);
    await assert.rejects(client.connect(path.join(dir, 'missing.json')));
  } finally { if (probe) await probe.stop(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('Node companion rejects malformed rendezvous before any network request', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-native-rendezvous-'));
  try {
    await stageNativeDevice(dir);
    const { createProbeClient } = createRequire(import.meta.url)(path.join(dir, 'rc-probe-client.cjs'));
    const client = createProbeClient({ outlet() {} });
    const valid = { version: 1, kind: 'rc-native-capability-probe', host: '127.0.0.1',
      port: 50000, hostEpoch: ids.epoch, token: 'a'.repeat(64) };
    const file = path.join(dir, 'invalid.json');
    for (const patch of [{ version: 2 }, { kind: 'production' }, { host: 'example.invalid' },
      { port: 0 }, { port: 65536 }, { port: '50000' }, { token: 'short' },
      { token: null }, { hostEpoch: 'bad' }]) {
      await fs.writeFile(file, JSON.stringify({ ...valid, ...patch }));
      await assert.rejects(client.connect(file), /invalid_probe_file/);
    }
    await fs.writeFile(file, JSON.stringify({ ...valid, padding: 'x'.repeat(2048) }));
    await assert.rejects(client.connect(file), /invalid_probe_file/);
    await assert.rejects(client.connect('relative.json'), /invalid_probe_file/);
    client.stop();
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
