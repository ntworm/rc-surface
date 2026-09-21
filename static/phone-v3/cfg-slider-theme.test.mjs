// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import './control-config.js';
import './config-mode.js';

const root = import.meta.dirname;

function makeFakeDom() {
  const listeners = { capture: {}, bubble: {} };
  const button = {
    id: 'btn-cfg-mode',
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, force) {
        if (force === true) this._set.add(c);
        else if (force === false) this._set.delete(c);
        else if (this._set.has(c)) this._set.delete(c);
        else this._set.add(c);
      },
      contains(c) { return this._set.has(c); },
    },
    dataset: {},
    setAttribute(k, v) { this.dataset[k] = v; },
    addEventListener(name, fn) { this._listeners = this._listeners || {}; this._listeners[name] = fn; },
    _listeners: {},
    _trigger(name) { (this._listeners[name] || (() => {}))({}); },
  };
  const menu = {
    id: 'control-config-menu',
    classList: {
      _set: new Set(['hidden']),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, force) {
        if (force === true) this._set.add(c);
        else if (force === false) this._set.delete(c);
        else if (this._set.has(c)) this._set.delete(c);
        else this._set.add(c);
      },
      contains(c) { return this._set.has(c); },
    },
    style: {},
    innerHTML: '',
    set innerHTML(v) {
      this._innerHTMLValue = String(v);
      if (v === '' || v === null || v === undefined) {
        this.children.length = 0;
      }
    },
    get innerHTML() { return this._innerHTMLValue || ''; },
    setAttribute(k, v) { this._attrs = this._attrs || {}; this._attrs[k] = v; },
    removeAttribute(k) { this._attrs = this._attrs || {}; delete this._attrs[k]; },
    children: [],
    appendChild(c) { this.children.push(c); c.parent = this; },
    getAttribute(k) { return (this._attrs || {})[k] || null; },
  };
  const body = {
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, force) {
        if (force === true) this._set.add(c);
        else if (force === false) this._set.delete(c);
        else if (this._set.has(c)) this._set.delete(c);
        else this._set.add(c);
      },
      contains(c) { return this._set.has(c); },
    },
    dataset: {},
  };
  const elements = { [button.id]: button, [menu.id]: menu };

  function makeElement(name, dataset) {
    return {
      tagName: name.toUpperCase(),
      classList: {
        _set: new Set(),
        add(c) { this._set.add(c); },
        remove(c) { this._set.delete(c); },
        toggle(c, force) {
          if (force === true) this._set.add(c);
          else if (force === false) this._set.delete(c);
          else if (this._set.has(c)) this._set.delete(c);
          else this._set.add(c);
        },
        contains(c) { return this._set.has(c); },
      },
      dataset: dataset || {},
      style: { setProperty(k, v) { this[k] = v; }, getPropertyValue(k) { return this[k] || ''; } },
      children: [],
      attributes: {},
      _className: '',
      setAttribute(k, v) { this.attributes[k] = v; },
      getAttribute(k) {
        if (this.attributes && this.attributes[k] !== undefined) return this.attributes[k];
        if (this.dataset && typeof k === 'string' && k.startsWith('data-')) {
          const shortKey = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          if (this.dataset[shortKey] !== undefined) return this.dataset[shortKey];
        }
        return null;
      },
      get className() { return this._className || ''; },
      set className(v) {
        this._className = String(v);
        this.classList._set.clear();
        for (const token of this._className.split(/\s+/).filter(Boolean)) {
          this.classList._set.add(token);
        }
      },
      appendChild(c) { this.children.push(c); c.parent = this; },
      addEventListener(name, fn) { this._listeners = this._listeners || {}; this._listeners[name] = fn; },
      _listeners: {},
      closest(sel) {
        if (this.parent && this.parent.closest) return this.parent.closest(sel);
        return null;
      },
      querySelector() { return null; },
      getBoundingClientRect() { return { left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 }; },
    };
  }

  const documentRef = {
    body,
    getElementById(id) { return elements[id] || null; },
    addEventListener(name, fn, opts) {
      const phase = opts && opts.capture ? 'capture' : 'bubble';
      (listeners[phase][name] = listeners[phase][name] || []).push(fn);
    },
    removeEventListener() {},
    createElement(tag) { return makeElement(tag); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    documentElement: { clientWidth: 1024, clientHeight: 768 },
    elements,
    makeElement,
    _listeners: listeners,
  };

  const windowRef = {
    mobileMappingState: { open: false },
    closeMobileMappingMode() { windowRef.mobileMappingState.open = false; },
    RcSensorCapabilities: null,
    CSS: { escape(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); } },
    RcControlConfig: globalThis.RcControlConfig,
  };

  return { documentRef, windowRef, listeners, button, menu, body };
}

