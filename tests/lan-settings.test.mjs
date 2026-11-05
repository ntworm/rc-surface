// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  configureNetworkStorage,
  getNetworkChoice,
  getNetworkProofs,
  recordNetworkProof,
  resetNetworkSettingsForTests,
  setNetworkChoice,
} from '../src/server/lan-settings.js';

const tempDir = async () => fs.mkdtemp(path.join(os.tmpdir(), 'rc-network-'));
const day = 86_400_000;

test('defaults to automatic with no proofs', async t => {
  t.after(resetNetworkSettingsForTests);
  resetNetworkSettingsForTests();
  await configureNetworkStorage(await tempDir());
  assert.deepEqual(getNetworkChoice(), { mode: 'auto' });
  assert.deepEqual([...getNetworkProofs(0)], []);
});

test('a pin and a proof survive a reload from network.json', async t => {
  t.after(resetNetworkSettingsForTests);
  resetNetworkSettingsForTests();
  const dir = await tempDir();
  await configureNetworkStorage(dir);
  await setNetworkChoice({ mode: 'pinned', id: 'Ethernet|192.168.0.0/24' });
  await recordNetworkProof('Ethernet|192.168.0.0/24|', 5 * day);
  resetNetworkSettingsForTests();
  assert.deepEqual(getNetworkChoice(), { mode: 'auto' });
  await configureNetworkStorage(dir);
  assert.deepEqual(getNetworkChoice(), { mode: 'pinned', id: 'Ethernet|192.168.0.0/24' });
  assert.deepEqual([...getNetworkProofs(6 * day)], [{ key: 'Ethernet|192.168.0.0/24|', at: 5 * day }]);
});

test('a second proof for the same network replaces the first', async t => {
  t.after(resetNetworkSettingsForTests);
  resetNetworkSettingsForTests();
  await configureNetworkStorage(await tempDir());
  await recordNetworkProof('a', 1 * day);
  await recordNetworkProof('a', 2 * day);
  assert.deepEqual([...getNetworkProofs(3 * day)], [{ key: 'a', at: 2 * day }]);
});

test('expired proofs are dropped and at most 32 are kept, oldest out', async t => {
  t.after(resetNetworkSettingsForTests);
  resetNetworkSettingsForTests();
  await configureNetworkStorage(await tempDir());
  await recordNetworkProof('old', 0);
  assert.deepEqual([...getNetworkProofs(31 * day)], []);
  for (let i = 0; i < 40; i++) await recordNetworkProof(`k${i}`, 40 * day + i);
  const proofs = getNetworkProofs(41 * day);
  assert.equal(proofs.length, 32);
  assert.equal(proofs.some(proof => proof.key === 'k0'), false);
  assert.equal(proofs.some(proof => proof.key === 'k39'), true);
});

test('an invalid choice is refused and leaves the setting alone', async t => {
  t.after(resetNetworkSettingsForTests);
  resetNetworkSettingsForTests();
  await configureNetworkStorage(await tempDir());
  await setNetworkChoice({ mode: 'pinned', id: 'Wi-Fi|10.0.0.0/24' });
  for (const bad of [null, 'auto', { mode: 'manual', host: 'evil.example' }, { mode: 'pinned' }, { mode: 'pinned', id: 5 }]) {
    await assert.rejects(() => setNetworkChoice(bad));
  }
  assert.deepEqual(getNetworkChoice(), { mode: 'pinned', id: 'Wi-Fi|10.0.0.0/24' });
});

test('an unreadable or malformed file does not throw and keeps the defaults', async t => {
  t.after(resetNetworkSettingsForTests);
  for (const body of ['{not json', '[]', '{"choice":{"mode":"manual","host":"x"},"proofs":"nope"}', '{"proofs":[{"key":1,"at":"x"}]}']) {
    resetNetworkSettingsForTests();
    const dir = await tempDir();
    await fs.writeFile(path.join(dir, 'network.json'), body, 'utf8');
    await configureNetworkStorage(dir);
    assert.deepEqual(getNetworkChoice(), { mode: 'auto' });
    assert.deepEqual([...getNetworkProofs(0)], []);
  }
});

test('no storage directory keeps the choice in memory only', async t => {
  t.after(resetNetworkSettingsForTests);
  resetNetworkSettingsForTests();
  await configureNetworkStorage(null);
  await setNetworkChoice({ mode: 'pinned', id: 'x|1.2.3.0/24' });
  assert.deepEqual(getNetworkChoice(), { mode: 'pinned', id: 'x|1.2.3.0/24' });
});

test('a stale activation does not load its file', async t => {
  t.after(resetNetworkSettingsForTests);
  resetNetworkSettingsForTests();
  const dir = await tempDir();
  await fs.writeFile(path.join(dir, 'network.json'), '{"choice":{"mode":"pinned","id":"a|1.2.3.0/24"}}', 'utf8');
  await configureNetworkStorage(dir, () => false);
  assert.deepEqual(getNetworkChoice(), { mode: 'auto' });
});
