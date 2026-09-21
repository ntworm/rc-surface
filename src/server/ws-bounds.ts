// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0

/**
 * ws-bounds.ts — WebSocket protocol bounds and input validation.
 *
 * Every numeric limit lives here so runtime guards and tests share one
 * source of truth.
 *
 * All numeric limits are centralised here so they can be referenced by both
 * the runtime guards and the test suite.
 */

// ── WebSocket transport limits ──────────────────────────────────────────────

/** Disable per-message deflate — CPU cost outweighs bandwidth on LAN. */
export const PER_MESSAGE_DEFLATE = false;

/** Maximum payload size in bytes (100 KiB). Oversized frames are rejected by ws. */
export const MAX_PAYLOAD_BYTES = 102_400;

/** Maximum open WebSockets across phone and admin endpoints. */
export const MAX_WS_CONNECTIONS = 64;

/** Maximum open WebSockets from one network address. */
export const MAX_WS_CONNECTIONS_PER_IP = 16;

/** Interval between protocol-level liveness probes. */
export const WS_HEARTBEAT_INTERVAL_MS = 15_000;

export class WebSocketConnectionLimiter {
  private total = 0;
  private readonly byIp = new Map<string, number>();

  constructor(
    private readonly maxTotal = MAX_WS_CONNECTIONS,
    private readonly maxPerIp = MAX_WS_CONNECTIONS_PER_IP,
  ) {}

  tryAcquire(ipAddress: string): boolean {
    const key = ipAddress || "<unknown>";
    const ipCount = this.byIp.get(key) ?? 0;
    if (this.total >= this.maxTotal || ipCount >= this.maxPerIp) return false;
    this.total += 1;
    this.byIp.set(key, ipCount + 1);
    return true;
  }

  release(ipAddress: string): void {
    const key = ipAddress || "<unknown>";
    const ipCount = this.byIp.get(key) ?? 0;
    if (ipCount <= 0) return;
    this.total = Math.max(0, this.total - 1);
    if (ipCount === 1) this.byIp.delete(key);
    else this.byIp.set(key, ipCount - 1);
  }

  reset(): void {
    this.total = 0;
    this.byIp.clear();
  }
}

export interface HeartbeatSocket {
  ping(): void;
  terminate(): void;
}

export class WebSocketHeartbeatMonitor<T extends HeartbeatSocket = HeartbeatSocket> {
  private readonly alive = new WeakMap<T, boolean>();

  add(socket: T): void {
    this.alive.set(socket, true);
  }

  markAlive(socket: T): void {
    this.alive.set(socket, true);
  }

  sweep(sockets: Iterable<T>): void {
    for (const socket of sockets) {
      if (this.alive.get(socket) === false) {
        socket.terminate();
        continue;
      }
      this.alive.set(socket, false);
      socket.ping();
    }
  }
}

// ── Schema limits ───────────────────────────────────────────────────────────

/** Maximum Unicode code-points in a client display name. */
export const MAX_CLIENT_NAME_LENGTH = 64;

/** Maximum characters in a single control `name` field. */
export const MAX_CONTROL_NAME_LENGTH = 128;

/** Maximum controls accepted in a single snapshot message. */
export const MAX_CONTROLS_PER_SNAPSHOT = 128;

/** Current exact batch width; the original four-name schema remains accepted. */
export const MAX_CONTROLS_PER_IMMEDIATE_BATCH = 12;

const IMMEDIATE_AUDIO_DESCRIPTOR_NAMES = new Set([
  "sensor.audio.transient",
  "sensor.audio.kick",
  "sensor.audio.snare",
  "sensor.audio.brightness",
  "sensor.audio.centroid", "sensor.audio.flux", "sensor.audio.flatness",
  "sensor.audio.spread", "sensor.audio.rolloff",
  "sensor.audio.low", "sensor.audio.mid", "sensor.audio.high",
]);
const LEGACY_AUDIO_DESCRIPTOR_NAMES = new Set(Array.from(IMMEDIATE_AUDIO_DESCRIPTOR_NAMES).slice(0, 4));

