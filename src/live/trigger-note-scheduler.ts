// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0

import { TriggerNoteClock, nextTriggerBeat, resolveGridDurationMs } from "./trigger-note-clock.js";
import type { HeldMidiNote } from "./midi-receiver.js";

export type PendingTrigger = {
  lane: object;
  key: string;
  timing: "beat" | "bar";
  durationMs: number;
  durationBars?: number;
  send: () => HeldMidiNote;
  isCurrent: () => boolean;
  feedback: (state: string, targetBeat?: number, reason?: string) => void;
};

export interface SchedulerTimers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (id: unknown) => void;
}

interface ScheduledEntry {
  request: PendingTrigger;
  targetBeat: number;
  epoch: number;
  expectedFireTime: number;
  timerId: unknown;
}

const defaultTimers: SchedulerTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as any),
};
const defaultNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

export class TriggerNoteScheduler {
  private clock: TriggerNoteClock;
  private now: () => number;
  private timers: SchedulerTimers;
  private pendingByLane = new Map<object, ScheduledEntry>();
  private activeHeldNotes = new Map<HeldMidiNote, { lane: object; request: PendingTrigger }>();
  private releaseTimers = new Map<HeldMidiNote, unknown>();

  constructor(
    clock: TriggerNoteClock,
    now: () => number = defaultNow,
    timers: SchedulerTimers = defaultTimers,
  ) {
    this.clock = clock;
    this.now = now;
    this.timers = timers;
  }

  private getActiveLaneCount(): number {
    const lanes = new Set<object>();
    for (const lane of this.pendingByLane.keys()) {
      lanes.add(lane);
    }
    for (const { lane } of this.activeHeldNotes.values()) {
      lanes.add(lane);
    }
    return lanes.size;
  }

  private isLaneActive(lane: object): boolean {
    if (this.pendingByLane.has(lane)) return true;
    for (const entry of this.activeHeldNotes.values()) {
      if (entry.lane === lane) return true;
    }
    return false;
  }

  enqueue(request: PendingTrigger): void {
    if (!this.isLaneActive(request.lane) && this.getActiveLaneCount() >= 64) {
      request.feedback("error", undefined, "lane_cap_exceeded");
      return;
    }

    if (this.pendingByLane.has(request.lane)) {
      const previous = this.pendingByLane.get(request.lane)!;
      this.timers.clear(previous.timerId);
      this.pendingByLane.delete(request.lane);
      previous.request.feedback("cancelled", previous.targetBeat, "superseded");
    }

    const snap = this.clock.snapshot();
    if (!snap.valid) {
      request.feedback("unavailable", undefined, snap.reason ?? "clock_unavailable");
      return;
    }

    const targetBeat = nextTriggerBeat(snap.beat, request.timing, snap.beatsPerBar);
    const beatsDelta = targetBeat - snap.beat;
    if (beatsDelta <= 0 || !Number.isFinite(beatsDelta)) {
      request.feedback("unavailable", undefined, "invalid_beat_delta");
      return;
    }

    const delayMs = beatsDelta * (60000 / snap.bpm);
    const currentTime = this.now();
    const expectedFireTime = currentTime + delayMs;

    request.feedback("pending", targetBeat);

    const entry: ScheduledEntry = {
      request,
      targetBeat,
      epoch: snap.epoch,
      expectedFireTime,
      timerId: null,
    };

    entry.timerId = this.timers.set(() => this.onTimerFired(request.lane, entry), Math.max(0, delayMs));
    this.pendingByLane.set(request.lane, entry);
  }

