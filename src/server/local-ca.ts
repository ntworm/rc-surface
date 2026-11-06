// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
//
// The authority of this computer: a certificate authority that says what it
// may sign for, and the certificate of the server that chains to it. The
// phone trusts the authority once; every certificate after that comes from
// it, so the browser stops warning about the address.

import { createPublicKey, generateKeyPairSync, X509Certificate } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  AuthorityKeyIdentifierExtension,
  BasicConstraintsExtension,
  ExtendedKeyUsage,
  ExtendedKeyUsageExtension,
  Extension,
  KeyUsageFlags,
  KeyUsagesExtension,
  SubjectAlternativeNameExtension,
  SubjectKeyIdentifierExtension,
  X509Certificate as PeculiarCertificate,
  X509CertificateGenerator,
  type JsonGeneralNames,
} from "@peculiar/x509";

/** The name the authority carries. */
export const CA_COMMON_NAME = "RC Surface local CA";

/** The name the certificate of the server carries. */
export const SERVER_COMMON_NAME = "ableton-rc-surface.local";

/** Where the authority keeps its two files. */
export const CA_CERT_FILE = "rc-surface-local-ca.crt";
export const CA_KEY_FILE = "rc-surface-local-ca.key";

/** The extension that says what the authority may sign for. */
const NAME_CONSTRAINTS_OID = "2.5.29.30";

/** How long the authority lives, and how long a certificate it signs lives. */
const CA_LIFETIME_DAYS = 3650;
const SERVER_LIFETIME_DAYS = 397;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The addresses the authority may sign for: the loopback, the private
 *  networks and the link-local ones. Anything else is the internet, and the
 *  authority has no business signing for it. */
const PERMITTED_SUBNETS: readonly { address: string; mask: string }[] = [
  { address: "127.0.0.0", mask: "255.0.0.0" },
  { address: "10.0.0.0", mask: "255.0.0.0" },
  { address: "172.16.0.0", mask: "255.240.0.0" },
  { address: "192.168.0.0", mask: "255.255.0.0" },
  { address: "169.254.0.0", mask: "255.255.0.0" },
];

/** The authority of this computer, with the key that signs for it. */
export interface LocalCa {
  /** The certificate of the authority, in PEM. */
  certPem: string;
  /** The private key of the authority, in PEM. */
  keyPem: string;
  /** The certificate of the authority, as bytes: what the phone installs. */
  der: Buffer;
}

/** An IPv4 address as the number it is, or null when it is not one. */
function ipv4(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

/** The length of a DER value, in the shortest form that fits it. */
function derLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  let rest = length;
  while (rest > 0) {
    bytes.unshift(rest & 0xff);
    rest >>>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

/** A DER SEQUENCE around the given parts. */
function derSequence(...parts: Buffer[]): Buffer {
  const content = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([0x30]), derLength(content.length), content]);
}

/** One permitted address range, as RFC 5280 writes it: the address and its
 *  mask, four bytes each, inside a general name of the IP kind. */
function derSubnet(address: string, mask: string): Buffer {
  const octets = (text: string) => Buffer.from(text.split(".").map(part => Number(part)));
  const name = Buffer.concat([Buffer.from([0x87, 0x08]), octets(address), octets(mask)]);
  return derSequence(name);
}

/** The name constraints of the authority, as they are written in the
 *  certificate: the addresses it may sign for, and nothing else. */
export const CA_NAME_CONSTRAINTS_DER: Buffer = (() => {
  const subtrees = Buffer.concat(
    PERMITTED_SUBNETS.map(subnet => derSubnet(subnet.address, subnet.mask)),
  );
  // The permitted subtrees carry the tag of the field that holds them.
  const permitted = Buffer.concat([Buffer.from([0xa0]), derLength(subtrees.length), subtrees]);
  return derSequence(permitted);
})();

/** True when the authority may sign a certificate for the address. */
export function isPermittedServerIp(ip: string): boolean {
  const value = ipv4(ip);
  if (value === null) return false;
  return PERMITTED_SUBNETS.some(subnet => {
    const address = ipv4(subnet.address);
    const mask = ipv4(subnet.mask);
    if (address === null || mask === null) return false;
    // The mask is a bitwise and, which comes out signed: both sides of the
    // comparison have to be read the same way.
    return ((value & mask) >>> 0) === address;
  });
}

/** The bytes of a PEM text. */
function toDer(pem: string): Buffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  return Buffer.from(body, "base64");
}

/** The bytes of a buffer, in the shape the browser's crypto understands. */
function bytes(buffer: Buffer): ArrayBuffer {
  const copy = new ArrayBuffer(buffer.length);
  new Uint8Array(copy).set(buffer);
  return copy;
}

/** The WebCrypto keys of an RSA key pair in PEM. */
async function importKeyPair(keyPem: string): Promise<CryptoKeyPair> {
  const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  const privateKey = await crypto.subtle.importKey(
    "pkcs8", bytes(toDer(keyPem)), algorithm, false, ["sign"],
  );
  const publicPem = createPublicKey(keyPem).export({ type: "spki", format: "pem" }).toString();
  const publicKey = await crypto.subtle.importKey(
    "spki", bytes(toDer(publicPem)), algorithm, true, ["verify"],
  );
  return { privateKey, publicKey };
}

