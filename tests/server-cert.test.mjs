// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import test from "node:test";
import assert from "node:assert/strict";
import selfsigned from "selfsigned";

function certOptions(altNames) {
  return {
    algorithm: "sha256",
    keySize: 2048,
    extensions: [
      { name: "basicConstraints", cA: false },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
      { name: "subjectAltName", altNames },
    ],
  };
}

test("cert.ts builds SAN entries for localhost, loopback, and unique LAN IPs", async () => {
  const { buildSubjectAltNames } = await import("../src/server/cert.ts");

  assert.deepEqual(
    buildSubjectAltNames(["192.168.100.2", "not-an-ip", "127.0.0.1", "192.168.100.2"]),
    [
      { type: 2, value: "localhost" },
      { type: 7, ip: "127.0.0.1" },
      { type: 7, ip: "192.168.100.2" },
    ],
  );
});

test("cert.ts detects persisted certs that are missing the current LAN IP SAN", async () => {
  const { buildSubjectAltNames, certCoversRequiredAltNames } = await import("../src/server/cert.ts");
  const attrs = [{ name: "commonName", value: "ableton-rc-surface.local" }];

  const oldPems = await selfsigned.generate(
    attrs,
    certOptions(buildSubjectAltNames([])),
  );
  assert.equal(
    certCoversRequiredAltNames(Buffer.from(oldPems.cert, "utf8"), ["192.168.100.2"]),
    false,
  );

  const newPems = await selfsigned.generate(
    attrs,
    certOptions(buildSubjectAltNames(["192.168.100.2"])),
  );
  assert.equal(
    certCoversRequiredAltNames(Buffer.from(newPems.cert, "utf8"), ["192.168.100.2"]),
    true,
  );
});

test("cert.ts counts the days a certificate still has", async () => {
  const { buildSubjectAltNames, certificateDaysLeft } = await import("../src/server/cert.ts");
  const attrs = [{ name: "commonName", value: "ableton-rc-surface.local" }];
  const day = 24 * 60 * 60 * 1000;
  const endingIn = (days) => selfsigned.generate(attrs, {
    ...certOptions(buildSubjectAltNames([])),
    notAfterDate: new Date(Date.now() + days * day),
  });

  const endingDays = certificateDaysLeft((await endingIn(10)).cert);
  assert.ok(endingDays !== null && endingDays >= 9 && endingDays <= 10,
    `a certificate that ends in ten days has ten days left: ${endingDays}`);

  const freshDays = certificateDaysLeft((await endingIn(365)).cert);
  assert.ok(freshDays !== null && freshDays >= 364 && freshDays <= 365,
    `a certificate that ends in a year has a year left: ${freshDays}`);

  assert.equal(certificateDaysLeft("not a certificate"), null,
    "a certificate that cannot be read has no days left to count");
});
