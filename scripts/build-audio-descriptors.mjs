// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePatch } from './amxd.js';
const source = new URL('../max/audio-descriptors/', import.meta.url);
const companions = Object.freeze(['rc-fast-attacks.maxpat', 'rc-native-slot.maxpat', 'rc-device-control.js', 'rc-bridge.cjs', 'rc-probe-client.cjs']);

function withNativeProject(patch) {
  // A bare .maxpat is not a complete M4L project. Live's stock Audio Effect
  // supplies these dictionaries before project_newfromdevicepatcher reads them.
  // Our old AMXDs had only amxdtype and crashed in dictionary_getentrycount.
  // Keep this native-only; do not rewrite the legacy Sender/Receiver or DSP.
  return { ...patch, patcher: { ...patch.patcher, project: {
    version: 1,
    // Prototype creation: 2026-09-06 UTC, seconds since Max's 1904 epoch.
    // Fixed metadata makes repeated staging deterministic.
    creationdate: 3871497600, modificationdate: 3871497600,
    viewrect: [0, 0, 300, 500], autoorganize: 1, hideprojectwindow: 1,
    showdependencies: 1, autolocalize: 0,
    contents: { patchers: {}, code: {} }, layout: {}, searchpath: {},
    detailsvisible: 0, amxdtype: 1633771873, readonly: 0,
    devpathtype: 0, devpath: '.', sortmode: 0, viewmode: 0, includepackages: 0,
  } } };
}

export async function stageNativeDevice(outDir) {
  const out = path.resolve(outDir);
  const patch = JSON.parse(await fs.readFile(new URL('device.maxpat', source), 'utf8'));
  const target = JSON.parse(await fs.readFile(new URL('rc-latency-target.maxpat', source), 'utf8'));
  const copies = await Promise.all(companions.map(async name => [name, await fs.readFile(new URL(name, source))]));
  copies.push(['native-audio-contract.cjs', await fs.readFile(new URL('../static/shared/native-audio-contract.js', import.meta.url))]);
  await fs.mkdir(out, { recursive: true });
  const names = ['RC-Audio-Descriptors.amxd', ...copies.map(([name]) => name), 'RC-Native-Latency-Target.amxd'];
  // Explicit empty staging folder: never replace a user's prior experiment.
  for (const name of names) {
    try { await fs.access(path.join(out, name)); throw Error('native_stage_exists'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  writePatch(path.join(out, names[0]), withNativeProject(patch), 'audio');
  writePatch(path.join(out, 'RC-Native-Latency-Target.amxd'), withNativeProject(target), 'audio');
  for (const [name, bytes] of copies) await fs.writeFile(path.join(out, name), bytes, { flag: 'wx' });
  return names;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.length !== 3) { process.stderr.write('Usage: node scripts/build-audio-descriptors.mjs <new-output-folder>\n'); process.exitCode = 1; }
  else stageNativeDevice(process.argv[2]).then(names => process.stdout.write(names.join('\n') + '\n'))
    .catch(() => { process.stderr.write('Native experimental staging failed; use a new output folder.\n'); process.exitCode = 1; });
}
