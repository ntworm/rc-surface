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
import { checkSameOrigin, isAllowedHost, isAllowedHostForOwnName } from "../src/server/session-auth.ts";

const own = os.hostname();

test("an address of this computer is answered", () => {
  const allowed = ["127.0.0.1:8730", "192.168.100.2:8731", "0.0.0.0", "10.0.0.1", "localhost:8080", "LOCALHOST"];
  for (const host of allowed) {
    assert.equal(isAllowedHost(host), true, `${host} must be answered`);
  }
});

test("an IPv6 literal of this computer is answered", () => {
  assert.equal(isAllowedHost("[::1]:8730"), true, "a loopback literal must be answered");
  assert.equal(isAllowedHost("[fe80::1%eth0]:8731"), true, "a literal with a zone must be answered");
  assert.equal(isAllowedHost("[::1]"), true, "a loopback literal without a port must be answered");
  assert.equal(isAllowedHost("[fe80::1%eth0]"), true, "a literal with a zone and no port must be answered");
});

test("a bracketed name that is not an address is refused", () => {
  assert.equal(isAllowedHost("[cafe]"), false, "a bracketed name must be refused");
  assert.equal(isAllowedHost("[cafe]:8730"), false, "a bracketed name with a port must be refused");
});

test("the name of this computer is answered, in any case", () => {
  assert.equal(isAllowedHost(own), true, "the name of this computer must be answered");
  assert.equal(isAllowedHost(own.toUpperCase()), true, "the name of this computer must be answered in any case");
});

// The '.local' form is covered below: on macOS the name already ends in it.
test("the name of this computer is answered with and without the '.local' suffix", () => {
  // The name of this computer, whatever shape the machine gives it.
  const base = own.toLowerCase().endsWith(".local")
    ? own.toLowerCase().slice(0, -".local".length)
    : own.toLowerCase();
  assert.equal(isAllowedHost(base), true, "the bare name of this computer must be answered");
  assert.equal(isAllowedHost(`${base}.local`), true, "the local name of this computer must be answered");
  // A name of this computer of a chosen shape.
  assert.equal(isAllowedHostForOwnName("studio", "studio.local"), true, "the bare name must be answered");
  assert.equal(isAllowedHostForOwnName("studio.local", "studio.local"), true, "the name with the suffix must be answered");
  assert.equal(isAllowedHostForOwnName("studio", "studio"), true, "the bare name must be answered");
  assert.equal(isAllowedHostForOwnName("studio.local", "studio"), true, "the name with the suffix must be answered");
  assert.equal(isAllowedHostForOwnName("other", "studio.local"), false, "a foreign name must be refused");
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

test("an address with a leading zero is refused", () => {
  const refused = ["0177.0.0.1", "01.2.3.4", "127.0.0.01"];
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
