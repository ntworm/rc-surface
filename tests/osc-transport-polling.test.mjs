// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// queryInitialState registers `start_listen` for tempo, is_playing, metronome,
// both signature halves, current_song_time, beat and selected_track —
// AbletonOSC pushes every one of those on change. The 500 ms poll used to ask
// for the same values anyway, and the 2 s heartbeat asked for the tempo a
// third time. That was ~12 OSC messages a second out and as many replies back,
// forever, restating what had just been pushed — and every reply walks
// handleIncoming and can emit an 'update' to all connected phones.
//
// Polling is now a recovery path: it runs when the push stream goes quiet.
import test from "node:test";
import assert from "node:assert/strict";
import { OSCTransport, LISTENER_QUIET_MS, LISTENER_REREGISTER_MS } from "../src/live/osc-transport.ts";

function recordingTransport() {
  const transport = new OSCTransport();
  const sent = [];
  // Record instead of touching a socket, but keep the reply accounting the
  // real send() performs, so poll replies are still told apart from pushes.
  transport.send = (address) => { sent.push(address); transport.expectReply(address); };
  return { transport, sent };
}

test("a flowing push stream reduces polling to what has no listener behind it", () => {
  const { transport, sent } = recordingTransport();
  const now = Date.now();
  transport.state.lastSeenAt = now - 100; // a push arrived 100 ms ago
  transport.lastPushAt = now - 100;
  transport.state.isPlaying = true;

  transport.pollTick(now);

  assert.deepEqual(sent, [], "with pushes flowing there is nothing left to poll");
});

test("a quiet push stream falls back to a full resync", () => {
  const { transport, sent } = recordingTransport();
  const now = Date.now();
  transport.state.lastSeenAt = now - (LISTENER_QUIET_MS + 1);
  transport.state.isPlaying = true;

  transport.pollTick(now);

  assert.ok(sent.includes("/live/song/get/tempo"));
  assert.ok(sent.includes("/live/song/get/is_playing"));
  assert.ok(sent.includes("/live/song/get/metronome"));
  assert.ok(sent.includes("/live/view/get/selected_track"));
  assert.ok(
    sent.includes("/live/song/get/current_song_time"),
    "the playhead is only re-asked for while playing",
  );
});

test("a quiet stream that is not playing does not ask for the playhead", () => {
  const { transport, sent } = recordingTransport();
  const now = Date.now();
  transport.state.lastSeenAt = now - (LISTENER_QUIET_MS + 1);
  transport.state.isPlaying = false;

  transport.pollTick(now);

  assert.ok(!sent.includes("/live/song/get/current_song_time"));
});

test("the heartbeat probe is skipped while the link is already proving itself", () => {
  const { transport, sent } = recordingTransport();
  const now = Date.now();
  transport.state.lastSeenAt = now - 200;
  transport.lastPushAt = now - 200;

  transport.heartbeatTick(now);

  assert.deepEqual(sent, [], "a push arriving on the socket already proves liveness");
});

test("the heartbeat probes once the stream goes quiet", () => {
  const { transport, sent } = recordingTransport();
  const now = Date.now();
  transport.state.lastSeenAt = now - (LISTENER_QUIET_MS + 1);
  transport.lastListenerRegistrationAt = now;

  transport.heartbeatTick(now);

  assert.deepEqual(sent, ["/live/song/get/tempo", "/live/song/get/is_playing"]);
});

test("disconnect detection still fires after five silent seconds", () => {
  const { transport } = recordingTransport();
  const now = Date.now();
  transport.state.lastSeenAt = now - 5001;
  transport.state.connected = true;

  transport.heartbeatTick(now);

  assert.equal(transport.state.connected, false);
});

test("a socket that never spoke is treated as quiet, not as connected", () => {
  const { transport, sent } = recordingTransport();
  const now = Date.now();
  transport.state.lastSeenAt = null;
  transport.state.connected = true;
  transport.lastListenerRegistrationAt = now;

  transport.heartbeatTick(now);

  assert.equal(transport.state.connected, true, "no first message yet is not a disconnect");
  assert.deepEqual(sent, ["/live/song/get/tempo", "/live/song/get/is_playing"], "but it must still be probed");
});

test("steady-state traffic drops by roughly an order of magnitude", () => {
  const { transport, sent } = recordingTransport();
  const now = Date.now();
  transport.state.isPlaying = true;

  // Ten seconds of playback: 20 poll turns, 5 heartbeat turns, with
  // current_song_time pushing throughout so the stream never goes quiet.
  for (let i = 0; i < 20; i++) {
    transport.state.lastSeenAt = now + i * 500;
    transport.lastPushAt = now + i * 500;
    transport.pollTick(now + i * 500);
  }
  for (let i = 0; i < 5; i++) {
    transport.state.lastSeenAt = now + i * 2000;
    transport.lastPushAt = now + i * 2000;
    transport.heartbeatTick(now + i * 2000);
  }

  // Was 20 * 6 + 5 = 125 messages for the same ten seconds; the selection
  // is asked for on demand now, so a flowing link sends nothing at all.
  assert.equal(sent.length, 0, "a flowing link is silent");
});

