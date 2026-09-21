// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { stageNativeDevice } from './build-audio-descriptors.mjs';
import { readPatch } from './amxd.js';
import { createFastDetector } from './native-audio-reference.mjs';

const boxes = p => p.patcher.boxes.map(e => e.box);
const wire = (p, from, outlet, to, inlet) => p.patcher.lines.some(({ patchline: l }) =>
  l.source[0] === from && l.source[1] === outlet && l.destination[0] === to && l.destination[1] === inlet);

test('both native AMXDs include project dictionaries required by the Live project loader', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-native-project-'));
  try {
    await stageNativeDevice(dir);
    // Independent boundary expectation from Live's shipped Max Audio Effect
    // project envelope, not from our writer. A JSON round-trip alone missed this.
    for (const [file, source] of [['RC-Audio-Descriptors.amxd', 'device.maxpat'],
      ['RC-Native-Latency-Target.amxd', 'rc-latency-target.maxpat']]) {
      const { patcher } = readPatch(path.join(dir, file));
      const project = patcher.project;
      assert.equal(project.version, 1, file + ': project schema version');
      assert.deepEqual(project.contents, { patchers: {}, code: {} }, file + ': nested project dictionaries');
      assert.deepEqual(project.layout, {}, file + ': project layout dictionary');
      assert.deepEqual(project.searchpath, {}, file + ': project search-path dictionary');
      assert.equal(project.devpath, '.'); assert.equal(project.devpathtype, 0);
      assert.equal(project.amxdtype, 1633771873);
      assert.equal(project.hideprojectwindow, 1);
      assert.equal(project.readonly, 0); assert.equal(project.autolocalize, 0);
      assert.ok(Number.isSafeInteger(project.creationdate) && project.creationdate > 0);
      assert.ok(Number.isSafeInteger(project.modificationdate) && project.modificationdate >= project.creationdate);
      // This fix must not alter IDs, parameter banks, DSP, UI or load/arm logic.
      const original = JSON.parse(await fs.readFile('max/audio-descriptors/' + source, 'utf8')).patcher;
      const { project: _project, ...payload } = patcher;
      assert.deepEqual(payload, original);
    }
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('experimental folder contains an audio effect and every byte-identical companion', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-native-device-'));
  try {
    const staged = await stageNativeDevice(dir);
    assert.deepEqual(staged.slice().sort(), ['RC-Audio-Descriptors.amxd','rc-fast-attacks.maxpat',
      'rc-native-slot.maxpat','rc-device-control.js','rc-bridge.cjs','rc-probe-client.cjs','native-audio-contract.cjs', 'RC-Native-Latency-Target.amxd'].sort());
    assert.deepEqual(await fs.readFile(path.join(dir, 'native-audio-contract.cjs')), await fs.readFile('static/shared/native-audio-contract.js'));
    for (const companion of staged.filter(p => !p.endsWith('.amxd') && p !== 'native-audio-contract.cjs')) {
      assert.deepEqual(await fs.readFile(path.join(dir, companion)), await fs.readFile('max/audio-descriptors/' + companion));
    }
    const bytes = await fs.readFile(path.join(dir, staged[0]));
    await assert.rejects(stageNativeDevice(dir), /native_stage_exists/);
    assert.deepEqual(await fs.readFile(path.join(dir, staged[0])), bytes);
    assert.equal(bytes.toString('ascii', 8, 12), 'aaaa');
    const p = readPatch(path.join(dir, staged[0]));
    assert.equal(p.patcher.project.amxdtype, 1633771873);
    assert.ok(wire(p, 'input', 0, 'output', 0)); assert.ok(wire(p, 'input', 1, 'output', 1));
    assert.equal(p.patcher.lines.filter(e => e.patchline.destination[0] === 'output').length, 2);
    assert.ok(wire(p, 'input', 0, 'fast', 0) && wire(p, 'input', 1, 'fast', 1));
    assert.ok(wire(p, 'fast', 0, 'slot', 0));
    assert.ok(boxes(p).some(b => b.text === 'node.script rc-bridge.cjs @autostart 0 @restart 0'));
    assert.equal(p.patcher.lines.some(e => e.patchline.source[0] === 'node' && e.patchline.destination[0] === 'slot'), false);
    assert.ok(boxes(p).some(b => b.varname === '_RC PairNonce' && b.parameter_enable === 1));
    const nonce = boxes(p).find(b => b.varname === '_RC PairNonce').saved_attribute_attributes.valueof;
    assert.equal(nonce.parameter_type, 0, 'Max Int parameters are only 8-bit; use Float for 24-bit nonce');
    assert.equal(nonce.parameter_mmax, 16777215);
    const identity = boxes(p).find(b => b.id === 'identity-store');
    assert.equal(identity.parameter_enable, 1, 'UUID must persist with Live Set, not just the patch file');
    assert.equal(identity.saved_attribute_attributes.valueof.parameter_type, 3);
    assert.ok(boxes(p).find(b => b.id === 'off').presentation);
    assert.ok(wire(p, 'off', 0, 'defer-control', 0));
    for (const b of boxes(p).filter(b => b.presentation)) {
      const [x, y, width, height] = b.presentation_rect;
      assert.ok(y >= 0 && y + height <= 169 && x >= 0 && x + width <= p.patcher.devicewidth, b.id + ' must fit the Live device strip');
    }
    assert.ok(wire(p, 'node-route', 1, 'network-status', 1), 'network heartbeat must not overwrite musical status');
    const target = readPatch(path.join(dir, 'RC-Native-Latency-Target.amxd'));
    const gain = boxes(target).find(b => b.id === 'gain');
    assert.equal(gain.parameter_enable, 1);
    assert.equal(gain.saved_attribute_attributes.valueof.parameter_mmax, 1);
    assert.ok(wire(target, 'gain', 0, 'level', 0));
    assert.ok(wire(target, 'level', 0, 'left', 1) && wire(target, 'level', 0, 'right', 1));
    assert.ok(wire(target, 'input', 0, 'left', 0) && wire(target, 'input', 1, 'right', 0));
    assert.ok(wire(target, 'left', 0, 'output', 0) && wire(target, 'right', 0, 'output', 1));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('native slot releases on explicit id0, load and deletion, with no persisted mapping', async () => {
  const p = JSON.parse(await fs.readFile('max/audio-descriptors/rc-native-slot.maxpat', 'utf8'));
  assert.ok(boxes(p).some(b => b.text === 'live.remote~ @normalized 1 @smoothing 0'));
  assert.ok(boxes(p).some(b => b.text === 'live.modulate~ @smoothing 0'));
  for (const modulator of ['remote','modulate']) {
    assert.ok(wire(p, 'release', 0, modulator, 1));
    assert.ok(wire(p, modulator === 'remote' ? 'remote-id' : 'modulate-id', 0, modulator, 1));
    assert.equal(boxes(p).find(b => b.id === modulator).saved_object_attributes._persistence, 0);
  }
  assert.ok(wire(p, 'load', 0, 'release', 0));
  assert.ok(wire(p, 'free', 0, 'release', 0));
  assert.equal(boxes(p).find(b => b.id === 'release').text, 'id 0');
});

async function controllerHarness({ eligible = true } = {}) {
  const events = [], parameters = { min: 0, max: 1, is_enabled: eligible ? 1 : 0, is_quantized: 0 };
  const api = { id: 42, type: 'DeviceParameter', unquotedpath: 'live_set tracks 0 devices 1 parameters 1',
    get: key => [parameters[key]] };
  const context = vm.createContext({ outlet: (...args) => events.push(args), notifyclients() {},
    LiveAPI: function() { return api; }, arrayfromargs: args => Array.from(args) });
  vm.runInContext(await fs.readFile('max/audio-descriptors/rc-device-control.js', 'utf8'), context);
  return { context, events, api, parameters };
}
test('local control never auto-arms; prepare, explicit Remote, OFF and invalidated IDs release safely', async () => {
  const { context: c, events, api } = await controllerHarness();
  c.init(); assert.ok(events.some(e => e[1] === 'release'));
  assert.equal(events.some(e => e[1] === 'remote' && e[2] === 42), false);
  c.targetpath('live_set', 'tracks', 0, 'devices', 1, 'parameters', 1);
  c.prepare(); assert.equal(events.at(-1)[2], 'target_prepared');
  c.arm(); assert.ok(events.some(e => e[1] === 'remote' && e[2] === 42));
  c.off(); assert.equal(events.filter(e => e[1] === 'release').length >= 2, true);
  c.prepare(); api.id = 0; c.arm();
  assert.equal(events.at(-1)[2], 'target_unavailable');
  api.id = 42; c.prepare(); api.id = 43; c.arm();
  assert.equal(events.at(-1)[2], 'target_unavailable', 'another valid ID cannot replace a prepared target');
  api.id = 42; c.prepare(); api.unquotedpath = 'live_set tracks 1 devices 1 parameters 1'; c.arm();
  assert.equal(events.at(-1)[2], 'target_unavailable');
});
test('unsupported targets and Modulate cannot grab parameters; persistence stores UUID only', async () => {
  const { context: c, events } = await controllerHarness({ eligible: false });
  c.init(); const first = c.getvalueof();
  assert.match(first, /^[0-9a-f-]{36}$/);
  c.targetpath('live_set', 'tracks', 0, 'devices', 1, 'parameters', 1); c.prepare();
  assert.equal(events.at(-1)[2], 'target_ineligible');
  c.mode(1); c.arm(); assert.equal(events.at(-1)[2], 'modulation_kind_unsupported');
  c.setvalueof(first); assert.equal(c.getvalueof(), first);
  assert.equal(events.some(e => e[1] === 'remote' && e[2] > 0), false);
});

test('Live Activator OFF refuses arm until explicitly enabled again', async () => {
  const { context: c, events } = await controllerHarness();
  c.init(); c.targetpath('live_set', 'tracks', 0, 'devices', 1, 'parameters', 1); c.prepare();
  assert.equal(typeof c.deviceenabled, 'function');
  c.deviceenabled(0); c.arm(); assert.equal(events.at(-1)[2], 'device_disabled');
  c.deviceenabled(1); c.arm(); assert.equal(events.at(-1)[2], 'remote_active');
  const p = JSON.parse(await fs.readFile('max/audio-descriptors/device.maxpat', 'utf8'));
  assert.ok(wire(p, 'thisdevice', 1, 'device-enabled', 0));
  assert.ok(wire(p, 'device-enabled', 0, 'defer-control', 0));
});
test('control calculates MSP slide coefficients per rate and rejects invalid controls atomically', async () => {
  const { context: c, events } = await controllerHarness();
  c.init(); c.samplerate(48000);
  const fast = events.findLast(e => e[1] === 'fast-slide')[2];
  const slow = events.findLast(e => e[1] === 'slow-slide')[2];
  assert.ok(Math.abs((1 - 1 / fast) - .9793821813312401) < 1e-12);
  assert.ok(Math.abs((1 - 1 / slow) - .9993057966262922) < 1e-12);
  c.settings(.65, 1.25, 1);
  assert.ok(Math.abs((1 - 1 / events.findLast(e => e[1] === 'release-slide')[2]) - .9834714538216175) < 1e-12);
  const count = events.length; c.settings(.5, 0, 1);
  assert.equal(events.length, count + 1); assert.equal(events.at(-1)[2], 'invalid_settings');
});

test('MSP graph wiring executes the same recurrence, including stereo power, threshold, release and shaping', async () => {
  const p = JSON.parse(await fs.readFile('max/audio-descriptors/rc-fast-attacks.maxpat', 'utf8'));
  // Small test-only evaluator for this DAG's documented MSP operations. This
  // checks patch connectivity/formulas, NOT Max scheduling, compilation or CPU.
  for (const sampleRate of [44100, 48000, 96000]) {
    const { context: c, events } = await controllerHarness(); c.init(); c.samplerate(sampleRate); c.settings(.7, 15.625, 1.5);
    const params = new Map(), state = new Map();
    const route = boxes(p).find(b => b.id === 'route').text.split(' ').slice(1);
    assert.ok(wire(p, 'ctl', 0, 'route', 0));
    for (const [outlet, command, value] of events) if (outlet === 0 && route.includes(command)) {
      for (const { patchline: l } of p.patcher.lines) if (l.source[0] === 'route' && l.source[1] === route.indexOf(command)) {
        if (typeof value === 'number') params.set(l.destination.join(':'), value);
      }
    }
    const source = createFastDetector({ sampleRate, settings: { sensitivity: .7, releaseMs: 15.625, curve: 1.5 } });
    for (let n = 0; n < 8000; n++) {
      const left = n < 100 ? 1e-7 : n < 160 ? .7 : n < 600 ? 0 : .2 * Math.sin(n * .2);
      const right = -left, memo = new Map();
      function value(id) {
        if (memo.has(id)) return memo.get(id);
        if (id === 'left') return left;
        if (id === 'right') return right;
        const node = boxes(p).find(b => b.id === id), [op, ...args] = node.text.split(' ');
        const input = (port, fallback = 0) => {
          const connection = p.patcher.lines.find(e => e.patchline.destination[0] === id && e.patchline.destination[1] === port);
          if (connection && connection.patchline.source[0] !== 'route') return value(connection.patchline.source[0]);
          return params.get(id + ':' + port) ?? (port > 0 && args[port - 1] !== undefined ? Number(args[port - 1]) : fallback);
        };
        let result;
        const x = input(0);
        switch (op) {
          case '*~': result = x * input(1); break;
          case '+~': result = x + input(1); break;
          case '-~': result = x - input(1); break;
          case '/~': result = x / input(1); break;
          case 'sqrt~': result = Math.sqrt(x); break;
          case 'maximum~': result = Math.max(x, input(1)); break;
          case 'clip~': result = Math.max(input(1), Math.min(input(2), x)); break;
          // Max pow~ is unlike JS: LEFT exponent, RIGHT base (Cycling74 ref).
          case 'pow~': result = input(1) ** x; break;
          case '>=~': result = x >= input(1) ? 1 : 0; break;
          case 'slide~': { const last = state.get(id) || 0; result = last + (x - last) / input(x >= last ? 1 : 2); state.set(id, result); break; }
          case 'outlet': result = x; break;
          default: throw Error('unsupported DSP test operation ' + op);
        }
        memo.set(id, result); return result;
      }
      assert.ok(Math.abs(value('out') - source.push(left, right)) < 1e-10, 'sample ' + n + ' at ' + sampleRate);
    }
  }
});
