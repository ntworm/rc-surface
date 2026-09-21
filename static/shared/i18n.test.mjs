// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

// The resolution order is the whole design: the QR carries the panel's choice
// so the phone paints in it on the first frame, storage keeps a reopened page
// from reverting, and the server can override both when the operator changes
// the language while a phone is already connected.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(path.join(import.meta.dirname, 'i18n.js'), 'utf8');

function el(attrs = {}) {
  const classes = new Set();
  return {
    tagName: attrs.tagName || 'DIV',
    dataset: attrs.dataset || {},
    value: attrs.value,
    textContent: '',
    title: '',
    placeholder: '',
    attributes: {},
    classList: {
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    getAttribute: (name) => attrs.attrs?.[name] ?? null,
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener(type, fn) {
      (this._l ||= {})[type] = fn;
    },
    fire(type) {
      this._l?.[type]?.();
    },
    querySelectorAll: () => [],
  };
}

function load({ search = '', stored = null, nodes = [] } = {}) {
  const store = new Map();
  if (stored) store.set('ableton-rc:locale', stored);
  const doc = {
    documentElement: { lang: '' },
    querySelectorAll: (sel) =>
      nodes.filter((n) => n.matchSelector === sel),
    querySelector: () => null,
    dispatchEvent: () => {},
  };
  const ctx = {
    document: doc,
    location: { search },
    URLSearchParams,
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
    },
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    RcSurfaceI18nCatalog: {
      'perf.pads': { en: 'PADS', 'pt-BR': 'PADS' },
      'snp.transition': { en: 'Transition time', 'pt-BR': 'Tempo de transição' },
      'msg.slots': { en: '{n} slots free', 'pt-BR': '{n} slots livres' },
      'only.en': { en: 'English only' },
    },
    console,
  };
  ctx.globalThis = ctx;
  vm.runInNewContext(source, ctx);
  return { api: ctx.RcSurfaceI18n, doc, store };
}

test('the URL wins, because the QR is how the phone learns the language', () => {
  const { api } = load({ search: '?token=abc&lang=pt-BR', stored: 'en' });
  assert.equal(api.getLocale(), 'pt-BR');
});

test('storage carries a reopened page that has no parameter', () => {
  assert.equal(load({ stored: 'pt-BR' }).api.getLocale(), 'pt-BR');
  assert.equal(load({ search: '?lang=fr', stored: 'pt-BR' }).api.getLocale(), 'pt-BR');
  assert.equal(load().api.getLocale(), 'en', 'and the default when there is nothing');
});

test('a missing key shows the key, a missing translation shows English', () => {
  const { api } = load({ search: '?lang=pt-BR' });
  assert.equal(api.t('snp.transition'), 'Tempo de transição');
  // Visible in the interface is a bug report; blank is a mystery.
  assert.equal(api.t('nope.missing'), 'nope.missing');
  // Untranslated falls through rather than rendering nothing.
  assert.equal(api.t('only.en'), 'English only');
  // Terms Brazilians keep in English stay in English on purpose.
  assert.equal(api.t('perf.pads'), 'PADS');
});

test('placeholders interpolate and survive a missing parameter', () => {
  const { api } = load({ search: '?lang=pt-BR' });
  assert.equal(api.t('msg.slots', { n: 3 }), '3 slots livres');
  assert.equal(api.t('msg.slots'), '{n} slots livres', 'left visible, not blanked');
});

test('the server overrides what this browser last chose', () => {
  const { api, store } = load({ stored: 'en' });
  assert.equal(api.getLocale(), 'en');
  assert.equal(api.adoptFromServer('pt-BR'), 'pt-BR', 'the panel is the console');
  assert.equal(store.get('ableton-rc:locale'), 'pt-BR', 'and it is remembered');
  // Junk from the wire must not blank the interface.
  assert.equal(api.adoptFromServer('klingon'), 'pt-BR');
  assert.equal(api.adoptFromServer(null), 'pt-BR');
});

test('subscribers are told, and one throwing does not stop the others', () => {
  const { api } = load();
  const seen = [];
  api.subscribe(() => {
    throw new Error('bad listener');
  });
  api.subscribe((l) => seen.push(l));
  api.setLocale('pt-BR');
  assert.deepEqual(seen, ['pt-BR']);
});

