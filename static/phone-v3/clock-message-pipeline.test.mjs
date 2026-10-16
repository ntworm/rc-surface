// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('actual transport message and MAP renderer retain AUT clock age without renewing it on redraw', () => {
  const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
  const app = read('./app.js');
  const mapping = read('./mapping-mode.js');
  let now = 100;
  const root = { performance: { now: () => now }, document: { querySelector: () => null }, updateLiveLine() {} };
  root.window = root;
  vm.createContext(root);
  vm.runInContext(read('./xy-automation.js'), root);
  const uiStart = mapping.indexOf('  window.updateTriggerNoteClockUI =');
  vm.runInContext(mapping.slice(uiStart, mapping.indexOf('  function updateTriggerFeedbackUI', uiStart)), root);
  const receiveStart = app.indexOf('        const state = msg.state;', app.indexOf("msg.type === 'transport_state'"));
  const receive = '{' + app.slice(receiveStart, app.indexOf('        if (state) {', receiveStart)) + '}';
  root.msg = { clock: { valid: true, playing: true, beat: 8, bpm: 120, beatsPerBar: 4, epoch: 1 } };
  vm.runInContext(receive, root);
  assert.equal(root.triggerNoteClockSnapshot.receivedAt, 100);
  const engine = root.RcXYAutomation;
  const create = () => engine.create({ timing: 'sync', bars: 1, seconds: 10 });
  assert.doesNotThrow(() => engine.arm(create(), root.triggerNoteClockSnapshot, now));
  now = 1200;
  root.updateTriggerNoteClockUI(root.msg.clock);
  assert.equal(root.triggerNoteClockSnapshot.receivedAt, 100, 'UI redraw cannot manufacture a fresh host observation');
  assert.throws(() => engine.arm(create(), root.triggerNoteClockSnapshot, now), /clock/i);
  vm.runInContext(receive, root);
  assert.equal(root.triggerNoteClockSnapshot.receivedAt, 1200);
  assert.doesNotThrow(() => engine.arm(create(), root.triggerNoteClockSnapshot, now));
});

test('MAP AUT and CFG header controls hide only by the real tab, never by MAP or STAGE state', () => {
  // Contextual header (2026-10-16): AUT on PERF, CFG on PERF/MIX, MAP except REC.
  // Any other hiding rule (overlay, stage, width) would strand an open mode.
  const css = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const id of ['btn-map-mode', 'btn-aut-mode', 'btn-cfg-mode']) {
    for (const [, selectors] of css.matchAll(/([^{}]*)\{[^}]*display:\s*none[^}]*\}/g)) {
      for (const selector of selectors.split(',').map((item) => item.trim()).filter((item) => item.includes('#' + id))) {
        assert.match(selector, /^body\[data-header-page(?:="recording")?\]/, id + ': ' + selector);
      }
    }
  }
  const layout = fs.readFileSync(new URL('./modules/layout.js', import.meta.url), 'utf8');
  const mapping = fs.readFileSync(new URL('./mapping-mode.js', import.meta.url), 'utf8');
  assert.match(layout, /dataset\.headerPage = page/);
  assert.doesNotMatch(mapping, /headerPage/, 'MAP overlay keeps the header context of the page underneath');
});
