import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setExtensionContext, clearExtensionContext } from '../src/context.ts';
import { commands, controlMappings, applyMapping, eventModesState, lastMappedValues,
  setMappingsFilePath, stopSmoothTimer, handleClientDisconnect, cancelPendingMappingWrites,
  loadMappings, configureMappingStorage, setPresetsDirPath, activeSmooths } from '../src/live/mappings.ts';
import { globalWriteScheduler } from '../src/server/write-scheduler.ts';
import { deferred, settle } from './helpers/isolated-module.mjs';

function harness() {
  controlMappings.clear(); eventModesState.clear(); lastMappedValues.clear();
  globalWriteScheduler.clear(); setMappingsFilePath(null);
  const writes = [], gate = deferred();
  const param = { name: 'Gain', min: 0, max: 1, isQuantized: false,
    getValue: async () => 0,
    setValue: async (value) => { writes.push(value); if (writes.length === 1) await gate.promise; } };
  setExtensionContext({ application: { song: { tracks: [{ devices: [{ parameters: [param] }] }], returnTracks: [] } } });
  const target = { type: 'device_param', trackIndex: 0, deviceIndex: 0, paramIndex: 0, smooth: 0, takeoverMode: 'jump' };
  const cleanup = () => { gate.resolve(); stopSmoothTimer(); activeSmooths.clear(); controlMappings.clear();
    globalWriteScheduler.clear(); eventModesState.clear(); lastMappedValues.clear(); clearExtensionContext(); };
  return { writes, gate, target, cleanup };
}

for (const operation of ['clear', 'remove', 'replace', 'disconnect', 'deactivate']) {
  for (const mode of ['continuous', 'toggle']) {
    test(`${operation} invalidates an old pad ${mode} queue after a slow SDK write`, async () => {
      const h = harness();
      controlMappings.set('pad-1', [{ ...h.target, mode }]);
      const first = applyMapping('phone', 'pad-1', 1);
      try {
        await settle();
        await applyMapping('phone', 'pad-1', 0);
        await applyMapping('phone', 'pad-1', 1);
        assert.deepEqual(h.writes, [1]);
        if (operation === 'clear') await commands.clearMappings.handler({});
        if (operation === 'remove') await commands.removeMapping.handler({ control: 'pad-1' });
        if (operation === 'replace') await commands.setMapping.handler({ control: 'pad-1', target: { ...h.target } });
        if (operation === 'disconnect') await handleClientDisconnect('phone');
        if (operation === 'deactivate') await cancelPendingMappingWrites();
        h.gate.resolve(); await first; await settle();
        // Disconnect still sends its deliberate OFF; it must not replay the
        // older queued OFF/ON sequence on the way there.
        assert.deepEqual(h.writes, operation === 'disconnect' ? [1, 0] : [1]);
        if (operation !== 'disconnect') {
          controlMappings.set('pad-1', [{ ...h.target }]);
          await applyMapping('phone', 'pad-1', 0.25);
          assert.deepEqual(h.writes, [1, 0.25]);
        }
      } finally { h.cleanup(); await first; }
    });
  }
}

test('Clear All releases a held trigger note even though the binding is gone', async () => {
  const h = harness();
  const messages = [];
  setExtensionContext({ application: { song: { tempo: 120, tracks: [{ devices: [{
    name: 'RC-Midi-Receiver', parameters: [{ name: 'RC MIDI Packet v2', min: 0,
      max: 4194303, isQuantized: false, async setValue(value) {
        messages.push([Math.floor(value / 128) % 128, value % 128]);
      } }],
  }] }] } } });
  try {
    controlMappings.set('pad-1', [{ ...h.target, mode: 'trigger_note', midiNote: 'C3', midiVelocity: 100 }]);
    await applyMapping('phone', 'pad-1', 1);
    await commands.clearMappings.handler({});
    assert.deepEqual(messages, [[60, 100], [60, 0]]);
  } finally { h.cleanup(); }
});

