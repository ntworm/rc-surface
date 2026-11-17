// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

export interface ContinuousRequest {
  targetKey: string;
  value: number;
  write: (value: number) => Promise<void>;
  smoothFactor?: number;
  sourceTimeMs?: number;
  immediate?: boolean;
  isCurrent?: () => boolean;
}

interface ContinuousLane {
  targetKey: string;
  immediate: boolean;
  smoothFactor: number;
  current: number;
  from: number;
  destination: number;
  rampStartedAtMs: number;
  rampDurationMs: number;
  sourceCadenceMs: number;
  lastSourceTimeMs: number;
  lastWriteAtMs: number | null;
  lastWritten: number | null;
  // Value of the newest write handed to Live, in flight or already applied.
  // Duplicate suppression compares against it, not against `lastWritten`.
  lastDispatched: number | null;
  write: (value: number) => Promise<void>;
  isCurrent: (() => boolean) | undefined;
  inFlight: Promise<void> | null;
  // Dispatch order of the writes of this lane. The newest one wins when two
  // overlapping writes finish in the opposite order.
  writeSeq: number;
  lastWrittenSeq: number;
  // Two writes overlapped, so the destination still owes one confirming write.
  confirmPending: boolean;
  revision: number;
  waiters: Array<() => void>;
}

export interface ActuatorStatsBucket {
  writesStarted: number;
  writesCompleted: number;
  writesFailed: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  ratePerSecond: number;
  lastCompletedAtMs: number | null;
}

export interface WriteLatencySummary {
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  count: number;
}

const EMPTY_BUCKET: ActuatorStatsBucket = Object.freeze({
  writesStarted: 0,
  writesCompleted: 0,
  writesFailed: 0,
  meanMs: 0,
  p50Ms: 0,
  p95Ms: 0,
  maxMs: 0,
  ratePerSecond: 0,
  lastCompletedAtMs: null,
});

const EPSILON = 1e-9;

const COMPLETION_RING_SIZE = 512;
const RATE_WINDOW_MS = 1000;

/**
 * How many SDK writes may be in flight for one physical target. Two lets the
 * newest destination start before a slow write finishes; three would let the
 * target drift away from the phone.
 */
const MAX_IN_FLIGHT_PER_TARGET = 2;

/**
 * Monotonic clock when the host exposes one; the Extensions runtime inside
 * Live has no `performance` global, so fall back to wall-clock milliseconds.
 */
export function defaultNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo] ?? 0;
  const weight = rank - lo;
  return (sorted[lo] ?? 0) * (1 - weight) + (sorted[hi] ?? 0) * weight;
}

/**
 * Owns continuous writes by physical Live target. Incoming frames retarget the
 * newest value (or explicit user ramp); the actuator is the sole writer and
 * keeps at most two SDK setValue calls in flight for one physical target.
 * After an overlap it writes the lane destination once more, alone, so the
 * last value Live holds is the destination.
 */
export class ContinuousTargetActuator {
  private readonly now: () => number;
  private readonly minWriteIntervalMs: number;
  private readonly lanes = new Map<string, ContinuousLane>();
  // Writes in flight per physical target. Cancelling a logical lane cannot
  // recall an SDK write already sent, so the count outlives the lane.
  private readonly inFlightByTarget = new Map<string, number>();
  // Writes already handed to Live and not finished yet, per physical target.
  private readonly sentByTarget = new Map<string, number>();
  private interval: ReturnType<typeof setInterval> | null = null;
  // Stats are kept per physical target and aggregated for a "total" bucket.
  // They exist for the live-write-ceiling bench: a diagnostic path that
  // observes real production traffic without altering actuator behaviour.
  private readonly completionSamples = new Map<string, { values: number[]; next: number }>();
  private readonly completionTimestamps = new Map<string, number[]>();
  private readonly statsCounters = new Map<string, {
    writesStarted: number;
    writesCompleted: number;
    writesFailed: number;
    lastCompletedAtMs: number | null;
  }>();

  constructor(options: { now?: () => number; minWriteIntervalMs?: number } = {}) {
    this.now = options.now ?? defaultNow;
    this.minWriteIntervalMs = Math.max(1, options.minWriteIntervalMs ?? 20);
  }

