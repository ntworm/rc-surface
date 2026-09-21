// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

// The language is held by the extension, not by each browser, because the
// panel and the phone are different browsers on different machines and a
// per-device preference would never travel between them.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const mod = await import('../src/server/locale.ts');
const {
  normalizeLocale,
  getLocale,
  setLocale,
  configureLocaleStorage,
  resetLocaleForTests,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
} = mod;

test('normalizeLocale accepts what a browser or a URL actually sends', () => {
  for (const value of ['pt', 'pt-BR', 'pt-br', 'PT_BR', 'pt-PT', 'pt-BR,en;q=0.9']) {
    assert.equal(normalizeLocale(value), 'pt-BR', `${value} should resolve to pt-BR`);
  }
  for (const value of ['en', 'en-US', 'EN', 'en-GB,en;q=0.5']) {
    assert.equal(normalizeLocale(value), 'en', `${value} should resolve to en`);
  }
  // Anything we do not ship answers null, so callers choose between keeping
  // the current locale and falling back — rather than being handed a guess.
  for (const value of ['fr', 'es-AR', '', '   ', 'zz', null, undefined, 42, {}, []]) {
    assert.equal(normalizeLocale(value), null, `${JSON.stringify(value)} should not resolve`);
  }
});

test('setLocale ignores junk instead of corrupting the setting', () => {
  resetLocaleForTests();
  assert.equal(getLocale(), DEFAULT_LOCALE);

  assert.equal(setLocale('pt-BR'), 'pt-BR');
  assert.equal(getLocale(), 'pt-BR');

  for (const junk of ['fr', '', null, undefined, 7, { locale: 'en' }]) {
    assert.equal(setLocale(junk), 'pt-BR', `${JSON.stringify(junk)} must not change the locale`);
  }
  assert.equal(getLocale(), 'pt-BR', 'the good value survives every bad one');

  assert.equal(setLocale('en'), 'en');
  resetLocaleForTests();
});

test('the choice survives a restart', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-locale-'));
  try {
    resetLocaleForTests();
    await configureLocaleStorage(dir);
    setLocale('pt-BR');
    // The write is fire-and-forget, so give it a turn before reading back.
    await new Promise((r) => setTimeout(r, 60));

    const onDisk = JSON.parse(await fs.readFile(path.join(dir, 'locale.json'), 'utf8'));
    assert.equal(onDisk.locale, 'pt-BR');

    resetLocaleForTests();
    assert.equal(getLocale(), DEFAULT_LOCALE, 'a fresh process starts at the default');
    assert.equal(await configureLocaleStorage(dir), 'pt-BR', 'and then reads the choice back');
    assert.equal(getLocale(), 'pt-BR');
  } finally {
    resetLocaleForTests();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a missing or corrupt store leaves the language working', async () => {
  resetLocaleForTests();
  // No storage directory at all — the case the mapping store also tolerates.
  assert.equal(await configureLocaleStorage(null), DEFAULT_LOCALE);
  assert.equal(setLocale('pt-BR'), 'pt-BR', 'the session still honours a change');

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-locale-bad-'));
  try {
    await fs.writeFile(path.join(dir, 'locale.json'), '{ not json', 'utf8');
    resetLocaleForTests();
    assert.equal(await configureLocaleStorage(dir), DEFAULT_LOCALE, 'unreadable falls back');

    await fs.writeFile(path.join(dir, 'locale.json'), JSON.stringify({ locale: 'klingon' }), 'utf8');
    resetLocaleForTests();
    assert.equal(await configureLocaleStorage(dir), DEFAULT_LOCALE, 'unknown falls back');
  } finally {
    resetLocaleForTests();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('the QR carries the language so the phone opens in it', async () => {
  const { buildServerAccessUrls } = await import('../src/server/access-urls.ts');
  const base = {
    isRunning: true,
    httpPort: 8730,
    httpsPort: 8731,
    primaryIp: '192.168.0.9',
    controllerToken: 'ctrl',
    adminToken: 'adm',
  };

  const pt = buildServerAccessUrls({ ...base, locale: 'pt-BR' });
  assert.match(pt.phoneUrl, /lang=pt-BR/);
  assert.match(pt.adminUrl, /lang=pt-BR/);
  // The token must still be first: the phone is refused without it, and a
  // language is no reason to reshape the part that authenticates.
  assert.match(pt.phoneUrl, /\?token=ctrl&lang=/);

  // Omitted rather than empty, so an unset language does not add a parameter.
  const none = buildServerAccessUrls(base);
  assert.doesNotMatch(none.phoneUrl, /lang=/);

  // A stopped server still has no URLs to hand out.
  const off = buildServerAccessUrls({ ...base, isRunning: false, locale: 'pt-BR' });
  assert.equal(off.phoneUrl, null);
});

test('exactly the two locales we ship are offered', () => {
  assert.deepEqual([...SUPPORTED_LOCALES], ['en', 'pt-BR']);
  assert.ok(SUPPORTED_LOCALES.includes(DEFAULT_LOCALE));
});
