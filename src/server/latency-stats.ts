// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0

/**
 * latency-stats.ts — the latency of the control path, phase by phase.
 *
 * A phone that drives Live spends time in four places: its own queue, the
 * network, the dispatch in the host, and the write Live itself takes. Each
 * phase keeps its own ring, so a slow link never hides behind a fast write.
 * The age of a frame is measured per frame, so its percentiles are real.
 */

import { continuousTargetActuator } from "../live/continuous-target-actuator.js";
import { PHONE_MAX_AGE_MS, type FrameTiming } from "./ws-bounds.js";

/** Samples kept per phase. */
export const PHASE_RING_SIZE = 512;

export interface LatencyPhaseSummary { p50: number; p95: number; max: number; count: number; }
export interface LatencyClientSummary {
  clientId: string;
  frames: number;
  skippedSeq: number;
  lastSeq: number;
  /** Frames of this client that reached the age the phone allows. */
  overMaxAge: number;
  /** Frames of this client whose queue alone reached the age the phone allows. */
  queueAtLimit: number;
}
export interface LatencyEstimate { p50: number; p95: number; label: "sumOfPhasePercentiles"; }

/** A counter of the frames that ran past a limit. */
export interface LatencyCountSummary { count: number; }

/** The frames that ran past the limit of the phone, and the limit itself. */
export interface LatencyOverAgeSummary { count: number; thresholdMs: number; }

export interface LatencyStatsSnapshot {
  phoneQueueMs: LatencyPhaseSummary;
  halfRttMs: LatencyPhaseSummary;
  hostDispatchMs: LatencyPhaseSummary;
  actuatorWriteMs: LatencyPhaseSummary;
  /** The age of each frame, measured per frame instead of summed per phase. */
  frameAgeMs: LatencyPhaseSummary;
  /** Frames older than the limit of the phone, and the limit itself. */
  overMaxAge: LatencyOverAgeSummary;
  /** Frames whose queue alone reached the limit of the phone. */
  queueAtLimit: LatencyCountSummary;
  clients: LatencyClientSummary[];
  estimate: LatencyEstimate;
  notes: string[];
}

/** What the numbers mean, and what they do not. */
export const LATENCY_STATS_NOTES: string[] = [
  "All values are milliseconds.",
  "The estimate is the sum of the phase percentiles: phone queue + RTT/2 + host dispatch + actuator write.",
  "RTT/2 assumes a symmetric path and comes from the last ping, which can be up to 5 s old.",
  "age_ms is the age of the oldest item in the frame, so the phone queue phase is the worst item of that frame.",
  "skippedSeq counts the frames that never arrived, including the frames the rate limiter dropped.",
  "The write phase is global across every target and client; discrete controls never reach the actuator.",
  "The write tick and the scheduler queue (up to about 20 ms) are not in the sum, so the estimate is a lower bound.",
  "The write timing has 1 ms resolution.",
  "The frame age is the sum of the phone queue, the round trip half and the host dispatch of each frame; it leaves the Live write out, so its percentiles are real, unlike the estimate.",
  "The host drops no frame by its age; it still drops by the rate limiter and by malformed frames.",
  "The over-max-age and the queue-at-limit counts are cumulative since the last reset; the frame age ring keeps the last 512 frames.",
  "resetLatencyStats clears the phase rings and the per-client counters; the write phase belongs to the actuator and is cleared by resetActuatorStats.",
];

/** A bounded ring of samples: the newest PHASE_RING_SIZE of them win. */
class SampleRing {
  private readonly values: number[] = [];
  private next = 0;

  push(value: number): void {
    if (this.values.length < PHASE_RING_SIZE) {
      this.values.push(value);
      return;
    }
    this.values[this.next] = value;
    this.next = (this.next + 1) % PHASE_RING_SIZE;
  }

  snapshot(): number[] {
    return this.values.slice();
  }

  clear(): void {
    this.values.length = 0;
    this.next = 0;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.max(0, Math.min(sorted.length - 1, (sorted.length - 1) * p));
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo] ?? 0;
  const weight = rank - lo;
  return (sorted[lo] ?? 0) * (1 - weight) + (sorted[hi] ?? 0) * weight;
}

function summarize(values: number[]): LatencyPhaseSummary {
  const sorted = values.slice().sort((a, b) => a - b);
  const last = sorted.length > 0 ? (sorted[sorted.length - 1] ?? 0) : 0;
  return { p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), max: last, count: sorted.length };
}

function sumPercentiles(phases: LatencyPhaseSummary[], key: "p50" | "p95"): number {
  return phases.reduce((total, phase) => total + phase[key], 0);
}

