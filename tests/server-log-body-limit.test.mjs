// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import test from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import path from 'node:path';

process.env.RC_SURFACE_PORT = '16118';

if (typeof globalThis.__dirname === 'undefined') {
  globalThis.__dirname = path.join(process.cwd(), 'dist');
}

const serverState = await import('../src/server/state.ts');

let port;
test.before(async () => {
  await serverState.startServer();
  port = serverState.actualPort;
});

test.after(async () => {
  await serverState.stopServer();
});

test('POST /log rejects an oversized body instead of buffering it', async () => {
  const statusCode = await new Promise((resolve, reject) => {
    const body = Buffer.alloc(65 * 1024, 0x61);
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/log',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': body.length,
      },
    }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('request timeout')));
    req.end(body);
  });

  assert.equal(statusCode, 413);
});

test('POST /log enforces the same limit for chunked bodies', async () => {
  const statusCode = await new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/log',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('request timeout')));
    req.write(Buffer.alloc(40 * 1024, 0x61));
    req.end(Buffer.alloc(40 * 1024, 0x62));
  });

  assert.equal(statusCode, 413);
});
