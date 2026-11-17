// Copyright (c) 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The pinch channel carries two different things: an analog position in mode
// A and a latched toggle in mode C. The wire has to know which one it is, so
// the publisher declares the ordering and onControl forwards it unchanged.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(path.join(import.meta.dirname, 'app.js'), 'utf8');
const contractSource = fs.readFileSync(
  path.join(import.meta.dirname, 'mapping-input-contract.js'),
  'utf8',
);

function onControlSource() {
  // app.js is a large bootstrap; pull out just the onControl assignment and
  // the stream it forwards to, so the contract can be exercised without
  // standing up the whole phone UI.
  const start = source.indexOf('window.currentControlLost = window.currentControlLost');
  assert.ok(start > 0, 'the currentControlLost initialiser must exist in app.js');
  const end = source.indexOf('window.onModulatorState', start);
  assert.ok(end > start, 'could not bound the onControl definition');
  return source.slice(start, end);
}

function loadOnControl(push) {
  const context = { window: null, state: { controls: [] }, console };
  context.window = context;
  context.globalThis = context;
  context.currentControlStates = {};
  context.window.RcControlStream = { create: () => ({ push, reset() {} }) };
  vm.runInNewContext(contractSource, context, { filename: 'mapping-input-contract.js' });
  vm.runInNewContext(onControlSource(), context, { filename: 'app-onControl.js' });
  return context;
}

test('onControl forwards its options to the control stream', () => {
  const body = onControlSource();
  assert.match(body, /window\.onControl = \(ctrl, opts\)/);
  assert.match(body, /controlStream\?\.push\(ctrl, opts\)/);
});

test('the options never enter the control object', () => {
  const body = onControlSource();
  assert.match(body, /normalizeControl\(ctrl\)/);
  const rest = body
    .replace('window.onControl = (ctrl, opts)', '')
    .replace('controlStream?.push(ctrl, opts)', '');
  assert.doesNotMatch(rest, /\bopts\b/, 'the options must stay out of the control and the normalization');
});

test('onControl hands the option to the stream untouched', () => {
  const calls = [];
  const ctx = loadOnControl((ctrl, opts) => {
    calls.push({ ctrl, opts });
    return true;
  });
  const ctrl = { name: 'sensor.vision.pinch', value: 0.5 };
  ctx.onControl(ctrl, { ordered: false });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.ordered, false);
  assert.equal(calls[0].ctrl.name, 'sensor.vision.pinch');
  assert.equal('ordered' in calls[0].ctrl, false, 'the option must not enter the control object');
  assert.equal('ordered' in ctrl, false, 'the raw control must not be mutated');
});

test('both pinch branches declare their ordering', () => {
  assert.match(
    source,
    /window\.onControl\(\{ name: 'sensor\.vision\.pinch', value: state\.visionToggle\.pinch \}, \{ ordered: true \}\)/,
  );
  assert.match(
    source,
    /window\.onControl\(\{ name: 'sensor\.vision\.pinch', value: data\.pinchVal \?\? 0 \}, \{ ordered: false \}\)/,
  );
});