for (const storage of ['fallback', 'profile']) {
  test(`a cancelled activation cannot commit a delayed ${storage} mapping load`, async () => {
    const h = harness();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-cancel-load-'));
    try {
      await configureMappingStorage(storage === 'profile' ? dir : '');
      if (storage === 'fallback') setMappingsFilePath(path.join(dir, 'mappings.json'));
      await commands.setMapping.handler({ control: 'pad-1', target: h.target });
      controlMappings.clear();
      controlMappings.set('button-2', [{ ...h.target }]);
      let current = true;
      const loading = loadMappings(() => current);
      current = false;
      await loading;
      assert.deepEqual([...controlMappings.keys()], ['button-2']);
    } finally {
      await configureMappingStorage(''); h.cleanup();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
}

test('loading a preset cancels queued writes from the previous binding', async () => {
  const h = harness();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-cancel-preset-'));
  setPresetsDirPath(dir);
  let writing = Promise.resolve();
  try {
    await commands.savePreset.handler({ name: 'empty' });
    controlMappings.set('pad-1', [{ ...h.target }]);
    writing = applyMapping('phone', 'pad-1', 1); await settle();
    await applyMapping('phone', 'pad-1', 0);
    await applyMapping('phone', 'pad-1', 1);
    await commands.loadPreset.handler({ name: 'empty' });
    h.gate.resolve(); await writing;
    assert.deepEqual(h.writes, [1]);
  } finally {
    h.cleanup(); await writing; setPresetsDirPath(null);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('lifecycle cancellation releases and removes smoothed work before another activation', async () => {
  const h = harness();
  h.gate.resolve();
  try {
    controlMappings.set('pad-1', [{ ...h.target, smooth: 0.5 }]);
    await applyMapping('phone', 'pad-1', 1);
    assert.equal(activeSmooths.size, 1);
    await cancelPendingMappingWrites();
    assert.equal(activeSmooths.size, 0);
    assert.deepEqual(h.writes, [0]);
  } finally { h.cleanup(); }
});

test('Clear All cancels the newest pending continuous audio value behind a slow SDK write', async () => {
  const h = harness();
  try {
    controlMappings.set('sensor.audio.brightness', [{ ...h.target }]);
    await applyMapping('phone', 'sensor.audio.brightness', 1);
    await settle();
    await applyMapping('phone', 'sensor.audio.brightness', 0.25);
    await commands.clearMappings.handler({});
    h.gate.resolve(); await settle();
    assert.deepEqual(h.writes, [1]);
  } finally { h.cleanup(); }
});

for (const pending of [false, true]) test(`a new continuous binding receives the same first value (old SDK pending=${pending})`, async () => {
  const h = harness(); if (!pending) h.gate.resolve();
  try {
    controlMappings.set('sensor.audio.brightness', [{ ...h.target }]);
    await applyMapping('phone', 'sensor.audio.brightness', 1); await settle();
    await commands.setMapping.handler({ control: 'sensor.audio.brightness', target: { ...h.target } });
    await applyMapping('phone', 'sensor.audio.brightness', 1); await settle();
    if (pending) {
      assert.deepEqual(h.writes, [1], 'do not overlap the old in-flight SDK call');
      h.gate.resolve(); await settle();
    }
    assert.deepEqual(h.writes, [1, 1]);
  } finally { h.cleanup(); }
});

test('a failed Clear All does not discard the valid queue or its binding', async () => {
  const h = harness();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-cancel-failed-'));
  controlMappings.set('pad-1', [{ ...h.target }]);
  const first = applyMapping('phone', 'pad-1', 1);
  try {
    await settle(); await applyMapping('phone', 'pad-1', 0);
    setMappingsFilePath(dir); // A directory cannot replace mappings.json.
    await assert.rejects(commands.clearMappings.handler({}));
    h.gate.resolve(); await first;
    assert.deepEqual(h.writes, [1, 0]);
    assert.equal(controlMappings.has('pad-1'), true);
  } finally { h.cleanup(); await first; await fs.rm(dir, { recursive: true, force: true }); }
});