  private async onTimerFired(lane: object, entry: ScheduledEntry): Promise<void> {
    if (this.pendingByLane.get(lane) !== entry) {
      return;
    }

    const actualTime = this.now();
    const earlyDelta = entry.expectedFireTime - actualTime;
    if (earlyDelta > 1) {
      entry.timerId = this.timers.set(() => this.onTimerFired(lane, entry), earlyDelta);
      return;
    }

    const lateDelta = actualTime - entry.expectedFireTime;
    if (lateDelta > 20) {
      this.pendingByLane.delete(lane);
      entry.request.feedback("missed", entry.targetBeat, "callback_late");
      return;
    }

    const snap = this.clock.snapshot();
    if (!snap.valid) {
      this.pendingByLane.delete(lane);
      entry.request.feedback("unavailable", entry.targetBeat, snap.reason ?? "clock_unavailable");
      return;
    }
    if (snap.epoch !== entry.epoch) {
      this.pendingByLane.delete(lane);
      entry.request.feedback("cancelled", entry.targetBeat, "epoch_changed");
      return;
    }

    if (!entry.request.isCurrent()) {
      this.pendingByLane.delete(lane);
      entry.request.feedback("cancelled", entry.targetBeat, "superseded");
      return;
    }

    // MIDI OFF must reach the Receiver before the replacement ON. Retire the
    // former timer as well: its late callback must never cut this new note.
    for (const [oldNote, active] of this.activeHeldNotes) {
      if (active.lane !== lane) continue;
      this.activeHeldNotes.delete(oldNote);
      const timer = this.releaseTimers.get(oldNote);
      if (timer !== undefined) this.timers.clear(timer);
      this.releaseTimers.delete(oldNote);
      await oldNote.release();
    }
    if (this.pendingByLane.get(lane) !== entry || !entry.request.isCurrent()) return;
    const fireSnap = this.clock.snapshot();
    if (!fireSnap.valid || fireSnap.epoch !== entry.epoch) {
      this.pendingByLane.delete(lane);
      entry.request.feedback('unavailable', entry.targetBeat, fireSnap.reason ?? 'clock_changed');
      return;
    }
    const durationMs = entry.request.durationBars === undefined
      ? entry.request.durationMs
      : resolveGridDurationMs(entry.request.durationBars, fireSnap);
    if (durationMs === null) {
      this.pendingByLane.delete(lane);
      entry.request.feedback('unavailable', entry.targetBeat, 'invalid_grid_duration');
      return;
    }
    this.pendingByLane.delete(lane);

    let heldNote: HeldMidiNote;
    try {
      heldNote = entry.request.send();
    } catch (err: any) {
      entry.request.feedback("error", entry.targetBeat, err?.message ?? "send_failed");
      return;
    }

    entry.request.feedback("sent", entry.targetBeat);
    this.activeHeldNotes.set(heldNote, { lane, request: entry.request });

    heldNote.started.then((didSend) => {
      if (!didSend) {
        this.activeHeldNotes.delete(heldNote);
        return;
      }
      if (!this.activeHeldNotes.has(heldNote)) return;
      const releaseTimer = this.timers.set(async () => {
        if (!this.activeHeldNotes.has(heldNote)) return;
        this.releaseTimers.delete(heldNote);
        try {
          await heldNote.release();
        } finally {
          this.activeHeldNotes.delete(heldNote);
        }
      }, durationMs);
      this.releaseTimers.set(heldNote, releaseTimer);
    }).catch(() => {
      this.activeHeldNotes.delete(heldNote);
    });
  }

  refresh(): void {
    const snap = this.clock.snapshot();
    if (!snap.valid) {
      for (const [lane, entry] of [...this.pendingByLane.entries()]) {
        this.timers.clear(entry.timerId);
        this.pendingByLane.delete(lane);
        entry.request.feedback("unavailable", entry.targetBeat, snap.reason ?? "clock_unavailable");
      }
      for (const [note] of [...this.activeHeldNotes.entries()]) {
        this.activeHeldNotes.delete(note);
        const timer = this.releaseTimers.get(note);
        if (timer !== undefined) this.timers.clear(timer);
        this.releaseTimers.delete(note);
        void note.release();
      }
      return;
    }

    for (const [lane, entry] of [...this.pendingByLane.entries()]) {
      if (entry.epoch !== snap.epoch) {
        this.timers.clear(entry.timerId);
        this.pendingByLane.delete(lane);
        entry.request.feedback("cancelled", entry.targetBeat, "epoch_changed");
      }
    }
  }

  async cancelWhere(predicate: (request: PendingTrigger) => boolean, reason: string): Promise<void> {
    const releases: Promise<void>[] = [];
    for (const [lane, entry] of [...this.pendingByLane.entries()]) {
      if (predicate(entry.request)) {
        this.timers.clear(entry.timerId);
        this.pendingByLane.delete(lane);
        entry.request.feedback("cancelled", entry.targetBeat, reason);
      }
    }
    for (const [note, { request }] of [...this.activeHeldNotes.entries()]) {
      if (predicate(request)) {
        this.activeHeldNotes.delete(note);
        const timer = this.releaseTimers.get(note);
        if (timer !== undefined) this.timers.clear(timer);
        this.releaseTimers.delete(note);
        releases.push(note.release());
      }
    }
    await Promise.all(releases);
  }

  async dispose(): Promise<void> {
    const releases: Promise<void>[] = [];
    for (const [lane, entry] of [...this.pendingByLane.entries()]) {
      this.timers.clear(entry.timerId);
      this.pendingByLane.delete(lane);
      entry.request.feedback("cancelled", entry.targetBeat, "disposed");
    }
    for (const [note] of [...this.activeHeldNotes.entries()]) {
      this.activeHeldNotes.delete(note);
      const timer = this.releaseTimers.get(note);
      if (timer !== undefined) this.timers.clear(timer);
      this.releaseTimers.delete(note);
      releases.push(note.release());
    }
    await Promise.all(releases);
  }
}
