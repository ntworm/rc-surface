// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
//
// The authority of this computer: a real certificate authority that says
// what it may sign for, and a certificate of the server that chains to it.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { X509Certificate, generateKeyPairSync } from 'node:crypto';

import {
  CA_NAME_CONSTRAINTS_DER,
  isIssuedByCa,
  isPermittedServerIp,
  issueServerCertificate,
  loadOrCreateLocalCa,
} from '../src/server/local-ca.ts';

const temporaryDir = () => fs.mkdtempSync(path.join(tmpdir(), 'rc-surface-local-ca-'));
const removeDir = (dir) => fs.rmSync(dir, { recursive: true, force: true });

/**
 * The name constraints extension, as it is written in the certificate.
 *
 * The extension is the OID of the name constraints, the critical flag and
 * the octet string that carries the bytes: the bytes themselves are what
 * the test looks for.
 */
function nameConstraints(raw) {
  const index = raw.indexOf(CA_NAME_CONSTRAINTS_DER);
  assert.notEqual(index, -1, 'the name constraints must be there with the exact bytes');
  const before = raw.subarray(Math.max(0, index - 8), index);
  assert.ok(
    before.includes(Buffer.from([0x01, 0x01, 0xff])),
    'the name constraints must be critical',
  );
}

function serverKeyPem() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return privateKey.export({ type: 'pkcs8', format: 'pem' });
}

test('the authority is a CA that says what it may sign for', async () => {
  const dir = temporaryDir();
  try {
    const ca = await loadOrCreateLocalCa(dir);
    assert.ok(ca, 'the authority must be made');
    const cert = new X509Certificate(ca.certPem);
    assert.equal(cert.ca, true, 'the certificate must be a certificate authority');
    nameConstraints(cert.raw);
  } finally {
    removeDir(dir);
  }
});

test('the certificate of the server chains to the authority', async () => {
  const dir = temporaryDir();
  try {
    const ca = await loadOrCreateLocalCa(dir);
    assert.ok(ca);
    const leaf = await issueServerCertificate(ca, serverKeyPem(), [
      '127.0.0.1',
      '192.168.100.16',
      '169.254.83.107',
      '8.8.8.8',
    ]);
    assert.ok(leaf, 'the certificate must be signed');
    assert.equal(isIssuedByCa(leaf, ca.certPem), true, 'the authority must have signed it');
    const names = new X509Certificate(leaf).subjectAltName ?? '';
    assert.match(names, /localhost/, 'localhost must be named');
    assert.match(names, /192\.168\.100\.16/, 'the private address must be named');
    assert.match(names, /169\.254\.83\.107/, 'the link-local address must be named');
    assert.doesNotMatch(names, /8\.8\.8\.8/, 'the authority may not sign for a public address');
  } finally {
    removeDir(dir);
  }
});

test('the authority is made once and is made again when the files are broken', async () => {
  const dir = temporaryDir();
  try {
    const first = await loadOrCreateLocalCa(dir);
    assert.ok(first);
    const second = await loadOrCreateLocalCa(dir);
    assert.equal(second.certPem, first.certPem, 'the authority must be kept');
    assert.equal(second.keyPem, first.keyPem, 'the key of the authority must be kept');

    fs.writeFileSync(path.join(dir, 'rc-surface-local-ca.crt'), 'not a certificate');
    fs.writeFileSync(path.join(dir, 'rc-surface-local-ca.key'), 'not a key');
    const third = await loadOrCreateLocalCa(dir);
    assert.ok(third, 'a new authority must be made');
    assert.notEqual(third.certPem, first.certPem, 'a broken file is no authority');
  } finally {
    removeDir(dir);
  }
});

test('only the loopback, the private addresses and the link-local ones may be signed for', () => {
  assert.equal(isPermittedServerIp('127.0.0.1'), true);
  assert.equal(isPermittedServerIp('10.1.2.3'), true);
  assert.equal(isPermittedServerIp('172.16.0.1'), true);
  assert.equal(isPermittedServerIp('172.31.255.255'), true);
  assert.equal(isPermittedServerIp('192.168.0.1'), true);
  assert.equal(isPermittedServerIp('169.254.83.107'), true);
  assert.equal(isPermittedServerIp('8.8.8.8'), false);
  assert.equal(isPermittedServerIp('172.32.0.1'), false);
  assert.equal(isPermittedServerIp('192.169.0.1'), false);
  assert.equal(isPermittedServerIp('localhost'), false);
});
