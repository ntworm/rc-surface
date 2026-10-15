// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
export type VisionLossPolicy = {version: 1; mode: 'hold' | 'timeout' | 'release'; timeoutMs: number; legacy: boolean};
export type VisionTracking = {seq: number; qualified: boolean; graceMs: number; activation?: boolean};
export const learnedPose = (name: string): boolean => /^sensor\.vision\.gesture\.(?:[1-9]|1[0-5])$/.test(name);
export function visionLossPolicy(value?: unknown, restored = false): VisionLossPolicy {
  if (value == null) return {version: 1, mode: restored ? 'hold' : 'timeout', timeoutMs: 10000, legacy: restored};
  const p = value as VisionLossPolicy;
  if (!p || p.version !== 1 || !['hold','timeout','release'].includes(p.mode)
    || !Number.isInteger(p.timeoutMs) || p.timeoutMs < 100 || p.timeoutMs > 30000 || p.timeoutMs % 100
    || typeof p.legacy !== 'boolean' || (p.legacy && p.mode !== 'hold')) throw Error('Invalid vision loss policy');
  return {...p};
}
export function validVisionTracking(value: unknown): value is VisionTracking {
  const p = value as VisionTracking;
  return !!p && typeof p === 'object' && !Array.isArray(p) && Number.isSafeInteger(p.seq) && p.seq > 0
    && typeof p.qualified === 'boolean' && Number.isInteger(p.graceMs) && p.graceMs >= 0 && p.graceMs <= 2000
    && (p.activation === undefined || typeof p.activation === 'boolean') && !(p.activation && !p.qualified);
}
type Entry = {client: string; control: string; lastQualified: number; grace: number; lost: boolean;
  expired: boolean; token: object; timer: unknown; current: () => boolean; sequence: number};
export class VisionLossWatchdog {
  private entries = new Map<string, Entry>();
  private sequences = new Map<string, number>();
  constructor(private options: {
    policy: () => VisionLossPolicy;
    release: (client: string, control: string) => Promise<void> | void;
    loss?: (client: string, control: string) => Promise<void> | void;
    feedback?: (client: string, control: string, state: string, remainingMs: number | null, sequence: number) => void;
    now?: () => number; set?: (fn: () => void, ms: number) => unknown; clear?: (id: unknown) => void;
  }) {}
  private now = (): number => (this.options.now || (() => performance.now()))();
  private clear(entry: Entry) { if (entry.timer != null) (this.options.clear || (id => clearTimeout(id as any)))(entry.timer); entry.timer = null; }
  private notify(entry: Entry, state: string) {
    const p = this.options.policy();
    this.options.feedback?.(entry.client, entry.control, state,
      p.mode === 'timeout' ? Math.max(0, entry.lastQualified + p.timeoutMs - this.now()) : null, entry.sequence);
  }
  private arm(entry: Entry) {
    this.clear(entry);
    if (entry.expired) return;
    const p = this.options.policy(), now = this.now();
    const lossAt = entry.lastQualified + entry.grace;
    const deadline = p.mode === 'timeout' ? entry.lastQualified + p.timeoutMs
      : p.mode === 'release' ? lossAt : Infinity;
    const due = entry.lost ? deadline : Math.min(lossAt, deadline);
    if (!Number.isFinite(due)) return;
    const token = entry.token;
    entry.timer = (this.options.set || ((fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; }))(() => {
      if (this.entries.get(entry.client + '::' + entry.control) !== entry || entry.token !== token) return;
      if (!entry.current()) { this.forget(entry.client, entry.control); return; }
      const time = this.now();
      if (time >= deadline) {
        entry.expired = true; this.clear(entry); this.notify(entry, 'released');
        void Promise.resolve(this.options.release(entry.client, entry.control)).catch(error => console.error('Vision gate release failed:', error));
      } else {
        const becameLost = !entry.lost && time >= lossAt;
        entry.lost = time >= lossAt;
        if (becameLost) {
          this.notify(entry, 'holding');
          void Promise.resolve(this.options.loss?.(entry.client, entry.control)).catch(error => console.error('Vision safe loss failed:', error));
        }
        this.arm(entry);
      }
    }, Math.max(0, due - now));
  }
  /** Returns permission to dispatch a learned gate. No evidence cannot renew/revive it. */
  observe(client: string, control: string, value: number, lost: boolean, tracking: VisionTracking | undefined, current: () => boolean = () => true): boolean {
    if (!learnedPose(control)) return true;
    const key = client + '::' + control, p = this.options.policy();
    if (tracking !== undefined) {
      if (!validVisionTracking(tracking) || tracking.seq <= (this.sequences.get(client) || 0)) return false;
      this.sequences.set(client, tracking.seq);
    }
    let entry = this.entries.get(key);
    if (entry && !entry.current()) { this.forget(client, control); entry = undefined; }
    if (!lost && value === 0) { this.forget(client, control); return true; }
    const qualified = tracking?.qualified === true && !lost && value > 0;
    if (qualified) {
      if (entry?.expired && !tracking?.activation) return false;
      if (!entry || entry.expired) {
        if (entry) this.clear(entry);
        entry = {client, control, lastQualified: this.now(), grace: tracking!.graceMs, lost: false,
          expired: false, token: {}, timer: null, current, sequence: tracking!.seq};
        this.entries.set(key, entry);
      } else { entry.lastQualified = this.now(); entry.grace = tracking!.graceMs; entry.lost = false; entry.sequence = tracking!.seq; }
      this.notify(entry, 'tracking'); this.arm(entry); return true;
    }
    if (entry) {
      // Unknown frames never move the qualified anchor or reset the deadline.
      if (lost && this.now() >= entry.lastQualified + entry.grace) entry.lost = true;
      this.arm(entry);
    }
    if (lost) return true; // per-target Safe loss may release sooner
    return tracking === undefined && (p.legacy || p.mode === 'hold');
  }
  refresh() { for (const entry of this.entries.values()) this.arm(entry); }
  forget(client: string, control?: string) {
    for (const [key, entry] of this.entries) if (entry.client === client && (!control || entry.control === control)) {
      this.clear(entry); this.entries.delete(key);
    }
    if (!control) this.sequences.delete(client);
  }
  reset() { for (const entry of this.entries.values()) this.clear(entry); this.entries.clear(); this.sequences.clear(); }
}
