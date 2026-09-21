// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function fixture(saved = '') {
  const pending = [];
  const media = new EventTarget();
  media.enumerateDevices = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
  media.getUserMedia = () => assert.fail('discovery must never start capture');
  const document = Object.assign(new EventTarget(), { createElement: () => ({}), visibilityState: 'visible' });
  const select = Object.assign(new EventTarget(), { replaceChildren(...options) { this.options = options; } });
  let changed = 0;
  const storage = new Map([['ableton-rc:audio-input-device', saved]]);
  const global = { navigator: { mediaDevices: media }, document, localStorage: {
    getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value),
  } };
  global.window = global;
  vm.runInNewContext(fs.readFileSync(new URL('./audio-input-selector.js', import.meta.url), 'utf8'), global);
  const selector = global.AudioInputSelector.create({ select, onChange: () => changed++, translate: (key, fallback) => fallback });
  return { selector, select, pending, media, storage, changed: () => changed };
}
const input = (deviceId, label = '') => ({ kind: 'audioinput', deviceId, label });

test('device discovery preserves explicit hidden input and never silently chooses default', async () => {
  const f = fixture('loop');
  assert.equal(f.selector.deviceId, 'loop');
  f.pending.shift().resolve([input('default'), input(''), { kind: 'videoinput', deviceId: 'camera' }]);
  await new Promise(setImmediate);
  assert.equal(f.select.value, 'loop');
  assert.match(f.select.options.at(-1).label || f.select.options.at(-1).textContent, /Unavailable/);
  f.select.value = '';
  f.select.dispatchEvent(new Event('change'));
  assert.equal(f.selector.deviceId, '');
  assert.equal(f.changed(), 1);
  assert.equal(f.storage.get('ableton-rc:audio-input-device'), '');
});

test('permission/device refresh deduplicates inputs and ignores older enumeration results', async () => {
  const f = fixture();
  const old = f.pending.shift();
  f.media.dispatchEvent(new Event('devicechange'));
  f.pending.shift().resolve([input('loop', 'Loopback'), input('loop'), input('mic')]);
  await new Promise(setImmediate);
  assert.deepEqual(Array.from(f.select.options, (o) => o.value), ['', 'loop', 'mic']);
  assert.equal(f.select.options[1].textContent, 'Loopback');
  assert.equal(f.select.options[2].textContent, 'Audio input 2');
  old.resolve([input('stale')]);
  await new Promise(setImmediate);
  assert.equal(f.select.options[1].value, 'loop');
  f.selector.refresh();
  f.pending.shift().reject(new Error('permission denied'));
  await new Promise(setImmediate);
  assert.equal(f.select.options[1].value, 'loop');
  assert.equal(f.changed(), 0, 'discovery is not a user source change');
});
