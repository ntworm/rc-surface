// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} function exists`);

  const openBrace = source.indexOf('{', start);
  let depth = 0;
  for (let i = openBrace; i < source.length; i++) {
    const char = source[i];
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (depth === 0) return source.slice(start, i + 1);
  }

  throw new Error(`Could not extract ${name}`);
}

test('admin targetLabel delegates to the shared mapping core with target metadata', () => {
  const html = fs.readFileSync(path.join(import.meta.dirname, 'mappings.html'), 'utf8');
  const targetLabelSource = extractFunction(html, 'targetLabel');
  const calls = [];
  const context = {
    result: null,
    targets: [{ trackIndex: 0, name: 'Drums' }],
    window: {
      targetLabel(target, targetsList) {
        calls.push({ target, targetsList });
        return `${targetsList[0].name} -> ${target.type}`;
      },
    },
  };
  vm.createContext(context);

  vm.runInContext(`${targetLabelSource}\nresult = targetLabel({ type: 'mixer_volume', trackIndex: 0 });`, context);

  assert.equal(context.result, 'Drums -> mixer_volume');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].targetsList, context.targets);
});

test('admin mapping render escapes Live-derived labels at every HTML insertion point', () => {
  const html = fs.readFileSync(path.join(import.meta.dirname, 'mappings.html'), 'utf8');
  const escapeHtmlSource = extractFunction(html, 'escapeHtml');
  const renderTargetsSource = extractFunction(html, 'renderTargets');
  const renderControlsSource = extractFunction(html, 'renderControls');
  const updateSettingsSource = extractFunction(html, 'updateSettings');
  const payload = '<img src=x onerror="globalThis.pwned=true">evil&\'"';
  const targetsTree = {
    innerHTML: '',
    querySelectorAll() { return []; },
  };
  const searchInput = { value: '' };
  const clearSearch = { style: {} };
  const context = {
    targets: [{
      trackIndex: 0,
      name: payload,
      mixer: [{ type: 'mixer_volume', trackIndex: 0, label: payload }],
      devices: [{
        index: 0,
        name: payload,
        params: [{ trackIndex: 0, deviceIndex: 0, paramIndex: 0, label: payload }],
      }],
    }],
    mappings: {},
    selectedControl: null,
    findMappingForTarget() { return null; },
    document: {
      getElementById(id) {
        if (id === 'targets-tree') return targetsTree;
        if (id === 'target-search') return searchInput;
        if (id === 'btn-clear-search') return clearSearch;
        return null;
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(`${escapeHtmlSource}\n${renderTargetsSource}`, context);

  vm.runInContext('renderTargets()', context);
  assert.doesNotMatch(targetsTree.innerHTML, /<img\b/i, 'tree view must not insert a Live name as markup');
  assert.match(targetsTree.innerHTML, /&lt;img/, 'tree view keeps the label visible as escaped text');

  searchInput.value = 'evil';
  vm.runInContext('renderTargets()', context);
  assert.doesNotMatch(targetsTree.innerHTML, /<img\b/i, 'search results must not insert a Live name as markup');
  assert.match(targetsTree.innerHTML, /&lt;img/, 'search results keep the label visible as escaped text');

  assert.match(renderControlsSource, /escapeHtml\(tgtText\)/,
    'the selected target summary must escape the same Live-derived label');
  assert.match(updateSettingsSource, /escapeHtml\(targetLabel\(m\)\)/,
    'the mapping detail card must escape the same Live-derived label');
});

test('admin shell loads local assets through relative paths', () => {
  const html = fs.readFileSync(path.join(import.meta.dirname, 'index.html'), 'utf8');

  assert.match(html, /href="style\.css"/);
  assert.match(html, /src="app\.js"/);
  assert.doesNotMatch(html, /(?:href|src)="\/static\/admin\//);
});

test('admin mappings expose only current canonical phone controls', () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, 'mappings-core.js'), 'utf8');
  const contract = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'phone-v3', 'mapping-input-contract.js'),
    'utf8',
  );
  const context = { window: {} };
  vm.createContext(context);

  vm.runInContext(contract, context);
  vm.runInContext(source, context);

  const groups = context.window.phoneControls;
  const byGroup = new Map(groups.map((g) => [g.group, g.items]));
  const items = (group) => Array.from(byGroup.get(group) || []);
  assert.deepEqual(items('Pads'), Array.from({ length: 12 }, (_, i) => `pad-${i + 1}`));
  assert.deepEqual(items('Mix Knobs (1-8)'), Array.from({ length: 8 }, (_, i) => `knob-${i + 1}`));
  assert.deepEqual(items('Mix Faders (1-8)'), Array.from({ length: 8 }, (_, i) => `fader-${i + 1}`));
  assert.deepEqual(items('LFOs (1-4)'), ['toggle-1', 'toggle-2', 'toggle-3', 'toggle-4']);
  assert.deepEqual(items('Stutters (Buttons 1-4)'), ['button-1', 'button-2', 'button-3', 'button-4']);
  assert.deepEqual(items('Sensors: Vision'), [
    'sensor.vision.x', 'sensor.vision.y', 'sensor.vision.z',
    'sensor.vision.fist', 'sensor.vision.pinch', 'sensor.vision.victory',
    'sensor.vision.rotateVal', 'sensor.vision.open',
    'sensor.vision.pinch_x', 'sensor.vision.pinch_y', 'sensor.vision.pinch_z',
    'sensor.vision.gesture.1', 'sensor.vision.gesture.2', 'sensor.vision.gesture.3',
  ]);
  assert.equal(byGroup.has('Expression (' + 'Rib' + 'bons 1-2)'), false);
  const controls = groups.flatMap((g) => g.items);
  for (const current of [
    'sensor.audio.rms', 'sensor.audio.envelope',
    'sensor.audio.transient', 'sensor.audio.kick', 'sensor.audio.snare', 'sensor.audio.brightness',
    'sensor.vision.x', 'sensor.vision.pinch_x',
  ]) {
    assert.equal(controls.includes(current), true, `current control should be exposed: ${current}`);
  }
  for (const retired of [
    'knob-9', 'fader-9', 'toggle-5', 'button-5', 'rib' + 'bon-3', 'gate-1', 'scene-1', 'sensor.light.lux',
    'sensor.vision.thumb', 'sensor.vision.index', 'sensor.vision.middle',
    'sensor.vision.ring', 'sensor.vision.pinky', 'sensor.vision.active',
    'sensor.vision.palm', 'sensor.vision.face', 'sensor.vision.fingers',
    'sensor.vision.color.r', 'sensor.vision.color.g', 'sensor.vision.color.b',
  ]) {
    assert.equal(controls.includes(retired), false, `retired control should not be exposed: ${retired}`);
  }
});

