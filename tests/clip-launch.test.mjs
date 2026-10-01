// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import assert from "node:assert/strict";
import test from "node:test";
import fs from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

import { clearExtensionContext, setExtensionContext } from "../src/context.ts";
import {
  applyMapping,
  cancelPendingMappingWrites,
  commands,
  controlMappings,
  handleClientDisconnect,
  setMappingsFilePath,
} from "../src/live/mappings.ts";
import { oscTransport } from "../src/live/osc-transport.ts";
import { clipLaunchEngine, NATURAL_END_SETTLE_MS, LEDGER_CONFIRM_MS } from "../src/live/clip-launch.ts";
import { COMMAND_SIDE_EFFECTS, dispatchCommand } from "../src/server/command-dispatch.ts";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const G1 = "sensor.vision.gesture.1";
const G2 = "sensor.vision.gesture.2";
const G3 = "sensor.vision.gesture.3";

let nextId = 100;
const clip = (name, extra = {}) => ({
  handle: { id: BigInt(nextId++) }, name,
  startMarker: 0, endMarker: 4, loopStart: 0, loopEnd: 4, looping: true, ...extra,
});
const track = (name, clips, extra = {}) => ({
  handle: { id: BigInt(nextId++) }, name, groupTrack: null, devices: [],
  clipSlots: clips.map((c) => ({ clip: c })), ...extra,
});

let song;
let sent;
let namesReply;
const realSend = oscTransport.send;

