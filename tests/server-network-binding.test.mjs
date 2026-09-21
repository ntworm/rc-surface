// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

process.env.RC_SURFACE_PORT = '16120';

if (typeof globalThis.__dirname === 'undefined') {
  globalThis.__dirname = path.join(process.cwd(), 'dist');
}

const serverState = await import('../src/server/state.ts');

test('plaintext HTTP and WS listen only on loopback while HTTPS serves the LAN', async () => {
  await serverState.startServer();
  try {
    const httpAddress = serverState.serverInstance.address();
    const httpsAddress = serverState.httpsServerInstance.address();

    assert.equal(httpAddress.address, '127.0.0.1');
    assert.equal(httpsAddress.address, '0.0.0.0');
  } finally {
    await serverState.stopServer();
  }
});