// Owner bench 2026-09-21: Live creates the AbletonOSC control surface once
// before the document loads and again after ("Disconnecting..." then a second
// "Started AbletonOSC"). Listeners registered with the first instance die with
// it, while the second instance still answers probes, so the link looked
// alive and RC Surface never re-registered: no beat flash, stale play state.
test("a quiet stream re-registers the listeners once the re-registration interval has passed", () => {
  const { transport, sent } = recordingTransport();
  const now = Date.now();
  transport.state.lastSeenAt = now - (LISTENER_QUIET_MS + 1);
  transport.lastListenerRegistrationAt = now - (LISTENER_REREGISTER_MS + 1);

  transport.heartbeatTick(now);

  for (const address of [
    "/live/song/start_listen/is_playing",
    "/live/song/start_listen/tempo",
    "/live/song/start_listen/current_song_time",
    "/live/song/start_listen/beat",
    "/live/view/start_listen/selected_track",
  ]) {
    assert.ok(sent.includes(address), `${address} must be re-registered`);
  }
  assert.ok(!sent.includes("/live/song/get/cue_points"), "cue points are not re-fetched on every re-registration");
  assert.equal(transport.lastListenerRegistrationAt, now);
});

test("a quiet stream does not re-register before the interval, and a flowing stream never does", () => {
  const { transport, sent } = recordingTransport();
  const now = Date.now();
  transport.state.lastSeenAt = now - (LISTENER_QUIET_MS + 1);
  transport.lastListenerRegistrationAt = now - 1000;
  transport.heartbeatTick(now);
  assert.ok(!sent.some((a) => a.includes("start_listen")), "recently registered: only probe");

  sent.length = 0;
  transport.state.lastSeenAt = now - 100;
  transport.lastPushAt = now - 100;
  transport.lastListenerRegistrationAt = now - (LISTENER_REREGISTER_MS * 5);
  transport.heartbeatTick(now);
  assert.deepEqual(sent, [], "pushes are arriving, so the listeners are proven alive");
});

test("the quiet-stream probe also asks whether Live is playing, so optimistic play/stop state is corrected", () => {
  const { transport, sent } = recordingTransport();
  const now = Date.now();
  transport.state.lastSeenAt = now - (LISTENER_QUIET_MS + 1);
  transport.lastListenerRegistrationAt = now;

  transport.heartbeatTick(now);

  assert.deepEqual(sent, ["/live/song/get/tempo", "/live/song/get/is_playing"]);
});

// Second round on the same bench: with a device selected, AbletonOSC answers
// the 2 Hz selected_device poll, and those replies kept lastSeenAt fresh, so
// the stream never counted as quiet and the re-registration never ran.
// Only unsolicited pushes may prove that the listeners are alive.
test("replies to our own polls do not count as listener pushes", () => {
  const { transport } = recordingTransport();
  const now = Date.now();
  const message = (address, value) => ({ oscType: "message", address, args: [{ type: "integer", value }] });

  transport.refreshSelection();                  // sends /live/view/get/selected_device
  transport.handleIncoming(message("/live/view/get/selected_track", 0));
  transport.handleIncoming(message("/live/view/get/selected_device", 0));
  assert.equal(transport.lastPushAt, null, "the answer to our poll is a reply, not a push");
  assert.ok(transport.isListenerStreamQuiet(now + LISTENER_QUIET_MS + 1));

  transport.handleIncoming(message("/live/song/get/beat", 3));
  assert.ok(transport.lastPushAt !== null, "an unsolicited beat is a push");
  assert.ok(!transport.isListenerStreamQuiet(transport.lastPushAt + 100));
});

test("dead listeners with a selected device are re-registered within one interval", () => {
  const { transport, sent } = recordingTransport();
  const now = Date.now();
  const message = (address, value) => ({ oscType: "message", address, args: [{ type: "integer", value }] });
  transport.lastListenerRegistrationAt = now;

  // Twelve seconds of a link whose only traffic is our probes and their replies.
  for (let t = 500; t <= 12000; t += 500) {
    transport.pollTick(now + t);
    if (t % 2000 === 0) {
      transport.heartbeatTick(now + t);
      transport.handleIncoming(message("/live/song/get/tempo", 120));
      transport.handleIncoming(message("/live/song/get/is_playing", 0));
    }
  }
  assert.ok(sent.includes("/live/song/start_listen/beat"), "the beat listener must be re-registered");
});

// AbletonOSC raises inside Live ("None is not in list") whenever
// /live/view/get/selected_device is asked while no device is selected, and
// logs a traceback each time. Polled at 2 Hz that grew the owner's
// abletonosc.log to 3.28 GB. The selection is only read by MAP mode's
// "use selected" button, so it is now asked for on demand.
test("the selection is never polled on a cadence", () => {
  const { transport, sent } = recordingTransport();
  const now = Date.now();
  for (let t = 0; t <= 4000; t += 500) {
    transport.pollTick(now + t);
    if (t % 2000 === 0) transport.heartbeatTick(now + t);
  }
  assert.ok(!sent.includes("/live/view/get/selected_device"), "selected_device must not be polled");
});

test("requestSelection asks once and resolves on the reply or on its timeout", async () => {
  const { transport, sent } = recordingTransport();
  const message = (address, values) => ({ oscType: "message", address, args: values.map((value) => ({ type: "integer", value })) });

  const pending = transport.requestSelection(1000);
  assert.deepEqual(sent, ["/live/view/get/selected_track", "/live/view/get/selected_device"]);
  transport.handleIncoming(message("/live/view/get/selected_device", [1, 2]));
  await pending;
  assert.equal(transport.state.selectedTrackIndex, 1);
  assert.equal(transport.state.selectedDeviceIndex, 2);

  const started = Date.now();
  await transport.requestSelection(50);
  assert.ok(Date.now() - started >= 45, "an unanswered request gives up after its timeout");
});
