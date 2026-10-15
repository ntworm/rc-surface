// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Generator tests only: no claim about physical SDK/automation sampling rate.
import test from 'node:test';
import assert from 'node:assert/strict';
import './control-config.js';
import './config-mode.js';

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
      style: {},
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
      set className(v) { this._className = String(v); },
      appendChild(c) { this.children.push(c); c.parent = this; },
      addEventListener(name, fn) { this._listeners = this._listeners || {}; this._listeners[name] = fn; },
      _listeners: {},
      closest(sel) {
        if (sel === '[data-name]' && this.dataset && this.dataset.name) return this;
        if (sel.startsWith('.page[') && sel.includes('data-page=')) {
          const m = sel.match(/data-page="([^"]+)"/);
          const wanted = m ? m[1] : null;
          const isPage = (this.className || (this.classList && this.classList._set) ? this.className || '' : '').split ? (this.className || '').split(/\s+/).includes('page') : false;
          if (!wanted) {
            return this.parent && this.parent.closest ? this.parent.closest(sel) : null;
          }
          if (isPage && this.dataset && this.dataset.page === wanted) return this;
          return this.parent && this.parent.closest ? this.parent.closest(sel) : null;
        }
        if (this.parent && this.parent.closest) return this.parent.closest(sel);
        return null;
      },
      querySelector() { return null; },
      getBoundingClientRect() { return { left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 }; },
    };
  }

  function makePage(pageName, children) {
    const page = makeElement('div', { page: pageName });
    page.className = 'page';
    for (const c of children) page.appendChild(c);
    return page;
  }

  const documentRef = {
    body,
    getElementById(id) { return elements[id] || null; },
    addEventListener(name, fn, opts) {
      const phase = opts && opts.capture ? 'capture' : 'bubble';
      (listeners[phase][name] = listeners[phase][name] || []).push(fn);
    },
    removeEventListener(name, fn, opts) {
      const phase = opts && opts.capture ? 'capture' : 'bubble';
      const arr = listeners[phase][name] || [];
      const i = arr.indexOf(fn);
      if (i !== -1) arr.splice(i, 1);
    },
    createElement(tag) { return makeElement(tag); },
    querySelector(sel) {
      if (sel.startsWith('[data-name="')) {
        const wanted = sel.slice('[data-name="'.length, -2);
        for (const [id, el] of Object.entries(elements)) {
          if (el.dataset && el.dataset.name === wanted) return el;
        }
      }
      return null;
    },
    querySelectorAll() { return []; },
    documentElement: { clientWidth: 1024, clientHeight: 768 },
    elements,
    makeElement,
    makePage,
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

function dispatchPointerDownCapture(documentRef, target, button = 0) {
  const ev = {
    target,
    type: 'pointerdown',
    button,
    preventDefault() { this._prevented = true; },
    stopPropagation() { this._stopped = true; },
    stopImmediatePropagation() { this._stoppedImmediate = true; },
  };
  const capture = documentRef._listeners.capture.pointerdown || [];
  for (const fn of capture) fn(ev);
  return ev;
}

function dispatchPointerUpCapture(documentRef, target, button = 0) {
  const ev = {
    target,
    type: 'pointerup',
    button,
    preventDefault() { this._prevented = true; },
    stopPropagation() { this._stopped = true; },
    stopImmediatePropagation() { this._stoppedImmediate = true; },
  };
  const capture = documentRef._listeners.capture.pointerup || [];
  for (const fn of capture) fn(ev);
  const clickCapture = documentRef._listeners.capture.click || [];
  for (const fn of clickCapture) fn(ev);
  return ev;
}

test('toggle turns on the body class and updates button aria-pressed', () => {
  const { cfg, documentRef } = createConfigMode();
  cfg.toggle();
  assert.equal(documentRef.body.classList.contains('config-mode'), true);
  assert.equal(cfg.state.on, true);
  cfg.toggle();
  assert.equal(documentRef.body.classList.contains('config-mode'), false);
  assert.equal(cfg.state.on, false);
});

test('turning on with MAP open closes MAP first', () => {
  const { cfg, windowRef } = createConfigMode();
  windowRef.mobileMappingState.open = true;
  cfg.on();
  assert.equal(windowRef.mobileMappingState.open, false);
  assert.equal(cfg.state.on, true);
});

test('capture-phase pointerdown on a data-name inside PERF is blocked', () => {
  const { cfg, documentRef } = createConfigMode();
  cfg.on();
  const perfPage = documentRef.makePage('performance', []);
  const pad = documentRef.makeElement('div', { name: 'pad-1' });
  perfPage.appendChild(pad);
  const ev = dispatchPointerDownCapture(documentRef, pad);
  assert.equal(ev._prevented, true);
  assert.equal(ev._stopped, true);
});

test('capture-phase pointerdown outside CFG pages is ignored', () => {
  const { cfg, documentRef } = createConfigMode();
  cfg.on();
  const otherPage = documentRef.makePage('video', []);
  const knob = documentRef.makeElement('div', { name: 'cam-knob-1' });
  otherPage.appendChild(knob);
  const ev = dispatchPointerDownCapture(documentRef, knob);
  assert.equal(ev._prevented, undefined);
  assert.equal(cfg.state.pointerDownAnchor, null);
});

test('pointerup after pointerdown on a CFG control opens the menu', () => {
  const { cfg, documentRef } = createConfigMode();
  cfg.on();
  const perfPage = documentRef.makePage('performance', []);
  const pad = documentRef.makeElement('div', { name: 'pad-1' });
  perfPage.appendChild(pad);
  dispatchPointerDownCapture(documentRef, pad);
  dispatchPointerUpCapture(documentRef, pad);
  assert.equal(cfg.state.openFor, 'pad-1');
  assert.equal(documentRef.getElementById('control-config-menu').classList.contains('hidden'), false);
});

test('contextmenu on a CFG control opens the menu and prevents default', () => {
  const { cfg, documentRef } = createConfigMode();
  const perfPage = documentRef.makePage('performance', []);
  const pad = documentRef.makeElement('div', { name: 'pad-2' });
  perfPage.appendChild(pad);
  const ev = {
    target: pad,
    type: 'contextmenu',
    preventDefault() { this._prevented = true; },
    stopPropagation() { this._stopped = true; },
  };
  for (const fn of documentRef._listeners.bubble.contextmenu || []) fn(ev);
  assert.equal(cfg.state.openFor, 'pad-2');
  assert.equal(ev._prevented, true);
});

test('Escape closes the open menu', () => {
  const { cfg, documentRef } = createConfigMode();
  cfg.on();
  cfg.open('pad-1', { left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 });
  assert.equal(cfg.state.openFor, 'pad-1');
  const keyEv = { key: 'Escape' };
  for (const fn of documentRef._listeners.bubble.keydown || []) fn(keyEv);
  assert.equal(cfg.state.openFor, null);
});

test('second right-click on the same control closes CFG; another control opens its own menu',()=>{
  const {cfg,documentRef}=createConfigMode();
  const a=documentRef.makeElement('div',{name:'pad-1'}),b=documentRef.makeElement('div',{name:'toggle-2'});
  documentRef.makePage('performance',[a,b]);
  const rightClick=target=>cfg._internals.onContextMenu({target,preventDefault(){},stopPropagation(){}});
  rightClick(a);assert.equal(cfg.state.openFor,'pad-1');
  rightClick(b);assert.equal(cfg.state.openFor,'toggle-2');
  rightClick(b);assert.equal(cfg.state.openFor,null);assert.equal(cfg.state.on,false);
  cfg.on();cfg.open('pad-1');rightClick(a);
  assert.equal(cfg.state.openFor,null);assert.equal(cfg.state.on,true,'explicit CFG mode stays enabled');
});

for(const contextBeforeUp of [true,false]) test(`right mouse sequence switches controls without toggling the new menu off (${contextBeforeUp?'context-first':'up-first'})`,()=>{
  const {cfg,documentRef}=createConfigMode();
  const a=documentRef.makeElement('div',{name:'pad-1'}),b=documentRef.makeElement('div',{name:'pad-2'});
  documentRef.makePage('performance',[a,b]);
  const right=target=>{
    dispatchPointerDownCapture(documentRef,target,2);
    const context=()=>cfg._internals.onContextMenu({target,button:2,preventDefault(){},stopPropagation(){}});
    if(contextBeforeUp)context();
    dispatchPointerUpCapture(documentRef,target,2);
    if(!contextBeforeUp)context();
  };
  right(a);assert.equal(cfg.state.openFor,'pad-1');
  right(b);assert.equal(cfg.state.openFor,'pad-2');
  right(b);assert.equal(cfg.state.openFor,null);
});

test('register/render: builder is invoked with the control name and returns declarative items', () => {
  // The renderer is exercised end-to-end by Playwright (tests/ui/config-mode.spec.mjs).
  // The Node unit test only verifies that the builder contract works: name is
  // passed through, returned items are honoured by the renderer (verified by
  // tracking which item types the renderer handled via a stub container).
  const { cfg } = createConfigMode();
  let receivedName = null;
  cfg.register('pad-1', (name) => {
    receivedName = name;
    return [];
  });
  // The renderer only walks the items array if it reaches renderItems; the
  // popover opens with an empty body, but the builder ran and received the name.
  cfg.open('pad-1', { left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30 });
  assert.equal(receivedName, 'pad-1');
  assert.equal(cfg.state.openFor, 'pad-1');
});

test('renderItems unwraps segment/slider/action/info into populated controls', () => {
  // P02: builders return { segment: {...} }, { slider: {...} } wrappers. The
  // renderer must pass the inner object so labels, buttons and range inputs
  // actually appear in the popover instead of an empty container.
  const { cfg, documentRef } = createConfigMode();
  cfg.register('pad-1', () => [
    { segment: { label: 'Mode', options: [{ label: 'A', value: 'A' }, { label: 'B', value: 'B' }], get: () => 'A', set: () => {} } },
    { slider: { label: 'Swing', min: 0, max: 1, step: 0.05, get: () => 0.5, set: () => {} } },
    { action: { label: 'Reset', run: () => {} } },
    { info: { text: 'Per-instance note' } },
  ]);
  cfg.open('pad-1', { left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30 });
  const menu = documentRef.getElementById('control-config-menu');
  const body = menu.children[1];
  assert.equal(body.className, 'cfg-menu-body');
  assert.equal(body.children.length, 4);
  assert.equal(body.children[0].className, 'cfg-segment');
  assert.equal(body.children[1].className, 'cfg-slider');
  assert.equal(body.children[2].className, 'cfg-action');
  assert.equal(body.children[3].className, 'cfg-info');
  // Segment buttons render their option labels.
  const group = body.children[0].children.find((c) => c.className === 'cfg-segment-group');
  assert.equal(group.children.length, 2);
  assert.equal(group.children[0].textContent, 'A');
  assert.equal(group.children[1].textContent, 'B');
  // Slider renders a labelled range input.
  const slider = body.children[1];
  assert.equal(slider.children[0].className, 'cfg-item-label');
  assert.equal(slider.children[0].textContent, 'Swing');
  const input = slider.children[1].children[0];
  assert.equal(input.type, 'range');
  assert.equal(input.value, '0.5');
});

test('closing a contextmenu-opened popover turns CFG back off', () => {
  // P04: a right-click popover is transient. Closing it must reset state.on so
  // the capture-phase pointerdown handler stops swallowing normal clicks.
  const { cfg, documentRef } = createConfigMode();
  const perfPage = documentRef.makePage('performance', []);
  const pad = documentRef.makeElement('div', { name: 'pad-3' });
  perfPage.appendChild(pad);
  const ev = { target: pad, type: 'contextmenu', preventDefault() {}, stopPropagation() {} };
  for (const fn of documentRef._listeners.bubble.contextmenu || []) fn(ev);
  assert.equal(cfg.state.openFor, 'pad-3');
  assert.equal(cfg.state.on, true);
  cfg.close();
  assert.equal(cfg.state.openFor, null);
  assert.equal(cfg.state.on, false);
});

test('switching away from PERF/MIX turns CFG off automatically', () => {
  const { cfg, documentRef } = createConfigMode();
  cfg.on();
  assert.equal(cfg.state.on, true);
  cfg._internals.onPageChange({ detail: { page: 'audio' } });
  assert.equal(cfg.state.on, false);
  assert.equal(documentRef.body.classList.contains('config-mode'), false);
  // PERF and MIX keep CFG on.
  cfg.on();
  cfg._internals.onPageChange({ detail: { page: 'mixer' } });
  assert.equal(cfg.state.on, true);
});

test('direct choices keep numeric types, selection and expanded rhythm editor across refresh',()=>{
  const {cfg,documentRef}=createConfigMode();let chosen;
  cfg.register('toggle-1',()=>[
    {segment:{label:'Timing',refresh:true,options:[{label:'SYNC',value:'sync'}],get:()=>chosen,set:v=>{chosen=v;}}},
    {details:{label:'Subdivision · '+chosen,items:[{segment:{refresh:true,options:[{label:'1/16',value:.25},{label:'Invalid',value:1,disabled:true}],get:()=>chosen,set:v=>{chosen=v;}}}]}},
  ]);
  cfg.open('toggle-1',{left:0,top:10,bottom:30});
  const menu=documentRef.getElementById('control-config-menu');
  const details=menu.children[1].children[1];
  assert.equal(details.tagName,'DETAILS');assert.equal(details.open,false);
  details.open=true;details._listeners.toggle();
  const buttons=details.children[1].children[0].children[0].children;
  buttons[1]._listeners.click();assert.equal(chosen,undefined);
  buttons[0]._listeners.click();assert.equal(chosen,.25);
  assert.equal(cfg.state.openFor,'toggle-1');
  const refreshed=menu.children[1].children[1];
  assert.equal(refreshed.open,true);
  assert.equal(refreshed.children[1].children[0].children[0].children[0].getAttribute('aria-pressed'),'true');
});

test('small viewport bounds the whole popover rather than only its body',()=>{
  const {cfg,documentRef,windowRef}=createConfigMode();windowRef.innerHeight=260;windowRef.innerWidth=320;
  documentRef.documentElement.clientHeight=260;documentRef.documentElement.clientWidth=320;
  cfg.open('toggle-1',{left:20,top:190,bottom:230});
  const menu=documentRef.getElementById('control-config-menu');
  assert.equal(menu.style.maxHeight,'244px');assert.equal(menu.style.top,'8px');
});


test('the shared menu renderer supports AUT without consuming performance gestures or leaking CFG',()=>{
  const {documentRef,windowRef,body}=makeFakeDom();
  let active=true;
  const aut=globalThis.RcConfigMode.create({document:documentRef,window:windowRef,primary:false,
    modeClass:'automation-mode',contextEnabled:()=>active,accept:name=>/^xy-[12]$/.test(name)});
  aut.attach();aut.on();assert.equal(body.classList.contains('automation-mode'),true);
  const page=documentRef.makePage('performance',[]),xy=documentRef.makeElement('div',{name:'xy-1'});
  page.appendChild(xy);assert.equal(dispatchPointerDownCapture(documentRef,xy)._prevented,undefined);
  const right=target=>aut._internals.onContextMenu({target,preventDefault(){},stopPropagation(){}});
  right(xy);assert.equal(aut.state.openFor,'xy-1');right(xy);assert.equal(aut.state.openFor,null);
  active=false;right(xy);assert.equal(aut.state.openFor,null);
  windowRef.RcAutomationMode={state:{on:true},off(){this.state.on=false;}};
  const cfg=globalThis.RcConfigMode.create({document:documentRef,window:windowRef});cfg.on();
  assert.equal(windowRef.RcAutomationMode.state.on,false);
});
