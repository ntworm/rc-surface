// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// The certificate of the server comes from the authority of this computer,
// and the authority is what the phone installs.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import * as tls from 'node:tls';
import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import selfsigned from 'selfsigned';
import {
  SubjectAlternativeNameExtension,
  X509CertificateGenerator,
} from '@peculiar/x509';

import { setExtensionContext } from '../src/context.ts';
import { buildSnapshot, setNetworkSnapshot } from '../src/server/lan-candidates.ts';
import {
  certCoversRequiredAltNames,
  ensureCertificateCovers,
  getLocalCaDer,
  getLocalCaFingerprint,
  httpsOptions,
  loadCerts,
} from '../src/server/cert.ts';
import { isIssuedByCa, loadOrCreateLocalCa, CA_COMMON_NAME } from '../src/server/local-ca.ts';
import {
  actualCaPort,
  actualHttpsPort,
  actualPort,
  startServer,
  stopServer,
} from '../src/server/state.ts';

const nic = (address) => ({
  address,
  netmask: '255.255.255.0',
  mac: '08:bf:b8:13:fa:7d',
  family: 'IPv4',
  internal: false,
});

const signals = { defaultRouteIp: null, gateways: [], routeChecked: false };

/** The machine as the server sees it: one adapter with the given addresses. */
function snapshotOf(addresses) {
  return buildSnapshot({ Ethernet: addresses.map(nic) }, signals);
}

/** The machine with one adapter chosen by hand: what the USE button does. */
function pinnedSnapshotOf(address) {
  const first = buildSnapshot({ Ethernet: [nic(address)] }, signals);
  const id = first.candidates[0]?.id ?? '';
  return buildSnapshot({ Ethernet: [nic(address)] }, signals, {
    choice: { mode: 'pinned', id },
  });
}

async function storageDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'rc-surface-ca-'));
}

/** The authority that the server keeps in the certs folder. */
function authorityOf(dir) {
  return loadOrCreateLocalCa(path.join(dir, 'certs'));
}

/** The milliseconds of a day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The bytes of a PEM text. */
const derOf = (pem) =>
  Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');

/**
 * A certificate of the server signed by the authority, with the validity we
 * choose: the days it has left before it ends.
 */
async function leafSignedBy(ca, days, ips) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  const publicKey = await crypto.subtle.importKey(
    'spki', createPublicKey(keyPem).export({ type: 'spki', format: 'der' }), algorithm, true, ['verify'],
  );
  const signingKey = await crypto.subtle.importKey(
    'pkcs8', derOf(ca.keyPem), algorithm, false, ['sign'],
  );
  const notBefore = new Date(Date.now() - DAY_MS);
  const certificate = await X509CertificateGenerator.create({
    subject: [{ CN: ['ableton-rc-surface.local'] }],
    issuer: [{ CN: [CA_COMMON_NAME] }],
    publicKey,
    signingKey,
    notBefore,
    notAfter: new Date(notBefore.getTime() + days * DAY_MS),
    signingAlgorithm: algorithm,
    extensions: [
      new SubjectAlternativeNameExtension([
        { type: 'dns', value: 'localhost' },
        { type: 'ip', value: '127.0.0.1' },
        ...ips.map(ip => ({ type: 'ip', value: ip })),
      ], false),
    ],
  });
  return { cert: certificate.toString('pem'), key: keyPem };
}

/** The certificate of the server that the next start will find. */
function writeServerCerts(dir, leaf) {
  const certPath = path.join(dir, 'certs', 'ableton-rc-server.crt');
  const keyPath = path.join(dir, 'certs', 'ableton-rc-server.key');
  return Promise.all([
    fs.writeFile(certPath, leaf.cert),
    fs.writeFile(keyPath, leaf.key),
  ]);
}

test('the certificate of the server is signed by the authority of this computer', async t => {
  const dir = await storageDir();
  setExtensionContext({ environment: { storageDirectory: dir } });
  setNetworkSnapshot(snapshotOf(['192.168.100.16']));
  t.after(async () => {
    setExtensionContext(null);
    setNetworkSnapshot(null);
    await fs.rm(dir, { recursive: true, force: true });
  });

  await loadCerts();

  const ca = await authorityOf(dir);
  assert.ok(ca, 'the authority must be kept with the certificates');
  assert.ok(httpsOptions, 'the server must have a certificate');
  assert.equal(
    isIssuedByCa(httpsOptions.cert.toString('utf8'), ca.certPem),
    true,
    'the authority must have signed it',
  );
  assert.ok(
    certCoversRequiredAltNames(httpsOptions.cert, ['192.168.100.16']),
    'the address of the machine must be named',
  );
  assert.deepEqual(getLocalCaDer(), ca.der, 'the authority hands its own certificate over');
});