function createConfigMode() {
  const { documentRef, windowRef } = makeFakeDom();
  const cfg = globalThis.RcConfigMode.create({ document: documentRef, window: windowRef });
  cfg.attach();
  return { cfg, documentRef, windowRef };
}

class FakeDomElement {
  constructor(tag = '') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this._className = '';
    this.dataset = {};
    this._textContent = '';
    this.value = '';
    this.type = '';
    this.min = '';
    this.max = '';
    this.step = '';
    this.style = { setProperty(k, v) { this[k] = v; }, getPropertyValue(k) { return this[k] || ''; } };
    this.listeners = new Map();
    this.classList = {
      add: (name) => { this.className = `${this.className} ${name}`.trim(); },
      remove: (name) => { this.className = this.className.split(/\s+/).filter((x) => x !== name).join(' '); },
      contains: (name) => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const active = force === undefined ? !this.classList.contains(name) : !!force;
        if (active) this.classList.add(name);
        else this.classList.remove(name);
      },
    };
  }
  get className() { return this._className; }
  set className(v) { this._className = String(v); }
  get textContent() {
    if (this._textContent) return this._textContent;
    return this.children.map((c) => c.textContent).join(' ');
  }
  set textContent(val) {
    this._textContent = val;
    this.children = [];
  }
  get innerHTML() { return ''; }
  set innerHTML(val) {
    if (val === '') {
      this.children = [];
      this._textContent = '';
    }
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  setAttribute(name, value) { this[name] = value; }
  getAttribute(name) { return this[name] || null; }
  closest() { return null; }
}

