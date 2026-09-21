// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

/**
 * Interface language for the panel and the phone.
 *
 * The extension owns the setting, not the browser: the panel and the phone are
 * different browsers on different machines, so a per-device preference would
 * never travel between them. This module therefore resolves the language in a
 * deliberate order:
 *
 *   1. `?lang=` on the URL — the QR carries it, so the phone paints in the
 *      right language on the first frame instead of flashing English.
 *   2. localStorage — a surface reopened without the parameter keeps what it
 *      last saw, so a bookmarked page is not stuck in the wrong language.
 *   3. the shipped default.
 *
 * The server can override at any time through `adoptFromServer`, which is how
 * a phone that is already open follows a change made in the panel.
 *
 * Strings live in i18n-catalog.js so this file stays a mechanism rather than a
 * dictionary.
 */
(function rcSurfaceI18n(globalScope) {
  'use strict';

  const STORAGE_KEY = 'ableton-rc:locale';
  const SUPPORTED = Object.freeze(['en', 'pt-BR']);
  const DEFAULT = 'en';

  const documentRef = globalScope.document ?? null;
  const listeners = new Set();
  let locale = DEFAULT;
  let catalog = globalScope.RcSurfaceI18nCatalog || {};

  /** Same shapes the server's normalizeLocale accepts, for the same reasons. */
  function normalizeLocale(value) {
    if (typeof value !== 'string') return null;
    const head = value.split(',')[0]?.trim().replace('_', '-').toLowerCase() ?? '';
    if (!head) return null;
    if (head === 'pt' || head.startsWith('pt-')) return 'pt-BR';
    if (head === 'en' || head.startsWith('en-')) return 'en';
    return null;
  }

  function fromUrl() {
    try {
      const params = new globalScope.URLSearchParams(globalScope.location?.search || '');
      return normalizeLocale(params.get('lang'));
    } catch {
      return null;
    }
  }

  function fromStorage() {
    try {
      return normalizeLocale(globalScope.localStorage?.getItem(STORAGE_KEY));
    } catch {
      // Private mode, or storage disabled. Not a reason to fail to render.
      return null;
    }
  }

  function remember(value) {
    try {
      globalScope.localStorage?.setItem(STORAGE_KEY, value);
    } catch {
      /* the language still applies for this page */
    }
  }

  function interpolate(template, params) {
    if (!params) return template;
    return String(template).replace(/\{(\w+)\}/g, (whole, key) =>
      Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : whole,
    );
  }

  /**
   * A missing key returns the key itself rather than blank: a visible
   * `perf.padModes` in the interface is a bug report, an empty label is a
   * mystery. A missing translation falls through to English rather than
   * showing nothing.
   */
  function t(key, params, requestedLocale) {
    const entry = catalog[key];
    if (!entry) return key;
    const want = requestedLocale || locale;
    const value = entry[want] ?? entry[DEFAULT] ?? key;
    return interpolate(value, params);
  }

  function apply(root) {
    const scope = root || documentRef;
    if (!scope?.querySelectorAll) return;
    const mappings = [
      ['data-i18n', 'textContent'],
      // Prose with inline markup — a <b>, a <code>, a link mid-sentence — has
      // to be translated as one unit. Word order differs between languages, so
      // translating each text node around the tags produces sentences that are
      // correct fragment by fragment and wrong as a whole. The catalog value
      // carries the inline tags and is written as HTML.
      ['data-i18n-html', 'innerHTML'],
      ['data-i18n-title', 'title'],
      ['data-i18n-placeholder', 'placeholder'],
      ['data-i18n-aria-label', 'aria-label'],
      // A document that exists in both languages lives in two files, so the
      // destination is part of the translation, not just the label.
      ['data-i18n-href', 'href'],
    ];
    for (const [attribute, property] of mappings) {
      for (const element of scope.querySelectorAll(`[${attribute}]`)) {
        const value = t(element.getAttribute(attribute));
        if (property === 'aria-label') element.setAttribute('aria-label', value);
        else if (property === 'href') element.setAttribute('href', value);
        else if (property === 'innerHTML') {
          // Only ever a catalog value, which ships with the project — there is
          // no user input on this path.
          element.innerHTML = value;
        } else element[property] = value;
      }
    }
    if (documentRef?.documentElement) documentRef.documentElement.lang = locale;
    for (const el of scope.querySelectorAll('[data-locale-value]')) {
      if (el.value !== undefined) el.value = locale;
    }
  }

  function notify() {
    for (const listener of listeners) {
      try {
        listener(locale);
      } catch {
        /* one bad listener must not stop the rest from re-rendering */
      }
    }
    try {
      documentRef?.dispatchEvent?.(
        new globalScope.CustomEvent('rcsurface:languagechange', { detail: { locale } }),
      );
    } catch {
      /* no CustomEvent in this environment */
    }
  }

  function commit(next, { persist }) {
    if (!next || next === locale) return locale;
    locale = next;
    if (persist) remember(locale);
    apply();
    notify();
    return locale;
  }

  /** A local choice: remembered on this device and sent to the server by the caller. */
  function setLocale(value) {
    return commit(normalizeLocale(value), { persist: true });
  }

  /**
   * The server's word, which wins over what this browser last chose — that is
   * the whole point of the panel being the console. Still remembered, so a
   * reload before the socket is up does not go back to the old language.
   */
  function adoptFromServer(value) {
    return commit(normalizeLocale(value), { persist: true });
  }

  function getLocale() {
    return locale;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /**
   * Wires a <select> or a set of buttons carrying data-set-locale. Returns the
   * chosen locale through onChange so the caller can tell the server; this
   * module never talks to the socket itself.
   */
  function bindSelector(target, onChange) {
    const el = typeof target === 'string' ? documentRef?.querySelector(target) : target;
    if (!el) return;
    const announce = (value) => {
      const next = setLocale(value);
      if (typeof onChange === 'function') onChange(next);
    };
    if (el.tagName === 'SELECT') {
      el.value = locale;
      el.addEventListener('change', () => announce(el.value));
    } else {
      el.querySelectorAll?.('[data-set-locale]').forEach((btn) => {
        btn.addEventListener('click', () => announce(btn.dataset.setLocale));
      });
    }
    // subscribe() only fires on change, so the first paint would leave every
    // button unmarked. Sync once against the locale we already resolved.
    const sync = (value) => {
      if (el.tagName === 'SELECT') el.value = value;
      el.querySelectorAll?.('[data-set-locale]').forEach((btn) => {
        const on = btn.dataset.setLocale === value;
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', String(on));
      });
    };
    sync(locale);
    subscribe(sync);
  }

  function registerCatalog(entries) {
    catalog = Object.assign({}, catalog, entries || {});
    apply();
  }

  locale = fromUrl() || fromStorage() || DEFAULT;

  globalScope.RcSurfaceI18n = Object.freeze({
    STORAGE_KEY,
    SUPPORTED,
    DEFAULT,
    normalizeLocale,
    getLocale,
    setLocale,
    adoptFromServer,
    t,
    apply,
    subscribe,
    bindSelector,
    registerCatalog,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