interface ClientState {
  frames: number;
  skippedSeq: number;
  lastSeq: number;
  overMaxAge: number;
  queueAtLimit: number;
}

const phoneQueue = new SampleRing();
const halfRtt = new SampleRing();
const hostDispatch = new SampleRing();
/** The age of each frame, one sample per frame. */
const frameAge = new SampleRing();
const clients = new Map<string, ClientState>();
let overMaxAgeCount = 0;
let queueAtLimitCount = 0;

/**
 * Record one control frame of a live-write client.
 *
 * The frame number tells the host that frames went missing: a gap means the
 * rate limiter dropped them. A frame number that does not grow starts a new
 * stream — the phone restarts its counter — and counts no loss.
 *
 * The age of the frame is the sum of its three phases: what the phone queued,
 * half of the last round trip, and the dispatch in the host. A frame that
 * arrives older than the limit of the phone is counted, never dropped: the
 * host drops frames by the rate limiter and by their shape, not by their age.
 */
export function recordControlFrame(clientId: string, timing: FrameTiming | null, dispatchMs: number): void {
  if (!timing) return;
  const state = clients.get(clientId) ?? { frames: 0, skippedSeq: 0, lastSeq: timing.seq, overMaxAge: 0, queueAtLimit: 0 };
  state.frames += 1;
  if (timing.seq > state.lastSeq + 1) state.skippedSeq += timing.seq - state.lastSeq - 1;
  state.lastSeq = timing.seq;
  clients.set(clientId, state);
  if (timing.ageMs !== undefined) phoneQueue.push(timing.ageMs);
  if (timing.rttMs !== undefined) halfRtt.push(timing.rttMs / 2);
  hostDispatch.push(dispatchMs);
  recordFrameAge(state, timing, dispatchMs);
}

/**
 * The age of one frame, in milliseconds: the queue of the phone, the half of
 * the round trip and the dispatch of the host. The write of Live is not part
 * of it, so the percentiles of the ring are the age of the frames. The phone
 * drops the items that grew older than its own limit before it sends them, so
 * a frame whose queue alone reached the limit arrives with its oldest item
 * already cut.
 */
function recordFrameAge(state: ClientState, timing: FrameTiming, dispatchMs: number): void {
  if (timing.ageMs !== undefined && timing.rttMs !== undefined) {
    const frameAgeMs = timing.ageMs + timing.rttMs / 2 + dispatchMs;
    frameAge.push(frameAgeMs);
    if (frameAgeMs > PHONE_MAX_AGE_MS) {
      overMaxAgeCount += 1;
      state.overMaxAge += 1;
    }
  }
  if (timing.ageMs !== undefined && timing.ageMs >= PHONE_MAX_AGE_MS) {
    queueAtLimitCount += 1;
    state.queueAtLimit += 1;
  }
}

/** Forget everything remembered about one client (it disconnected or was replaced). */
export function forgetClient(clientId: string): void {
  clients.delete(clientId);
}

/** A read-only snapshot of every phase, every client, and the total estimate. */
export function getLatencyStats(): LatencyStatsSnapshot {
  const phoneQueueMs = summarize(phoneQueue.snapshot());
  const halfRttMs = summarize(halfRtt.snapshot());
  const hostDispatchMs = summarize(hostDispatch.snapshot());
  const frameAgeMs = summarize(frameAge.snapshot());
  const write = continuousTargetActuator.getWriteLatency();
  const actuatorWriteMs: LatencyPhaseSummary = { p50: write.p50Ms, p95: write.p95Ms, max: write.maxMs, count: write.count };
  const phases = [phoneQueueMs, halfRttMs, hostDispatchMs, actuatorWriteMs];
  return {
    phoneQueueMs,
    halfRttMs,
    hostDispatchMs,
    actuatorWriteMs,
    frameAgeMs,
    overMaxAge: { count: overMaxAgeCount, thresholdMs: PHONE_MAX_AGE_MS },
    queueAtLimit: { count: queueAtLimitCount },
    clients: Array.from(clients.entries()).map(([clientId, state]) => ({ clientId, ...state })),
    estimate: {
      p50: sumPercentiles(phases, "p50"),
      p95: sumPercentiles(phases, "p95"),
      label: "sumOfPhasePercentiles",
    },
    notes: LATENCY_STATS_NOTES,
  };
}

/** Clear every ring and every client counter. */
export function resetLatencyStats(): void {
  phoneQueue.clear();
  halfRtt.clear();
  hostDispatch.clear();
  frameAge.clear();
  clients.clear();
  overMaxAgeCount = 0;
  queueAtLimitCount = 0;
}