function setup({ drumsExtra = {}, virada = {} } = {}) {
  const keys = track("Keys", [clip("Chords")]);
  const drums = track("Drums", [clip("Base"), clip("Variação"), clip("Virada", virada), null].map((c) => c), drumsExtra);
  drums.clipSlots[3] = { clip: null };
  const empty = track("Empty", []);
  song = { tempo: 120, tracks: [keys, drums, empty], returnTracks: [], mainTrack: null };
  setExtensionContext({ application: { song } });
  sent = [];
  namesReply = () => song.tracks.map((t) => t.name);
  oscTransport.send = (address, args = []) => {
    sent.push([address, ...args.map((arg) => (arg && typeof arg === "object" && "value" in arg ? arg.value : arg))]);
    oscTransport.expectReply(address);
    if (address === "/live/song/get/track_names") {
      const reply = namesReply();
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
const position = (t, s, p) => push("/live/clip/get/playing_position", t, s, p);
function songTime(beat) {
  push("/live/song/get/current_song_time", beat);
}

const fires = () => sent.filter(([address]) => address === "/live/clip_slot/fire").map(([, t, s]) => [t, s]);
const stops = () => sent.filter(([address]) => address === "/live/track/stop_all_clips").map(([, t]) => t);
const quantWrites = () => sent.filter(([address]) => address.includes('/set/'));

test('D11: global quantization is live-write, strictly validated, and waits for Live instead of the cache', async () => {
  setup();
  assert.equal(COMMAND_SIDE_EFFECTS.setGlobalClipQuantization, 'live-write');
  const request = (role, args) => dispatchCommand(role, { cmd: 'setGlobalClipQuantization', args });
  assert.equal((await request('viewer', { quantization: 9 })).ok, false);
  for (const args of [{}, { quantization: '9' }, { quantization: 2.5 }, { quantization: -1 },
    { quantization: 14 }, { quantization: NaN }, { quantization: null },
    { quantization: 9, extra: true }, []]) {
    assert.equal((await request('controller', args)).ok, false);
  }
  assert.deepEqual(quantWrites(), []);
  let completed = false;
  const pending = request('controller', { quantization: 9 }).then((result) => { completed = true; return result; });
  await settle();
  assert.equal(completed, false);
  assert.equal(oscTransport.globalQuantization, 4);
  assert.deepEqual(quantWrites(), [['/live/song/set/clip_trigger_quantization', 9]]);
  assert.equal((await request('admin', { quantization: 7 })).ok, false, 'overlapping requests never queue');
  push('/live/song/get/clip_trigger_quantization', 9);
  assert.equal((await pending).ok, true);
  assert.equal(oscTransport.globalQuantization, 9);
  assert.equal((await request('admin', { quantization: 9 })).ok, true, 'same confirmed value is a no-op');
  assert.equal(quantWrites().length, 1);
});

test('D11: invalid or divergent reports never confirm a request; timeout is not replayed', async () => {
  setup();
  const pending = dispatchCommand('controller', { cmd: 'setGlobalClipQuantization', args: { quantization: 13 } });
  await settle();
  for (const bad of [-1, 14, 2.5, '13']) push('/live/song/get/clip_trigger_quantization', bad);
  push('/live/song/get/clip_trigger_quantization', 13, 14);
  assert.equal(oscTransport.globalQuantization, 4);
  push('/live/song/get/clip_trigger_quantization', 7);
  assert.equal(oscTransport.globalQuantization, 7, 'show the observed value even when it differs');
  const result = await pending;
  assert.equal(result.ok, false);
  assert.match(result.error, /confirm|timeout/i);
  push('/live/song/get/clip_trigger_quantization', 13);
  oscTransport.emit('update', { ...oscTransport.state, connected: false });
  oscTransport.emit('update', { ...oscTransport.state, connected: true });
  assert.equal(oscTransport.globalQuantization, 13, 'late reports update observation only');
  assert.deepEqual(quantWrites(), [['/live/song/set/clip_trigger_quantization', 13]]);
});

test('D11: offline and local send failure are visible without replay', async () => {
  setup();
  oscTransport.state.connected = false;
  let result = await dispatchCommand('controller', { cmd: 'setGlobalClipQuantization', args: { quantization: 0 } });
  assert.equal(result.ok, false);
  assert.match(result.error, /OSC|connect/i);
  assert.deepEqual(quantWrites(), []);
  oscTransport.state.connected = true;
  oscTransport.send = () => { throw new Error('local send failed'); };
  result = await dispatchCommand('controller', { cmd: 'setGlobalClipQuantization', args: { quantization: 0 } });
  assert.equal(result.ok, false);
  assert.match(result.error, /local send failed/);
  assert.equal(oscTransport.globalQuantizationPending, false);
});

async function armThreePasses() {
  await mapViradaReturn(3);
  playing(1, 0); fired(1, -1);
  await gesture(G3, 1);
  fired(1, 2); fired(1, -1); songTime(16); playing(1, 2);
}
function runReturnWindow() {
  for (let e = .5; e < 14; e += .5) { songTime(16 + e); position(1, 2, e % 4); }
}
test('D13: confirmed global changes cancel waiting and armed returns; duplicate reports do not', async () => {
  for (const armed of [false, true]) {
    setup();
    await mapViradaReturn(3);
    playing(1, 0); fired(1, -1); await gesture(G3, 1);
    if (armed) { fired(1, 2); fired(1, -1); songTime(16); playing(1, 2); }
    push('/live/song/get/clip_trigger_quantization', 7);
    fired(1, -1); playing(1, 2); runReturnWindow();
    assert.deepEqual(fires(), [[1, 2]]);
    assert.equal(clipLaunchEngine.snapshot().diagnostics.at(-1).reason, 'global_quantization_changed');
    await cancelPendingMappingWrites(); controlMappings.clear(); clipLaunchEngine.reset();
  }
  setup(); await armThreePasses();
  push('/live/song/get/clip_trigger_quantization', 4);
  runReturnWindow();
  assert.deepEqual(fires(), [[1, 2], [1, 0]], 'unchanged quantum permits the original return once');
});

test('D13: a pending write suspends returns, and connection loss cancels instead of reviving them', async () => {
  setup(); await armThreePasses();
  const pending = dispatchCommand('controller', { cmd: 'setGlobalClipQuantization', args: { quantization: 9 } });
  await settle();
  runReturnWindow();
  assert.deepEqual(fires(), [[1, 2]], 'no return during unconfirmed write');
  // Live reports the old value while the request is still outstanding. The
  // requested value is needed for success; losing the link ends this request.
  push('/live/song/get/clip_trigger_quantization', 4);
  oscTransport.state.connected = false; oscTransport.emit('update', oscTransport.state);
  assert.equal((await pending).ok, false);
  oscTransport.state.connected = true; push('/live/song/get/clip_trigger_quantization', 9);
  runReturnWindow();
  assert.deepEqual(fires(), [[1, 2]], 'unconfirmed rules never revive');
});

test('D13: an unconfirmed deadline cancels a suspended rule and a late response cannot revive it', async () => {
  setup(); await armThreePasses();
  const pending = dispatchCommand('controller', { cmd: 'setGlobalClipQuantization', args: { quantization: 9 } });
  await settle(); runReturnWindow();
  assert.equal((await pending).ok, false);
  assert.equal(clipLaunchEngine.snapshot().statuses[0].rule.reason, 'quantization_unconfirmed');
  push('/live/song/get/clip_trigger_quantization', 9);
  runReturnWindow();
  assert.deepEqual(fires(), [[1, 2]]);
  assert.equal(quantWrites().length, 1);
});

test('D13: new rules refuse arming while a global write is pending, but the clip request is preserved', async () => {
  setup(); await mapViradaReturn(3);
  const pending = dispatchCommand('controller', { cmd: 'setGlobalClipQuantization', args: { quantization: 9 } });
  await settle(); await gesture(G3, 1);
  assert.deepEqual(fires(), [[1, 2]]);
  assert.equal(clipLaunchEngine.snapshot().statuses[0].rule.refusal, 'quantization_pending');
  push('/live/song/get/clip_trigger_quantization', 9); await pending;
  fired(1, 2); fired(1, -1); songTime(16); playing(1, 2); runReturnWindow();
  assert.deepEqual(fires(), [[1, 2]], 'confirmation does not arm a previously refused rule');
});

test('D13: global changes cancel even clip-overridden stop rules and delayed natural-end callbacks', async () => {
  setup({ virada: { looping: false, endMarker: 6, loopEnd: 6 } });
  oscTransport.globalQuantization = 7; oscTransport.state.tempo = 60;
  await mapViradaReturn(1);
  playing(1, 0); fired(1, -1); await gesture(G3, 1);
  fired(1, 2); fired(1, -1); songTime(16); playing(1, 2);
  for (let beat = 1; beat <= 5; beat++) { songTime(16 + beat); position(1, 2, beat); }
  songTime(22); playing(1, -1);
  push('/live/song/get/clip_trigger_quantization', 9);
  await wait(NATURAL_END_SETTLE_MS + 50);
  assert.deepEqual(fires(), [[1, 2]], 'late natural-end callback observes cancellation identity');
  await cancelPendingMappingWrites(); controlMappings.clear(); clipLaunchEngine.reset();
  setup();
  await mapClip(G3, 'Virada', () => ({ then: { action: 'stop', passes: 3 } }));
  push('/live/clip/get/launch_quantization', 1, 2, 8); // own quarter-note quantization
  playing(1, 0); fired(1, -1); await gesture(G3, 1);
  fired(1, 2); fired(1, -1); songTime(16); playing(1, 2);
  push('/live/song/get/clip_trigger_quantization', 7);
  runReturnWindow();
  assert.deepEqual(stops(), []);
  assert.equal(clipLaunchEngine.snapshot().statuses[0].rule.reason, 'global_quantization_changed');
});

test('D13: a return already sent keeps its ledger when global quantization changes', async () => {
  setup(); await mapViradaReturn(1);
  playing(1, 0); fired(1, -1); await gesture(G3, 1);
  fired(1, 2); fired(1, -1); playing(1, 2);
  assert.deepEqual(fires(), [[1, 2], [1, 0]]);
  push('/live/song/get/clip_trigger_quantization', 9);
  await gesture(G3, 0); await gesture(G3, 1);
  assert.deepEqual(fires(), [[1, 2], [1, 0]], 'no compensation or duplicate over the sent return');
});

async function clipTargets() {
  return commands.getClipTargets.handler({});
}

async function drumsTarget(extra = {}) {
  const { tracks } = await clipTargets();
  const drums = tracks.find((t) => t.name === "Drums");
  const ref = (name) => {
    const c = drums.clips.find((item) => item.name === name);
    return { slotIndex: c.slotIndex, clipName: c.name, clipSessionId: c.sessionId };
  };
  return {
    type: "clip_launch",
    trackIndex: drums.trackIndex,
    track: { trackIndex: drums.trackIndex, trackName: drums.name, trackSessionId: drums.sessionId },
    ref,
    ...extra,
  };
}

async function map(control, target) {
  const { ref: _ref, ...clean } = target;
  return commands.setMapping.handler({ control, targets: [clean] });
}

async function mapClip(control, name, extra = {}) {
  const base = await drumsTarget();
  return map(control, { ...base, launchMode: "clip", clip: base.ref(name), ...extra(base) });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function gesture(control, value, lost = false) {
  await applyMapping(CLIENT, control, value, lost);
  await settle();
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

test("getClipTargets lists real names of tracks with clips and skips empty and group tracks", async () => {
  setup();
  const group = track("Group", [clip("Row")]);
  song.tracks.push(group);
  song.tracks[0].groupTrack = group;
  const { tracks } = await clipTargets();
  assert.deepEqual(tracks.map((t) => t.name), ["Keys", "Drums"]);
  const drums = tracks[1];
  assert.deepEqual(drums.clips.map((c) => [c.slotIndex, c.name, c.kind]), [[0, "Base", "midi"], [1, "Variação", "midi"], [2, "Virada", "midi"]]);
  assert.match(drums.sessionId, /^\d+$/);
  assert.match(drums.clips[0].sessionId, /^\d+$/);
});

test("realistic 45-46 digit Live session ids save and fire the exact slot without losing precision", async () => {
  setup();
  const trackId = "1071830035832904214785262397353859593604694139";
  const clipId = "107183003583290421478526239735385959360469413";
  song.tracks[1].handle.id = BigInt(trackId);
  song.tracks[1].clipSlots[2].clip.handle.id = BigInt(clipId);
  const base = await drumsTarget();
  await map(G3, { ...base, launchMode: "clip", clip: base.ref("Virada") });
  const stored = controlMappings.get(G3)[0];
  assert.equal(stored.track.trackSessionId, trackId);
  assert.equal(stored.clip.clipSessionId, clipId);
  await gesture(G3, 1);
  assert.deepEqual(fires(), [[1, 2]]);
});

test("setMapping validates Launch Clip targets and drops generic editor fields", async () => {
  setup();
  const base = await drumsTarget();
  const valid = { ...base, launchMode: "clip", clip: base.ref("Base") };
  delete valid.ref;
  for (const [label, bad] of [
    ["unknown field", { ...valid, evil: 1 }],
    ["then in list mode", { ...valid, launchMode: "list", clip: undefined, clips: [base.ref("Base"), base.ref("Virada")], then: { action: "stop", passes: 1 } }],
    ["list of one", { ...valid, launchMode: "list", clip: undefined, clips: [base.ref("Base")] }],
    ["passes above 8", { ...valid, then: { action: "stop", passes: 9 } }],
    ["stop with a clip", { ...valid, launchMode: "stop" }],
    ["return to itself", { ...valid, then: { action: "clip", passes: 1, clip: base.ref("Base") } }],
    ["return track", { ...valid, trackKind: "return" }],
    ["long name", { ...valid, clip: { ...base.ref("Base"), clipName: "x".repeat(129) } }],
    ["bad session id", { ...valid, clip: { ...base.ref("Base"), clipSessionId: "abc" } }],
    ["oversized session id", { ...valid, clip: { ...base.ref("Base"), clipSessionId: "1".repeat(65) } }],
    ["numeric session id", { ...valid, track: { ...valid.track, trackSessionId: 123 } }],
  ]) {
    const clean = JSON.parse(JSON.stringify(bad));
    await assert.rejects(commands.setMapping.handler({ control: "pad-1", targets: [clean] }), Error, label);
  }
  await commands.setMapping.handler({
    control: "pad-1",
    targets: [{ ...valid, curve: "linear", inMin: 0, neutralPolicy: "hold", visionSafeLossVersion: 2 }],
  });
  const stored = controlMappings.get("pad-1")[0];
  assert.equal(stored.curve, undefined);
  assert.equal(stored.neutralPolicy, undefined);
  assert.equal(stored.launchMode, "clip");
});

test("a pose launches its clip once; holding, losing the hand and disconnecting never repeat it", async () => {
  setup();
  await mapClip(G1, "Base", () => ({}));
  await gesture(G1, 1);
  assert.deepEqual(fires(), [[1, 0]]);
  await gesture(G1, 1);
  await gesture(G1, 0, true);
  await gesture(G1, 1);
  await handleClientDisconnect(CLIENT);
  await gesture(G1, 1);
  assert.deepEqual(fires(), [[1, 0]], "held pose, hand loss and reconnection never relaunch");
  assert.ok(sent.every(([address]) => !address.includes("/set/")), "Launch Clip never writes a property");
});

test("a real release re-arms; asking for the clip Live already plays sends nothing", async () => {
  setup();
  await mapClip(G1, "Base", () => ({}));
  await gesture(G1, 1);
  fired(1, 0);
  fired(1, -1);
  playing(1, 0);
  await gesture(G1, 0);
  await gesture(G1, 1);
  assert.deepEqual(fires(), [[1, 0]], "Base already playing: the request is already satisfied");
  playing(1, -1);
  await gesture(G1, 0);
  await gesture(G1, 1);
  assert.deepEqual(fires(), [[1, 0], [1, 0]], "after the track stopped, the next real activation launches again");
});

test("poses switch directly without a neutral pose, each launching its own clip once", async () => {
  setup();
  await mapClip(G1, "Base", () => ({}));
  await mapClip(G2, "Variação", () => ({}));
  await mapClip(G3, "Virada", () => ({}));
  await gesture(G1, 1);
  fired(1, 0); fired(1, -1); playing(1, 0);
  // The phone switches G1 → G2: release of G1 and ON of G2 arrive together.
  await gesture(G1, 0); await gesture(G2, 1);
  fired(1, 1); fired(1, -1); playing(1, 1);
  await gesture(G2, 0); await gesture(G3, 1);
  fired(1, 2); fired(1, -1); playing(1, 2);
  await gesture(G3, 0); await gesture(G1, 1);
  assert.deepEqual(fires(), [[1, 0], [1, 1], [1, 2], [1, 0]]);
});

test("an oscillating pose does not launch twice while Live has not echoed the first request", async () => {
  setup();
  await mapClip(G2, "Variação", () => ({}));
  await gesture(G2, 1);
  await gesture(G2, 0);
  await gesture(G2, 1);
  assert.deepEqual(fires(), [[1, 1]], "the request ledger covers the listener latency");
  fired(1, 1);
  await gesture(G2, 0);
  await gesture(G2, 1);
  assert.deepEqual(fires(), [[1, 1]], "already waiting in Live");
});

test("without any echo from Live the request is reported unconfirmed and may be asked again", async () => {
  setup();
  await mapClip(G2, "Variação", () => ({}));
  const statuses = [];
  const original = clipLaunchEngine["deps"].broadcast;
  clipLaunchEngine["deps"].broadcast = (status) => statuses.push(status);
  try {
    await gesture(G2, 1);
    await wait(LEDGER_CONFIRM_MS + 100);
    assert.ok(statuses.some((s) => s.state === "no_confirmation"));
    await gesture(G2, 0);
    await gesture(G2, 1);
    assert.deepEqual(fires(), [[1, 1], [1, 1]]);
  } finally {
    clipLaunchEngine["deps"].broadcast = original;
  }
});

test("changing your mind before the boundary relaunches the playing clip (the API has no cancel)", async () => {
  setup();
  await mapClip(G1, "Base", () => ({}));
  await mapClip(G2, "Variação", () => ({}));
  playing(1, 0);
  fired(1, -1);
  await gesture(G2, 1);
  fired(1, 1);
  await gesture(G1, 1);
  assert.deepEqual(fires(), [[1, 1], [1, 0]]);
});

function visionEntry(control) {
  const phone = join(import.meta.dirname, '../static/phone-v3');
  const context = { Date, performance: { now: () => 0 } };
  context.window = context; context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(join(phone, 'safe-input-layer.js'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(join(phone, 'vision-processor.js'), 'utf8'), context);
  const fixture = fs.readFileSync(join(phone, 'static-pose-gesture.test.mjs'), 'utf8');
  vm.runInNewContext(fixture.slice(fixture.indexOf('function handPose('), fixture.indexOf('function transform(')), context);
  const processor = new context.VisionProcessor();
  processor.setGestureOptions({ holdMs: 120 });
  const pose = context.handPose({ thumb: 1, ring: .2, pinky: .2 });
  const descriptor = context.SafeInputLayer.normalizeHandPose(pose);
  for (let take = 0; take < 3; take++) processor.gestures.learn('G1', Array.from({ length: 8 }, () => descriptor.slice()));
  let queue = Promise.resolve();
  processor.onGesture = () => { queue = queue.then(() => gesture(control, 1)); };
  processor.onGestureRelease = () => { queue = queue.then(() => gesture(control, 0)); };
  return {
    async frame(time) { processor.processHandData({ x: .5, y: .5, z: .5, active: true }, time, pose); await queue; },
    async missing(time) { processor.processMissing(time); await queue; await applyMapping(CLIENT, 'sensor.vision.active', 0, true); },
  };
}

test('C21: real vision absence/recovery advances list once after confirmation, never pending', async () => {
  setup();
  const base = await drumsTarget();
  await map(G1, { ...base, launchMode: 'list', clips: ['Base', 'Variação', 'Virada'].map(base.ref) });
  const vision = visionEntry(G1);
  await vision.frame(0); await vision.frame(120);
  assert.deepEqual(fires(), [[1, 0]]);
  await vision.missing(130); await vision.frame(200); await vision.frame(320);
  assert.deepEqual(fires(), [[1, 0]], 'unacknowledged item never advances');
  fired(1, 0);
  await vision.missing(330); await vision.frame(400); await vision.frame(520);
  assert.deepEqual(fires(), [[1, 0]], 'Live pending item never advances');
  fired(1, -1); playing(1, 0);
  await vision.missing(530); await vision.frame(600); await vision.frame(719);
  assert.deepEqual(fires(), [[1, 0]], 'recovery must wait the full hold');
  await vision.frame(720); await vision.frame(1000);
  assert.deepEqual(fires(), [[1, 0], [1, 1]], 'one new stable entry advances exactly once');
  assert.deepEqual(stops(), []);
  assert.deepEqual(quantWrites(), []);
});

test('C21: real vision OFF keeps playing clip and its armed continuation alive', async () => {
  setup();
  await mapViradaReturn(2);
  const vision = visionEntry(G3);
  await vision.frame(0); await vision.frame(120);
  fired(1, 2); fired(1, -1); songTime(16); playing(1, 2);
  await vision.missing(130);
  assert.deepEqual(fires(), [[1, 2]]);
  await vision.frame(200); await vision.frame(320);
  assert.deepEqual(fires(), [[1, 2]], 'same playing clip does not restart on stable recovery');
  await vision.missing(330);
  for (let elapsed = .5; elapsed <= 5; elapsed += .5) {
    songTime(16 + elapsed); position(1, 2, elapsed % 4);
  }
  assert.deepEqual(fires(), [[1, 2], [1, 0]], 'return still fires with hand absent');
  assert.deepEqual(stops(), []);
  assert.deepEqual(quantWrites(), []);
});

test("Advance list moves one item per quantized entry, from the playing clip, and wraps", async () => {
  setup();
  const base = await drumsTarget();
  await map("pad-1", { ...base, launchMode: "list", clips: ["Base", "Variação", "Virada"].map(base.ref) });
  const tap = async () => { await gesture("pad-1", 1); await gesture("pad-1", 0); };
  await tap();
  assert.deepEqual(fires(), [[1, 0]], "nothing playing: the first item");
  await tap();
  await tap();
  assert.deepEqual(fires(), [[1, 0]], "item not echoed yet: no second advance");
  fired(1, 0);
  await tap();
  assert.deepEqual(fires(), [[1, 0]], "item waiting in Live: still one advance");
  fired(1, -1); playing(1, 0);
  await tap();
  assert.deepEqual(fires(), [[1, 0], [1, 1]]);
  fired(1, 1); fired(1, -1); playing(1, 1);
  await tap();
  fired(1, 2); fired(1, -1); playing(1, 2);
  await tap();
  assert.deepEqual(fires(), [[1, 0], [1, 1], [1, 2], [1, 0]], "wraps to the first item");
});

test("Stop track asks for a quantized stop once and nothing when stopped", async () => {
  setup();
  const base = await drumsTarget();
  await map("pad-12", { ...base, launchMode: "stop" });
  playing(1, 0);
  fired(1, -1);
  const tap = async () => { await gesture("pad-12", 1); await gesture("pad-12", 0); };
  await tap();
  assert.deepEqual(stops(), [1]);
  assert.deepEqual(sent.find(([address]) => address === "/live/track/stop_all_clips"), ["/live/track/stop_all_clips", 1],
    "no extra argument: Live's quantized default");
  fired(1, -2);
  await tap();
  assert.deepEqual(stops(), [1], "stop already pending");
  fired(1, -1); playing(1, -1);
  await tap();
  assert.deepEqual(stops(), [1], "already stopped");
});

test("reordering tracks fires the same clip at its new index", async () => {
  setup();
  await mapClip(G1, "Base", () => ({}));
  song.tracks.reverse(); // Drums stays at 1, swap Keys/Empty around it
  song.tracks.unshift(song.tracks.pop()); // Drums now at 2
  const drumsIndex = song.tracks.findIndex((t) => t.name === "Drums");
  await gesture(G1, 1);
  assert.deepEqual(fires(), [[drumsIndex, 0]]);
  assert.ok(sent.some(([address, t]) => address === "/live/track/start_listen/fired_slot_index" && t === drumsIndex));
});

test("moving a clip to another scene fires it at its new slot", async () => {
  setup();
  await mapClip(G1, "Base", () => ({}));
  const drums = song.tracks[1];
  drums.clipSlots = [{ clip: null }, drums.clipSlots[1], drums.clipSlots[2], drums.clipSlots[0]];
  await gesture(G1, 1);
  assert.deepEqual(fires(), [[1, 3]]);
});

test("a renamed, deleted or duplicated destination is never fired", async () => {
  setup();
  await mapClip(G1, "Base", () => ({}));
  const statuses = [];
  const original = clipLaunchEngine["deps"].broadcast;
  clipLaunchEngine["deps"].broadcast = (status) => statuses.push(status);
  try {
    const drums = song.tracks[1];
    drums.clipSlots[0].clip.name = "Base 2";
    await gesture(G1, 1); await gesture(G1, 0);
    drums.clipSlots[0].clip = null;
    await gesture(G1, 1); await gesture(G1, 0);
    drums.clipSlots[0].clip = clip("Base");
    drums.clipSlots[3].clip = clip("Base");
    await gesture(G1, 1); await gesture(G1, 0);
    assert.deepEqual(fires(), []);
    assert.deepEqual(statuses.filter((s) => s.control === G1).map((s) => s.state), ["missing", "missing", "ambiguous"]);
  } finally {
    clipLaunchEngine["deps"].broadcast = original;
  }
});

test("AbletonOSC track indices that differ from the SDK block the launch", async () => {
  setup();
  await mapClip(G1, "Base", () => ({}));
  namesReply = () => ["Keys", "Something else", "Drums", "Empty"];
  await gesture(G1, 1);
  assert.deepEqual(fires(), []);
  const { statuses } = await commands.getClipLaunchStatus.handler({});
  assert.equal(statuses.length, 1);
});

test("a group track is refused", async () => {
  setup();
  await mapClip(G1, "Base", () => ({}));
  song.tracks[0].groupTrack = song.tracks[1];
  await gesture(G1, 1);
  assert.deepEqual(fires(), []);
});

test("without the AbletonOSC link nothing is sent and the state says so", async () => {
  setup();
  await mapClip(G1, "Base", () => ({}));
  oscTransport.state.connected = false;
  await gesture(G1, 1);
  assert.deepEqual(fires(), []);
  const { statuses } = await commands.getClipLaunchStatus.handler({});
  assert.equal(statuses[0].state, "unavailable");
});

// ── "After it starts" ────────────────────────────────────────────────────

async function mapViradaReturn(passes, extra = {}) {
  await mapClip(G3, "Virada", (base) => ({ then: { action: "clip", passes, clip: base.ref("Base") }, ...extra }));
}

test("Virada → Base after one pass: Base is requested once Live confirms the Virada", async () => {
  setup();
  await mapClip(G1, "Base", () => ({}));
  await mapViradaReturn(1);
  playing(1, 0); fired(1, -1);
  await gesture(G3, 1);
  assert.deepEqual(fires(), [[1, 2]]);
  fired(1, 2);
  assert.deepEqual(fires(), [[1, 2]], "nothing before the Virada actually starts");
  fired(1, -1);
  playing(1, 2);
  assert.deepEqual(fires(), [[1, 2], [1, 0]], "one bar = one quantum: the return goes at confirmation");
  // The G3 pose oscillates while the return waits: neither a restart nor a cancel.
  await gesture(G3, 0);
  await gesture(G3, 1);
  fired(1, 0);
  await gesture(G3, 0);
  await gesture(G3, 1);
  assert.deepEqual(fires(), [[1, 2], [1, 0]]);
  fired(1, -1); playing(1, 0);
  const { diagnostics } = await commands.getClipLaunchStatus.handler({});
  assert.equal(diagnostics.at(-1).outcome, "sent");
  assert.equal(diagnostics.at(-1).late, false);
});

async function playVirada(passes, { step = 0.5, beats } = {}) {
  await mapViradaReturn(passes);
  playing(1, 0); fired(1, -1);
  await gesture(G3, 1);
  fired(1, 2); fired(1, -1);
  let songBeat = 16;
  songTime(songBeat);
  playing(1, 2);
  const sendsAt = [];
  const total = beats ?? passes * 4 + 4;
  for (let elapsed = step; elapsed <= total; elapsed += step) {
    songBeat += step;
    songTime(songBeat);
    const before = fires().length;
    position(1, 2, elapsed % 4);
    if (fires().length > before) sendsAt.push(elapsed);
  }
  return sendsAt;
}

for (const passes of [2, 3]) {
  test(`Virada → Base after ${passes} passes goes out inside the last quantum`, async () => {
    setup();
    const sendsAt = await playVirada(passes);
    assert.equal(sendsAt.length, 1, JSON.stringify(sendsAt));
    const total = passes * 4;
    assert.ok(sendsAt[0] >= total - 4 + 0.25 && sendsAt[0] < total, `sent at ${sendsAt[0]} of ${total}`);
  });
}

test("a new choice cancels a pending return; no old return ever follows", async () => {
  setup();
  await mapClip(G1, "Base", () => ({}));
  await mapViradaReturn(3);
  playing(1, 0); fired(1, -1);
  await gesture(G3, 1);
  fired(1, 2); fired(1, -1);
  songTime(16);
  playing(1, 2);
  songTime(17);
  position(1, 2, 1);
  await gesture(G3, 0);
  await gesture(G1, 1); // back to Base before the return
  fired(1, 0);
  for (let beat = 2; beat < 16; beat += 0.5) {
    songTime(16 + beat);
    position(1, 2, beat % 4);
  }
  assert.deepEqual(fires(), [[1, 2], [1, 0]], "only the user's Base, never a late return");
});

test("a launch from Live itself, a track stop and a transport stop cancel the rule", async () => {
  for (const interrupt of [
    () => fired(1, 1),
    () => fired(1, -2),
    () => push("/live/song/get/is_playing", 0),
  ]) {
    setup();
    await mapViradaReturn(3);
    playing(1, 0); fired(1, -1);
    await gesture(G3, 1);
    fired(1, 2); fired(1, -1);
    songTime(16);
    playing(1, 2);
    interrupt();
    oscTransport.state.isPlaying = true;
    for (let beat = 0.5; beat < 14; beat += 0.5) {
      songTime(16 + beat);
      position(1, 2, beat % 4);
    }
    assert.deepEqual(fires(), [[1, 2]]);
    await cancelPendingMappingWrites();
    controlMappings.clear();
    clipLaunchEngine.refresh();
    clipLaunchEngine.reset();
  }
});

test("removing the mapping cancels its rule", async () => {
  setup();
  await mapViradaReturn(2);
  playing(1, 0); fired(1, -1);
  await gesture(G3, 1);
  fired(1, 2); fired(1, -1);
  songTime(16);
  playing(1, 2);
  await commands.removeMapping.handler({ control: G3 });
  for (let beat = 0.5; beat < 10; beat += 0.5) {
    songTime(16 + beat);
    position(1, 2, beat % 4);
  }
  assert.deepEqual(fires(), [[1, 2]]);
});

test("a phone disconnect leaves the armed rule running; the OSC link loss cancels it for good", async () => {
  setup();
  await mapViradaReturn(2);
  playing(1, 0); fired(1, -1);
  await gesture(G3, 1);
  fired(1, 2); fired(1, -1);
  songTime(16);
  playing(1, 2);
  await handleClientDisconnect(CLIENT);
  for (let beat = 0.5; beat <= 5; beat += 0.5) {
    songTime(16 + beat);
    position(1, 2, beat % 4);
  }
  assert.deepEqual(fires(), [[1, 2], [1, 0]], "the return went out with the phone gone");

  // Second run: the OSC link drops before the window.
  await cancelPendingMappingWrites();
  controlMappings.clear();
  clipLaunchEngine.refresh();
  clipLaunchEngine.reset();
  setup();
  await mapViradaReturn(2);
  playing(1, 0); fired(1, -1);
  await gesture(G3, 1);
  fired(1, 2); fired(1, -1);
  songTime(16);
  playing(1, 2);
  oscTransport.state.connected = false;
  await wait(1200);
  oscTransport.state.connected = true;
  for (let beat = 0.5; beat <= 8; beat += 0.5) {
    songTime(16 + beat);
    position(1, 2, beat % 4);
  }
  assert.deepEqual(fires(), [[1, 2]], "nothing resent after the link came back");
});

test("a non-loop Virada that ends before the window gets one late return; a transport stop gets none", async () => {
  for (const stopTransport of [false, true]) {
    setup({ virada: { looping: false, endMarker: 6, loopEnd: 6 } });
    oscTransport.globalQuantization = 7; // 1/4
    oscTransport.state.tempo = 60;
    await mapViradaReturn(1);
    playing(1, 0); fired(1, -1);
    await gesture(G3, 1);
    fired(1, 2); fired(1, -1);
    songTime(16);
    playing(1, 2);
    for (let beat = 1; beat <= 5; beat += 1) {
      songTime(16 + beat);
      position(1, 2, beat);
    }
    assert.deepEqual(fires(), [[1, 2]], "window [5.25, 6) not reached by a push");
    if (stopTransport) {
      oscTransport.state.isPlaying = false;
    } else {
      songTime(22);
    }
    playing(1, -1);
    await wait(NATURAL_END_SETTLE_MS + 50);
    if (!stopTransport) songTime(22.1);
    assert.deepEqual(fires(), stopTransport ? [[1, 2]] : [[1, 2], [1, 0]]);
    await cancelPendingMappingWrites();
    controlMappings.clear();
    clipLaunchEngine.refresh();
    clipLaunchEngine.reset();
  }
});

test("rules that cannot be counted are refused up front and the clip still launches", async () => {
  setup();
  oscTransport.globalQuantization = 0; // None
  await mapViradaReturn(1);
  const { statuses } = await commands.getClipLaunchStatus.handler({});
  assert.equal(statuses[0].rule.state, "refused");
  assert.equal(statuses[0].rule.refusal, "quantization_none");
  await gesture(G3, 1);
  assert.deepEqual(fires(), [[1, 2]]);
});

test("status reports effective quantization and the prediction", async () => {
  setup({ virada: { loopEnd: 2, endMarker: 2 } });
  await mapViradaReturn(1);
  push("/live/clip/get/launch_quantization", 1, 0, 0); // Base: Global
  push("/live/clip/get/launch_mode", 1, 2, 0);
  push("/live/clip/get/legato", 1, 2, 0);
  const { statuses } = await commands.getClipLaunchStatus.handler({});
  assert.deepEqual(statuses[0].quantization, { source: "global", label: "1 Bar" });
  assert.deepEqual(statuses[0].rule.prediction, { landingBeats: 4, extraBeats: 2, kind: "repeat" });
});

test("a legato or non-trigger Virada refuses the rule", async () => {
  setup();
  await mapViradaReturn(1);
  push("/live/clip/get/legato", 1, 2, 1);
  let { statuses } = await commands.getClipLaunchStatus.handler({});
  assert.equal(statuses[0].rule.refusal, "legato");
  push("/live/clip/get/legato", 1, 2, 0);
  push("/live/clip/get/launch_mode", 1, 2, 1);
  ({ statuses } = await commands.getClipLaunchStatus.handler({}));
  assert.equal(statuses[0].rule.refusal, "launch_mode");
  assert.deepEqual(statuses[0].warnings, ["launch_mode"]);
});

test("Launch Clip commands are classified: listing is read, testing is a live write", async () => {
  assert.equal(COMMAND_SIDE_EFFECTS.getClipTargets, "read");
  assert.equal(COMMAND_SIDE_EFFECTS.getClipLaunchStatus, "read");
  assert.equal(COMMAND_SIDE_EFFECTS.testClipLaunch, "live-write");
  setup();
  await mapClip(G1, "Base", () => ({}));
  const viewer = await dispatchCommand("viewer", { cmd: "testClipLaunch", args: { control: G1 } });
  assert.equal(viewer.ok, false);
  assert.deepEqual(fires(), []);
  const read = await dispatchCommand("viewer", { cmd: "getClipTargets" });
  assert.equal(read.ok, true);
  const controller = await dispatchCommand("controller", { cmd: "testClipLaunch", args: { control: G1 } });
  assert.equal(controller.ok, true, controller.error);
  assert.deepEqual(fires(), [[1, 0]]);
  const notClip = await dispatchCommand("controller", { cmd: "testClipLaunch", args: { control: "pad-9" } });
  assert.equal(notClip.ok, false);
});

test("the OSC traffic stays within fire, stop, listeners and getters", async () => {
  setup();
  await mapViradaReturn(2);
  await gesture(G3, 1);
  const allowed = new Set([
    "/live/clip_slot/fire", "/live/track/stop_all_clips",
    "/live/track/start_listen/fired_slot_index", "/live/track/stop_listen/fired_slot_index",
    "/live/track/start_listen/playing_slot_index", "/live/track/stop_listen/playing_slot_index",
    "/live/clip/start_listen/playing_position", "/live/clip/stop_listen/playing_position",
    "/live/clip/get/launch_quantization", "/live/clip/get/launch_mode", "/live/clip/get/legato",
    "/live/song/start_listen/clip_trigger_quantization", "/live/song/get/clip_trigger_quantization",
    "/live/song/get/track_names",
  ]);
  for (const [address] of sent) assert.ok(allowed.has(address), address);
});