/** Makes the authority of this computer: a key pair and the certificate that
 *  says what it may sign for. */
async function createLocalCa(): Promise<LocalCa> {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const keyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const keys = await importKeyPair(keyPem);
  const notBefore = new Date(Date.now() - DAY_MS);
  const certificate = await X509CertificateGenerator.createSelfSigned({
    name: [{ CN: [CA_COMMON_NAME] }],
    keys,
    notBefore,
    notAfter: new Date(notBefore.getTime() + CA_LIFETIME_DAYS * DAY_MS),
    signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    extensions: [
      new BasicConstraintsExtension(true, 0, true),
      new KeyUsagesExtension(KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign, true),
      await SubjectKeyIdentifierExtension.create(keys.publicKey),
      new Extension(NAME_CONSTRAINTS_OID, true, bytes(CA_NAME_CONSTRAINTS_DER)),
    ],
  });
  const certPem = certificate.toString("pem");
  return { certPem, keyPem, der: Buffer.from(certificate.rawData) };
}

/** True when the key belongs to the certificate: an authority that cannot
 *  sign is no authority. */
function keyBelongsToCertificate(keyPem: string, certificate: X509Certificate): boolean {
  const fromKey = createPublicKey(keyPem).export({ type: "spki", format: "der" });
  const fromCertificate = certificate.publicKey.export({ type: "spki", format: "der" });
  return Buffer.from(fromKey).equals(Buffer.from(fromCertificate));
}

/** The authority that is already on disk, when there is one that works. */
async function readLocalCa(certPath: string, keyPath: string): Promise<LocalCa | null> {
  try {
    const [certPem, keyPem] = await Promise.all([
      fs.readFile(certPath, "utf8"),
      fs.readFile(keyPath, "utf8"),
    ]);
    const certificate = new X509Certificate(certPem);
    if (!certificate.ca) return null;
    if (!keyBelongsToCertificate(keyPem, certificate)) return null;
    return { certPem, keyPem, der: Buffer.from(certificate.raw) };
  } catch {
    return null;
  }
}

/** The authority of this computer: the one that is already on disk, or a new
 *  one. Null when nothing works, and the server keeps its own certificate. */
export async function loadOrCreateLocalCa(certDir: string): Promise<LocalCa | null> {
  const certPath = path.join(certDir, CA_CERT_FILE);
  const keyPath = path.join(certDir, CA_KEY_FILE);
  const existing = await readLocalCa(certPath, keyPath);
  if (existing) return existing;
  const created = await createLocalCa();
  await fs.mkdir(certDir, { recursive: true });
  await Promise.all([
    fs.writeFile(certPath, created.certPem, { mode: 0o600 }),
    fs.writeFile(keyPath, created.keyPem, { mode: 0o600 }),
  ]);
  return created;
}

/** The names the certificate of the server carries: the loopback and every
 *  address it has to reach. */
function serverNames(addresses: readonly string[]): JsonGeneralNames {
  const names: JsonGeneralNames = [
    { type: "dns", value: "localhost" },
    { type: "ip", value: "127.0.0.1" },
  ];
  for (const address of addresses) {
    if (address === "127.0.0.1") continue;
    if (!isPermittedServerIp(address)) continue;
    names.push({ type: "ip", value: address });
  }
  return names;
}

/** Issues the certificate of the server, signed by the authority. The
 *  authority signs only the addresses it is allowed to sign for. */
export async function issueServerCertificate(
  ca: LocalCa,
  keyPem: string,
  ips: readonly string[],
): Promise<string | null> {
  try {
    const caKeys = await importKeyPair(ca.keyPem);
    const publicKey = createPublicKey(keyPem).export({ type: "spki", format: "der" });
    const serverPublicKey = await crypto.subtle.importKey(
      "spki", bytes(Buffer.from(publicKey)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, true, ["verify"],
    );
    const notBefore = new Date(Date.now() - DAY_MS);
    const certificate = await X509CertificateGenerator.create({
      subject: [{ CN: [SERVER_COMMON_NAME] }],
      issuer: [{ CN: [CA_COMMON_NAME] }],
      publicKey: serverPublicKey,
      signingKey: caKeys.privateKey,
      notBefore,
      notAfter: new Date(notBefore.getTime() + SERVER_LIFETIME_DAYS * DAY_MS),
      signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      extensions: [
        new BasicConstraintsExtension(false, undefined, true),
        new KeyUsagesExtension(KeyUsageFlags.digitalSignature | KeyUsageFlags.keyEncipherment, true),
        new ExtendedKeyUsageExtension([ExtendedKeyUsage.serverAuth], false),
        await SubjectKeyIdentifierExtension.create(serverPublicKey),
        // A strict verifier finds the authority by this identifier.
        await AuthorityKeyIdentifierExtension.create(new PeculiarCertificate(bytes(ca.der)), false),
        new SubjectAlternativeNameExtension(serverNames(ips), false),
      ],
    });
    return certificate.toString("pem");
  } catch {
    return null;
  }
}

/** True when the authority signed the certificate. */
export function isIssuedByCa(leafPem: string, caPem: string): boolean {
  try {
    const leaf = new X509Certificate(leafPem);
    const ca = new X509Certificate(caPem);
    if (leaf.issuer !== ca.subject) return false;
    return leaf.verify(ca.publicKey);
  } catch {
    return false;
  }
}