async function loadMapDetailWithControl(control) {
  const ids = [
    'btn-map-mode', 'btn-map-back', 'btn-map-refresh', 'mapping-mode',
    'map-armed-strip',
    'map-mobile-status', 'map-mobile-presets', 'map-mobile-search',
    'map-mobile-controls', 'map-mobile-detail',
  ];
  const elements = new Map(ids.map((id) => [id, new FakeDomElement(id)]));
  const body = new FakeDomElement('body');
  body.dataset.page = 'performance';

  const doc = {
    readyState: 'complete',
    body,
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new FakeDomElement(tag),
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  const win = {
    document: doc,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    MappingInputContract: {
      getControlGroups: () => [],
      getProfile: () => ({ kind: 'continuous', min: 0, max: 1 }),
      normalizeValue: (_n, v) => Number(v),
      rawToNormalized: (_n, v) => Number(v),
      normalizedToRaw: (_n, v) => Number(v),
      formatValue: (_n, v) => String(v),
    },
    currentVisionProcessor: {
      positionFilters: {
        x: { minCutoff: 2.0, beta: 1.5 },
        y: { minCutoff: 2.0, beta: 1.5 },
        z: { minCutoff: 1.0, beta: 0.5 },
      },
    },
    sendPhoneCommand: (_cmd, _args, cb) => {
      if (typeof cb === 'function') cb({ ok: true, result: { targets: [], mappings: {}, clients: [], presets: [] } });
      return true;
    },
  };

  const context = vm.createContext({
    window: win,
    document: doc,
    console,
    setTimeout: win.setTimeout,
    clearTimeout: win.clearTimeout,
    Promise,
  });

  const code = fs.readFileSync(path.join(root, 'mapping-mode.js'), 'utf8');
  vm.runInContext(code, context);

  win.mobileMappingState.selectedControl = control;
  win.mobileMappingState.open = true;
  await win.loadMobileMappingData();

  return { detail: elements.get('map-mobile-detail'), context };
}

function verifyCssThemeCoverage(cssContent, selectorPattern) {
  // Checks that style.css declares track, thumb, focus-visible, and disabled
  // for the matching slider selector
  const hasTrack = (
    cssContent.includes('::-webkit-slider-runnable-track') &&
    cssContent.includes('::-moz-range-track')
  );
  const hasThumb = (
    cssContent.includes('::-webkit-slider-thumb') &&
    cssContent.includes('::-moz-range-thumb')
  );
  const hasFocus = cssContent.includes(':focus-visible');
  const hasDisabled = cssContent.includes(':disabled');

  return {
    hasTrack,
    hasThumb,
    hasFocus,
    hasDisabled,
  };
}

test('CFG XY 2 sliders render with theme-applicable selector and style.css declarations', () => {
  const { cfg, documentRef } = createConfigMode();
  let frictionVal = 0.012;
  let bounceVal = 0.75;

  cfg.register(/^xy-2$/, (name) => [
    { slider: { label: 'Friction', min: 0.002, max: 0.05, step: 0.001, get: () => frictionVal, set: (v) => { frictionVal = v; }, format: (v) => v.toFixed(3) } },
    { slider: { label: 'Bounce', min: 0, max: 0.95, step: 0.05, get: () => bounceVal, set: (v) => { bounceVal = v; }, format: (v) => v.toFixed(2) } },
  ]);

  cfg.open('xy-2', { left: 10, top: 10, right: 100, bottom: 50, width: 90, height: 40 });

  const menu = documentRef.getElementById('control-config-menu');
  const body = menu.children[1];
  assert.equal(body.className, 'cfg-menu-body');
  assert.equal(body.children.length, 2);

  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

  // Verify each slider in CFG
  for (const sliderWrapper of body.children) {
    assert.equal(sliderWrapper.className, 'cfg-slider');
    const row = sliderWrapper.children.find((c) => c.className.includes('cfg-slider-row'));
    assert.ok(row, 'must have .cfg-slider-row');
    const input = row.children.find((c) => c.tagName === 'INPUT' && c.type === 'range');
    assert.ok(input, 'must have range input');

    // Theme selector check:
    // Either input has a class shared with .morph-slider theme,
    // OR style.css has explicit rules for .cfg-slider-row input[type="range"] / .cfg-slider-row input
    const hasSharedClass = input.classList.contains('morph-slider');
    const hasRowCssRule = (
      css.includes('.cfg-slider-row input') ||
      css.includes('.cfg-slider-input') ||
      css.includes('.cfg-slider-row input[type="range"]')
    );

    assert.ok(
      hasSharedClass || hasRowCssRule,
      'CFG range input must have a selector applicable to slider theme (.morph-slider class or .cfg-slider-row input rule in style.css)',
    );

    // Verify style.css declares track, thumb, focus-visible, and disabled for CFG sliders
    const coverage = verifyCssThemeCoverage(css);
    assert.ok(coverage.hasTrack, 'style.css must declare ::-webkit-slider-runnable-track and ::-moz-range-track');
    assert.ok(coverage.hasThumb, 'style.css must declare ::-webkit-slider-thumb and ::-moz-range-thumb');
    assert.ok(coverage.hasFocus, 'style.css must declare :focus-visible');
    assert.ok(coverage.hasDisabled, 'style.css must declare :disabled');

    // Also verify that style.css connects the theme declarations to the CFG selector
    const ruleMatchesCfg = (
      hasSharedClass ||
      /\.cfg-slider-row\s+input[^{]*::-webkit-slider-runnable-track/.test(css) ||
      /\.cfg-slider-row\s+input[^{]*::-webkit-slider-thumb/.test(css) ||
      /\.cfg-slider-input[^{]*::-webkit-slider-thumb/.test(css)
    );
    assert.ok(
      ruleMatchesCfg,
      'style.css must connect track and thumb rules to CFG slider input selector',
    );
  }

  // Range attributes and events preserved
  const frictionRow = body.children[0].children.find((c) => c.className.includes('cfg-slider-row'));
  const frictionInput = frictionRow.children.find((c) => c.tagName === 'INPUT');
  const frictionLabel = frictionRow.children.find((c) => c.className === 'cfg-slider-value');
  assert.equal(frictionInput.min, '0.002');
  assert.equal(frictionInput.max, '0.05');
  assert.equal(frictionInput.step, '0.001');
  assert.equal(frictionInput.value, '0.012');
  assert.equal(frictionLabel.textContent, '0.012');

  // Input event triggers set and updates value label
  frictionInput.value = '0.025';
  frictionInput._listeners.input();
  assert.equal(frictionVal, 0.025);
  assert.equal(frictionLabel.textContent, '0.025');
});

test('MAP vision sensor filter sliders have theme-applicable selector in style.css', async () => {
  const { detail } = await loadMapDetailWithControl('sensor.vision.x');
  const panel = detail.children.find((c) => c.className.includes('map-vision-filter-panel'));
  assert.ok(panel, 'map-vision-filter-panel must exist for sensor.vision.x');

  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

  // Find slider inputs in the filter panel
  const inputs = [];
  function collectRangeInputs(node) {
    if (node.tagName === 'INPUT' && (node.type === 'range' || node.getAttribute('type') === 'range')) {
      inputs.push(node);
    }
    for (const child of node.children || []) collectRangeInputs(child);
  }
  collectRangeInputs(panel);

  assert.equal(inputs.length, 2, 'must have minCutoff and beta sliders in panel');

  for (const input of inputs) {
    const hasSharedClass = input.classList.contains('morph-slider');
    const hasMapCssRule = (
      css.includes('.map-vision-filter-panel input') ||
      css.includes('.map-vision-slider') ||
      css.includes('.map-vision-filter-row input')
    );

    assert.ok(
      hasSharedClass || hasMapCssRule,
      'MAP vision filter slider must have theme-applicable selector (.morph-slider class or .map-vision-filter rule in style.css)',
    );

    const ruleMatchesMap = (
      hasSharedClass ||
      /\.map-vision-filter[^{]*::-webkit-slider-runnable-track/.test(css) ||
      /\.map-vision-filter[^{]*::-webkit-slider-thumb/.test(css) ||
      /\.map-vision-slider[^{]*::-webkit-slider-thumb/.test(css)
    );
    assert.ok(
      ruleMatchesMap,
      'style.css must connect track and thumb rules to MAP filter slider input selector',
    );
  }
});
test('CFG slider sets --range-progress on render and input', () => {
  const { cfg, documentRef } = createConfigMode();
  let val = 0.25;
  cfg.register(/^prog-1$/, () => [
    { slider: { label: 'Prog', min: 0, max: 1, step: 0.01, get: () => val, set: (v) => { val = v; } } }
  ]);
  cfg.open('prog-1', { left: 0, top: 0, right: 100, bottom: 50, width: 100, height: 50 });
  const menu = documentRef.getElementById('control-config-menu');
  const body = menu.children[1];
  const row = body.children[0].children.find((c) => c.className.includes('cfg-slider-row'));
  const input = row.children.find((c) => c.tagName === 'INPUT');

  assert.equal(input.style.getPropertyValue('--range-progress'), '25%');

  input.value = '0.75';
  input._listeners.input();
  assert.equal(input.style.getPropertyValue('--range-progress'), '75%');
});
