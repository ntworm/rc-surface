// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { clearExtensionContext, setExtensionContext } from "../src/context.ts";
import {
  buildProjectConfig,
  relinkProjectConfig,
  validateProjectConfig,
} from "../src/live/project-config.ts";
import {
  cancelPendingMappingWrites,
  commands,
  controlMappings,
  getProjectConfigStatus,
  loadMappings,
  setMappingsFilePath,
  setPresetsDirPath,
} from "../src/live/mappings.ts";
import { clipLaunchEngine, relinkClipLaunchTarget } from "../src/live/clip-launch.ts";
import { oscTransport } from "../src/live/osc-transport.ts";

let nextId = 500;
const clip = (name) => ({ handle: { id: BigInt(nextId++) }, name, startMarker: 0, endMarker: 4, loopStart: 0, loopEnd: 4, looping: true });
const track = (name, clips) => ({ handle: { id: BigInt(nextId++) }, name, groupTrack: null, devices: [], clipSlots: clips.map((c) => ({ clip: c })) });

function makeSong() {
  return {
    tempo: 120,
    tracks: [track("Keys", [clip("Chords")]), track("Drums", [clip("Base"), clip("Variação"), clip("Virada")])],
    returnTracks: [],
    mainTrack: null,
  };
}

function launchTarget(song, extra = {}) {
  const drums = song.tracks[1];
  const ref = (slot) => ({ slotIndex: slot, clipName: drums.clipSlots[slot].clip.name, clipSessionId: String(drums.clipSlots[slot].clip.handle.id) });
  return {
    type: "clip_launch",
    trackIndex: 1,
    track: { trackIndex: 1, trackName: "Drums", trackSessionId: String(drums.handle.id) },
    launchMode: "clip",
    clip: ref(2),
    then: { action: "clip", passes: 1, clip: ref(0) },
    ...extra,
  };
}

const realSend = oscTransport.send;
test.beforeEach(() => { oscTransport.send = () => {}; });
test.afterEach(async () => {
  await cancelPendingMappingWrites();
  controlMappings.clear();
  clipLaunchEngine.refresh();
  clipLaunchEngine.reset();
  setMappingsFilePath(null);
  setPresetsDirPath(null);
  clearExtensionContext();
  oscTransport.send = realSend;
});

/** Same set, reopened: handles are new, names are the same. */
function reopen(song) {
  const copy = makeSong();
  copy.tracks = song.tracks.map((t) => track(t.name, t.clipSlots.map((s) => s.clip && clip(s.clip.name))));
  return copy;
}

test("a profile round trip keeps Launch Clip targets and relinks them by name", () => {
  const song = makeSong();
  const config = buildProjectConfig(song, new Map([["sensor.vision.gesture.3", [launchTarget(song)]]]));
  const validated = validateProjectConfig(JSON.parse(JSON.stringify(config)));
  const { mappings, report } = relinkProjectConfig(validated, reopen(song));
  const [target] = mappings.get("sensor.vision.gesture.3");
  assert.equal(target.relinkStatus, "loaded");
  assert.equal(target.clip.clipName, "Virada");
  assert.equal(target.then.clip.clipName, "Base");
  assert.equal(report.loaded, 1);
});

test("reordered tracks and scenes relink to the new positions", () => {
  const song = makeSong();
  const config = buildProjectConfig(song, new Map([["pad-1", [launchTarget(song)]]]));
  const moved = reopen(song);
  moved.tracks.reverse(); // Drums is now track 0
  const drums = moved.tracks[0];
  drums.clipSlots = [drums.clipSlots[2], { clip: null }, drums.clipSlots[0], drums.clipSlots[1]]; // Virada 0, Base 2
  const { mappings, report } = relinkProjectConfig(validateProjectConfig(config), moved);
  const [target] = mappings.get("pad-1");
  assert.equal(target.relinkStatus, "relinked");
  assert.equal(target.trackIndex, 0);
  assert.equal(target.track.trackIndex, 0);
  assert.equal(target.clip.slotIndex, 0);
  assert.equal(target.then.clip.slotIndex, 2);
  assert.equal(report.relinked, 1);
});

