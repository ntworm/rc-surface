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
  write: (value: number) => Promise<void>;
  isCurrent: (() => boolean) | undefined;
  inFlight: Promise<void> | null;
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
 * newest value (or explicit user ramp); the actuator is the sole writer and cannot
 * overlap SDK setValue calls for the same parameter.
 */
export class ContinuousTargetActuator {
  private readonly now: () => number;
  private readonly minWriteIntervalMs: number;
  private readonly lanes = new Map<string, ContinuousLane>();
  // Cancelling a logical lane cannot recall an SDK write already sent.
  private readonly inFlightByTarget = new Map<string, Promise<void>>();
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
        write: request.write,
        isCurrent: request.isCurrent,
        inFlight: null,
        revision: 1,
        waiters: [],
      });
    } else {
      const sameOwner = !existing.isCurrent || existing.isCurrent();
      // Preserve an SDK call already in flight, but not its old owner's
      // deduplication history. The replacement must receive its first value.
      if (!sameOwner) existing.lastWritten = null;
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

  private isSettled(lane: ContinuousLane, nowMs: number): boolean {
    return lane.inFlight === null
      && lane.lastWritten !== null
      && Math.abs(lane.lastWritten - lane.destination) <= EPSILON
      && nowMs >= lane.rampStartedAtMs + lane.rampDurationMs;
  }

  private pumpLane(lane: ContinuousLane, nowMs: number): Promise<void> | null {
    if (lane.inFlight) return lane.inFlight;
    const targetInFlight = this.inFlightByTarget.get(lane.targetKey);
    if (targetInFlight) return targetInFlight;
    if (lane.isCurrent && !lane.isCurrent()) {
      this.cancel(lane.targetKey);
      return null;
    }
    const value = this.interpolate(lane, nowMs);
    const atDestination = Math.abs(value - lane.destination) <= EPSILON;
    if (lane.lastWritten !== null && Math.abs(lane.lastWritten - value) <= EPSILON) {
      if (atDestination) this.resolveWaiters(lane);
      return null;
    }
    if (lane.rampDurationMs > 0 && lane.lastWriteAtMs !== null && nowMs - lane.lastWriteAtMs < this.minWriteIntervalMs) {
      return null;
    }

    const revisionAtStart = lane.revision;
    const write = lane.write;
    const isCurrent = lane.isCurrent;
    lane.lastWriteAtMs = nowMs;
    const startedAtMs = nowMs;
    this.recordWriteStart(lane.targetKey);
    const writePromise = Promise.resolve()
      .then(() => {
        if (this.lanes.get(lane.targetKey) === lane && (!isCurrent || isCurrent())) return write(value);
      })
      .then(() => {
        if (isCurrent && !isCurrent()) return;
        lane.lastWritten = value;
        lane.current = value;
        this.recordWriteComplete(lane.targetKey, this.now() - startedAtMs);
      })
      .catch((error: unknown) => {
        console.error(
          '[ContinuousTargetActuator] target write failed:',
          error instanceof Error ? error.message : String(error),
        );
        this.recordWriteFailure(lane.targetKey);
      })
      .finally(() => {
        lane.inFlight = null;
        this.inFlightByTarget.delete(lane.targetKey);
        const replacement = this.lanes.get(lane.targetKey);
        if (replacement && replacement !== lane) {
          void this.pumpLane(replacement, this.now());
          return;
        }
        const complete = (!isCurrent || isCurrent()) && revisionAtStart === lane.revision
          && Math.abs(value - lane.destination) <= EPSILON
          && this.now() >= lane.rampStartedAtMs + lane.rampDurationMs;
        if (complete) this.resolveWaiters(lane);
        // Immediate writes retain one newest destination per physical
        // target. Drain it as soon as Live is ready, not on the 20 ms timer.
        // Never resurrect a cancelled lane or retry a failed write forever.
        else if (lane.immediate && revisionAtStart !== lane.revision
          && this.lanes.get(lane.targetKey) === lane) {
          void this.pumpLane(lane, this.now());
        }
      });
    lane.inFlight = writePromise;
    this.inFlightByTarget.set(lane.targetKey, writePromise);
    return writePromise;
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
    let writesStarted = 0;
    let writesCompleted = 0;
    let writesFailed = 0;
    let ratePerSecond = 0;
    let lastCompletedAtMs: number | null = null;
    for (const bucket of Object.values(byTarget)) {
      writesStarted += bucket.writesStarted;
      writesCompleted += bucket.writesCompleted;
      writesFailed += bucket.writesFailed;
      ratePerSecond += bucket.ratePerSecond;
      if (bucket.lastCompletedAtMs !== null
        && (lastCompletedAtMs === null || bucket.lastCompletedAtMs > lastCompletedAtMs)) {
        lastCompletedAtMs = bucket.lastCompletedAtMs;
      }
    }
    const total: ActuatorStatsBucket = {
      writesStarted,
      writesCompleted,
      writesFailed,
      meanMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      maxMs: 0,
      ratePerSecond,
      lastCompletedAtMs,
    };
    return { total, byTarget };
  }

  resetStats(): void {
    this.statsCounters.clear();
    this.completionSamples.clear();
    this.completionTimestamps.clear();
  }
}

export const continuousTargetActuator = new ContinuousTargetActuator();
