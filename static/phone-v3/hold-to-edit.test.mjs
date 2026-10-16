// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./hold-to-edit.js', import.meta.url), 'utf8');

function harness({ hit = 'outMin', panelRect = { left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200 } } = {}) {
  const timers = new Map();
  let timerId = 0;
  const windowEvents = new Map(), documentEvents = new Map(), listeners = new Map();
  const surface = {
    dataset: {}, captured: [],
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener(name) { listeners.delete(name); },
    setPointerCapture(id) { this.captured.push(id); },
    releasePointerCapture() {},
  };
  const document = { hidden: false, addEventListener: (name, handler) => documentEvents.set(name, handler), removeEventListener() {} };
  const context = vm.createContext({
    document,
    setTimeout: (handler) => { timers.set(++timerId, handler); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    addEventListener: (name, handler) => windowEvents.set(name, handler),
    removeEventListener: (name) => windowEvents.delete(name),
  });
  vm.runInContext(source, context);
  const log = [];
  const api = context.RcHoldToEdit.attach(surface, {
    hitTest: () => hit,
    begin: (key) => { log.push(['begin', key]); return { [key]: 0.25 }; },
    move: (key, event) => log.push(['move', key, event.clientY]),
    end: (key) => log.push(['end', key]),
    cancel: (key, snapshot) => log.push(['cancel', key, snapshot[key]]),
    panel: { getBoundingClientRect: () => panelRect },
  });
  const fire = (name, event = {}) => {
    let prevented = false;
    listeners.get(name)?.({ pointerId: 1, button: 0, clientX: 50, clientY: 50, ...event, preventDefault() { prevented = true; } });
    return prevented;
  };
  const elapse = () => { const pending = [...timers.values()]; timers.clear(); for (const handler of pending) handler(); };
  return { api, surface, log, fire, elapse, timers, windowEvents, documentEvents, context };
}
const touch = (extra = {}) => ({ pointerType: 'touch', ...extra });

test('touch: a quick tap and a scroll before the hold never edit', () => {
  const h = harness();
  assert.equal(h.fire('pointerdown', touch()), false, 'no preventDefault before the hold: the browser may scroll');
  h.fire('pointerup', touch());
  h.elapse();
  assert.deepEqual(h.log, []);
  h.fire('pointerdown', touch());
  h.fire('pointermove', touch({ clientY: 80 }));
  h.elapse();
  h.fire('pointermove', touch({ clientY: 90 }));
  h.fire('pointerup', touch());
  assert.deepEqual(h.log, [], 'moving past the slop turns the press into a scroll');
  assert.equal(h.fire('touchmove'), false, 'scroll is never blocked while nothing is held');
  assert.equal(h.surface.captured.length, 0);
});

test('touch: hold selects, drag edits, release ends; the hold timer is the 600 ms CFG long press', () => {
  const h = harness();
  assert.equal(h.context.RcHoldToEdit.HOLD_MS, 600);
  h.fire('pointerdown', touch());
  h.fire('pointermove', touch({ clientX: 53, clientY: 52 }));
  assert.equal(h.surface.dataset.holdEdit, undefined, 'not selected before the hold completes');
  h.elapse();
  assert.equal(h.surface.dataset.holdEdit, 'outMin', 'selection is visible');
  assert.deepEqual(h.surface.captured, [1]);
  assert.equal(h.fire('touchmove'), true, 'the held handle owns the touch, not the page');
  assert.equal(h.fire('pointermove', touch({ clientY: 120 })), true);
  h.fire('pointerup', touch());
  assert.deepEqual(h.log, [['begin', 'outMin'], ['move', 'outMin', 120], ['end', 'outMin']]);
  assert.equal(h.surface.dataset.holdEdit, undefined);
  assert.equal(h.fire('touchmove'), false);
});

test('touch on the background (no handle) is ignored entirely', () => {
  const h = harness({ hit: null });
  h.fire('pointerdown', touch());
  h.elapse();
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.log, []);
});

test('cancel paths restore the selected value and never leave a drag stuck', () => {
  for (const trigger of ['pointercancel', 'lostpointercapture', 'leave', 'ableton-rc:page-change', 'ableton-rc:phone-ws-close', 'blur', 'hidden']) {
    const h = harness();
    h.fire('pointerdown', touch());
    h.elapse();
    h.fire('pointermove', touch({ clientY: 70 }));
    if (trigger === 'leave') h.fire('pointermove', touch({ clientY: 260 }));
    else if (trigger === 'hidden') { h.context.document.hidden = true; h.documentEvents.get('visibilitychange')(); }
    else if (trigger.startsWith('pointer') || trigger === 'lostpointercapture') h.fire(trigger, touch());
    else h.windowEvents.get(trigger)();
    assert.deepEqual(h.log.at(-1), ['cancel', 'outMin', 0.25], trigger);
    assert.equal(h.api.active(), null, trigger);
    assert.equal(h.surface.dataset.holdEdit, undefined, trigger);
    const before = h.log.length;
    h.fire('pointermove', touch({ clientY: 90 }));
    h.fire('pointerup', touch());
    assert.equal(h.log.length, before, trigger + ': later moves do nothing');
  }
  const h = harness();
  h.fire('pointerdown', touch());
  h.windowEvents.get('ableton-rc:page-change')();
  h.elapse();
  assert.deepEqual(h.log, [], 'a tab change also retires a pending hold');
});

test('mouse keeps the immediate desktop drag and detach removes every listener', () => {
  const h = harness();
  assert.equal(h.fire('pointerdown', { pointerType: 'mouse' }), true);
  assert.equal(h.surface.dataset.holdEdit, 'outMin');
  h.fire('pointermove', { pointerType: 'mouse', clientY: 40 });
  h.fire('pointerup', { pointerType: 'mouse' });
  assert.deepEqual(h.log, [['begin', 'outMin'], ['move', 'outMin', 40], ['end', 'outMin']]);
  h.fire('pointerdown', { pointerType: 'mouse', button: 2 });
  assert.equal(h.log.length, 3, 'secondary button does not edit');
  h.api.detach();
  assert.equal(h.windowEvents.size, 0);
  h.fire('pointerdown', { pointerType: 'mouse' });
  assert.equal(h.log.length, 3);
});