test("a destination that disappeared is missing, and duplicates are ambiguous until reassociated", () => {
  const song = makeSong();
  const config = buildProjectConfig(song, new Map([["pad-1", [launchTarget(song)]]]));
  const gone = reopen(song);
  gone.tracks[1].clipSlots[2].clip = null;
  assert.equal(relinkProjectConfig(validateProjectConfig(config), gone).mappings.get("pad-1")[0].relinkStatus, "missing");
  const twice = reopen(song);
  twice.tracks[1].clipSlots.push({ clip: clip("Virada") });
  const relinked = relinkProjectConfig(validateProjectConfig(config), twice);
  assert.equal(relinked.mappings.get("pad-1")[0].relinkStatus, "ambiguous");
  assert.equal(relinked.report.ambiguous, 1);
  const twoTracks = reopen(song);
  twoTracks.tracks.push(track("Drums", [clip("Base")]));
  assert.equal(relinkProjectConfig(validateProjectConfig(config), twoTracks).mappings.get("pad-1")[0].relinkStatus, "ambiguous");
});

test("a malformed Launch Clip mapping makes the profile invalid", () => {
  const song = makeSong();
  const config = buildProjectConfig(song, new Map([["pad-1", [{ ...launchTarget(song), launchMode: "sometimes" }]]]));
  assert.throws(() => validateProjectConfig(JSON.parse(JSON.stringify(config))), /Launch Clip/);
});

test("relinking keeps the target's choice and continuation", () => {
  const song = makeSong();
  const original = launchTarget(song, { launchMode: "list", clip: undefined, then: undefined,
    clips: [0, 1, 2].map((slot) => ({ slotIndex: slot, clipName: song.tracks[1].clipSlots[slot].clip.name })) });
  delete original.clip;
  delete original.then;
  const relinked = relinkClipLaunchTarget(reopen(song), original);
  assert.equal(relinked.launchMode, "list");
  assert.deepEqual(relinked.clips.map((c) => c.clipName), ["Base", "Variação", "Virada"]);
  assert.ok(relinked.clips.every((c) => /^\d+$/.test(c.clipSessionId)));
});

test("export and import keep Launch Clip targets; import relinks them", async () => {
  const song = makeSong();
  setExtensionContext({ application: { song } });
  await commands.setMapping.handler({ control: "sensor.vision.gesture.3", targets: [launchTarget(song)] });
  const exported = await commands.exportProjectConfig.handler({});
  const reopened = reopen(song);
  reopened.tracks.reverse();
  setExtensionContext({ application: { song: reopened } });
  await commands.importProjectConfig.handler({ content: exported.content });
  const [target] = controlMappings.get("sensor.vision.gesture.3");
  assert.equal(target.type, "clip_launch");
  assert.equal(target.trackIndex, 0);
  assert.equal(target.relinkStatus, "relinked");
  assert.equal(getProjectConfigStatus().report.relinked, 1);
});

test("presets keep Launch Clip targets and relink them when loaded", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rc-clip-preset-"));
  try {
    const song = makeSong();
    setExtensionContext({ application: { song } });
    setPresetsDirPath(dir);
    await commands.setMapping.handler({ control: "pad-1", targets: [launchTarget(song)] });
    await commands.savePreset.handler({ name: "Show" });
    const reopened = reopen(song);
    reopened.tracks.reverse();
    setExtensionContext({ application: { song: reopened } });
    await commands.loadPreset.handler({ name: "Show" });
    const [target] = controlMappings.get("pad-1");
    assert.equal(target.trackIndex, 0);
    assert.equal(target.clip.clipName, "Virada");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("the mappings file drops a malformed Launch Clip target and keeps the rest", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rc-clip-mappings-"));
  try {
    const song = makeSong();
    setExtensionContext({ application: { song } });
    const file = path.join(dir, "mappings.json");
    await fs.writeFile(file, JSON.stringify({
      "pad-1": [{ ...launchTarget(song), evil: true }],
      "pad-2": [launchTarget(song)],
      "fader-1": [{ type: "tempo" }],
    }));
    setMappingsFilePath(file);
    await loadMappings();
    assert.deepEqual(controlMappings.get("pad-1"), []);
    assert.equal(controlMappings.get("pad-2")[0].relinkStatus, "loaded");
    assert.equal(controlMappings.get("fader-1")[0].type, "tempo");
    assert.ok(getProjectConfigStatus().report.compatibility.some((line) => line.includes("Launch Clip")));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