test('the fingerprint of the authority is the SHA-256 of its certificate', async t => {
  const dir = await storageDir();
  setExtensionContext({ environment: { storageDirectory: dir } });
  setNetworkSnapshot(snapshotOf(['192.168.100.16']));
  t.after(async () => {
    setExtensionContext(null);
    setNetworkSnapshot(null);
    await fs.rm(dir, { recursive: true, force: true });
  });

  await loadCerts();

  const der = getLocalCaDer();
  assert.ok(der, 'there is an authority');
  const hex = createHash('sha256').update(der).digest('hex').toUpperCase();
  assert.equal(
    getLocalCaFingerprint(),
    hex.match(/.{2}/g).join(':'),
    'the fingerprint is the SHA-256 of the certificate of the authority',
  );
  assert.match(
    getLocalCaFingerprint(),
    /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/,
    'it is uppercase hex pairs joined by colons',
  );
});

test('a certificate the authority did not sign is replaced', async t => {
  const dir = await storageDir();
  setExtensionContext({ environment: { storageDirectory: dir } });
  setNetworkSnapshot(snapshotOf(['192.168.100.16']));
  t.after(async () => {
    setExtensionContext(null);
    setNetworkSnapshot(null);
    await fs.rm(dir, { recursive: true, force: true });
  });

  await loadCerts();
  const ca = await authorityOf(dir);

  // A certificate from elsewhere: it covers the address, but the authority
  // of this computer did not sign it.
  const pems = await selfsigned.generate(
    [{ name: 'commonName', value: 'ableton-rc-surface.local' }],
    {
      algorithm: 'sha256',
      keySize: 2048,
      extensions: [{ name: 'subjectAltName', altNames: [{ type: 7, ip: '192.168.100.16' }] }],
    },
  );
  await fs.writeFile(path.join(dir, 'certs', 'ableton-rc-server.crt'), pems.cert);
  await fs.writeFile(path.join(dir, 'certs', 'ableton-rc-server.key'), pems.private);

  await loadCerts();

  assert.equal(
    isIssuedByCa(httpsOptions.cert.toString('utf8'), ca.certPem),
    true,
    'the certificate must come from the authority',
  );
});

test('a certificate that is about to end is renewed when Live opens', async t => {
  const dir = await storageDir();
  setExtensionContext({ environment: { storageDirectory: dir } });
  setNetworkSnapshot(snapshotOf(['192.168.100.16']));
  t.after(async () => {
    setExtensionContext(null);
    setNetworkSnapshot(null);
    await fs.rm(dir, { recursive: true, force: true });
  });

  await loadCerts();
  const ca = await authorityOf(dir);

  // A certificate of the authority that ends in ten days: it still works,
  // but it will not work for long.
  const ending = await leafSignedBy(ca, 10, ['192.168.100.16']);
  await writeServerCerts(dir, ending);

  await loadCerts();

  assert.notEqual(httpsOptions.cert.toString('utf8'), ending.cert,
    'the certificate that was about to end must not be kept');
  assert.equal(isIssuedByCa(httpsOptions.cert.toString('utf8'), ca.certPem), true,
    'the same authority signs the new certificate');
  assert.ok(certCoversRequiredAltNames(httpsOptions.cert, ['192.168.100.16']),
    'the address is still named');
});

test('a certificate with time left on it is kept', async t => {
  const dir = await storageDir();
  setExtensionContext({ environment: { storageDirectory: dir } });
  setNetworkSnapshot(snapshotOf(['192.168.100.16']));
  t.after(async () => {
    setExtensionContext(null);
    setNetworkSnapshot(null);
    await fs.rm(dir, { recursive: true, force: true });
  });

  await loadCerts();
  const ca = await authorityOf(dir);

  const fresh = await leafSignedBy(ca, 200, ['192.168.100.16']);
  await writeServerCerts(dir, fresh);

  await loadCerts();

  assert.equal(httpsOptions.cert.toString('utf8'), fresh.cert,
    'the certificate is kept as it is');
});

test('a new address is signed by the authority, and the old ones stay', async t => {
  const dir = await storageDir();
  setExtensionContext({ environment: { storageDirectory: dir } });
  setNetworkSnapshot(snapshotOf(['192.168.100.16']));
  t.after(async () => {
    setExtensionContext(null);
    setNetworkSnapshot(null);
    await fs.rm(dir, { recursive: true, force: true });
  });

  await loadCerts();
  const ca = await authorityOf(dir);

  assert.equal(await ensureCertificateCovers(['10.0.0.7']), true);

  assert.equal(
    isIssuedByCa(httpsOptions.cert.toString('utf8'), ca.certPem),
    true,
    'the authority signs the new address too',
  );
  assert.ok(
    certCoversRequiredAltNames(httpsOptions.cert, ['10.0.0.7', '192.168.100.16']),
    'the old address stays named',
  );
});

test('a public address is beyond the authority: the server signs itself', async t => {
  const dir = await storageDir();
  setExtensionContext({ environment: { storageDirectory: dir } });
  setNetworkSnapshot(pinnedSnapshotOf('25.10.1.20'));
  t.after(async () => {
    setExtensionContext(null);
    setNetworkSnapshot(null);
    await fs.rm(dir, { recursive: true, force: true });
  });

  await loadCerts();
  const ca = await authorityOf(dir);

  assert.equal(
    isIssuedByCa(httpsOptions.cert.toString('utf8'), ca.certPem),
    false,
    'the authority may not sign for a public address',
  );
  assert.ok(
    certCoversRequiredAltNames(httpsOptions.cert, ['25.10.1.20']),
    'the address is still named',
  );
});

