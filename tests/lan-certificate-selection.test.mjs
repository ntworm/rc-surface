// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import selfsigned from 'selfsigned';
import { buildSubjectAltNames, certCoversRequiredAltNames } from '../src/server/cert.js';

test('a newly appeared interface is not advertised until the certificate covers it', async () => {
  const { cert } = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
    keySize: 2048, extensions: [{ name: 'subjectAltName', altNames: buildSubjectAltNames(['10.0.1.5']) }],
  });
  assert.equal(certCoversRequiredAltNames(cert, ['10.0.1.5']), true);
  assert.equal(certCoversRequiredAltNames(cert, ['192.168.1.2']), false);
});
