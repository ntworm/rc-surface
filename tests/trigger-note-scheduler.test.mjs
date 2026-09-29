// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0

import test from "node:test";
import assert from "node:assert/strict";

import { TriggerNoteClock } from "../src/live/trigger-note-clock.ts";
import { TriggerNoteScheduler } from "../src/live/trigger-note-scheduler.ts";
import { pressReceiverNote } from "../src/live/midi-receiver.ts";

function createFakeTimerSystem(startTime = 10000) {
  let currentTime = startTime;
  let nextTimerId = 1;
  const activeTimers = new Map();

  const timers = {
    set(fn, ms) {
      const id = nextTimerId++;
      activeTimers.set(id, { fn, fireTime: currentTime + ms });
      return id;
    },
    clear(id) {
      activeTimers.delete(id);
    },
  };

  const now = () => currentTime;

  const advance = async (ms) => {
    const targetTime = currentTime + ms;
    while (true) {
      let earliestId = null;
      let earliestTime = Infinity;
      for (const [id, timer] of activeTimers.entries()) {
        if (timer.fireTime <= targetTime && timer.fireTime < earliestTime) {
          earliestId = id;
          earliestTime = timer.fireTime;
        }
      }
      if (earliestId === null) {
        currentTime = targetTime;
        break;
      }
      currentTime = earliestTime;
      const t = activeTimers.get(earliestId);
      activeTimers.delete(earliestId);
      t.fn();
      await new Promise(r => setImmediate(r));
    }
  };

  return { timers, now, advance, setTime: (t) => { currentTime = t; }, activeTimers };
}

function createMockTrack() {
  const packets = [];
  const receiver = {
    name: "RC-Midi-Receiver",
    parameters: [
      {
        name: "RC MIDI Packet v2",
        min: 0,
        max: 4194303,
        isQuantized: false,
        setValue: async (value) => {
          const note = Math.floor(value / 128) % 128;
          const velocity = value % 128;
          packets.push([note, velocity]);
        },
      },
    ],
  };
  const track = { devices: [receiver] };
  return { track, packets, receiver };
}

test('retrigger on one track retires old OFF timer before the replacement receives its full duration', async () => {
  const sys = createFakeTimerSystem(1000);
  const clock = new TriggerNoteClock(sys.now);
  clock.updateTransport(true, true, 120, 4, 4);
  clock.observePosition(10.75, 120, 4);
  const { track, packets } = createMockTrack();
  const scheduler = new TriggerNoteScheduler(clock, sys.now, sys.timers);
  const enqueue = (key, note) => scheduler.enqueue({
    lane: track, key, timing: 'beat', durationMs: 600,
    send: () => pressReceiverNote(track, note, 100, () => true),
    isCurrent: () => true, feedback: () => {},
  });

  enqueue('first', 48);
  await sys.advance(125);
  assert.deepEqual(packets, [[48, 100]]);
  await sys.advance(250);
  clock.observePosition(11.5, 120, 4);
  enqueue('second', 50);
  await sys.advance(250);
  assert.deepEqual(packets, [[48, 100], [48, 0], [50, 100]]);
  await sys.advance(100); // the first note's former OFF deadline
  assert.deepEqual(packets, [[48, 100], [48, 0], [50, 100]]);
  await sys.advance(500);
  assert.deepEqual(packets, [[48, 100], [48, 0], [50, 100], [50, 0]]);
});

test('grid pulse freezes 1/4 of a 3/4 bar from fresh BPM at the actual ON', async () => {
  const sys = createFakeTimerSystem(1000);
  const clock = new TriggerNoteClock(sys.now);
  clock.updateTransport(true, true, 120, 3, 4);
  clock.observePosition(10.75, 120, 3, 4);
  const { track, packets } = createMockTrack();
  const scheduler = new TriggerNoteScheduler(clock, sys.now, sys.timers);
  scheduler.enqueue({ lane: track, key: 'grid', timing: 'beat', durationMs: 80, durationBars: 0.25,
    send: () => pressReceiverNote(track, 48, 100, () => true), isCurrent: () => true, feedback: () => {} });
  await sys.advance(124);
  clock.updateTransport(true, true, 60, 3, 4);
  clock.observePosition(10.999, 60, 3, 4);
  await sys.advance(1);
  assert.deepEqual(packets, [[48, 100]]);
  await sys.advance(749);
  assert.deepEqual(packets, [[48, 100]]);
  await sys.advance(1);
  assert.deepEqual(packets, [[48, 100], [48, 0]]);
});