test('without a place to keep it there is no authority', async t => {
  setExtensionContext(null);
  setNetworkSnapshot(snapshotOf(['192.168.100.16']));
  t.after(() => setNetworkSnapshot(null));

  await loadCerts();

  assert.equal(getLocalCaDer(), null, 'there is no authority to hand over');
  assert.equal(getLocalCaFingerprint(), null, 'and no fingerprint to show');
  assert.ok(httpsOptions, 'the server still has a certificate');
  assert.ok(
    certCoversRequiredAltNames(httpsOptions.cert, ['192.168.100.16']),
    'the address is still named',
  );
});

/** The port this test takes: the other two follow from it. */
const PANEL_PORT = 18730;

/** One request to the server, and what it answered. */
function request(port, requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: requestPath }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('the server takes three ports, and the certificate page answers on its own', async t => {
  process.env.RC_SURFACE_PORT = String(PANEL_PORT);
  const dir = await storageDir();
  setExtensionContext({ environment: { storageDirectory: dir } });
  t.after(async () => {
    await stopServer();
    setExtensionContext(null);
    delete process.env.RC_SURFACE_PORT;
    await fs.rm(dir, { recursive: true, force: true });
  });

  await startServer();

  assert.equal(actualPort, PANEL_PORT, 'the panel takes the port it was given');
  assert.equal(actualHttpsPort, PANEL_PORT + 1, 'the phone takes the port after it');
  assert.equal(actualCaPort, PANEL_PORT + 2, 'the certificate page takes the port after that');

  const page = await request(actualCaPort, '/ca');
  assert.equal(page.status, 200, 'the page is there');
  assert.match(page.body.toString('utf8'), /RC Surface/, 'the page says who it is');

  const certificate = await request(actualCaPort, '/ca.crt');
  assert.equal(certificate.status, 200, 'the certificate is there');
  assert.ok(certificate.body.length > 0, 'and it carries the bytes of the authority');
});

test('the ports are free again after a stop', () => {
  assert.equal(actualPort, null);
  assert.equal(actualHttpsPort, null);
  assert.equal(actualCaPort, null);
});

// The authority is only worth something if the system reads it: a phone
// that trusts it has to accept the certificate of the server and refuse a
// certificate for an address the authority may not sign for.
test('the authority is one the system reads: it signs the local addresses and refuses the rest', async t => {
  const dir = await storageDir();
  setExtensionContext({ environment: { storageDirectory: dir } });
  setNetworkSnapshot(snapshotOf(['192.168.100.16']));
  t.after(async () => {
    setExtensionContext(null);
    setNetworkSnapshot(null);
    await fs.rm(dir, { recursive: true, force: true });
  });

  await loadCerts();
  const ca = await authorityOf(dir);

  const allowed = await handshake(
    { cert: httpsOptions.cert.toString('utf8'), key: httpsOptions.key.toString('utf8') },
    ca.certPem,
  );
  assert.equal(allowed, null, `the certificate of the server must be accepted: ${allowed}`);

  const forbidden = await forbiddenLeaf(ca);
  const refused = await handshake(forbidden, ca.certPem);
  assert.notEqual(refused, null, 'the authority may not sign for a public address');
});

/** The message of a refused connection, or null when it went through. */
async function handshake(server, caPem) {
  const tlsServer = tls.createServer(
    { cert: server.cert, key: server.key },
    socket => socket.end('ok'),
  );
  await new Promise(resolve => tlsServer.listen(0, '127.0.0.1', resolve));
  const port = tlsServer.address().port;
  try {
    await new Promise((resolve, reject) => {
      const socket = tls.connect(
        { port, host: '127.0.0.1', ca: caPem, servername: 'localhost' },
        () => { socket.end(); resolve(); },
      );
      socket.on('error', reject);
    });
    return null;
  } catch (err) {
    return err.message;
  } finally {
    tlsServer.close();
  }
}

/** A certificate for a public address, signed by the authority: what the
 *  authority must never sign for. */
async function forbiddenLeaf(ca) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const der = Buffer.from(keyPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');
  const signingKey = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const publicKey = createPublicKey(keyPem).export({ type: 'spki', format: 'der' });
  const certificate = await X509CertificateGenerator.create({
    subject: [{ CN: ['ableton-rc-surface.local'] }],
    issuer: [{ CN: ['RC Surface local CA'] }],
    publicKey: new Uint8Array(publicKey),
    signingKey,
    extensions: [
      new SubjectAlternativeNameExtension([
        { type: 'dns', value: 'localhost' },
        { type: 'ip', value: '8.8.8.8' },
      ]),
    ],
  });
  return { cert: certificate.toString('pem'), key: keyPem };
}