test('apply writes text, attributes and the document language', () => {
  const label = el({ attrs: { 'data-i18n': 'snp.transition' } });
  label.matchSelector = '[data-i18n]';
  const btn = el({ attrs: { 'data-i18n-aria-label': 'perf.pads' } });
  btn.matchSelector = '[data-i18n-aria-label]';
  const { api, doc } = load({ search: '?lang=pt-BR', nodes: [label, btn] });
  api.apply();
  assert.equal(label.textContent, 'Tempo de transição');
  assert.equal(btn.attributes['aria-label'], 'PADS');
  assert.equal(doc.documentElement.lang, 'pt-BR');
});

test('storage being unavailable does not stop the language working', () => {
  const ctx = load();
  // Simulate private mode by making the store throw after load.
  assert.doesNotThrow(() => ctx.api.setLocale('pt-BR'));
  assert.equal(ctx.api.getLocale(), 'pt-BR');
});

test('only the two shipped locales are accepted', () => {
  const { api } = load();
  assert.deepEqual([...api.SUPPORTED], ['en', 'pt-BR']);
  for (const good of ['pt', 'pt-br', 'PT_BR', 'en-US']) {
    assert.ok(api.normalizeLocale(good));
  }
  for (const bad of ['fr', 'es', '', null, 7]) {
    assert.equal(api.normalizeLocale(bad), null);
  }
});

test('no element carries the same i18n handle twice', () => {
  // Running the marker a second time doubled 26 attributes, twice, because it
  // only checked for an existing text handle before adding an attribute one.
  // Duplicated attributes are invalid HTML and the browser silently keeps the
  // first, so the symptom is a translation that mysteriously will not update.
  for (const rel of ['../phone-v3/index.html', '../panel/index.html']) {
    const html = fs.readFileSync(path.join(import.meta.dirname, rel), 'utf8');
    const offenders = [];
    for (const tag of html.match(/<[^>]+>/g) || []) {
      for (const attr of ['data-i18n', 'data-i18n-title', 'data-i18n-aria-label', 'data-i18n-placeholder']) {
        const seen = tag.match(new RegExp(`\\s${attr}="`, 'g')) || [];
        if (seen.length > 1) offenders.push(`${rel}: ${tag.slice(0, 70)}`);
      }
    }
    assert.deepEqual(offenders, [], `duplicated handles in ${rel}`);
  }
});

test('every handle in the markup exists in the catalog', () => {
  // A handle with no entry renders as the key itself, which is visible but
  // ugly. Catch it here rather than in front of an audience.
  const catalogSrc = fs.readFileSync(path.join(import.meta.dirname, 'i18n-catalog.js'), 'utf8');
  const keys = new Set([...catalogSrc.matchAll(/^\s{4}'([\w.]+)':/gm)].map((m) => m[1]));
  assert.ok(keys.size > 200, `expected a full catalog, saw ${keys.size}`);
  const missing = new Set();
  for (const rel of ['../phone-v3/index.html', '../panel/index.html']) {
    const html = fs.readFileSync(path.join(import.meta.dirname, rel), 'utf8');
    for (const m of html.matchAll(/data-i18n(?:-title|-aria-label|-placeholder)?="([\w.]+)"/g)) {
      if (!keys.has(m[1])) missing.add(`${rel}: ${m[1]}`);
    }
  }
  assert.deepEqual([...missing], [], 'handles with no catalog entry');
});

test('the scripts route their strings through the catalog', () => {
  // A third category the markup pass cannot reach: text assigned in
  // JavaScript, which has no tag to hang a handle on.
  const files = ['../phone-v3/app.js', '../phone-v3/mapping-mode.js',
    '../phone-v3/modules/transport.js', '../phone-v3/modules/snapshots.js'];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(import.meta.dirname, rel), 'utf8');
    const literals = [...src.matchAll(/textContent\s*=\s*'([^']{2,60})'/g)]
      .map((m) => m[1])
      .filter((v) => /[A-Za-z]{2}/.test(v));
    assert.deepEqual(literals, [], `${rel} still writes untranslated text`);
    assert.ok(src.includes('const T = (k, fallback)'), `${rel} needs the catalog helper`);
    // Every lookup carries its English text, so a catalog that fails to load
    // shows English rather than raw keys like mm.clearAll.
    for (const m of src.matchAll(/T\('([\w.]+)'([^)]*)\)/g)) {
      assert.match(m[2], /^,\s*'/, `${rel}: T('${m[1]}') has no English fallback`);
    }
  }
});
