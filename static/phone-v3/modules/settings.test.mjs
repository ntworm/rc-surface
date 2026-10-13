import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const context = { globalThis: {} };
vm.runInNewContext(fs.readFileSync(new URL('./settings.js', import.meta.url), 'utf8'), context);
const settings = context.globalThis.RcPageSettings;
test('settings route real pages and preserve context beneath overlays', () => {
  assert.equal(settings.resolvePage('mapping', 'video'), 'video');
  assert.equal(settings.resolvePage('transport', 'audio'), 'audio');
  assert.equal(settings.resolvePage('mixer', 'video'), 'mixer');
  assert.equal(settings.supports('mixer'), false);
  assert.equal(settings.supports('snapshots'), false);
  for (const page of ['performance', 'audio', 'video', 'sensors']) assert.equal(settings.supports(page), true);
});
test('new profiles default to timed ten seconds and old profiles retain legacy hold', () => {
  assert.equal(settings.policy(undefined, false).mode, 'timeout');
  assert.equal(settings.policy(undefined, true).legacy, true);
  assert.equal(settings.policy(undefined, true).mode, 'hold');
  for (const bad of [{mode:'magic'}, {version:1,mode:'timeout',timeoutMs:NaN,legacy:false},
    {version:1,mode:'timeout',timeoutMs:101,legacy:false}]) assert.throws(() => settings.policy(bad));
});