  request(request: ContinuousRequest): void {
    if (!request.targetKey || !Number.isFinite(request.value)) return;
    const nowMs = this.now();
    const sourceTimeMs = Number.isFinite(request.sourceTimeMs)
      ? request.sourceTimeMs as number
      : nowMs;
    const value = request.value;
    const existing = this.lanes.get(request.targetKey);

    if (!existing) {
      this.lanes.set(request.targetKey, {
        targetKey: request.targetKey,
        immediate: request.immediate === true,
        smoothFactor: request.smoothFactor ?? 0,
        current: value,
        from: value,
        destination: value,
        rampStartedAtMs: nowMs,
        rampDurationMs: 0,
        sourceCadenceMs: 33,
        lastSourceTimeMs: sourceTimeMs,
        lastWriteAtMs: null,
        lastWritten: null,
        lastDispatched: null,
        write: request.write,
        isCurrent: request.isCurrent,
        inFlight: null,
        writeSeq: 0,
        lastWrittenSeq: 0,
        confirmPending: false,
        revision: 1,
        waiters: [],
      });
    } else {
      const sameOwner = !existing.isCurrent || existing.isCurrent();
      // Preserve an SDK call already in flight, but not its old owner's
      // deduplication history. The replacement must receive its first value.
      if (!sameOwner) {
        existing.lastWritten = null;
        existing.lastDispatched = null;
      }
      // A repeated measurement is not a new destination. Do not
      // restart an explicit ramp or queue another identical SDK write.
      if (sameOwner && request.immediate && existing.immediate
        && existing.destination === value
        && existing.smoothFactor === (request.smoothFactor ?? 0)) {
        existing.write = request.write;
        existing.isCurrent = request.isCurrent;
        return;
      }
      existing.immediate = request.immediate === true;
      existing.smoothFactor = request.smoothFactor ?? 0;
      const current = this.interpolate(existing, nowMs);
      const observedCadence = sourceTimeMs - existing.lastSourceTimeMs;
      if (observedCadence > 0) {
        existing.sourceCadenceMs = clamp(observedCadence, 20, 50);
      }
      // Keep the familiar response curve: a factor of .5 settles in roughly
      // 150 ms, while .9 gives a visibly gentle ~270 ms release. The base
      // cadence still guarantees at least one frame of interpolation.
      const userRampMs = clamp(request.smoothFactor ?? 0, 0, 0.99) * 300;
      existing.current = current;
      existing.from = current;
      existing.destination = value;
      existing.rampStartedAtMs = nowMs;
      // Calls arriving in the same millisecond are synchronous control/API
      // updates rather than a timed sensor stream. Preserve the historical
      // immediate behavior for those updates; real phone frames carry a
      // positive cadence and receive the dezipper ramp.
      existing.rampDurationMs = (existing.immediate || observedCadence < 16) && userRampMs === 0
        ? 0
        : Math.max(existing.sourceCadenceMs, userRampMs);
      existing.lastSourceTimeMs = sourceTimeMs;
      existing.write = request.write;
      existing.isCurrent = request.isCurrent;
      existing.revision += 1;
    }

    this.start();
    void this.tick();
  }

  release(
    targetKey: string,
    value: number,
    write: (value: number) => Promise<void>,
    smoothFactor = 0,
  ): void {
    this.request({ targetKey, value, write, smoothFactor, sourceTimeMs: this.now() });
  }

  async tick(): Promise<void> {
    const nowMs = this.now();
    const jobs: Promise<void>[] = [];
    for (const lane of this.lanes.values()) {
      const job = this.pumpLane(lane, nowMs);
      if (job) jobs.push(job);
    }
    await Promise.all(jobs);
  }

  cancel(targetKey?: string): void {
    if (targetKey !== undefined) {
      const lane = this.lanes.get(targetKey);
      if (lane) {
        this.resolveWaiters(lane);
        this.lanes.delete(targetKey);
      }
      return;
    }
    for (const lane of this.lanes.values()) this.resolveWaiters(lane);
    this.lanes.clear();
  }

