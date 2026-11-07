// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
//
// The place where a phone or a computer gets the certificate authority.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as http from 'node:http';

import { createCaDownloadListener } from '../src/server/ca-download.ts';

/** The bytes of a certificate, as the phone receives them. */
const CA_DER = Buffer.from(
  '308201470100300d0603551d250401046d04013b020101301e06092a864886f70d0101010500',
  'hex',
);

/** The port the page points the phone at. */
const HTTPS_PORT = 8731;

async function withServer(getCaDer, run) {
  const server = http.createServer(createCaDownloadListener(getCaDer, HTTPS_PORT));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address();
  try {
    await run(port);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

function request(port, path, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

test('the certificate of the authority is served as a file', async () => {
  await withServer(
    () => CA_DER,
    async (port) => {
      const response = await request(port, '/ca.crt');
      assert.equal(response.status, 200);
      assert.equal(response.headers['content-type'], 'application/x-x509-ca-cert');
      assert.equal(
        response.headers['content-disposition'],
        'attachment; filename="RC-Surface-CA.crt"',
      );
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.deepEqual(response.body, CA_DER);
    },
  );
});

test('the page says where to put the certificate, in the language of the phone', async () => {
  await withServer(
    () => CA_DER,
    async (port) => {
      const portuguese = await request(port, '/ca', {
        headers: { 'accept-language': 'pt-BR,pt;q=0.9', host: 'rc-surface.local' },
      });
      assert.equal(portuguese.status, 200);
      assert.equal(portuguese.headers['content-type'], 'text/html; charset=utf-8');
      const pt = portuguese.body.toString('utf8');
      assert.match(pt, /href="\/ca\.crt"/, 'the file must be one click away');
      assert.match(
        pt,
        /https:\/\/rc-surface\.local:8731\/"/,
        'the link back must carry the name of the computer',
      );
      assert.match(pt, /Configurações de Confiança de Certificados/, 'the page is in Portuguese');
      assert.match(pt, /Instalar um certificado/, 'the Android steps must be there');
      assert.match(
        pt,
        /Não abra o arquivo pela notificação/,
        'Android refuses a CA certificate opened from the download, so the page says so first',
      );
      assert.match(pt, /Autoridades de Certificação Raiz Confiáveis/, 'the Windows steps');
      assert.match(pt, /Sempre Confiar/, 'the Mac steps');
      assert.match(pt, /só vale para localhost e endereços privados da rede/, 'the limit');

      const english = await request(port, '/ca/', {
        headers: { 'accept-language': 'en-US,en;q=0.9', host: 'rc-surface.local' },
      });
      assert.equal(english.status, 200);
      const en = english.body.toString('utf8');
      assert.match(en, /Certificate Trust Settings/, 'the page is in English');
      assert.match(en, /Encryption and credentials/, 'the Android steps must be there');
      assert.match(en, /Can&#39;t install CA certificates/, 'the Android refusal, escaped');
      assert.match(en, /Trusted Root Certification Authorities/, 'the Windows steps');
      assert.match(en, /Always Trust/, 'the Mac steps');
      assert.match(en, /https:\/\/rc-surface\.local:8731\/"/);

      const page = pt;
      assert.doesNotMatch(page, /<script/i, 'the page must carry no script');
      assert.doesNotMatch(page, /<link/i, 'the page must carry no stylesheet of its own');
      assert.doesNotMatch(page, /https?:\/\/[^"']*\.(?:css|js|png|jpg)/i, 'no outside resource');
    },
  );
});

test('nothing else is answered', async () => {
  await withServer(
    () => CA_DER,
    async (port) => {
      assert.equal((await request(port, '/')).status, 404);
      assert.equal((await request(port, '/static/panel/index.html')).status, 404);
      assert.equal((await request(port, '/ca.crt', { method: 'POST' })).status, 404);
      assert.equal((await request(port, '/ca', { method: 'POST' })).status, 404);
    },
  );
});

test('without an authority there is nothing to hand over', async () => {
  await withServer(
    () => null,
    async (port) => {
      assert.equal((await request(port, '/ca.crt')).status, 404);
      assert.equal((await request(port, '/ca')).status, 404);
    },
  );
});
