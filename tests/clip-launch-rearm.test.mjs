// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import assert from "node:assert/strict";
import test from "node:test";

import { clearExtensionContext, setExtensionContext } from "../src/context.ts";
import {
  applyMapping,
  cancelPendingMappingWrites,
  commands,
  controlMappings,
  setMappingsFilePath,
} from "../src/live/mappings.ts";
import { oscTransport } from "../src/live/osc-transport.ts";
import { clipLaunchEngine } from "../src/live/clip-launch.ts";

// RC-004: a continuous control (knob, fader, XY) whose threshold is below
// the re-arm band could never release, so its clip launched only once.

const CLIENT = "33333333-3333-4333-8333-333333333333";
const FADER = "fader-1";

let nextId = 200;
const clip = (name) => ({
  handle: { id: BigInt(nextId++) }, name,
  startMarker: 0, endMarker: 4, loopStart: 0, loopEnd: 4, looping: true,
});
const track = (name, clips) => ({
  handle: { id: BigInt(nextId++) }, name, groupTrack: null, devices: [],
  clipSlots: clips.map((c) => ({ clip: c })),
});

let song;
let sent;
const realSend = oscTransport.send;

function setup() {
  const keys = track("Keys", [clip("Chords")]);
  const drums = track("Drums", [clip("Base"), clip("Fill")]);
  song = { tempo: 120, tracks: [keys, drums], returnTracks: [], mainTrack: null };
  setExtensionContext({ application: { song } });
  sent = [];
  oscTransport.send = (address, args = []) => {
    sent.push([address, ...args.map((arg) => (arg && typeof arg === "object" && "value" in arg ? arg.value : arg))]);
    oscTransport.expectReply(address);
    if (address === "/live/song/get/track_names") {
      const reply = song.tracks.map((t) => t.name);
      queueMicrotask(() => push("/live/song/get/track_names", ...reply));
    }
  };
  Object.assign(oscTransport.state, {
    available: true, connected: true, isPlaying: true, tempo: 120,
    signatureNumerator: 4, signatureDenominator: 4, currentSongTimeBeats: 0, lastSeenAt: Date.now(),
  });
  oscTransport.globalQuantization = 4; // 1 Bar
  oscTransport.lastSongTimeUpdateAt = Date.now();
}

function push(address, ...values) {
  oscTransport.handleIncoming({ oscType: "message", address, args: values.map((value) => ({ value })) });
}
const fired = (t, v) => push("/live/track/get/fired_slot_index", t, v);
const playing = (t, v) => push("/live/track/get/playing_slot_index", t, v);

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A fader move, the way the phone sends it: the raw value, 0..1. */
async function fader(value) {
  await applyMapping(CLIENT, FADER, value);
  await settle();
}

const fires = () => sent.filter(([address]) => address === "/live/clip_slot/fire").map(([, t, s]) => [t, s]);

/** Map the fader to the Base clip of the Drums track, with a given threshold. */
async function mapFader(threshold) {
  const { tracks } = await commands.getClipTargets.handler({});
  const drums = tracks.find((t) => t.name === "Drums");
  const base = drums.clips.find((c) => c.name === "Base");
  await commands.setMapping.handler({
    control: FADER,
    targets: [{
      type: "clip_launch",
      trackIndex: drums.trackIndex,
      track: { trackIndex: drums.trackIndex, trackName: drums.name, trackSessionId: drums.sessionId },
      launchMode: "clip",
      clip: { slotIndex: base.slotIndex, clipName: base.name, clipSessionId: base.sessionId },
      threshold,
    }],
  });
}

test.afterEach(async () => {
  await cancelPendingMappingWrites();
  controlMappings.clear();
  clipLaunchEngine.refresh();
  clipLaunchEngine.reset();
  setMappingsFilePath(null);
  clearExtensionContext();
  oscTransport.send = realSend;
  oscTransport.setClipLaunchActive(false);
  oscTransport.globalQuantization = null;
});

test("RC-004: a continuous control with a 0.05 threshold re-arms below 0.025 and launches again", async () => {
  setup();
  await mapFader(0.05);
  await fader(0);
  await fader(0.06);
  assert.deepEqual(fires(), [[1, 0]], "the first pose launches the clip");
  fired(1, 0); fired(1, -1); playing(1, -1);
  await fader(0.03);
  await fader(0.06);
  assert.deepEqual(fires(), [[1, 0]], "0.03 is inside the band: the launch does not re-arm");
  await fader(0);
  await fader(0.06);
  assert.deepEqual(fires(), [[1, 0], [1, 0]], "the release re-arms the launch");
});

test("RC-004: a continuous control with a 0.5 threshold keeps the 0.1 re-arm band", async () => {
  setup();
  await mapFader(0.5);
  await fader(0.6);
  assert.deepEqual(fires(), [[1, 0]], "the first pose launches the clip");
  fired(1, 0); fired(1, -1); playing(1, -1);
  await fader(0.45);
  await fader(0.6);
  assert.deepEqual(fires(), [[1, 0]], "0.45 is inside the band: the launch does not re-arm");
  await fader(0.39);
  await fader(0.6);
  assert.deepEqual(fires(), [[1, 0], [1, 0]], "0.39 is below the band: the launch re-arms");
});