test("input at beat 10.75 sends ON at beat 11 and OFF after 80ms duration", async () => {
  const sys = createFakeTimerSystem(1000);
  const clock = new TriggerNoteClock(sys.now);
  // Transport playing at 120 BPM, 4/4
  clock.updateTransport(true, true, 120, 4, 4);
  clock.observePosition(10.75, 120, 4);

  const { track, packets } = createMockTrack();
  const scheduler = new TriggerNoteScheduler(clock, sys.now, sys.timers);

  const feedbackEvents = [];
  scheduler.enqueue({
    lane: track,
    key: "client-1::pad-1::trigger_note",
    timing: "beat",
    durationMs: 80,
    send: () => pressReceiverNote(track, 48, 100, () => true),
    isCurrent: () => true,
    feedback: (state, targetBeat, reason) => {
      feedbackEvents.push({ state, targetBeat, reason });
    },
  });

  assert.equal(feedbackEvents.length, 1);
  assert.deepEqual(feedbackEvents[0], { state: "pending", targetBeat: 11, reason: undefined });
  assert.deepEqual(packets, []);

  // Advance 80ms (simulating falling edge / release input) - input goes 0
  await sys.advance(80);
  // Still before beat 11 (beat 11 is at 125ms from 10.75 at 120 BPM)
  assert.deepEqual(packets, []);

  // Advance remaining 45ms to reach beat 11 (125ms total)
  await sys.advance(45);
  // Now beat 11 has fired: packet [48, 100] (C2 note on)
  assert.deepEqual(packets, [[48, 100]]);
  assert.equal(feedbackEvents.length, 2);
  assert.deepEqual(feedbackEvents[1], { state: "sent", targetBeat: 11, reason: undefined });

  // Advance 79ms: OFF not fired yet
  await sys.advance(79);
  assert.deepEqual(packets, [[48, 100]]);

  // Advance 1ms (80ms total after started): OFF fires [48, 0]
  await sys.advance(1);
  assert.deepEqual(packets, [[48, 100], [48, 0]]);
});

test("A/B/C on same track sends only C; separate track is preserved", async () => {
  const sys = createFakeTimerSystem(1000);
  const clock = new TriggerNoteClock(sys.now);
  clock.updateTransport(true, true, 120, 4, 4);
  clock.observePosition(10.75, 120, 4);

  const track1 = createMockTrack();
  const track2 = createMockTrack();
  const scheduler = new TriggerNoteScheduler(clock, sys.now, sys.timers);

  const feedbackA = [];
  const feedbackB = [];
  const feedbackC = [];
  const feedbackD = [];

  // Enqueue A, then B, then C on track1
  scheduler.enqueue({
    lane: track1.track,
    key: "client-1::pad-1",
    timing: "beat",
    durationMs: 80,
    send: () => pressReceiverNote(track1.track, 48, 100, () => true),
    isCurrent: () => true,
    feedback: (state, beat, reason) => feedbackA.push({ state, beat, reason }),
  });

  scheduler.enqueue({
    lane: track1.track,
    key: "client-1::pad-2",
    timing: "beat",
    durationMs: 80,
    send: () => pressReceiverNote(track1.track, 50, 100, () => true),
    isCurrent: () => true,
    feedback: (state, beat, reason) => feedbackB.push({ state, beat, reason }),
  });

  scheduler.enqueue({
    lane: track1.track,
    key: "client-1::pad-3",
    timing: "beat",
    durationMs: 80,
    send: () => pressReceiverNote(track1.track, 52, 100, () => true),
    isCurrent: () => true,
    feedback: (state, beat, reason) => feedbackC.push({ state, beat, reason }),
  });

  // Enqueue D on independent track2
  scheduler.enqueue({
    lane: track2.track,
    key: "client-1::pad-4",
    timing: "beat",
    durationMs: 80,
    send: () => pressReceiverNote(track2.track, 60, 100, () => true),
    isCurrent: () => true,
    feedback: (state, beat, reason) => feedbackD.push({ state, beat, reason }),
  });

  // A and B should be cancelled with 'superseded'
  assert.equal(feedbackA[1]?.state, "cancelled");
  assert.equal(feedbackA[1]?.reason, "superseded");
  assert.equal(feedbackB[1]?.state, "cancelled");
  assert.equal(feedbackB[1]?.reason, "superseded");

  // Advance to beat 11 (125ms)
  await sys.advance(125);
  // Track 1 should ONLY have note 52 (C)
  assert.deepEqual(track1.packets, [[52, 100]]);
  // Track 2 should have note 60 (D)
  assert.deepEqual(track2.packets, [[60, 100]]);

  // Advance 80ms: both notes should have OFF
  await sys.advance(80);
  assert.deepEqual(track1.packets, [[52, 100], [52, 0]]);
  assert.deepEqual(track2.packets, [[60, 100], [60, 0]]);
});