/** History ring-buffer depth per control key. */
export const HISTORY_RING_SIZE = 120;

// ── Rate-limiting ───────────────────────────────────────────────────────────
//
// Sized against what the phone itself emits, not against a round number.
// Legacy designed worst case is ~30 snapshots/s (app.js TICK_MS = 33), one
// descriptor batch per 120 Hz audio/display frame, one coalesced modulator
// frame per 120 Hz display frame during a simultaneous LFO/stutter drag, plus
// a ping every five seconds — about 271 messages/s.
// Negotiated v1 replaces separate control/audio traffic with <=125 shared
// frames/s (8ms), plus <=120 modulator config frames, <=31 visual snapshots,
// 20 gate transitions/commands and a heartbeat: 297/s. Limits stay unchanged.
//
// The previous 30/s sustained sat exactly on the snapshot rate alone, so a
// drag dropped roughly two thirds of its frames. Rate-limited messages return
// without a reply, so nothing surfaced: the control simply stopped following
// the finger. See tests/server-rate-limit-headroom.test.mjs.

/** Burst bucket size (messages). */
export const RATE_BURST = 600;

/** Sustained rate (messages per second). */
export const RATE_SUSTAINED_PER_SEC = 300;

/** Window for rate limiter token replenishment (ms). */
export const RATE_WINDOW_MS = 1_000;

// ── Cache limits ────────────────────────────────────────────────────────────

/** Hard cap on cache entries (e.g. mapping cache, control-value cache). */
export const CACHE_MAX_ENTRIES = 2_048;

// ── Backpressure thresholds ─────────────────────────────────────────────────

/** Above this bufferedAmount we drop non-critical telemetry (bytes). */
export const BACKPRESSURE_DROP_THRESHOLD = 512 * 1024; // 512 KiB

/** Above this bufferedAmount we disconnect the slow client (bytes). */
export const BACKPRESSURE_DISCONNECT_THRESHOLD = 2 * 1024 * 1024; // 2 MiB

// ── Validation helpers ──────────────────────────────────────────────────────

/**
 * Sanitise a numeric value: NaN and ±Infinity become 0.
 */
export function sanitizeNumber(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return v;
}

/**
 * Validate + truncate a client display name.
 * Returns the (possibly truncated) name, or empty string if invalid.
 */
export function sanitizeClientName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // Use Array.from to correctly count Unicode code-points (surrogates).
  const codePoints = Array.from(raw);
  if (codePoints.length > MAX_CLIENT_NAME_LENGTH) {
    return codePoints.slice(0, MAX_CLIENT_NAME_LENGTH).join("");
  }
  return raw;
}

/**
 * Validate a control name — must be a non-empty string
 * within MAX_CONTROL_NAME_LENGTH characters.
 */
export function isValidControlName(name: unknown): name is string {
  return typeof name === "string" && name.length > 0 && name.length <= MAX_CONTROL_NAME_LENGTH;
}

/**
 * Validate a snapshot data object. Returns the controls array trimmed
 * to MAX_CONTROLS_PER_SNAPSHOT, or null if the data is fundamentally invalid.
 */
export function boundSnapshotControls(controls: unknown[]): unknown[] | null {
  if (!Array.isArray(controls)) return null;
  if (controls.length > MAX_CONTROLS_PER_SNAPSHOT) {
    return null; // reject entirely — client is misbehaving
  }
  return controls;
}

export interface ImmediateDescriptorControl {
  name: string;
  value: number;
  lost?: boolean;
}

/** Additive realtime protocol. Same 128-control/payload/rate bounds as the
 * legacy snapshot. Repeated names preserve ordered press/release edges. */
