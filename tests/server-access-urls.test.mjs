// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServerAccessUrls } from '../src/server/access-urls.ts';

test('LAN controller credentials are exposed only through HTTPS', () => {
  const withoutTls = buildServerAccessUrls({
    isRunning: true,
    httpPort: 8730,
    httpsPort: null,
    primaryIp: '192.168.1.50',
    controllerToken: 'controller-secret',
    adminToken: 'admin-secret',
  });

  assert.equal(withoutTls.phoneUrl, null, 'never fall back to a token-bearing HTTP LAN URL');
  assert.equal(
    withoutTls.adminUrl,
    'http://127.0.0.1:8730/static/admin/?token=admin-secret',
    'the local admin surface may use loopback HTTP',
  );

  const withTls = buildServerAccessUrls({
    isRunning: true,
    httpPort: 8730,
    httpsPort: 8731,
    primaryIp: '192.168.1.50',
    controllerToken: 'controller-secret',
    adminToken: 'admin-secret',
  });

  assert.equal(
    withTls.phoneUrl,
    'https://192.168.1.50:8731/?token=controller-secret',
  );
  assert.equal(withTls.adminUrl, withoutTls.adminUrl);
});
