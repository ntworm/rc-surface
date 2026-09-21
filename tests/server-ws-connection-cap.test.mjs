// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import path from 'node:path';
import { MAX_WS_CONNECTIONS_PER_IP } from '../src/server/ws-bounds.ts';

process.env.RC_SURFACE_PORT = '16122';
if (typeof globalThis.__dirname === 'undefined') {
  globalThis.__dirname = path.join(process.cwd(), 'dist');
}
const serverState = await import('../src/server/state.ts');

function openSocket(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

test('server refuses a WebSocket above the per-IP cap and recovers after close', async () => {
  await serverState.startServer();
  const sockets = [];
  try {
    for (let i = 0; i < MAX_WS_CONNECTIONS_PER_IP; i++) {
      sockets.push(await openSocket(serverState.actualPort));
    }

    await assert.rejects(
      openSocket(serverState.actualPort),
      /socket hang up|unexpected server response|closed before open/i,
    );

    const released = sockets.pop();
    await new Promise((resolve) => {
      released.once('close', resolve);
      released.close();
    });

    sockets.push(await openSocket(serverState.actualPort));
  } finally {
    for (const ws of sockets) ws.terminate();
    await serverState.stopServer();
  }
});