export function boundControlFrame(controls: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(controls) || !controls.length || controls.length > MAX_CONTROLS_PER_SNAPSHOT) return null;
  const unit = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
  for (const control of controls) {
    if (!control || typeof control !== 'object' || !isValidControlName(control.name)) return null;
    if (control.lost !== undefined && typeof control.lost !== 'boolean') return null;
    if (control.x !== undefined || control.y !== undefined) {
      if (!unit(control.x) || !unit(control.y) || control.value !== undefined) return null;
    } else if (!unit(control.value)) return null;
  }
  return controls;
}

/**
 * Validate the one high-rate batch admitted by the protocol.
 *
 * Requiring the complete, unique descriptor set prevents this higher-rate
 * path from becoming a generic way around ordinary message bounds. Reject the
 * whole frame on malformed input: coercing Infinity to zero could manufacture
 * a false momentary edge.
 */
export function boundImmediateControls(controls: unknown): ImmediateDescriptorControl[] | null {
  if (!Array.isArray(controls)) return null;
  const allowed = controls.length === MAX_CONTROLS_PER_IMMEDIATE_BATCH ? IMMEDIATE_AUDIO_DESCRIPTOR_NAMES
    : controls.length === 4 ? LEGACY_AUDIO_DESCRIPTOR_NAMES : null;
  if (!allowed) return null;
  const seen = new Set<string>();
  for (const control of controls) {
    if (!control || typeof control !== "object") return null;
    const item = control as Record<string, unknown>;
    if (!isValidControlName(item["name"]) || !allowed.has(item["name"])) {
      return null;
    }
    if (seen.has(item["name"])) return null;
    if (typeof item["value"] !== "number" || !Number.isFinite(item["value"])) return null;
    if (item["value"] < 0 || item["value"] > 1) return null;
    if (item["lost"] !== undefined && typeof item["lost"] !== "boolean") return null;
    seen.add(item["name"]);
  }
  return controls as ImmediateDescriptorControl[];
}

// ── Per-connection rate limiter ──────────────────────────────────────────────

/** Minimum spacing between rate-limit notices sent back to one client. */
export const RATE_NOTICE_INTERVAL_MS = 1_000;

export interface RateLimiterState {
  tokens: number;
  lastRefill: number;
  violations: number;
  /** When the client was last told it is being limited (0 = never). */
  lastNoticeAt: number;
  /** Violations already covered by a notice, so each notice reports a delta. */
  noticedViolations: number;
}

export function createRateLimiter(): RateLimiterState {
  return {
    tokens: RATE_BURST,
    lastRefill: Date.now(),
    violations: 0,
    lastNoticeAt: 0,
    noticedViolations: 0,
  };
}

/**
 * Decide whether a limited client should be told about it now.
 *
 * A dropped message returns no reply at all, which is what made the limiter
 * invisible: from the phone the control just stops following the finger. One
 * notice per second is enough to name the cause without the notices themselves
 * becoming the flood.
 */
export function takeRateLimitNotice(
  state: RateLimiterState,
  now: number = Date.now(),
): { dropped: number } | null {
  if (now - state.lastNoticeAt < RATE_NOTICE_INTERVAL_MS) return null;
  const dropped = state.violations - state.noticedViolations;
  if (dropped <= 0) return null;
  state.lastNoticeAt = now;
  state.noticedViolations = state.violations;
  return { dropped };
}

/**
 * Consume one token. Returns true if the message is allowed, false if
 * rate-limited.
 */
export function consumeToken(state: RateLimiterState): boolean {
  const now = Date.now();
  const elapsed = now - state.lastRefill;
  if (elapsed >= RATE_WINDOW_MS) {
    // Refill: add sustained tokens per elapsed windows, cap at burst.
    const windows = Math.floor(elapsed / RATE_WINDOW_MS);
    state.tokens = Math.min(RATE_BURST, state.tokens + windows * RATE_SUSTAINED_PER_SEC);
    state.lastRefill += windows * RATE_WINDOW_MS;
  }
  if (state.tokens > 0) {
    state.tokens--;
    return true;
  }
  state.violations++;
  return false;
}
