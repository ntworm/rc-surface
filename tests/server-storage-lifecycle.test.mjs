import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { isolatedModule, deferred } from './helpers/isolated-module.mjs';

for (const setting of [
  { name: 'autostart', configure: 'configureAutostartStorage', get: 'isAutostartEnabled', initial: true, loaded: false },
  { name: 'locale', configure: 'configureLocaleStorage', get: 'getLocale', initial: 'en', loaded: 'pt-BR' },
]) {
  function harness() {
    const reads = [];
    const api = isolatedModule(`src/server/${setting.name}.ts`, {
      path, stripWslDrivePrefix: (value) => value,
      fs: { readFile() { const gate = deferred(); reads.push(gate); return gate.promise; } },
    });
    return { api, reads };
  }
  test(`${setting.name}: a late read from a deactivated session cannot change the active setting`, async () => {
    const h = harness();
    let current = true;
    const loading = h.api[setting.configure]('old', () => current);
    current = false;
    h.reads[0].resolve(JSON.stringify({ [setting.name]: setting.loaded }));
    await loading;
    assert.equal(h.api[setting.get](), setting.initial);
  });
  test(`${setting.name}: an older storage read cannot overwrite a newer store`, async () => {
    const h = harness();
    const old = h.api[setting.configure]('old');
    const next = h.api[setting.configure]('new');
    h.reads[1].resolve(JSON.stringify({ [setting.name]: setting.initial })); await next;
    h.reads[0].resolve(JSON.stringify({ [setting.name]: setting.loaded })); await old;
    assert.equal(h.api[setting.get](), setting.initial);
  });
}
