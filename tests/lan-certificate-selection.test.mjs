// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import selfsigned from 'selfsigned';
import { certifiedLanSelection, buildSubjectAltNames } from '../src/server/cert.js';

test('a newly appeared interface is not advertised until the certificate covers it', async () => {
  const { cert } = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
    keySize: 2048, extensions: [{ name: 'subjectAltName', altNames: buildSubjectAltNames(['10.0.1.5']) }],
  });
  assert.deepEqual(certifiedLanSelection({ primary: '192.168.1.2', others: ['10.0.1.5'] }, cert), {
    primary: '10.0.1.5', others: [],
  });
  assert.deepEqual(certifiedLanSelection({ primary: '192.168.1.2', others: [] }, cert), {
    primary: '127.0.0.1', others: [],
  });
});
