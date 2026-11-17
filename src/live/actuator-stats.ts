// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

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

/** How many completion samples one physical target keeps for the percentiles. */
const COMPLETION_RING_SIZE = 512;

/** Width of the sliding window the write rate is counted in. */
const RATE_WINDOW_MS = 1000;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const last = sorted.length - 1;
  const rank = Math.max(0, Math.min(last, last * p));
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo] ?? 0;
  const weight = rank - lo;
  return (sorted[lo] ?? 0) * (1 - weight) + (sorted[hi] ?? 0) * weight;
}

interface StatsCounters {
  writesStarted: number;
  writesCompleted: number;
  writesFailed: number;
  lastCompletedAtMs: number | null;
}

interface CompletionRing {
  values: number[];
  next: number;
}

/**
 * Write statistics of one actuator, kept per physical target.
 *
 * The counters, the completion sample rings and the completion timestamps
 * live here: they exist for the live-write-ceiling bench, a diagnostic path
 * that observes real production traffic without altering actuator behaviour.
 */
export class ActuatorStats {
  private readonly now: () => number;
  private readonly completionSamples = new Map<string, CompletionRing>();
  private readonly completionTimestamps = new Map<string, number[]>();
  private readonly statsCounters = new Map<string, StatsCounters>();

  constructor(options: { now: () => number }) {
    this.now = options.now;
  }

  /** One write was handed to Live. */
  recordWriteStart(targetKey: string): void {
    this.ensureStatsEntry(targetKey);
    const counters = this.statsCounters.get(targetKey)!;
    counters.writesStarted += 1;
  }

  /** One write finished; `durationMs` is how long the SDK call took. */
  recordWriteComplete(targetKey: string, durationMs: number): void {
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

  /** One write failed; its value never reached Live. */
  recordWriteFailure(targetKey: string): void {
    this.ensureStatsEntry(targetKey);
    const counters = this.statsCounters.get(targetKey)!;
    counters.writesFailed += 1;
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

  /** Forget every counter and every sample of every target. */
  resetStats(): void {
    this.statsCounters.clear();
    this.completionSamples.clear();
    this.completionTimestamps.clear();
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
}