test('admin project refresh keeps numbered learned gesture slots', () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, 'mappings-core.js'), 'utf8');
  const contract = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'phone-v3', 'mapping-input-contract.js'),
    'utf8',
  );
  const context = {
    window: {},
    document: { getElementById: () => null },
  };
  vm.createContext(context);
  vm.runInContext(contract, context);
  vm.runInContext(source, context);

  context.window.sendWS = (cmd, args, cb) => {
    if (cmd === 'getProjectConfigStatus' && cb) {
      cb({ ok: true, result: { clientState: { gestures: { templates: [{ name: 'Wave Clap' }] } } } });
    }
  };
  context.window.fetchCoreData();

  const vision = context.window.phoneControls.find((group) => group.group === 'Sensors: Vision');
  assert.ok(vision);
  assert.deepEqual(
    Array.from(vision.items.filter((name) => name.startsWith('sensor.vision.gesture.'))),
    ['sensor.vision.gesture.1', 'sensor.vision.gesture.2', 'sensor.vision.gesture.3'],
    'template names label the three learned slots; they must not create wire IDs the phone never emits',
  );
});

test('admin dashboard does not render retired light sensor telemetry', () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, 'app.js'), 'utf8');

  assert.doesNotMatch(source, /light_reading/);
  assert.doesNotMatch(source, /data-ref="light-line"/);
  assert.doesNotMatch(source, /data-signal-group="lux"/);
});

test('admin mapping WebSocket retries when construction is rejected', () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, 'mappings-core.js'), 'utf8');
  const contract = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'phone-v3', 'mapping-input-contract.js'),
    'utf8',
  );
  let retryDelay = null;
  const context = {
    window: {},
    document: { getElementById: () => ({ innerHTML: '' }) },
    WebSocket: class {
      static OPEN = 1;
      constructor() { throw new Error('origin rejected'); }
    },
    setTimeout: (_callback, delay) => { retryDelay = delay; return 1; },
    clearTimeout: () => {},
    console,
  };
  vm.createContext(context);
  vm.runInContext(contract, context);
  vm.runInContext(source, context);
  assert.doesNotThrow(() => context.window.connectCoreWS('wss://localhost/admin/ws'));
  assert.equal(retryDelay, 2000);
});
