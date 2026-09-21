import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { isolatedModule, deferred, settle } from './helpers/isolated-module.mjs';

function harness({ tls = false, manualListen = false, manualClose = false } = {}) {
  const certs = [], servers = [], closed = [];
  let rotations = 0;
  class Server extends EventEmitter {
    active = false;
    listen(port) {
      this.port = port;
      if (!manualListen) queueMicrotask(() => this.bound());
    }
    bound() { this.active = true; this.emit('listening'); }
    address() { return this.active ? { port: this.port } : null; }
    closeAllConnections() {}
    close(callback) {
      const finish = () => { this.active = false; callback(); };
      if (manualClose) closed.push(finish); else finish();
    }
  }
  const createServer = () => { const server = new Server(); servers.push(server); return server; };
  const api = isolatedModule('src/server/state.ts', {
    http: { createServer }, https: { createServer }, process: { env: {} },
    useHttps: tls, httpsOptions: tls ? {} : null,
    loadCerts() { const gate = deferred(); certs.push(gate); return gate.promise; },
    regenerateTokens() { rotations++; },
    handleHttp() {}, handleUpgrade() {}, wssInit() {}, stopAllWsClients() {}, getLanAddresses: () => [],
  });
  return { api, certs, servers, closed, rotations: () => rotations };
}

test('overlapping starts share one initialization and Stop closes every listener', async () => {
  const h = harness();
  const starts = [h.api.startServer(), h.api.startServer()];
  await settle();
  for (const cert of h.certs) cert.resolve();
  await Promise.all(starts);
  await h.api.stopServer();
  assert.equal(h.certs.length, 1);
  assert.equal(h.rotations(), 1);
  assert.equal(h.servers.length, 1);
  assert.equal(h.servers.filter((s) => s.active).length, 0);
});

test('Stop during certificate loading prevents a late listener', async () => {
  const h = harness();
  const starting = h.api.startServer();
  await settle();
  const stopping = h.api.stopServer();
  h.certs[0].resolve();
  await Promise.all([starting, stopping]);
  assert.equal(h.servers.length, 0);
  assert.equal(h.api.serverInstance, null);
  assert.equal(h.api.actualPort, null);
});

for (const phase of ['HTTP', 'HTTPS']) {
  test(`Stop during ${phase} bind cannot publish or leave a listening socket`, async () => {
    const h = harness({ tls: true, manualListen: true });
    const starting = h.api.startServer();
    await settle();
    h.certs[0].resolve();
    await settle();
    if (phase === 'HTTPS') { h.servers[0].bound(); await settle(); }
    const stopping = h.api.stopServer();
    h.servers[phase === 'HTTPS' ? 1 : 0].bound();
    await settle();
    // Legacy code attempts HTTPS even after a cancelled HTTP bind.
    if (phase === 'HTTP' && h.servers[1]?.listenerCount('listening')) h.servers[1].bound();
    await Promise.all([starting, stopping]);
    assert.equal(h.servers.filter((s) => s.active).length, 0);
    assert.equal(h.api.serverInstance, null);
    assert.equal(h.api.httpsServerInstance, null);
    assert.equal(h.api.actualHttpsPort, null);
  });
}

test('Start waits for the preceding Stop to finish closing sockets', async () => {
  const h = harness({ manualClose: true });
  const first = h.api.startServer();
  await settle(); h.certs[0].resolve(); await first;
  const stopping = h.api.stopServer();
  const next = h.api.startServer();
  await settle();
  const initializationsBeforeClose = h.certs.length;
  h.closed.shift()();
  await stopping; await settle();
  h.certs[1].resolve(); await next;
  assert.equal(initializationsBeforeClose, 1);
  const cleanup = h.api.stopServer();
  h.closed.shift()(); await cleanup;
  assert.equal(h.servers.filter((s) => s.active).length, 0);
});

test('a rejected initialization allows a clean retry', async () => {
  const h = harness();
  const first = h.api.startServer();
  await settle(); h.certs[0].reject(new Error('certificate unavailable'));
  await assert.rejects(first, /certificate unavailable/);
  const next = h.api.startServer();
  await settle(); h.certs[1].resolve(); await next;
  assert.equal(h.servers.length, 1);
  await h.api.stopServer();
});

test('a runtime error closes the owned listeners and a late error cannot stop the replacement', async () => {
  const h = harness({ tls: true });
  const first = h.api.startServer();
  await settle(); h.certs[0].resolve(); await first;
  const old = h.servers[0];
  old.emit('error', new Error('runtime failure')); await settle();
  assert.equal(h.servers.filter((s) => s.active).length, 0);
  const next = h.api.startServer();
  await settle(); h.certs[1].resolve(); await next;
  const replacement = h.api.serverInstance;
  old.emit('error', new Error('obsolete error')); await settle();
  assert.equal(h.api.serverInstance, replacement);
  assert.equal(h.servers.filter((s) => s.active).length, 2);
  await h.api.stopServer();
});

test('a second Stop cancels a Start queued behind the first Stop', async () => {
  const h = harness({ manualClose: true });
  const first = h.api.startServer();
  await settle(); h.certs[0].resolve(); await first;
  const stopping = h.api.stopServer();
  const next = h.api.startServer();
  const stopAgain = h.api.stopServer();
  h.closed.shift()();
  await Promise.all([stopping, next, stopAgain]);
  assert.equal(h.certs.length, 1);
  assert.equal(h.api.serverInstance, null);
});
