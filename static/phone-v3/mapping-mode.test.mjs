// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = import.meta.dirname;

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.dataset = {};
    this._textContent = '';
    this.value = '';
    this.style = { setProperty(k, v) { this[k] = v; }, getPropertyValue(k) { return this[k] || ''; } };
    this.listeners = new Map();
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
  querySelectorAll() { return []; }
  closest(selector) {
    if (selector === '.map-pane-right') {
      if (!this._closestPaneRight) {
        this._closestPaneRight = new FakeElement();
        this._closestPaneRight.className = 'map-pane-right';
      }
      return this._closestPaneRight;
    }
    return null;
  }
}

function findByText(scope, text) {
  if (!scope) return null;
  if (scope._textContent === text) return scope;
  for (const child of scope.children || []) {
    const found = findByText(child, text);
    if (found) return found;
  }
  return null;
}

function loadMappingMode(overrides = {}) {
  const ids = [
    'btn-map-mode', 'btn-map-back', 'btn-map-refresh', 'mapping-mode',
    'map-armed-strip',
    'map-mobile-status', 'map-mobile-presets', 'map-mobile-search',
    'map-mobile-controls', 'map-mobile-detail',
  ];
  const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
  const body = new FakeElement('body');
  body.dataset.page = 'performance';
  const document = {
    readyState: 'complete',
    body,
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new FakeElement(tag),
    addEventListener() {},
    querySelector: (selector) => {
      const match = selector.match(/\.page\[data-page="([^"]+)"\]/);
      if (match) {
        const page = new FakeElement();
        page.className = 'page';
        page.dataset.page = match[1];
        return page;
      }
      return null;
    },
    querySelectorAll() { return []; }
  };
  const calls = [];
  const eventListeners = new Map();
  let mockMappings = { 'pad-1': [{ type: 'tempo' }] };
  function defaultSendPhoneCommand(cmd, args, cb) {
    calls.push({ cmd, args });
    if (cmd === 'setMapping') {
      mockMappings[args.control] = args.targets;
      cb({ ok: true });
      return true;
    }
    if (cmd === 'removeMapping') {
      delete mockMappings[args.control];
      cb({ ok: true });
      return true;
    }
    const fixtures = {
      getTargets: { ok: true, result: { targets: [{ type: 'tempo' }] } },
      getMappings: { ok: true, result: { mappings: mockMappings } },
      getClients: { ok: true, result: { clients: [{ client_id: 'phone-1', status: 'active' }] } },
      listPresets: { ok: true, result: { presets: ['Default', 'Gig'], current: 'Gig' } },
      getProjectConfigStatus: { ok: true, result: { report: { loaded: 1, relinked: 0, review: 0, ambiguous: 0, missing: 0 }, clientState: {} } },
      addUdpReceiverToTrack: { ok: true, result: { success: true } },
    };
    cb(fixtures[cmd] || { ok: true });
    return true;
  }
  const context = vm.createContext({
    window: {
      throttlePhoneTelemetry() {},
      setPhoneMappingModeActive() {},
      showPhonePage(page) { document.body.dataset.page = page; },
      addEventListener(name, fn) {
        if (!eventListeners.has(name)) eventListeners.set(name, []);
        eventListeners.get(name).push(fn);
      },
      dispatchEvent() {},
      sendPhoneCommand: defaultSendPhoneCommand,
      // Overrides last so callers can replace any default (including sendPhoneCommand)
      ...overrides,
    },
    document,
    CustomEvent: class CustomEvent { constructor(name, init) { this.type = name; this.detail = init?.detail; } },
    console,
  });
  context.window.window = context.window;
  context.window.document = document;
  vm.runInContext(fs.readFileSync(path.join(root, 'mapping-input-contract.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'mapping-mode.js'), 'utf8'), context);
  return { context, document, calls, elements, eventListeners };
}

test('mobile mapping mode loads targets, mappings, clients, and presets on open', async () => {
  const { context, calls, elements } = loadMappingMode();

  await context.window.openMobileMappingMode();

  assert.deepEqual(calls.map((c) => c.cmd), ['getTargets', 'getMappings', 'getClients', 'listPresets', 'getProjectConfigStatus']);
  assert.equal(context.window.mobileMappingState.currentMappings['pad-1'][0].type, 'tempo');
  assert.equal(context.window.mobileMappingState.currentPreset, 'Gig');
  assert.equal(elements.get('map-mobile-status').textContent, 'Loaded 1; relinked 0; review 0; missing 0');
});

test('MAP opens as an armed strip and expands only after a performance control is picked', async () => {
  const { context, elements, eventListeners } = loadMappingMode();

  const opening = context.window.openMobileMappingMode();
  const overlay = elements.get('mapping-mode');
  const armedStrip = elements.get('map-armed-strip');
  const detailPane = elements.get('map-mobile-detail').closest('.map-pane-right');

  assert.equal(overlay.dataset.state, 'armed', 'the compact state must be applied before loading finishes');
  assert.equal(armedStrip.classList.contains('hidden'), false, 'the waiting strip must be visible');
  assert.equal(detailPane.classList.contains('hidden'), true, 'the full editor must not cover the surface while waiting');
  await opening;

  const target = new FakeElement('div');
  target.setAttribute('data-name', 'knob-2');
  target.closest = (selector) => {
    if (selector === '[data-name]') return target;
    if (selector === '#mapping-mode' || selector === '.tabs') return null;
    return null;
  };
  const event = { target, preventDefault() {}, stopPropagation() {} };
  for (const listener of eventListeners.get('click') || []) listener(event);

  assert.equal(overlay.dataset.state, 'editing');
  assert.equal(armedStrip.classList.contains('hidden'), true, 'the strip yields to the editor after selection');
  assert.equal(detailPane.classList.contains('hidden'), false, 'the complete editor expands for the chosen control');
});

test('closing and reopening MAP clears the old control and returns to the armed strip', async () => {
  const { context, elements } = loadMappingMode();
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'pad-1';

  context.window.closeMobileMappingMode();
  await context.window.openMobileMappingMode();

  assert.equal(context.window.mobileMappingState.selectedControl, null);
  assert.equal(elements.get('mapping-mode').dataset.state, 'armed');
  assert.equal(elements.get('map-armed-strip').classList.contains('hidden'), false);
});

test('control browser renders grouped controls and selecting one renders mapped targets', async () => {
  const { context, elements } = loadMappingMode();

  await context.window.openMobileMappingMode();
  const controls = elements.get('map-mobile-controls');
  assert.ok(controls.children.length > 0, 'expected grouped controls to render');

  const padRow = controls.children.flatMap((group) => group.children || []).find((child) => child.dataset.control === 'pad-1');
  assert.ok(padRow, 'pad-1 row must exist');
  padRow.listeners.get('click')();

  assert.equal(context.window.mobileMappingState.selectedControl, 'pad-1');
  assert.match(elements.get('map-mobile-detail').textContent, /Pad 1/);
  assert.match(elements.get('map-mobile-detail').textContent, /Song Tempo/);
});

test('mobile target editor exposes Auto, Linear, and Geometric target scales', async () => {
  const { context, elements } = loadMappingMode();
  await context.window.openMobileMappingMode();
  const controls = elements.get('map-mobile-controls');
  const padRow = controls.children.flatMap((group) => group.children || [])
    .find((child) => child.dataset.control === 'pad-1');
  padRow.listeners.get('click')();

  const label = findByText(elements.get('map-mobile-detail'), 'Target scale');
  assert.ok(label, 'target scale label should render');
  const select = label.parentNode?.children?.find((child) => child.id === 'select')
    || label.parentNode?.children?.[1];
  assert.deepEqual(Array.from(select.children, (option) => option.value), ['auto', 'linear', 'geometric']);
  assert.equal(select.children.find((option) => option.selected)?.value, 'auto');
});

test('mobile audio note target does not offer withheld Follow Detected Note mode', async () => {
  const { context, elements } = loadMappingMode();
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.currentMappings = {
    'pad-1': [{ type: 'device_param', trackIndex: 0, deviceIndex: 0, paramIndex: 0, mode: 'continuous' }],
  };
  const controls = elements.get('map-mobile-controls');
  const noteRow = controls.children.flatMap((group) => group.children || [])
    .find((child) => child.dataset.control === 'pad-1');
  assert.ok(noteRow, 'pad row must exist');
  noteRow.listeners.get('click')();

  const label = findByText(elements.get('map-mobile-detail'), 'Mode');
  assert.ok(label, 'mode label should render');
  const select = label.parentNode?.children?.[1];
  assert.deepEqual(Array.from(select.children, (option) => option.value), [
    'continuous', 'toggle', 'trigger_note',
  ]);
});

test('mobile audio note picker does not offer Follow Detected Note setup', async () => {
  const { context, elements, calls } = loadMappingMode();
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.allTargets = [
    { trackIndex: 4, name: 'MIDI Track', isMidi: true },
  ];
  context.window.mobileMappingState.currentMappings = { 'pad-1': [] };

  const controls = elements.get('map-mobile-controls');
  const noteRow = controls.children.flatMap((group) => group.children || [])
    .find((child) => child.dataset.control === 'pad-1');
  assert.ok(noteRow, 'pad row must exist');
  noteRow.listeners.get('click')();

  const actions = elements.get('map-mobile-detail').children.find((child) => child.className === 'map-detail-actions');
  const follow = actions?.children.find((child) => child.textContent === 'Follow Detected Note');
  assert.equal(follow, undefined,
    'Follow Detected Note is withheld from every v1.0 creation surface');
  // The two actions that apply to any control are still here.
  assert.ok(actions?.children.some((child) => child.textContent === 'Bind'));
  assert.ok(actions?.children.some((child) => child.textContent === 'Trigger Note'));
});

test('mobile non-audio target does not expose Follow Detected Note mode', async () => {
  const { context, elements } = loadMappingMode();
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'pad-1';
  context.window.mobileMappingState.currentMappings = {
    'pad-1': [{ type: 'tempo', mode: 'continuous' }],
  };
  // Re-select through the browser so renderDetail runs with the chosen control.
  const controls = elements.get('map-mobile-controls');
  const padRow = controls.children.flatMap((group) => group.children || [])
    .find((child) => child.dataset.control === 'pad-1');
  padRow.listeners.get('click')();

  const label = findByText(elements.get('map-mobile-detail'), 'Mode');
  const select = label.parentNode?.children?.[1];
  assert.deepEqual(Array.from(select.children, (option) => option.value), ['continuous', 'toggle', 'trigger_note']);
});

test('removing the final target sends removeMapping', async () => {
  const { context, calls } = loadMappingMode();
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'pad-1';

  await context.window.removeMobileMappingTarget(0);

  const last = calls.at(-1);
  assert.equal(last.cmd, 'removeMapping');
  assert.equal(last.args.control, 'pad-1');
});

test('conflict replace removes the old owner before setting the new control', async () => {
  const { context, calls } = loadMappingMode();
  // Wait to let openMappingMode fetch initially
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.currentMappings = {
    'pad-1': [],
    'knob-1': [{ type: 'tempo' }],
  };
  context.window.mobileMappingState.selectedControl = 'pad-1';

  await context.window.replaceMobileMappingConflict('knob-1', { type: 'tempo' });

  const cmds = calls.slice(-2).map((c) => c.cmd);
  assert.deepEqual(cmds, ['removeMapping', 'setMapping']);
});

test('conflict banner uses friendly owner label and replace refreshes detail', async () => {
  const { context, elements } = loadMappingMode({ getPhoneClientId: () => 'phone-1' });
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.currentMappings = {
    'phone-1::pad-1': [],
    'phone-1::toggle-1': [{ type: 'tempo' }],
  };
  context.window.mobileMappingState.selectedControl = 'pad-1';

  await context.window.bindMobileTarget({ type: 'tempo' });

  const detail = elements.get('map-mobile-detail');
  const banner = detail.children.find((child) => child.className === 'map-conflict');
  assert.ok(banner, 'conflict banner should render');
  assert.match(banner.textContent, /Already mapped to LFO 1/);
  assert.doesNotMatch(banner.textContent, /phone-1::toggle-1|toggle-1/);

  const replace = banner.children.find((child) => child.textContent === 'Replace');
  assert.ok(replace, 'replace button should render');
  await replace.listeners.get('click')();

  assert.equal(context.window.mobileMappingState.pendingConflict, null);
  assert.equal(context.window.mobileMappingState.currentMappings['phone-1::toggle-1'], undefined);
  assert.equal(context.window.mobileMappingState.currentMappings['phone-1::pad-1'], undefined);
  assert.equal(context.window.mobileMappingState.currentMappings['pad-1'][0].type, 'tempo');
  assert.doesNotMatch(detail.textContent, /Already mapped/);
  assert.match(detail.textContent, /Song Tempo/);
});

test('binding a picked target sends setMapping with existing targets preserved', async () => {
  const { context, calls } = loadMappingMode();
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'pad-1';

  await context.window.bindMobileTarget({ type: 'mixer_volume', trackIndex: 0, label: 'Volume' });

  const setMappingCall = calls.find((c) => c.cmd === 'setMapping');
  assert.ok(setMappingCall, 'should have sent setMapping command');
  assert.equal(setMappingCall.args.control, 'pad-1');
  assert.equal(setMappingCall.args.targets.length, 2);
  assert.equal(setMappingCall.args.targets[1].type, 'mixer_volume');
  assert.equal(setMappingCall.args.targets[1].neutralPolicy, 'release');
});

test('editing target fields saves complete mapping payload', async () => {
  const { context, calls } = loadMappingMode();
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'pad-1';
  context.window.mobileMappingState.selectedTargetIndex = 0;

  await context.window.updateMobileTargetField('mode', 'toggle');
  await context.window.updateMobileTargetField('threshold', 0.42);
  await context.window.updateMobileTargetField('smooth', 0.25);
  await context.window.updateMobileTargetField('curve', 's-curve');
  await context.window.updateMobileTargetField('outMin', 0.2);
  await context.window.updateMobileTargetField('outMax', 0.8);

  const last = calls.filter((c) => c.cmd === 'setMapping').at(-1);
  const target = last.args.targets[0];
  assert.equal(target.mode, 'toggle');
  assert.equal(target.threshold, 0.42);
  assert.equal(target.smooth, 0.25);
  assert.equal(target.curve, 's-curve');
  assert.equal(target.outMin, 0.2);
  assert.equal(target.outMax, 0.8);
});

test('valid MIDI note edits persist without refresh', async () => {
  const { context, calls } = loadMappingMode();
  context.window.mobileMappingState.selectedControl = 'pad-1';
  context.window.mobileMappingState.currentMappings = {
    'pad-1': [{ type: 'device_param', trackIndex: 0, mode: 'trigger_note', midiNote: 'C3', midiVelocity: 100 }],
  };

  await context.window.updateMobileTargetField('midiNote', 'C7', { refresh: false });

  const last = calls.filter((c) => c.cmd === 'setMapping').at(-1);
  assert.equal(last.args.targets[0].midiNote, 'C7');
});

test('preset actions call backend preset commands', async () => {
  const { context, calls } = loadMappingMode();
  await context.window.openMobileMappingMode();

  await context.window.saveMobileMappingPreset('Set_A');
  await context.window.loadMobileMappingPreset('Gig');
  await context.window.deleteMobileMappingPreset('Gig');

  const cmds = calls.filter((c) => ['savePreset', 'loadPreset', 'deletePreset'].includes(c.cmd)).map((c) => c.cmd);
  assert.deepEqual(cmds, ['savePreset', 'loadPreset', 'deletePreset']);
  const saveCall = calls.find((c) => c.cmd === 'savePreset');
  assert.equal(saveCall.args.name, 'Set_A');
});

test('trigger note installs receiver before saving trigger target', async () => {
  const { context, calls } = loadMappingMode();
  context.window.mobileMappingState.selectedControl = 'pad-1';

  await context.window.createMobileTriggerNoteTarget({ trackIndex: 4, name: 'MIDI Track', isMidi: true });

  const addReceiverCall = calls.find((c) => c.cmd === 'addUdpReceiverToTrack');
  assert.ok(addReceiverCall, 'should have sent addUdpReceiverToTrack command');
  assert.equal(addReceiverCall.args.trackIndex, 4);

  const setMappingCall = calls.filter((c) => c.cmd === 'setMapping').at(-1);
  assert.ok(setMappingCall, 'should have sent setMapping command');
  assert.equal(setMappingCall.args.targets.at(-1).mode, 'trigger_note');
  assert.equal(setMappingCall.args.targets.at(-1).midiNote, 'C3');
});

test('phone mappings are saved globally and legacy client-scoped keys are removed', async () => {
  const { context, calls } = loadMappingMode({ getPhoneClientId: () => 'phone-1' });
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'pad-1';

  // Bind a new target – should use phone-1::pad-1 as the setMapping key
  context.window.mobileMappingState.currentMappings['phone-1::pad-1'] = [{ type: 'mixer_volume', trackIndex: 0 }];
  delete context.window.mobileMappingState.currentMappings['pad-1'];
  await context.window.updateMobileTargetField('takeoverMode', 'pickup');

  const setCall = calls.find((c) => c.cmd === 'setMapping');
  assert.ok(setCall, 'global mapping should have been saved');
  assert.equal(setCall.args.control, 'pad-1');
  assert.equal(setCall.args.targets[0].takeoverMode, 'pickup');

  // Remove the final target – should use phone-1::pad-1 as the removeMapping key
  const removeCall = calls.find((c) => c.cmd === 'removeMapping' && c.args.control === 'phone-1::pad-1');
  assert.ok(removeCall, 'legacy client mapping should have been removed');
  assert.equal(removeCall.args.control, 'phone-1::pad-1');
});

test('removing a legacy phone mapping deletes its client-scoped key', async () => {
  const { context, calls } = loadMappingMode({ getPhoneClientId: () => 'phone-1' });
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'knob-1';
  context.window.mobileMappingState.currentMappings = {
    'phone-1::knob-1': [{ type: 'tempo' }],
  };

  await context.window.removeMobileMappingTarget(0);

  assert.ok(calls.some((call) => call.cmd === 'removeMapping' && call.args.control === 'phone-1::knob-1'));
  assert.equal(context.window.mobileMappingState.currentMappings['phone-1::knob-1'], undefined);
});

test('btn-map-refresh triggers a full data reload', async () => {
  const { context, calls, elements } = loadMappingMode();
  await context.window.openMobileMappingMode();
  const beforeCount = calls.length;

  // Fire the registered click listener directly (FakeElement.listeners is a Map of name -> fn)
  const refreshBtn = elements.get('btn-map-refresh');
  const handler = refreshBtn.listeners.get('click');
  assert.ok(handler, 'refresh button should have a click listener');
  await handler();

  assert.ok(
    calls.slice(beforeCount).some((c) => c.cmd === 'getMappings'),
    'refresh click should trigger getMappings',
  );
});

test('missing Receiver keeps the picker open and does not send setMapping', async () => {
  const { context, calls, elements } = loadMappingMode({
    sendPhoneCommand(cmd, args, cb) {
      calls.push({ cmd, args });
      if (cmd === 'addUdpReceiverToTrack') {
        cb({ ok: true, result: { success: false, existing: false, inserted: false, reason: 'receiver_missing' } });
        return true;
      }
      cb({ ok: true });
      return true;
    },
  });
  context.window.mobileMappingState.selectedControl = 'pad-1';

  const result = await context.window.createMobileTriggerNoteTarget({ trackIndex: 2, name: 'MIDI Track', isMidi: true });

  assert.strictEqual(result, false, 'should return false on install failure');
  assert.ok(!calls.some((c) => c.cmd === 'setMapping'), 'setMapping must NOT be called after a failed install');
  assert.equal(elements.get('map-mobile-status').textContent, 'RC-Midi-Receiver.amxd não está nessa track. Coloque o dispositivo nela no Live e tente novamente.');
});

for (const [reason, expected] of [['receiver_upgrade_required', /v2/], ['receiver_ambiguous', /mais de um|more than one/i]]) {
  test(`MIDI picker explains ${reason} without saving`, async () => {
    const { context, calls, elements } = loadMappingMode({
      sendPhoneCommand(cmd, args, cb) {
        calls.push({ cmd, args });
        cb({ ok: true, result: { success: false, reason } });
        return true;
      },
    });
    context.window.mobileMappingState.selectedControl = 'pad-1';
    assert.equal(await context.window.createMobileTriggerNoteTarget({ trackIndex: 0, isMidi: true }), false);
    assert.match(elements.get('map-mobile-status').textContent, expected);
    assert.ok(!calls.some(call => call.cmd === 'setMapping'));
  });
}

test('MIDI target save failure keeps the picker open', async () => {
  const { context, elements, calls } = loadMappingMode();
  await context.window.openMobileMappingMode();
  context.window.sendPhoneCommand = (cmd, args, cb) => {
    calls.push({ cmd, args });
    if (cmd === 'addUdpReceiverToTrack') {
      cb({ ok: true, result: { success: true } });
      return true;
    }
    if (cmd === 'setMapping') {
      cb({ ok: false, error: 'Mapping write failed' });
      return true;
    }
    cb({ ok: true });
    return true;
  };
  context.window.mobileMappingState.selectedControl = 'pad-1';
  context.window.mobileMappingState.allTargets = [{ trackIndex: 4, name: 'MIDI Track', isMidi: true }];
  context.window.mobileMappingState.currentMappings = { 'pad-1': [] };
  const controls = elements.get('map-mobile-controls');
  const noteRow = controls.children.flatMap((group) => group.children || [])
    .find((child) => child.dataset.control === 'pad-1');
  assert.ok(noteRow, 'pad row should exist');
  noteRow.listeners.get('click')();
  const actions = elements.get('map-mobile-detail').children.find((child) => child.className === 'map-detail-actions');
  // Driven through Trigger Note: the behaviour under test is that a failed
  // write leaves the picker open, and Follow is no longer reachable from here.
  const trigger = actions?.children.find((child) => child.textContent === 'Trigger Note');
  assert.ok(trigger, 'trigger action should be present');
  trigger.listeners.get('click')();

  const row = elements.get('map-mobile-detail').children.find((child) => child.className === 'map-picker-list').children[0];
  await row.listeners.get('click')();

  assert.equal(context.window.mobileMappingState.pickerMode, 'midi');
  assert.equal(calls.filter((call) => call.cmd === 'setMapping').length, 1);
});

test('trigger_note does not conflict with device_param on track 0 / device 0 / param 0', async () => {
  const { context } = loadMappingMode();
  await context.window.openMobileMappingMode();

  // Existing device_param mapping on track 0, device 0, param 0
  context.window.mobileMappingState.currentMappings['pad-1'] = [
    { type: 'device_param', trackIndex: 0, deviceIndex: 0, paramIndex: 0 },
  ];
  // Select pad-2 and try to bind a trigger_note on the same track (track 0)
  context.window.mobileMappingState.selectedControl = 'pad-2';

  const conflict = context.window.mobileMappingState;
  // bindMobileTarget detects conflicts before saving; we test isSameTarget indirectly via findConflict
  // by reading pendingConflict after a bind attempt
  const triggerTarget = { type: 'device_param', mode: 'trigger_note', trackIndex: 0, midiNote: 'C3', label: 'MIDI C3' };
  await context.window.bindMobileTarget(triggerTarget);

  assert.equal(
    context.window.mobileMappingState.pendingConflict,
    null,
    'trigger_note should NOT conflict with a regular device_param on the same slot',
  );
});



test('pad-1 and pad-2 trigger_note on same MIDI track with different notes do not conflict', async () => {
  const { context } = loadMappingMode();
  await context.window.openMobileMappingMode();

  // pad-1 already has C3 on track 0
  context.window.mobileMappingState.currentMappings['pad-1'] = [
    { type: 'device_param', mode: 'trigger_note', trackIndex: 0, midiNote: 'C3' },
  ];
  // pad-2 wants D3 on track 0 — different note, must not conflict
  context.window.mobileMappingState.selectedControl = 'pad-2';
  const d3Target = { type: 'device_param', mode: 'trigger_note', trackIndex: 0, midiNote: 'D3', label: 'MIDI D3' };
  await context.window.bindMobileTarget(d3Target);

  assert.equal(
    context.window.mobileMappingState.pendingConflict,
    null,
    'D3 on pad-2 should not conflict with C3 on pad-1 (different notes)',
  );
});

test('findConflict treats a legacy selectedClient key as the current control owner', async () => {
  const { context } = loadMappingMode({ getPhoneClientId: () => 'phone-1' });
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'pad-1';
  // Simulate: the mapping already exists under the scoped key from a previous save
  context.window.mobileMappingState.currentMappings['phone-1::pad-1'] = [
    { type: 'mixer_volume', trackIndex: 2 },
  ];

  // Binding the same target again must NOT open a conflict dialog
  await context.window.bindMobileTarget({ type: 'mixer_volume', trackIndex: 2, label: 'Volume' });

  assert.equal(
    context.window.mobileMappingState.pendingConflict,
    null,
    'rebinding own scoped key must not produce a false conflict',
  );
});

test('MAP mode selects real control via data-name', async () => {
  const { context, eventListeners } = loadMappingMode();
  await context.window.openMobileMappingMode();

  const target = new FakeElement('div');
  target.setAttribute('data-name', 'knob-2');
  target.closest = (sel) => {
    if (sel === '[data-name]') return target;
    if (sel === '#mapping-mode') return null;
    if (sel === '.tabs') return null;
    return null;
  };

  const event = {
    target,
    preventDefault() {},
    stopPropagation() {},
  };

  const listeners = eventListeners.get('click') || [];
  assert.ok(listeners.length > 0, 'should have registered window click listener');
  for (const fn of listeners) {
    fn(event);
  }

  assert.equal(context.window.mobileMappingState.selectedControl, 'knob-2');
});

test('picker Bind to renders Track > Device > Parameter hierarchy instead of flat list', async () => {
  const richTargets = [
    { id: 'tempo', type: 'tempo', label: 'Song Tempo' },
    {
      trackIndex: 0,
      trackKind: 'track',
      name: 'Track 1: Bass',
      isMidi: true,
      mixer: [{ type: 'mixer_volume', trackIndex: 0, trackKind: 'track', label: 'Volume' }],
      devices: [{
        index: 0,
        name: 'Auto Filter',
        params: [{ type: 'device_param', trackIndex: 0, trackKind: 'track', deviceIndex: 0, paramIndex: 0, label: 'Freq' }]
      }]
    },
    {
      trackIndex: 0,
      trackKind: 'return',
      name: 'Return A: Delay',
      isMidi: false,
      mixer: [{ type: 'mixer_volume', trackIndex: 0, trackKind: 'return', label: 'Volume' }],
      devices: []
    }
  ];

  const { context, elements } = loadMappingMode({
    sendPhoneCommand(cmd, args, cb) {
      if (cmd === 'getTargets') {
        cb({ ok: true, result: { targets: richTargets } });
        return true;
      }
      const fixtures = {
        getMappings: { ok: true, result: { mappings: {} } },
        getClients: { ok: true, result: { clients: [] } },
        listPresets: { ok: true, result: { presets: ['Default'], current: 'Default' } },
      };
      cb(fixtures[cmd] || { ok: true });
      return true;
    }
  });

  await context.window.openMobileMappingMode();
  
  // Click pad-1 to select it
  const controls = elements.get('map-mobile-controls');
  const padRow = controls.children.flatMap((group) => group.children || []).find((child) => child.dataset.control === 'pad-1');
  assert.ok(padRow, 'pad-1 row must exist');
  padRow.listeners.get('click')();

  // Find and click the Bind button
  const detailEl = elements.get('map-mobile-detail');
  const actions = detailEl.children.find(c => c.className === 'map-detail-actions');
  assert.ok(actions, 'actions wrapper should exist');
  const bindBtn = actions.children.find(c => c.textContent === 'Bind');
  assert.ok(bindBtn, 'Bind button should exist');
  bindBtn.listeners.get('click')();

  const tree = detailEl.children.find(c => c.className === 'map-picker-tree');
  assert.ok(tree, 'should render map-picker-tree');

  const groups = tree.children.filter(c => c.className === 'map-picker-group');
  assert.ok(groups.length >= 2, 'should render picker groups');

  const trackBlock = groups.flatMap(g => g.children).find(c => c.className === 'map-picker-track-block');
  assert.ok(trackBlock, 'should render track block');

  const trackHeader = trackBlock.children.find(c => c.className.includes('map-picker-track-header'));
  assert.ok(trackHeader.textContent.includes('Track 1: Bass'), 'track header should include track name');

  const trackContent = trackBlock.children.find(c => c.className.includes('map-picker-track-content'));
  assert.ok(trackContent, 'should render track content wrapper');

  const deviceBlock = trackContent.children.find(c => c.className.includes('map-picker-device-block'));
  assert.ok(deviceBlock, 'should render device block');

  const devHeader = deviceBlock.children.find(c => c.className.includes('map-picker-device-header'));
  assert.ok(devHeader.textContent.includes('Auto Filter'), 'device header should include device name');
});

test('Main uses collapsed track/device hierarchy, keeps Tempo direct, filters and binds the exact Main target', async () => {
  const target = { type: 'device_param', trackIndex: 0, trackKind: 'main', deviceIndex: 1, paramIndex: 2, label: 'Ceiling' };
  const calls = [];
  const { context, elements } = loadMappingMode({ sendPhoneCommand(cmd, args, cb) {
    calls.push({ cmd, args });
    cb(cmd === 'getTargets' ? { ok: true, result: { targets: [{ trackIndex: 0, trackKind: 'main', name: 'Main', mixer: [], devices: [{ name: 'Limiter', params: [target] }] }] } }
      : { ok: true, result: { mappings: {}, clients: [], presets: [] } });
    return true;
  } });
  await context.window.openMobileMappingMode();
  const controls = elements.get('map-mobile-controls');
  controls.children.flatMap(g => g.children || []).find(c => c.dataset.control === 'pad-1').listeners.get('click')();
  const detail = elements.get('map-mobile-detail');
  detail.children.find(c => c.className === 'map-detail-actions').children.find(c => c.textContent === 'Bind').listeners.get('click')();
  const tree = detail.children.find(c => c.className === 'map-picker-tree');
  const group = tree.children[0];
  assert.ok(group.children.some(c => c.textContent === 'Tempo'));
  const block = group.children.find(c => c.className === 'map-picker-track-block');
  assert.ok(block, 'Main must not be a flat list of every parameter');
  const content = block.children.find(c => c.className.includes('map-picker-track-content'));
  assert.ok(content.classList.contains('hidden'));
  block.children[0].listeners.get('click')();
  assert.equal(content.classList.contains('hidden'), false);
  const dev = content.children.find(c => c.className === 'map-picker-device-block');
  assert.ok(dev.children[1].classList.contains('hidden'));
  dev.children[0].listeners.get('click')({ stopPropagation() {} });
  assert.equal(dev.children[1].classList.contains('hidden'), false);
  const search = detail.children.find(c => c.className === 'map-picker-search-wrap').children[0];
  for (const filter of ['ceiling', 'limiter', 'Main > Limiter']) {
    search.value = filter; search.listeners.get('input')();
    const filtered = tree.children[0].children.find(c => c.className === 'map-picker-track-block');
    assert.ok(filtered, filter);
    assert.equal(filtered.children[1].classList.contains('hidden'), false);
  }
  await findByText(tree, 'Ceiling').listeners.get('click')();
  assert.equal(calls.find(c => c.cmd === 'setMapping').args.targets[0].trackKind, 'main');
});

test('binding a duplicate mapping target sets status to error and does not add targets', async () => {
  const { context, elements } = loadMappingMode();
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'pad-1';
  
  // Set current mappings to have a tempo mapping already
  context.window.mobileMappingState.currentMappings = {
    'pad-1': [{ type: 'tempo' }]
  };

  await context.window.bindMobileTarget({ type: 'tempo' });

  assert.equal(elements.get('map-mobile-status').textContent, 'Este parâmetro já está mapeado para este controle.');
  assert.equal(elements.get('map-mobile-status').dataset.kind, 'error');
});

test('binding a device_param target', async () => {
  const { context, calls } = loadMappingMode();
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'pad-1';

  await context.window.bindMobileTarget({
    type: 'device_param',
    trackIndex: 0,
    trackKind: 'track',
    deviceIndex: 0,
    paramIndex: 0,
    label: 'Pitch'
  });

  const setMappingCall = calls.find((c) => c.cmd === 'setMapping');
  assert.ok(setMappingCall, 'should call setMapping');
  assert.equal(setMappingCall.args.targets.length, 2);
  const target = setMappingCall.args.targets[1];
  assert.equal(target.type, 'device_param');
  assert.equal(target.trackIndex, 0);
  assert.equal(target.trackKind, 'track');
  assert.equal(target.deviceIndex, 0);
  assert.equal(target.paramIndex, 0);
  assert.equal(target.curve, 'linear');
});

// ── Root cause R3 ───────────────────────────────────────────────────────────
// "Could not load mapping data" collapses five independent commands into one
// opaque string. In the field this hid the real cause (an expired session /
// dead port), so the panel could not tell the user what to do.

test('mapping load names the failing command and preserves its real error', async () => {
  const { context, elements } = loadMappingMode({
    sendPhoneCommand(cmd, args, cb) {
      if (cmd === 'getTargets') {
        cb({ ok: false, error: 'extension context not ready' });
        return true;
      }
      cb({ ok: true, result: { targets: [], mappings: {}, clients: [], presets: [], current: 'Default' } });
      return true;
    },
  });

  await context.window.openMobileMappingMode();

  const status = elements.get('map-mobile-status').textContent;
  assert.match(status, /getTargets/, `status must name the failing command, got: ${status}`);
  assert.match(status, /extension context not ready/, `status must keep the server error, got: ${status}`);
  assert.match(context.window.mobileMappingState.error, /getTargets/);
});

test('mapping load reports every failing command, not only the first', async () => {
  const { context, elements } = loadMappingMode({
    sendPhoneCommand(cmd, args, cb) {
      if (cmd === 'getTargets' || cmd === 'listPresets') {
        cb({ ok: false, error: 'Not connected to server' });
        return true;
      }
      cb({ ok: true, result: { mappings: {}, clients: [] } });
      return true;
    },
  });

  await context.window.openMobileMappingMode();

  const status = elements.get('map-mobile-status').textContent;
  assert.match(status, /getTargets/, `got: ${status}`);
  assert.match(status, /listPresets/, `got: ${status}`);
});

test('mapping panel explains a dropped connection instead of the bare word Disconnected', async () => {
  const { context, elements, eventListeners } = loadMappingMode();
  await context.window.openMobileMappingMode();

  for (const fn of eventListeners.get('ableton-rc:phone-ws-close') || []) fn({});

  const status = elements.get('map-mobile-status').textContent;
  assert.doesNotMatch(
    status,
    /^Disconnected$/,
    'a bare "Disconnected" gives the user nothing to act on',
  );
  assert.match(status, /reconnect/i, `got: ${status}`);
});

test('mapping panel reloads its data when the socket comes back', async () => {
  const { context, calls, eventListeners } = loadMappingMode();
  await context.window.openMobileMappingMode();
  const before = calls.length;

  for (const fn of eventListeners.get('ableton-rc:phone-ws-open') || []) fn({});
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(calls.length > before, 'reopening the socket must refresh mapping data');
});

// The phone MAP panel could only clear one control or one category. Wiping a
// whole set meant tapping through every group, so a global clear was missing.
test('mapping panel exposes a global clear that wipes every mapping at once', async () => {
  const { context, calls } = loadMappingMode({ confirm: () => true });
  await context.window.openMobileMappingMode();

  assert.equal(
    typeof context.window.clearAllMobileMappings,
    'function',
    'the phone MAP panel must offer a global clear',
  );

  const before = calls.length;
  await context.window.clearAllMobileMappings();

  const issued = calls.slice(before).map((c) => c.cmd);
  assert.ok(issued.includes('clearMappings'), `expected clearMappings, got ${issued.join(', ')}`);
  assert.equal(
    issued.filter((c) => c === 'clearMappings').length,
    1,
    'a global clear must issue exactly one clearMappings command',
  );
  // Compare keys, not the object: it is built inside the vm realm, so its
  // prototype differs from this realm's and deepStrictEqual would reject it.
  assert.deepEqual(
    Object.keys(context.window.mobileMappingState.currentMappings),
    [],
    'local mapping state must be emptied too',
  );
});

test('global clear is abandoned when the user cancels the confirmation', async () => {
  const { context, calls } = loadMappingMode({ confirm: () => false });
  await context.window.openMobileMappingMode();

  const before = calls.length;
  await context.window.clearAllMobileMappings();

  const issued = calls.slice(before).map((c) => c.cmd);
  assert.equal(
    issued.includes('clearMappings'),
    false,
    'cancelling must not wipe anything',
  );
});

test('the MAP presets row renders a Clear All button', async () => {
  const { context, elements } = loadMappingMode({ confirm: () => true });
  await context.window.openMobileMappingMode();

  const presets = elements.get('map-mobile-presets');
  const labels = presets.children.map((c) => c.textContent);
  assert.ok(
    labels.some((l) => /clear all/i.test(l || '')),
    `expected a Clear All button, got: ${labels.join(' | ')}`,
  );
});

test('slider edits store numbers, including the neutral value', async () => {
  const { context, calls } = loadMappingMode();
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'pad-1';
  context.window.mobileMappingState.selectedTargetIndex = 0;

  // Every editor slider hands over `input.value`, which is a string. A target
  // field that keeps the string reaches Live as "0.35" and breaks the mapping.
  for (const field of ['inMin', 'inMax', 'outMin', 'outMax', 'idleValue',
    'neutralValue', 'drive', 'compressor', 'smooth']) {
    await context.window.updateMobileTargetField(field, '0.35');
    const target = calls.filter((call) => call.cmd === 'setMapping').at(-1).args.targets[0];
    assert.equal(typeof target[field], 'number', field + ' must be stored as a number');
    assert.equal(target[field], 0.35);
  }
});

test('F-007: VISION SENSOR FILTER (1€) panel appears only for vision x/y/z, never for gestures or other controls', async () => {
  const positionFilters = {
    x: { minCutoff: 2.0, beta: 1.5 },
    y: { minCutoff: 2.0, beta: 1.5 },
    z: { minCutoff: 1.0, beta: 0.5 },
  };
  const { context, elements } = loadMappingMode({
    currentVisionProcessor: { positionFilters },
  });
  await context.window.openMobileMappingMode();
  const detail = elements.get('map-mobile-detail');

  // Must appear for sensor.vision.x, y, z
  for (const control of ['sensor.vision.x', 'sensor.vision.y', 'sensor.vision.z']) {
    context.window.mobileMappingState.selectedControl = control;
    context.window.mobileMappingState.selectedTargetIndex = 0;
    await context.window.loadMobileMappingData();
    const panel = detail.children.find((c) => (c.className || '').includes('map-vision-filter-panel'));
    assert.ok(panel, `filter panel must appear for ${control}`);
    const title = panel.children.find((c) => (c.textContent || '').includes('VISION SENSOR FILTER (1€)'));
    assert.ok(title, `filter title must exist for ${control}`);
  }

  // Must NOT appear for gestures or other controls
  for (const control of ['sensor.vision.gesture.1', 'sensor.vision.gesture1', 'sensor.vision.fist', 'sensor.orient.alpha', 'pad-1']) {
    context.window.mobileMappingState.selectedControl = control;
    context.window.mobileMappingState.selectedTargetIndex = 0;
    await context.window.loadMobileMappingData();
    const panel = detail.children.find((c) => (c.className || '').includes('map-vision-filter-panel'));
    assert.equal(
      panel,
      undefined,
      `filter panel must NOT appear for ${control}`,
    );
  }
});
test('MAP vision sensor filter sliders set --range-progress on render and input', async () => {
  const positionFilters = { x: { minCutoff: 2.0, beta: 1.5 }, y: { minCutoff: 2.0, beta: 1.5 }, z: { minCutoff: 1.0, beta: 0.5 } };
  const { context, elements } = loadMappingMode({ currentVisionProcessor: { positionFilters } });
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'sensor.vision.x';
  await context.window.loadMobileMappingData();
  const detail = elements.get('map-mobile-detail');

  const panel = detail.children.find((c) => (c.className || '').includes('map-vision-filter-panel'));
  const inputs = [];
  function collectRangeInputs(node) {
    if ((node.tagName === 'INPUT' || node.id === 'input') && (node.type === 'range' || node.getAttribute('type') === 'range')) {
      inputs.push(node);
    }
    for (const child of node.children || []) collectRangeInputs(child);
  }
  collectRangeInputs(panel);
  const input = inputs[0]; // minCutoff: min=0.1, max=5.0

  input.value = '1.0';
  input.listeners.get('input')();
  const pct1 = parseFloat(input.style.getPropertyValue('--range-progress'));
  assert.ok(Math.abs(pct1 - 18.36) < 0.2, `expected ~18.4, got ${pct1}`);

  input.value = '5.0';
  input.listeners.get('input')();
  const pct2 = parseFloat(input.style.getPropertyValue('--range-progress'));
  assert.ok(Math.abs(pct2 - 100) < 0.1, `expected 100, got ${pct2}`);
});
