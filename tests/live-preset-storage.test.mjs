// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { commands, controlMappings, runMappingMutation, setPresetsDirPath } from '../src/live/mappings.ts';
import { deferred } from './helpers/isolated-module.mjs';

test('preset save waits for mapping mutations and stores the committed mapping set', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-preset-serial-'));
  const held = deferred();
  setPresetsDirPath(dir);
  controlMappings.clear();
  controlMappings.set('knob-1', [{ type: 'tempo' }]);
  const mutation = runMappingMutation(async () => {
    await held.promise;
    controlMappings.set('knob-8', [{ type: 'tempo' }]);
  });
  const save = commands.savePreset.handler({ name: 'serial' });
  try {
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal((await fs.readdir(dir)).length, 0, 'save must wait, not snapshot uncommitted state');
  } finally {
    held.resolve();
    await Promise.all([mutation, save]);
  }
  try {
    assert.ok(JSON.parse(await fs.readFile(path.join(dir, 'serial.json'), 'utf8'))['knob-8']);
  } finally {
    setPresetsDirPath(null);
    controlMappings.clear();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a partial preset write leaves the previous preset intact and no staged debris', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-preset-partial-'));
  const filename = path.join(dir, 'saved.json');
  const previous = '{"knob-1":[{"type":"tempo"}]}';
  await fs.writeFile(filename, previous);
  setPresetsDirPath(dir);
  controlMappings.clear();
  controlMappings.set('knob-8', [{ type: 'tempo' }]);
  const write = fs.writeFile;
  let faulted = false;
  fs.writeFile = async (file, ...args) => {
    if (String(file).startsWith(filename)) {
      faulted = true;
      await write(file, '{partial', 'utf8');
      throw new Error('simulated disk full');
    }
    return write(file, ...args);
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(commands.savePreset.handler({ name: 'saved' }), /disk full/);
    assert.equal(faulted, true);
    assert.equal(await fs.readFile(filename, 'utf8'), previous);
    assert.deepEqual(await fs.readdir(dir), ['saved.json']);
  } finally {
    fs.writeFile = write;
    syncBuiltinESMExports();
    setPresetsDirPath(null);
    controlMappings.clear();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('preset deletion reports storage errors instead of claiming success', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-preset-delete-'));
  setPresetsDirPath(dir);
  await fs.mkdir(path.join(dir, 'blocked.json'));
  try {
    await assert.rejects(commands.deletePreset.handler({ name: 'blocked' }));
    assert.deepEqual(await commands.deletePreset.handler({ name: 'missing' }), { success: true, name: 'missing' });
  } finally {
    setPresetsDirPath(null);
    await fs.rm(dir, { recursive: true, force: true });
  }
});
