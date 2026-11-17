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
import { X509Certificate, createPublicKey, generateKeyPairSync } from 'node:crypto';
import {
  BasicConstraintsExtension,
  KeyUsageFlags,
  KeyUsagesExtension,
  X509CertificateGenerator,
} from '@peculiar/x509';

import {
  CA_COMMON_NAME,
  CA_NAME_CONSTRAINTS_DER,
  isIssuedByCa,
  isPermittedServerIp,
  issueServerCertificate,
  loadOrCreateLocalCa,
} from '../src/server/local-ca.ts';

const temporaryDir = () => fs.mkdtempSync(path.join(tmpdir(), 'rc-surface-local-ca-'));
const removeDir = (dir) => fs.rmSync(dir, { recursive: true, force: true });

/** The milliseconds of a day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The bytes of a PEM text. */
const derOf = (pem) =>
  Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');

/**
 * An authority with the validity we choose: the days it has left before it
 * ends. A negative number is an authority that has already ended.
 */
async function authorityEndingIn(days) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  const publicPem = createPublicKey(keyPem).export({ type: 'spki', format: 'pem' }).toString();
  const keys = {
    privateKey: await crypto.subtle.importKey('pkcs8', derOf(keyPem), algorithm, false, ['sign']),
    publicKey: await crypto.subtle.importKey('spki', derOf(publicPem), algorithm, true, ['verify']),
  };
  const notBefore = new Date(Date.now() - 2 * DAY_MS);
  const certificate = await X509CertificateGenerator.createSelfSigned({
    name: [{ CN: [CA_COMMON_NAME] }],
    keys,
    notBefore,
    notAfter: new Date(Date.now() + days * DAY_MS),
    signingAlgorithm: algorithm,
    extensions: [
      new BasicConstraintsExtension(true, 0, true),
      new KeyUsagesExtension(KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign, true),
    ],
  });
  return { certPem: certificate.toString('pem'), keyPem };
}

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

test('an authority that has ended is not used again', async () => {
  const dir = temporaryDir();
  try {
    const ended = await authorityEndingIn(-1);
    fs.writeFileSync(path.join(dir, 'rc-surface-local-ca.crt'), ended.certPem);
    fs.writeFileSync(path.join(dir, 'rc-surface-local-ca.key'), ended.keyPem);

    const ca = await loadOrCreateLocalCa(dir);

    assert.ok(ca, 'an authority must be made');
    assert.notEqual(ca.certPem, ended.certPem, 'the authority that ended must not be kept');
    assert.ok(new X509Certificate(ca.certPem).validToDate.getTime() > Date.now(),
      'the new authority still has time on it');
  } finally {
    removeDir(dir);
  }
});

test('an authority that is about to end says so', async () => {
  const dir = temporaryDir();
  try {
    const ending = await authorityEndingIn(60);
    fs.writeFileSync(path.join(dir, 'rc-surface-local-ca.crt'), ending.certPem);
    fs.writeFileSync(path.join(dir, 'rc-surface-local-ca.key'), ending.keyPem);

    const warnings = [];
    const said = console.warn;
    console.warn = (...args) => { warnings.push(args.join(' ')); };
    let ca;
    try {
      ca = await loadOrCreateLocalCa(dir);
    } finally {
      console.warn = said;
    }

    assert.ok(ca, 'the authority is kept');
    assert.equal(ca.certPem, ending.certPem, 'an authority that still lives is kept');
    assert.equal(warnings.length, 1, 'the authority that is about to end must say so');
    assert.match(warnings[0], /authority/, 'the warning says which authority it is');
  } finally {
    removeDir(dir);
  }
});
