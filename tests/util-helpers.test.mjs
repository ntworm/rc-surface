// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import test from "node:test";
import assert from "node:assert/strict";
import { stripWslDrivePrefix, selectLanInterfaces } from "../src/util/helpers.js";

const ipv4 = address => [{ address, family: 'IPv4', internal: false }];

test('Mac Wi-Fi takes priority over a bridge with a higher ranked address range', () => {
  const result = selectLanInterfaces({ bridge100: ipv4('192.168.64.1'), en0: ipv4('10.0.1.5'), utun3: ipv4('10.8.0.2') });
  assert.equal(result.primary, '10.0.1.5');
  assert.deepEqual(new Set(result.others), new Set(['192.168.64.1', '10.8.0.2']));
});

test('Windows physical adapters beat virtual adapters and unknown adapters retain a fallback', () => {
  assert.equal(selectLanInterfaces({ 'vEthernet (Default Switch)': ipv4('192.168.56.1'), 'Wi-Fi': ipv4('10.0.1.5') }).primary, '10.0.1.5');
  assert.equal(selectLanInterfaces({ custom: ipv4('10.0.1.5'), vmnet8: ipv4('192.168.64.1') }).primary, '10.0.1.5');
  assert.equal(selectLanInterfaces({ vmnet8: ipv4('192.168.64.1') }).primary, '192.168.64.1');
});

test('LAN choice ignores internal and IPv6 entries while keeping the original empty fallback', () => {
  const result = selectLanInterfaces({ en0: [
    { address: '127.0.0.1', family: 'IPv4', internal: true },
    { address: 'fe80::1', family: 'IPv6', internal: false },
  ] });
  assert.deepEqual(result, { primary: '127.0.0.1', others: [] });
});

test("stripWslDrivePrefix handles normal, WSL and Win32 UNC/long paths", () => {
  // Win32 regular path
  assert.equal(stripWslDrivePrefix("C:\\Users\\foo"), "C:\\Users\\foo");
  
  // WSL/leading slash path
  assert.equal(stripWslDrivePrefix("/C:/Users/foo"), "C:/Users/foo");

  // Win32 long path (\\\\?\\)
  assert.equal(stripWslDrivePrefix("\\\\?\\C:\\Users\\foo"), "C:\\Users\\foo");

  // Win32 UNC long path (\\\\?\\UNC\\)
  assert.equal(stripWslDrivePrefix("\\\\?\\UNC\\server\\share"), "\\\\server\\share");
});

test("step function returns resolved value on success", async () => {
  const { step } = await import("../src/util/helpers.js");
  const res = await step("successCall", async () => 42);
  assert.equal(res, 42);
});

test("step function wraps standard Error rejection", async () => {
  const { step } = await import("../src/util/helpers.js");
  await assert.rejects(
    async () => {
      await step("failCall", async () => {
        throw new Error("inner error");
      });
    },
    /step "failCall" failed: inner error/
  );
});

test("step function wraps undefined rejection", async () => {
  const { step } = await import("../src/util/helpers.js");
  await assert.rejects(
    async () => {
      await step("undefinedCall", async () => {
        throw undefined;
      });
    },
    /step "undefinedCall" failed: <undefined>/
  );
});

