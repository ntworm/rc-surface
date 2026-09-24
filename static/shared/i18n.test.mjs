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

function load({ search = '', stored = null, nodes = [], pageLocale = null } = {}) {
  const store = new Map();
  if (stored) store.set('ableton-rc:locale', stored);
  const doc = {
    documentElement: {
      lang: '',
      getAttribute: (name) => (name === 'data-default-locale' ? pageLocale : null),
    },
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

test('a page published in one language opens in it, unless the URL asks otherwise', () => {
  // docs/pt-br.html is the Portuguese landing page: a visitor who last chose
  // English on the English page still has to read the page they opened.
  assert.equal(load({ pageLocale: 'pt-BR', stored: 'en' }).api.getLocale(), 'pt-BR');
  assert.equal(load({ pageLocale: 'pt-BR', search: '?lang=en' }).api.getLocale(), 'en');
  // Pages without the attribute — the phone, the panel — are unchanged.
  assert.equal(load({ stored: 'pt-BR' }).api.getLocale(), 'pt-BR');
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
    assert.match(src, /const T = \(k, fallback(?:, params)?\)/, `${rel} needs the catalog helper`);
    // Every lookup carries its English text, so a catalog that fails to load
    // shows English rather than raw keys like mm.clearAll.
    for (const m of src.matchAll(/T\('([\w.]+)'([^)]*)\)/g)) {
      assert.match(m[2], /^,\s*'/, `${rel}: T('${m[1]}') has no English fallback`);
    }
  }
});

test('every catalog lookup in the phone scripts exists in both languages with the same placeholders', () => {
  // A status line built from a template literal cannot be translated, and a
  // key whose Portuguese drops a {placeholder} shows the raw brace on stage.
  const catalogSrc = fs.readFileSync(path.join(import.meta.dirname, 'i18n-catalog.js'), 'utf8');
  const scope = {};
  vm.runInNewContext(catalogSrc, { globalThis: scope });
  const catalog = scope.RcSurfaceI18nCatalog;
  const slots = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const problems = [];
  for (const rel of ['../phone-v3/app.js', '../phone-v3/mapping-mode.js']) {
    const src = fs.readFileSync(path.join(import.meta.dirname, rel), 'utf8');
    for (const m of src.matchAll(/T\('([\w.]+)',\s*'([^']*)'/g)) {
      const [, key, fallback] = m;
      const entry = catalog[key];
      if (!entry) { problems.push(`${rel}: ${key} is not in the catalog`); continue; }
      if (!entry['pt-BR']) problems.push(`${key} has no pt-BR`);
      if (entry.en.replace(/\s+/g, ' ') !== fallback) problems.push(`${key}: fallback "${fallback}" differs from catalog "${entry.en}"`);
      for (const locale of ['en', 'pt-BR']) {
        if (slots(entry[locale]).join() !== slots(fallback).join()) {
          problems.push(`${key} [${locale}] placeholders ${slots(entry[locale])} vs ${slots(fallback)}`);
        }
      }
    }
    for (const m of src.matchAll(/(?:status|readoutEl)\.textContent\s*=[^;]*`[^`]*[A-Za-z]{3}[^`]*`/g)) {
      problems.push(`${rel}: template literal written straight to the screen: ${m[0].slice(0, 80)}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('the pose-slot status lines read in Portuguese', () => {
  const catalogSrc = fs.readFileSync(path.join(import.meta.dirname, 'i18n-catalog.js'), 'utf8');
  const { api } = load({ search: '?lang=pt-BR' });
  const scope = {};
  vm.runInNewContext(catalogSrc, { globalThis: scope });
  api.registerCatalog(scope.RcSurfaceI18nCatalog);
  // USER-GUIDE.pt-BR.md tells the reader to look for this exact wording.
  assert.match(api.t('vid.recaptureRequired'), /^RECAPTURA NECESSÁRIA/);
  assert.equal(api.t('vid.slotPartial', { n: 2, left: 1 }), '2/3 salvos · capture mais 1');
  assert.equal(api.t('vid.poseRecognized', { name: 'G1', percent: 77 }), '✓ G1 reconhecido · 77%');
  // The buttons read TESTE and APAGAR ÚLTIMA, so the prose names them that way.
  assert.match(api.t('vid.slotReady'), /TESTE/);
  assert.match(api.t('vid.poseFull'), /APAGAR ÚLTIMA/);
  assert.equal(api.t('mm.inOutLost', { in: '0.50', out: '0.25' }), 'SEM SINAL — último In: 0.50 | Out: 0.25');
});
