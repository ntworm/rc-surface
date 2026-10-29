// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load() {
  const context = { URL };
  vm.runInNewContext(fs.readFileSync(new URL('./network-address.js', import.meta.url), 'utf8'), context);
  return context.RcSurfaceNetwork;
}

test('only announced private IPv4 addresses may replace the performance host', () => {
  const network = load();
  const info = { primaryIp: '192.168.64.1', otherIps: ['10.0.1.5', '10.0.1.5', '127.0.0.1', '169.254.1.1', '100.64.0.1', '8.8.8.8', '10.999.1.1'],
    phoneUrl: 'https://192.168.64.1:8731/?token=fixture&lang=pt-BR&extra=keep#keep' };
  assert.deepEqual(Array.from(network.addresses(info)), ['192.168.64.1', '10.0.1.5']);
  assert.equal(network.performanceUrl(info, '10.0.1.5'), 'https://10.0.1.5:8731/?token=fixture&lang=pt-BR&extra=keep#keep');
  for (const rejected of ['127.0.0.1', '8.8.8.8', '10.0.1.6', '10.999.1.1']) assert.equal(network.performanceUrl(info, rejected), info.phoneUrl);
  assert.equal(info.primaryIp, '192.168.64.1');
});

test('missing and non-HTTPS performance URLs are left untouched', () => {
  const network = load();
  for (const phoneUrl of [null, 'bad URL', 'http://192.168.64.1:8730/?token=fixture']) {
    assert.equal(network.performanceUrl({ primaryIp: '10.0.1.5', phoneUrl }, '10.0.1.5'), phoneUrl);
  }
  assert.deepEqual(Array.from(network.addresses({ primaryIp: '10.0.1.5', otherIps: null })), ['10.0.1.5']);
});