test("64-lane cap refuses new lane without prejudicing active lane releases", async () => {
  const sys = createFakeTimerSystem(1000);
  const clock = new TriggerNoteClock(sys.now);
  clock.updateTransport(true, true, 120, 4, 4);
  clock.observePosition(10.75, 120, 4);

  const scheduler = new TriggerNoteScheduler(clock, sys.now, sys.timers);
  const tracks = Array.from({ length: 65 }, () => createMockTrack());

  // Enqueue 64 distinct lanes
  for (let i = 0; i < 64; i++) {
    scheduler.enqueue({
      lane: tracks[i].track,
      key: `client-1::pad-${i}`,
      timing: "beat",
      durationMs: 80,
      send: () => pressReceiverNote(tracks[i].track, 48, 100, () => true),
      isCurrent: () => true,
      feedback: () => {},
    });
  }

  // 65th lane should be refused with error
  const feedback65 = [];
  scheduler.enqueue({
    lane: tracks[64].track,
    key: "client-1::pad-65",
    timing: "beat",
    durationMs: 80,
    send: () => pressReceiverNote(tracks[64].track, 48, 100, () => true),
    isCurrent: () => true,
    feedback: (state, beat, reason) => feedback65.push({ state, beat, reason }),
  });

  assert.equal(feedback65.length, 1);
  assert.equal(feedback65[0].state, "error");
  assert.equal(feedback65[0].reason, "lane_cap_exceeded");

  // Advance and verify all 64 lanes play and release properly
  await sys.advance(125);
  for (let i = 0; i < 64; i++) {
    assert.deepEqual(tracks[i].packets, [[48, 100]]);
  }
  assert.deepEqual(tracks[64].packets, []);

  await sys.advance(80);
  for (let i = 0; i < 64; i++) {
    assert.deepEqual(tracks[i].packets, [[48, 100], [48, 0]]);
  }
});

test("clock stop or stale cancels pending with unavailable", async () => {
  const sys = createFakeTimerSystem(1000);
  const clock = new TriggerNoteClock(sys.now);
  clock.updateTransport(true, true, 120, 4, 4);
  clock.observePosition(10.75, 120, 4);

  const { track, packets } = createMockTrack();
  const scheduler = new TriggerNoteScheduler(clock, sys.now, sys.timers);

  const feedback = [];
  scheduler.enqueue({
    lane: track,
    key: "pad-1",
    timing: "beat",
    durationMs: 80,
    send: () => pressReceiverNote(track, 48, 100, () => true),
    isCurrent: () => true,
    feedback: (state, beat, reason) => feedback.push({ state, beat, reason }),
  });

  // Transport stops before beat arrives
  clock.updateTransport(false, true, 120, 4, 4);
  scheduler.refresh();

  assert.equal(feedback[1]?.state, "unavailable");
  assert.equal(feedback[1]?.reason, "stopped");

  // Advancing timer does nothing because it was cancelled
  await sys.advance(200);
  assert.deepEqual(packets, []);
});

test("clock epoch increment (seek/loop/signature) cancels pending with cancelled", async () => {
  const sys = createFakeTimerSystem(1000);
  const clock = new TriggerNoteClock(sys.now);
  clock.updateTransport(true, true, 120, 4, 4);
  clock.observePosition(10.75, 120, 4);

  const { track, packets } = createMockTrack();
  const scheduler = new TriggerNoteScheduler(clock, sys.now, sys.timers);

  const feedback = [];
  scheduler.enqueue({
    lane: track,
    key: "pad-1",
    timing: "beat",
    durationMs: 80,
    send: () => pressReceiverNote(track, 48, 100, () => true),
    isCurrent: () => true,
    feedback: (state, beat, reason) => feedback.push({ state, beat, reason }),
  });

  // Big jump / seek changes epoch
  clock.observePosition(20.0, 120, 4);
  scheduler.refresh();

  assert.equal(feedback[1]?.state, "cancelled");
  assert.equal(feedback[1]?.reason, "epoch_changed");

  await sys.advance(200);
  assert.deepEqual(packets, []);
});

