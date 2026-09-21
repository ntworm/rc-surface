// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0

export interface ScheduledTask {
  targetKey: string;
  isDiscrete: boolean;
  value: number;
  execute: () => Promise<void>;
}

/**
 * WriteScheduler — Coalesces continuous control updates per targetKey while
 * preserving strict FIFO execution order for discrete (toggle, note, trigger)
 * events. Coalescing semantics and the discrete FIFO guarantee are part of
 * the host write contract exercised by tests/write-scheduler-*.test.mjs.
 */
export class WriteScheduler {
  private queues = new Map<string, ScheduledTask[]>();
  private activeKeys = new Set<string>();

  /**
   * Enqueue a task for a targetKey.
   * If `isDiscrete` is false, coalesce with the previous task for the same targetKey
   * if the previous task is also continuous (non-discrete).
   */
  enqueue(task: ScheduledTask): void {
    const key = task.targetKey;
    let queue = this.queues.get(key);
    if (!queue) {
      queue = [];
      this.queues.set(key, queue);
    }

    if (!task.isDiscrete && queue.length > 0) {
      const last = queue[queue.length - 1];
      if (last && !last.isDiscrete) {
        // Coalesce: replace stale continuous task with the newest value
        queue[queue.length - 1] = task;
        return;
      }
    }

    queue.push(task);
  }

  /**
   * Return number of pending tasks for a given targetKey (or total across all keys).
   */
  pendingCount(targetKey?: string): number {
    if (targetKey) {
      return this.queues.get(targetKey)?.length ?? 0;
    }
    let total = 0;
    for (const q of this.queues.values()) {
      total += q.length;
    }
    return total;
  }

  /** Start independent targets together; preserve FIFO and single-flight per
   * key. A slow SDK promise must never block another target's note or switch. */
  async flush(): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const key of this.queues.keys()) {
      if (this.activeKeys.has(key)) continue;
      this.activeKeys.add(key);
      jobs.push(this.drain(key));
    }
    await Promise.all(jobs);
  }

  private async drain(key: string): Promise<void> {
    try {
      // Read the current queue after every await: clear() may replace it.
      for (;;) {
        const queue = this.queues.get(key);
        const task = queue?.shift();
        if (!task) { this.queues.delete(key); break; }
        try { await task.execute(); }
        catch (err) {
          console.error(`[WriteScheduler] Error executing task for ${key}:`, err instanceof Error ? err.message : String(err));
        }
      }
    } finally {
      this.activeKeys.delete(key);
      // Also drain a new key enqueued while awaiting without its own flush.
      await this.flush();
    }
  }

  /**
   * Clear all pending tasks without executing.
   */
  clear(): void {
    this.queues.clear();
  }
}

export const globalWriteScheduler = new WriteScheduler();
