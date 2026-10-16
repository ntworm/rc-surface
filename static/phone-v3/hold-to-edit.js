// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// hold-to-edit.js — protects small drag handles (MAP curve, Burst envelope)
// inside scrolling phone panels. A mouse edits at once, as on the desktop.
// Touch and pen must press and hold a handle for the same 600 ms the CFG and
// SYNC long presses use; only then is the handle selected and the drag owned.
// A quick tap, a scroll that starts before the hold completes or a touch on
// the background never changes a value. Cancel (pointercancel, lost capture,
// leaving the panel, tab change, disconnect, hidden page) restores the value
// the handle had when it was selected.
(function (root) {
  'use strict';
  const HOLD_MS = 600;
  const SLOP_PX = 8;

  function attach(surface, options) {
    const opts = options || {};
    const holdMs = Number.isFinite(opts.holdMs) ? opts.holdMs : HOLD_MS;
    let press = null;
    let edit = null;
    let detached = false;

    const touchLike = (event) => event.pointerType === 'touch' || event.pointerType === 'pen';
    function setSelected(key) {
      if (surface.dataset && key) surface.dataset.holdEdit = key;
      else if (surface.dataset) delete surface.dataset.holdEdit;
      if (typeof opts.onSelect === 'function') opts.onSelect(key || null);
    }
    function clearPress() {
      if (!press) return;
      clearTimeout(press.timer);
      press = null;
    }
    function release(pointerId) {
      try { surface.releasePointerCapture?.(pointerId); } catch { /* capture already gone */ }
    }
    function activate(key, event) {
      edit = { key, pointerId: event.pointerId, snapshot: opts.begin ? opts.begin(key, event) : undefined };
      try { surface.setPointerCapture?.(event.pointerId); } catch { /* pointer already released */ }
      setSelected(key);
    }
    function finish(event) {
      const current = edit;
      edit = null;
      release(current.pointerId);
      setSelected(null);
      if (typeof opts.end === 'function') opts.end(current.key, event);
    }
    function cancel() {
      clearPress();
      if (!edit) return;
      const current = edit;
      edit = null;
      release(current.pointerId);
      setSelected(null);
      if (typeof opts.cancel === 'function') opts.cancel(current.key, current.snapshot);
    }
    function outsidePanel(event) {
      const panel = typeof opts.panel === 'function' ? opts.panel() : opts.panel;
      const rect = panel?.getBoundingClientRect?.();
      if (!rect || !(rect.width > 0) || !Number.isFinite(event.clientX)) return false;
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    }

    function onDown(event) {
      if (detached || edit || (event.button !== undefined && event.button !== 0)) return;
      const key = opts.hitTest ? opts.hitTest(event) : null;
      if (!key) return;
      if (!touchLike(event)) {
        activate(key, event);
        event.preventDefault?.();
        if (opts.moveOnDown && typeof opts.move === 'function') opts.move(key, event);
        return;
      }
      // No preventDefault and no capture yet: the browser may still scroll.
      clearPress();
      const pending = { key, pointerId: event.pointerId, x: event.clientX, y: event.clientY, event };
      pending.timer = setTimeout(() => {
        if (press !== pending) return;
        press = null;
        activate(pending.key, pending.event);
        if (opts.moveOnDown && typeof opts.move === 'function') opts.move(pending.key, pending.event);
      }, holdMs);
      press = pending;
    }
    function onMove(event) {
      if (press && event.pointerId === press.pointerId) {
        if (Math.hypot((event.clientX ?? press.x) - press.x, (event.clientY ?? press.y) - press.y) > SLOP_PX) clearPress();
        else press.event = event;
        return;
      }
      if (!edit || event.pointerId !== edit.pointerId) return;
      event.preventDefault?.();
      if (outsidePanel(event)) { cancel(); return; }
      if (typeof opts.move === 'function') opts.move(edit.key, event);
    }
    function onUp(event) {
      if (press && event.pointerId === press.pointerId) { clearPress(); return; }
      if (edit && event.pointerId === edit.pointerId) finish(event);
    }
    function onCancel(event) {
      if (press && (event.pointerId === undefined || event.pointerId === press.pointerId)) clearPress();
      if (edit && (event.pointerId === undefined || event.pointerId === edit.pointerId)) cancel();
    }
    // Only while a handle is held does the surface keep the touch from
    // scrolling; nothing is blocked page-wide or before selection.
    function onTouchMove(event) { if (edit) event.preventDefault?.(); }
    function onContextMenu(event) { if (press || edit) event.preventDefault?.(); }
    function onHidden() { if (root.document?.hidden) cancel(); }

    surface.addEventListener('pointerdown', onDown);
    surface.addEventListener('pointermove', onMove);
    surface.addEventListener('pointerup', onUp);
    surface.addEventListener('pointercancel', onCancel);
    surface.addEventListener('lostpointercapture', onCancel);
    surface.addEventListener('touchmove', onTouchMove, { passive: false });
    surface.addEventListener('contextmenu', onContextMenu);
    const globals = [['ableton-rc:page-change', cancel], ['ableton-rc:phone-ws-close', cancel], ['blur', cancel]];
    for (const [name, handler] of globals) root.addEventListener?.(name, handler);
    root.document?.addEventListener?.('visibilitychange', onHidden);

    function detach() {
      if (detached) return;
      cancel();
      detached = true;
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerup', onUp);
      surface.removeEventListener('pointercancel', onCancel);
      surface.removeEventListener('lostpointercapture', onCancel);
      surface.removeEventListener('touchmove', onTouchMove, { passive: false });
      surface.removeEventListener('contextmenu', onContextMenu);
      for (const [name, handler] of globals) root.removeEventListener?.(name, handler);
      root.document?.removeEventListener?.('visibilitychange', onHidden);
    }
    return {
      cancel,
      detach,
      active: () => (edit ? edit.key : null),
      pending: () => Boolean(press),
    };
  }

  root.RcHoldToEdit = Object.freeze({ attach, HOLD_MS, SLOP_PX });
})(typeof window !== 'undefined' ? window : globalThis);
