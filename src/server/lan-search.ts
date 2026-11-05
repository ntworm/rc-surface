// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

/**
 * Walking the network candidates one at a time.
 *
 * Every candidate gets a window of its own: the certificate is issued first,
 * then the machine waits for a phone to arrive on that address. A connection
 * from outside pauses the walk, so the conversation has time to finish.
 */

export const CANDIDATE_WINDOW_MS = 25_000;
export const ARRIVAL_PAUSE_MS = 45_000;

/** Only the routable levels of the network list are worth trying. */
const MIN_LEVEL = 1;
const MAX_LEVEL = 6;

export type LanSearchState = "preparing" | "running" | "arrived" | "exhausted" | "proved";
export type LanSearchOutcome = "exhausted" | "proved" | "stopped";

export interface LanSearchRow {
  ip: string;
  level: number;
  public: boolean;
}

export interface LanSearchView {
  state: LanSearchState;
  ip: string;
  position: number;
  total: number;
  deadline: number;
  skipped: string[];
}

export interface LanSearchDeps {
  now?: () => number;
  candidates: () => readonly LanSearchRow[];
  ownAddresses: () => readonly string[];
  ensureCovered: (ip: string) => Promise<boolean>;
  onChange: () => void;
  onFinish: (outcome: LanSearchOutcome) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface LanSearch {
  start(): Promise<void>;
  stop(): void;
  next(): Promise<boolean>;
  noteArrival(local: string | undefined, remote: string | undefined): void;
  noteProof(ip: string): void;
  view(): LanSearchView | null;
  active(): boolean;
}

/** The states in which the search still waits for something to happen. */
function isLiveState(state: LanSearchState): boolean {
  return state === "preparing" || state === "running" || state === "arrived";
}

/** The timer of the search never holds the process open. */
function defaultSetTimer(fn: () => void, ms: number): unknown {
  const handle = setTimeout(fn, ms) as { unref?: () => void };
  if (typeof handle.unref === "function") handle.unref();
  return handle;
}

function defaultClearTimer(handle: unknown): void {
  clearTimeout(handle as NodeJS.Timeout);
}

/** One walk over the candidates. The state lives here, not in the caller. */
class LanSearchRun implements LanSearch {
  private readonly deps: LanSearchDeps;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private rows: readonly LanSearchRow[] = [];
  private index = 0;
  private skipped: string[] = [];
  private paused = new Set<string>();
  private current: LanSearchView | null = null;
  private timer: unknown = null;
  private armed = false;
  private generation = 0;
  private remaining = 0;

  constructor(deps: LanSearchDeps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.setTimer = deps.setTimer ?? defaultSetTimer;
    this.clearTimer = deps.clearTimer ?? defaultClearTimer;
  }

  /** The one place the reported state changes. */
  private publish(state: LanSearchState, ip: string, position: number, deadline: number): void {
    this.current = { state, ip, position, total: this.rows.length, deadline, skipped: [...this.skipped] };
    this.deps.onChange();
  }

  private cancelTimer(): void {
    if (!this.armed) return;
    this.armed = false;
    this.clearTimer(this.timer);
    this.timer = null;
  }

  private armTimer(fn: () => void, ms: number): void {
    this.cancelTimer();
    this.timer = this.setTimer(fn, Math.max(0, ms));
    this.armed = true;
  }

  active(): boolean {
    return this.current !== null && isLiveState(this.current.state);
  }

  view(): LanSearchView | null {
    return this.current;
  }

  /** The list is over: nothing else will be tried. */
  private finishExhausted(gen: number): void {
    if (gen !== this.generation) return;
    this.cancelTimer();
    const last = this.rows[this.rows.length - 1];
    this.publish("exhausted", last ? last.ip : "", this.rows.length, 0);
    this.deps.onFinish("exhausted");
  }