  settle(targetKey?: string): Promise<void> {
    const lanes = targetKey === undefined
      ? Array.from(this.lanes.values())
      : [this.lanes.get(targetKey)].filter((lane): lane is ContinuousLane => lane !== undefined);
    const pending = lanes.filter((lane) => !this.isSettled(lane, this.now()));
    if (pending.length === 0) return Promise.resolve();
    return Promise.all(pending.map((lane) => new Promise<void>((resolve) => {
      lane.waiters.push(resolve);
    }))).then(() => undefined);
  }

  start(): void {
    if (this.interval !== null) return;
    this.interval = setInterval(() => { void this.tick(); }, this.minWriteIntervalMs);
    const maybeUnref = this.interval as ReturnType<typeof setInterval> & { unref?: () => void };
    maybeUnref.unref?.();
  }

  stop(): void {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.cancel();
  }

  isRunning(): boolean {
    return this.interval !== null;
  }

  pendingCount(): number {
    return this.lanes.size;
  }

  private interpolate(lane: ContinuousLane, nowMs: number): number {
    if (lane.rampDurationMs <= 0) return lane.destination;
    const unit = clamp((nowMs - lane.rampStartedAtMs) / lane.rampDurationMs, 0, 1);
    return lane.from + (lane.destination - lane.from) * unit;
  }

  /** True once the ramp is over, so the destination is the value to confirm. */
  private laneAtEnd(lane: ContinuousLane, nowMs: number): boolean {
    return lane.rampDurationMs <= 0 || nowMs >= lane.rampStartedAtMs + lane.rampDurationMs;
  }

  private isSettled(lane: ContinuousLane, nowMs: number): boolean {
    return (this.inFlightByTarget.get(lane.targetKey) ?? 0) === 0
      && !lane.confirmPending
      && lane.lastWritten !== null
      && Math.abs(lane.lastWritten - lane.destination) <= EPSILON
      && nowMs >= lane.rampStartedAtMs + lane.rampDurationMs;
  }

  private pumpLane(lane: ContinuousLane, nowMs: number): Promise<void> | null {
    const inFlight = this.inFlightByTarget.get(lane.targetKey) ?? 0;
    if (inFlight >= MAX_IN_FLIGHT_PER_TARGET) return lane.inFlight;
    if (lane.isCurrent && !lane.isCurrent()) {
      this.cancel(lane.targetKey);
      return null;
    }
    // An overlap left the destination unproven in Live. Write it once more,
    // alone, before anything else goes out.
    if (inFlight === 0 && lane.confirmPending && this.laneAtEnd(lane, nowMs)) {
      lane.confirmPending = false;
      return this.writeValue(lane, lane.destination, nowMs);
    }
    const value = this.interpolate(lane, nowMs);
    const atDestination = Math.abs(value - lane.destination) <= EPSILON;
    if (lane.lastDispatched !== null && Math.abs(lane.lastDispatched - value) <= EPSILON) {
      if (atDestination) this.maybeResolveWaiters(lane);
      return lane.inFlight;
    }
    if (lane.rampDurationMs > 0 && lane.lastWriteAtMs !== null && nowMs - lane.lastWriteAtMs < this.minWriteIntervalMs) {
      return lane.inFlight;
    }
    return this.writeValue(lane, value, nowMs);
  }

