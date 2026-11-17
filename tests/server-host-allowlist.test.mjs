// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// DNS rebinding: a page on another domain can point its own name at this
// machine, and the browser then sends that name in the Host header of a
// request that looks same-origin. The server answers only the names that
// belong to this computer — an address, localhost or this computer's name —
// and refuses a foreign Host before the Origin rules get a say.

import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { checkSameOrigin, isAllowedHost } from "../src/server/session-auth.ts";

const own = os.hostname();

test("an address of this computer is answered", () => {
  const allowed = ["127.0.0.1:8730", "192.168.100.2:8731", "0.0.0.0", "localhost:8080", "LOCALHOST"];
  for (const host of allowed) {
    assert.equal(isAllowedHost(host), true, `${host} must be answered`);
  }
});

test("an IPv6 literal of this computer is answered", () => {
  assert.equal(isAllowedHost("[::1]:8730"), true, "a loopback literal must be answered");
  assert.equal(isAllowedHost("[fe80::1%eth0]:8731"), true, "a literal with a zone must be answered");
});

test("the name of this computer is answered, in any case", () => {
  assert.equal(isAllowedHost(own), true, "the name of this computer must be answered");
  assert.equal(isAllowedHost(own.toUpperCase()), true, "the name of this computer must be answered in any case");
  assert.equal(isAllowedHost(`${own}.local`), true, "the local name of this computer must be answered");
});

test("a foreign domain is refused", () => {
  const refused = ["evil.example:8730", "127.0.0.1.evil.example", "localhost.evil.example", "[evil.example]"];
  for (const host of refused) {
    assert.equal(isAllowedHost(host), false, `${host} must be refused`);
  }
});

test("an address that only looks like one is refused", () => {
  const refused = ["2130706433", "127.1", "0x7f.0.0.1", "256.1.1.1"];
  for (const host of refused) {
    assert.equal(isAllowedHost(host), false, `${host} must be refused`);
  }
});

test("a foreign Host is refused before the Origin rules, whatever the Origin says", () => {
  const matching = checkSameOrigin({
    headers: { origin: "http://evil.example:8730", host: "evil.example:8730" },
  });
  assert.equal(matching.ok, false, "a Host that names another domain must be refused");
  assert.equal(matching.reason, "host-not-allowed");
  assert.equal(matching.hostValue, "evil.example:8730");

  const withoutOrigin = checkSameOrigin({ headers: { host: "evil.example:8730" } });
  assert.equal(withoutOrigin.ok, false, "a foreign Host must be refused without an Origin too");
  assert.equal(withoutOrigin.reason, "host-not-allowed");

  const nullOrigin = checkSameOrigin({
    headers: { origin: "null", host: "evil.example:8730" },
  });
  assert.equal(nullOrigin.ok, false, "a foreign Host must be refused with a null Origin too");
  assert.equal(nullOrigin.reason, "host-not-allowed");
});

test("a Host of this computer keeps the answers it had before", () => {
  const matching = checkSameOrigin({
    headers: { origin: "http://127.0.0.1:8730", host: "127.0.0.1:8730" },
  });
  assert.equal(matching.ok, true);
  assert.equal(matching.reason, "exact-host-match");

  const withoutOrigin = checkSameOrigin({ headers: { host: "localhost:8730" } });
  assert.equal(withoutOrigin.ok, true);
  assert.equal(withoutOrigin.reason, "no-origin-header");
});