test("late callback > 20ms cancels with missed without sending note ON", async () => {
  const sys = createFakeTimerSystem(1000);
  const clock = new TriggerNoteClock(sys.now);
  clock.updateTransport(true, true, 120, 4, 4);
  clock.observePosition(10.75, 120, 4);

  const { track, packets } = createMockTrack();
  const scheduler = new TriggerNoteScheduler(clock, sys.now, sys.timers);

  const feedback = [];
  scheduler.enqueue({
    lane: track,
    key: "pad-1",
    timing: "beat",
    durationMs: 80,
    send: () => pressReceiverNote(track, 48, 100, () => true),
    isCurrent: () => true,
    feedback: (state, beat, reason) => feedback.push({ state, beat, reason }),
  });

  // Simulate a CPU stall or late timer execution (> 20ms late)
  // Expected fire time is at 125ms. Let's jump sys clock by 150ms without firing timer yet, then fire timer
  sys.setTime(sys.now() + 150); // 25ms late
  // Trigger active timer
  for (const [id, timer] of [...sys.activeTimers.entries()]) {
    sys.activeTimers.delete(id);
    timer.fn();
  }

  assert.deepEqual(packets, [], "Note ON must not fire when timer callback is > 20ms late");
  assert.equal(feedback[1]?.state, "missed");
  assert.equal(feedback[1]?.reason, "callback_late");
});

test("early callback waits and does not fire ON early", async () => {
  const sys = createFakeTimerSystem(1000);
  const clock = new TriggerNoteClock(sys.now);
  clock.updateTransport(true, true, 120, 4, 4);
  clock.observePosition(10.75, 120, 4);

  const { track, packets } = createMockTrack();
  const scheduler = new TriggerNoteScheduler(clock, sys.now, sys.timers);

  scheduler.enqueue({
    lane: track,
    key: "pad-1",
    timing: "beat",
    durationMs: 80,
    send: () => pressReceiverNote(track, 48, 100, () => true),
    isCurrent: () => true,
    feedback: () => {},
  });

  // Timer prematurely called 50ms early
  sys.setTime(sys.now() + 75); // 50ms before 125ms
  for (const [id, timer] of [...sys.activeTimers.entries()]) {
    sys.activeTimers.delete(id);
    timer.fn();
  }
  // Should have re-armed, NOT fired note ON
  assert.deepEqual(packets, []);

  // Advance remaining 50ms
  await sys.advance(50);
  assert.deepEqual(packets, [[48, 100]]);
});

test("cancelWhere and dispose cancel pending and release active held notes", async () => {
  const sys = createFakeTimerSystem(1000);
  const clock = new TriggerNoteClock(sys.now);
  clock.updateTransport(true, true, 120, 4, 4);
  clock.observePosition(10.75, 120, 4);

  const { track, packets } = createMockTrack();
  const scheduler = new TriggerNoteScheduler(clock, sys.now, sys.timers);

  const feedback = [];
  scheduler.enqueue({
    lane: track,
    key: "client-1::pad-1",
    timing: "beat",
    durationMs: 80,
    send: () => pressReceiverNote(track, 48, 100, () => true),
    isCurrent: () => true,
    feedback: (state, beat, reason) => feedback.push({ state, beat, reason }),
  });

  await scheduler.cancelWhere(req => req.key.startsWith("client-1"), "client_disconnected");
  assert.equal(feedback[1]?.state, "cancelled");
  assert.equal(feedback[1]?.reason, "client_disconnected");

  // Re-enqueue, advance to note ON, then dispose releases active note
  scheduler.enqueue({
    lane: track,
    key: "client-1::pad-1",
    timing: "beat",
    durationMs: 80,
    send: () => pressReceiverNote(track, 48, 100, () => true),
    isCurrent: () => true,
    feedback: () => {},
  });

  await sys.advance(125);
  assert.deepEqual(packets, [[48, 100]]);

  await scheduler.dispose();
  assert.deepEqual(packets, [[48, 100], [48, 0]]);
});