  /**
   * Hand one value to Live. Two writes of a lane may be in flight at once:
   * the newest destination starts before a slow write finishes.
   */
  private writeValue(lane: ContinuousLane, value: number, nowMs: number): Promise<void> {
    const seq = lane.writeSeq + 1;
    const revisionAtStart = lane.revision;
    const write = lane.write;
    const isCurrent = lane.isCurrent;
    const startedAtMs = nowMs;
    let sent = false;
    lane.writeSeq = seq;
    lane.lastWriteAtMs = nowMs;
    lane.lastDispatched = value;
    this.recordWriteStart(lane.targetKey);
    const writePromise = Promise.resolve()
      .then(() => {
        // A cancelled or replaced lane must not reach Live.
        if (this.lanes.get(lane.targetKey) !== lane) return;
        if (isCurrent && !isCurrent()) return;
        sent = true;
        const pending = this.sentByTarget.get(lane.targetKey) ?? 0;
        // Two writes in flight for one target can land in Live out of order.
        if (pending > 0) lane.confirmPending = true;
        this.sentByTarget.set(lane.targetKey, pending + 1);
        return write(value);
      })
      .then(() => {
        if (!sent) return;
        if (isCurrent && !isCurrent()) return;
        // The newest write wins, even when an older one finishes afterwards.
        if (seq >= lane.lastWrittenSeq) {
          lane.lastWritten = value;
          lane.lastWrittenSeq = seq;
        }
        lane.current = value;
        this.recordWriteComplete(lane.targetKey, this.now() - startedAtMs);
      })
      .catch((error: unknown) => {
        console.error(
          '[ContinuousTargetActuator] target write failed:',
          error instanceof Error ? error.message : String(error),
        );
        this.recordWriteFailure(lane.targetKey);
        // The value never reached Live: let the next pump send it again.
        if (seq === lane.writeSeq) lane.lastDispatched = lane.lastWritten;
      })
      .finally(() => {
        if (sent) this.releaseCount(this.sentByTarget, lane.targetKey);
        const remaining = this.releaseCount(this.inFlightByTarget, lane.targetKey);
        const replacement = this.lanes.get(lane.targetKey);
        if (replacement && replacement !== lane) {
          void this.pumpLane(replacement, this.now());
          return;
        }
        if (this.lanes.get(lane.targetKey) !== lane) return;
        if (remaining === 0) {
          lane.inFlight = null;
          // The overlap owes one confirming write of the destination, alone.
          if (lane.confirmPending && this.laneAtEnd(lane, this.now())) {
            lane.confirmPending = false;
            void this.writeValue(lane, lane.destination, this.now());
            return;
          }
        }
        const complete = (!isCurrent || isCurrent()) && revisionAtStart === lane.revision
          && Math.abs(value - lane.destination) <= EPSILON
          && this.now() >= lane.rampStartedAtMs + lane.rampDurationMs;
        if (complete) {
          this.maybeResolveWaiters(lane);
          return;
        }
        // Immediate writes retain one newest destination per physical
        // target. Drain it as soon as Live is ready, not on the 20 ms timer.
        // Never resurrect a cancelled lane or retry a failed write forever.
        if (lane.immediate && revisionAtStart !== lane.revision) {
          void this.pumpLane(lane, this.now());
        }
      });
    lane.inFlight = writePromise;
    this.inFlightByTarget.set(lane.targetKey, (this.inFlightByTarget.get(lane.targetKey) ?? 0) + 1);
    return writePromise;
  }

  private releaseCount(counts: Map<string, number>, targetKey: string): number {
    const remaining = Math.max((counts.get(targetKey) ?? 0) - 1, 0);
    if (remaining > 0) counts.set(targetKey, remaining);
    else counts.delete(targetKey);
    return remaining;
  }

  private maybeResolveWaiters(lane: ContinuousLane): void {
    if (this.isSettled(lane, this.now())) this.resolveWaiters(lane);
  }