  /** One candidate: prepare it, then give it a window of its own. */
  private async enterIndex(target: number, gen: number): Promise<void> {
    if (gen !== this.generation) return;
    if (target >= this.rows.length) {
      this.finishExhausted(gen);
      return;
    }
    const row = this.rows[target];
    if (!row) return;
    this.index = target;
    this.publish("preparing", row.ip, target + 1, 0);
    let ok = false;
    try {
      ok = await this.deps.ensureCovered(row.ip);
    } catch {
      ok = false;
    }
    if (!ok) {
      if (gen !== this.generation) return;
      this.skipped.push(row.ip);
      await this.enterIndex(target + 1, gen);
      return;
    }
    if (gen !== this.generation) return;
    const deadline = this.now() + CANDIDATE_WINDOW_MS;
    this.publish("running", row.ip, target + 1, deadline);
    this.armTimer(() => {
      void this.enterIndex(target + 1, gen);
    }, CANDIDATE_WINDOW_MS);
  }

  /** The pause is over: the rest of the window belongs to the same row. */
  private endPause(gen: number, nextIndex: number): void {
    if (gen !== this.generation) return;
    const row = this.rows[this.index];
    const deadline = this.now() + this.remaining;
    this.publish("running", row ? row.ip : "", this.index + 1, deadline);
    this.armTimer(() => {
      void this.enterIndex(nextIndex, gen);
    }, this.remaining);
  }

  /** A connection from outside pauses the walk on the row it arrived on.
   *  The walk stays where it is: the row under test keeps its place, so no
   *  candidate is tried twice. */
  private beginPause(here: string, at: number): void {
    this.paused.add(here);
    this.remaining = (this.current?.deadline ?? 0) - this.now();
    const gen = this.generation;
    const nextIndex = this.index + 1;
    this.cancelTimer();
    this.publish("arrived", here, at + 1, this.now() + ARRIVAL_PAUSE_MS);
    this.armTimer(() => {
      this.endPause(gen, nextIndex);
    }, ARRIVAL_PAUSE_MS);
  }

  /** Only a running search can pause: while a pause holds the QR, another
   *  connection cannot move it. */
  private acceptsArrival(here: string, from: string): boolean {
    if (this.current === null) return false;
    if (this.current.state !== "running") return false;
    if (from === "::1" || from.startsWith("127.")) return false;
    if (this.deps.ownAddresses().includes(from)) return false;
    if (this.skipped.includes(here)) return false;
    if (this.paused.has(here)) return false;
    return true;
  }

  noteArrival(local: string | undefined, remote: string | undefined): void {
    if (!local || !remote) return;
    const here = local.replace(/^::ffff:/, "");
    const from = remote.replace(/^::ffff:/, "");
    if (!this.acceptsArrival(here, from)) return;
    const at = this.rows.findIndex(row => row.ip === here);
    if (at < 0 || at > this.index) return;
    this.beginPause(here, at);
  }

  noteProof(ip: string): void {
    const current = this.current;
    if (current === null) return;
    if (!isLiveState(current.state)) return;
    this.generation++;
    this.cancelTimer();
    this.publish("proved", ip, current.position, current.deadline);
    this.deps.onFinish("proved");
  }

  /** A new run ends the old one without reporting it. */
  async start(): Promise<void> {
    const gen = ++this.generation;
    this.cancelTimer();
    this.rows = Object.freeze(
      this.deps.candidates().filter(row => row.level >= MIN_LEVEL && row.level <= MAX_LEVEL && !row.public),
    );
    this.index = 0;
    this.skipped = [];
    this.paused = new Set<string>();
    this.remaining = 0;
    if (this.rows.length === 0) {
      this.finishExhausted(gen);
      return;
    }
    await this.enterIndex(0, gen);
  }

  stop(): void {
    const wasActive = this.active();
    this.generation++;
    this.cancelTimer();
    this.current = null;
    if (wasActive) this.deps.onFinish("stopped");
  }

  /** The caller asks for the next candidate: it gets a full window. */
  async next(): Promise<boolean> {
    if (!this.active()) return false;
    this.cancelTimer();
    const gen = ++this.generation;
    await this.enterIndex(this.index + 1, gen);
    return true;
  }
}

export function createLanSearch(deps: LanSearchDeps): LanSearch {
  return new LanSearchRun(deps);
}