  private resolveWaiters(lane: ContinuousLane): void {
    const waiters = lane.waiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  private ensureStatsEntry(targetKey: string): void {
    if (!this.statsCounters.has(targetKey)) {
      this.statsCounters.set(targetKey, {
        writesStarted: 0,
        writesCompleted: 0,
        writesFailed: 0,
        lastCompletedAtMs: null,
      });
    }
    if (!this.completionSamples.has(targetKey)) {
      this.completionSamples.set(targetKey, { values: [], next: 0 });
    }
    if (!this.completionTimestamps.has(targetKey)) {
      this.completionTimestamps.set(targetKey, []);
    }
  }

  private recordWriteStart(targetKey: string): void {
    this.ensureStatsEntry(targetKey);
    const counters = this.statsCounters.get(targetKey)!;
    counters.writesStarted += 1;
  }

  private recordWriteComplete(targetKey: string, durationMs: number): void {
    this.ensureStatsEntry(targetKey);
    const counters = this.statsCounters.get(targetKey)!;
    counters.writesCompleted += 1;
    const completedAt = this.now();
    counters.lastCompletedAtMs = completedAt;
    const ring = this.completionSamples.get(targetKey)!;
    const values = ring.values;
    if (values.length < COMPLETION_RING_SIZE) {
      values.push(durationMs);
    } else {
      values[ring.next] = durationMs;
      ring.next = (ring.next + 1) % COMPLETION_RING_SIZE;
    }
    const timestamps = this.completionTimestamps.get(targetKey)!;
    timestamps.push(completedAt);
    // Prune timestamps older than the rate window.
    const cutoff = completedAt - RATE_WINDOW_MS;
    while (timestamps.length > 0 && (timestamps[0] ?? Infinity) < cutoff) timestamps.shift();
  }

  private recordWriteFailure(targetKey: string): void {
    this.ensureStatsEntry(targetKey);
    const counters = this.statsCounters.get(targetKey)!;
    counters.writesFailed += 1;
  }

  private computeBucket(targetKey: string): ActuatorStatsBucket {
    const counters = this.statsCounters.get(targetKey);
    if (!counters) return { ...EMPTY_BUCKET };
    const ring = this.completionSamples.get(targetKey);
    const values = ring ? ring.values : [];
    const sorted = values.slice().sort((a, b) => a - b);
    const sum = sorted.reduce((acc, value) => acc + value, 0);
    const mean = sorted.length > 0 ? sum / sorted.length : 0;
    const timestamps = this.completionTimestamps.get(targetKey) ?? [];
    // Re-apply cutoff so a fresh getStats() call returns a tight rate window.
    const cutoff = this.now() - RATE_WINDOW_MS;
    let activeCount = 0;
    for (const ts of timestamps) if (ts >= cutoff) activeCount += 1;
    return {
      writesStarted: counters.writesStarted,
      writesCompleted: counters.writesCompleted,
      writesFailed: counters.writesFailed,
      meanMs: mean,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      maxMs: sorted.length > 0 ? (sorted[sorted.length - 1] ?? 0) : 0,
      ratePerSecond: activeCount,
      lastCompletedAtMs: counters.lastCompletedAtMs,
    };
  }

  /**
   * Read-only snapshot of write counters and latency percentiles for every
   * physical target the actuator has touched, plus an aggregated `total`.
   * Used by the live-write-ceiling bench (admin-only) to measure the real
   * production path, not the bench path itself.
   */
  getStats(): { total: ActuatorStatsBucket; byTarget: Record<string, ActuatorStatsBucket> } {
    const byTarget: Record<string, ActuatorStatsBucket> = {};
    for (const key of this.statsCounters.keys()) {
      byTarget[key] = this.computeBucket(key);
    }
    // The "total" bucket aggregates across all known targets. It does not
    // double-count latency samples (each physical target has its own ring).
    const total: ActuatorStatsBucket = { ...EMPTY_BUCKET };
    for (const bucket of Object.values(byTarget)) {
      total.writesStarted += bucket.writesStarted;
      total.writesCompleted += bucket.writesCompleted;
      total.writesFailed += bucket.writesFailed;
      total.ratePerSecond += bucket.ratePerSecond;
      if (bucket.lastCompletedAtMs !== null
        && (total.lastCompletedAtMs === null || bucket.lastCompletedAtMs > total.lastCompletedAtMs)) {
        total.lastCompletedAtMs = bucket.lastCompletedAtMs;
      }
    }
    return { total, byTarget };
  }

  /**
   * Latency of the completed writes, pooled over every physical target.
   *
   * The per-target rings keep the detail; this is the one number a latency
   * budget needs: how long a write to Live took, whatever it wrote.
   */
  getWriteLatency(): WriteLatencySummary {
    const pooled: number[] = [];
    for (const ring of this.completionSamples.values()) pooled.push(...ring.values);
    const sorted = pooled.sort((a, b) => a - b);
    return {
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      maxMs: sorted.length > 0 ? (sorted[sorted.length - 1] ?? 0) : 0,
      count: sorted.length,
    };
  }

  resetStats(): void {
    this.statsCounters.clear();
    this.completionSamples.clear();
    this.completionTimestamps.clear();
  }
}

export const continuousTargetActuator = new ContinuousTargetActuator();
