// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import dgram from 'node:dgram';
import { TextDecoder, TextEncoder } from 'node:util';
// osc-min's package.json declares `"type": "module"` with only named exports
// (`toBuffer`, `fromBuffer`). Importing it as `import * as osc from 'osc-min'`
// works in Node but, when esbuild bundles it into a single CJS file, the
// generated __commonJS wrapper evaluates `global` at module scope and crashes
// inside Ableton Live's strict ESM extension host ("global is not defined").
// Mark osc-min as `external` in build.ts so the bundle ships `require("osc-min")`
// (resolved at runtime by the host's module loader) instead of the wrapper.
import * as osc from 'osc-min';
import { EventEmitter } from 'node:events';
import { LISTEN, GET, CMD, RESPONSE, CLIP, CLIP_RESPONSE, SESSION_REC, REC, REC_LOOP, REC_PREFLIGHT, LISTENER_QUIET_MS as OSC_LISTENER_QUIET_MS } from '../osc-tokens.js';
import { RecordingTransport } from './recording-transport.js';

if (typeof (globalThis as any).TextEncoder === 'undefined') {
  (globalThis as any).TextEncoder = TextEncoder;
}
if (typeof (globalThis as any).TextDecoder === 'undefined') {
  (globalThis as any).TextDecoder = TextDecoder;
}

/**
 * How long the push stream may be silent before polling takes over. Long
 * enough that ordinary gaps between pushes do not trigger it, short enough
 * that a dropped listener registration is picked up within one heartbeat.
 * Canonical constant lives in src/osc-tokens.ts so the contract-freeze test
 * sees the same value as the runtime.
 */
export const LISTENER_QUIET_MS = OSC_LISTENER_QUIET_MS;

/**
 * While the push stream is quiet, re-register the listeners this often.
 * Live builds the AbletonOSC control surface once before the document loads
 * and again after it ("Disconnecting..." then a second "Started AbletonOSC"
 * a few seconds later). Listeners registered with the first instance die with
 * it, while the second instance still answers probes, so the link looks alive
 * and nothing else would ever re-register (owner bench, 2026-09-21: no beat
 * flash, stale play state). Re-registering is idempotent on AbletonOSC's side
 * and costs eight messages, so a quiet link pays that once per interval.
 */
export const LISTENER_REREGISTER_MS = 10_000;

// Launch Clip getters answer on their own address, exactly like GET: a reply
// to them must not pass for a listener push.
const GET_ADDRESSES: ReadonlySet<string> = new Set([
  ...Object.values(GET),
  REC.getRecordMode,
  REC_LOOP.getStart, REC_LOOP.getLength,
  ...Object.values(REC_PREFLIGHT),
  ...Object.values(SESSION_REC),
  CLIP.getLaunchQuantization,
  CLIP.getLaunchMode,
  CLIP.getLegato,
  CLIP.getGlobalQuantization,
  CLIP.getTrackNames,
]);
const PENDING_REPLY_CAP = 8;
// These properties are only polled by REC. A large Set can return more than
// eight track arm reports on one address; overflow must not impersonate a
// listener push and postpone listener recovery. Meter still has listeners.
const REC_POLL_ONLY: ReadonlySet<string> = new Set([
  ...Object.values(SESSION_REC),
  ...Object.entries(REC_PREFLIGHT).filter(([key]) => !key.startsWith('signature')).map(([, address]) => address),
  REC_LOOP.getStart, REC_LOOP.getLength,
]);

const oscInt = (value: number) => ({ type: 'integer', value: Math.trunc(value) });
export const GLOBAL_QUANTIZATION_CONFIRM_MS = 2000;

export function validateGlobalClipQuantization(args: unknown): number {
  if (!args || typeof args !== 'object' || Array.isArray(args)
    || Object.keys(args).length !== 1 || !Object.hasOwn(args, 'quantization')) {
    throw new Error('Expected exactly {quantization: integer 0..13}');
  }
  const value = (args as Record<string, unknown>)["quantization"];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 13) {
    throw new Error('quantization must be an integer from 0 to 13');
  }
  return value;
}

/** What Live reports about one clip property Launch Clip reads. */
export type ClipPropertyName = 'launch_quantization' | 'launch_mode' | 'legato';

export type TransportLiteState = {
  available: boolean;
  connected: boolean;
  error: string | null;
  isPlaying: boolean;
  tempo: number;
  currentSongTimeBeats: number;
  signatureNumerator: number;
  signatureDenominator: number;
  metronome: boolean;
  beat: number;
  locators: Array<{ name: string; time: number }>;
  selectedTrackIndex: number | null;
  selectedDeviceIndex: number | null;
  lastSeenAt: number | null;
};

export class OSCTransport extends EventEmitter {
  private server: dgram.Socket | null = null;
  private client: dgram.Socket | null = null;
  private targetPort: number = 11000;
  private targetHost: string = '127.0.0.1';
  private listenPort: number = 11001;
  private readonly listenPortCandidates = [11001, 11101, 11201];
  /** True only for a listener this transport bound, never a sibling's. */
  private ownsServer = false;
  private rebinding = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private requeryOnNextConnection = false;
  private onMessageCallback: ((msg: Buffer) => void) | null = null;

  public state: TransportLiteState = {
    available: false,
    connected: false,
    error: null,
    isPlaying: false,
    tempo: 120.0,
    currentSongTimeBeats: 0,
    signatureNumerator: 4,
    signatureDenominator: 4,
    metronome: false,
    beat: 0,
    locators: [],
    selectedTrackIndex: null,
    selectedDeviceIndex: null,
    lastSeenAt: null,
  };

  public readonly recording = new RecordingTransport({
    send: (address, args) => this.send(address, args),
    isConnected: () => this.state.available && this.state.connected,
  });

  public lastSongTimeUpdateAt: number = Date.now();

  /** When the start_listen set was last sent; null until the first registration. */
  public lastListenerRegistrationAt: number | null = null;

  /**
   * When an unsolicited message last arrived. Replies to our own GET polls
   * share the reply addresses with listener pushes, so they are accounted
   * for in `pendingReplies` and never refresh this; only a genuine push may
   * prove that the listeners are alive.
   */
  public lastPushAt: number | null = null;
  private readonly pendingReplies = new Map<string, number>();

  /**
   * Launch Clip. Off until a Launch Clip mapping exists, so a set without one
   * pays no extra OSC traffic. The listeners are remembered here so that a
   * re-registration (AbletonOSC rebuilt, link recovered) restores them along
   * with the song ones.
   */
  public clipLaunchActive = false;
  /** Song.clip_trigger_quantization as Live last reported it. */
  public globalQuantization: number | null = null;
  private pendingGlobalQuantization: ((error: Error) => void) | null = null;
  public get globalQuantizationPending(): boolean { return this.pendingGlobalQuantization !== null; }
  private readonly trackSlotListeners = new Set<number>();
  private readonly clipPositionListeners = new Map<string, [number, number]>();

  constructor() {
    super();
  }

  public start(): void {
    if (this.server || this.client) {
      return;
    }
    try {
      this.client = dgram.createSocket('udp4');
      
      this.onMessageCallback = (msg: Buffer) => {
        try {
          const oscMsg = osc.fromBuffer(msg);
          this.handleIncoming(oscMsg);
        } catch (err) {
          // ignore malformed OSC
        }
      };

      const g = globalThis as any;
      if (g.abletonOSCSocket && g.abletonOSCListeners) {
        // Both socket and listener set must already exist; partial init by a
        // sibling extension would crash on `g.abletonOSCListeners.add(...)`.
        this.server = g.abletonOSCSocket;
        this.ownsServer = false;
        g.abletonOSCListeners.add(this.onMessageCallback);
        const address = typeof g.abletonOSCSocket.address === 'function'
          ? g.abletonOSCSocket.address()
          : null;
        if (address && typeof address === 'object' && typeof address.port === 'number') {
          this.listenPort = address.port;
        }

        this.state.available = true;
        this.state.error = null;
        this.requeryOnNextConnection = true;
        this.queryInitialState();
        this.startPolling();
        this.startHeartbeat();
        console.log(`[OSC-RC] Shared OSC listening socket reused on port ${this.listenPort}`);
        return;
      }

      // RC Setlist may already own 11001 in a separate extension VM. Try a
      // small, deterministic fallback list instead of disabling all OSC
      // transport controls when the first bind reports EADDRINUSE.
      const tryBind = (candidateIndex: number): void => {
        const port = this.listenPortCandidates[candidateIndex];
        if (port === undefined) {
          this.state.available = false;
          this.state.connected = false;
          this.state.error = `Could not bind OSC listener on ${this.listenPortCandidates.join(', ')}`;
          if (this.client) {
            try { this.client.close(); } catch {}
            this.client = null;
          }
          return;
        }

        const serverSocket = dgram.createSocket('udp4');
        const onBindError = (err: NodeJS.ErrnoException) => {
          serverSocket.off('error', onBindError);
          try { serverSocket.close(); } catch {}
          if (err.code === 'EADDRINUSE') {
            console.warn(`[OSC-RC] Port ${port} in use, trying fallback ${this.listenPortCandidates[candidateIndex + 1] ?? 'none'}`);
            tryBind(candidateIndex + 1);
            return;
          }
          this.state.available = false;
          this.state.connected = false;
          this.state.error = err.message;
        };
        serverSocket.once('error', onBindError);
        serverSocket.bind(port, '127.0.0.1', () => {
          serverSocket.off('error', onBindError);
          g.abletonOSCListeners = new Set();
          g.abletonOSCListeners.add(this.onMessageCallback);
          this.serve(serverSocket);

          this.server = serverSocket;
          this.ownsServer = true;
          this.listenPort = port;
          this.state.available = true;
          this.state.error = null;
          this.requeryOnNextConnection = true;
          this.queryInitialState();
          this.startPolling();
          this.startHeartbeat();
          console.log(`[OSC-RC] Shared OSC listening socket created and bound on port ${this.listenPort}`);
        });
      };

      tryBind(0);
    } catch (err) {
      this.state.available = false;
      this.state.connected = false;
      const msg = err instanceof Error ? `${err.message}\n${err.stack || ""}` : String(err);
      console.log(`[OSC-RC] start() failed: ${msg}`);
      this.state.error = err instanceof Error ? err.message : String(err);
      this.dispose();
    }
  }

  /** Make `serverSocket` the shared listener that fans out to every callback. */
  private serve(serverSocket: dgram.Socket): void {
    const g = globalThis as any;
    serverSocket.on('error', (err) => {
      this.state.error = err.message;
      this.state.available = false;
      this.markLinkLost();
    });
    serverSocket.on('message', (msg) => {
      if (g.abletonOSCListeners) {
        for (const cb of g.abletonOSCListeners) {
          try { cb(msg); } catch {}
        }
      }
    });
    g.abletonOSCSocket = serverSocket;
  }

  /**
   * Stock AbletonOSC replies only to its fixed response port (11001), never
   * to the port that asked. A fallback listener taken while a sibling held
   * 11001 at startup therefore hears nothing. While no reply has arrived,
   * move a listener this transport owns alone back once 11001 is free.
   */
  private retryPreferredPort(): void {
    const g = globalThis as any, old = this.server, preferred = this.listenPortCandidates[0];
    if (!old || !this.ownsServer || this.rebinding || this.state.connected || preferred === undefined || this.listenPort === preferred) return;
    if (g.abletonOSCSocket !== old || g.abletonOSCListeners?.size !== 1 || !g.abletonOSCListeners.has(this.onMessageCallback)) return;
    this.rebinding = true;
    const socket = dgram.createSocket('udp4');
    const busy = () => { this.rebinding = false; try { socket.close(); } catch {} };
    socket.once('error', busy);
    socket.bind(preferred, '127.0.0.1', () => {
      socket.off('error', busy);
      this.rebinding = false;
      if (this.server !== old || g.abletonOSCSocket !== old || this.state.connected || g.abletonOSCListeners?.size !== 1) {
        try { socket.close(); } catch {}
        return;
      }
      this.serve(socket);
      this.server = socket;
      this.listenPort = preferred;
      old.removeAllListeners('message');
      try { old.close(); } catch {}
      this.requeryOnNextConnection = true;
      this.queryInitialState();
      console.log(`[OSC-RC] OSC listener moved back to port ${preferred}`);
    });
  }

  public dispose(): void {
    this.pendingGlobalQuantization?.(new Error('AbletonOSC disconnected before quantization confirmation'));
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    const g = globalThis as any;
    if (this.onMessageCallback) {
      // Only mutate shared state when we actually own the listener set.
      // A sibling extension (e.g. ableton-setlist-bridge) may own the
      // shared socket; closing it from here would break them.
      if (
        g.abletonOSCListeners &&
        typeof g.abletonOSCListeners.delete === "function"
      ) {
        g.abletonOSCListeners.delete(this.onMessageCallback);
        if (g.abletonOSCListeners.size === 0) {
          if (g.abletonOSCSocket && g.abletonOSCSocket === this.server) {
            try { g.abletonOSCSocket.close(); } catch {}
            g.abletonOSCSocket = null;
          }
          g.abletonOSCListeners = null;
        }
      }
      this.onMessageCallback = null;
    }
    this.server = null;
    this.ownsServer = false;
    if (this.client) {
      try { this.client.close(); } catch {}
      this.client = null;
    }
    this.state.available = false;
    this.state.connected = false;
    this.recording.dispose();
    // A later start() belongs to a new session: nothing of this one is
    // re-registered on its behalf.
    this.clipLaunchActive = false;
    this.globalQuantization = null;
    this.trackSlotListeners.clear();
    this.clipPositionListeners.clear();
  }

  public send(address: string, args: any[] = []): void {
    // Send from the bound listener whenever possible. AbletonOSC routes its
    // replies to the OSC listener endpoint; using a second ephemeral socket
    // makes transport commands appear to succeed while their responses (BPM,
    // playhead, locators) never reach Surface, especially when a fallback
    // listener port is selected alongside RC Setlist.
    const socket = this.server ?? this.client;
    if (!socket) return;
    this.expectReply(address);
    try {
      const oscMsg = {
        oscType: 'message',
        address,
        args
      };
      const buffer = osc.toBuffer(oscMsg);
      socket.send(buffer, this.targetPort, this.targetHost, (err) => {
        if (err) {
          this.state.error = err.message;
          this.recording.sendFailed(address, err);
          if (address === CLIP.setGlobalQuantization || address === CLIP.getGlobalQuantization) {
            this.pendingGlobalQuantization?.(err);
          }
        }
      });
    } catch (err) {
      // Log only the first error per lifecycle to avoid flooding the
      // log when the OSC socket is closed but polling/heartbeat keep
      // trying to send. Subsequent identical errors are coalesced.
      const detail = err instanceof Error ? `${err.message}\n${err.stack || ""}` : String(err);
      const lastErr = this.state.error;
      if (lastErr !== (err instanceof Error ? err.message : String(err))) {
        console.log(`[OSC-RC] send() failed: ${detail}`);
      }
      this.state.error = err instanceof Error ? err.message : String(err);
      this.recording.sendFailed(address, err instanceof Error ? err : new Error(String(err)));
      if (address === CLIP.setGlobalQuantization || address === CLIP.getGlobalQuantization) {
        this.pendingGlobalQuantization?.(new Error(this.state.error));
      }
    }
  }

  /** A GET poll expects one reply on its own address; cap so unanswered polls cannot mask pushes forever. */
  public expectReply(address: string): void {
    if (!GET_ADDRESSES.has(address)) return;
    const pending = this.pendingReplies.get(address) ?? 0;
    this.pendingReplies.set(address, Math.min(pending + 1, PENDING_REPLY_CAP));
  }

  public handleIncoming(oscMsg: any): void {
    if (oscMsg.oscType !== 'message') return;

    const wasConnected = this.state.connected;
    const now = Date.now();
    this.state.connected = true;
    this.state.lastSeenAt = now;
    this.state.error = null;
    const pending = this.pendingReplies.get(oscMsg.address) ?? 0;
    if (pending > 0) {
      this.pendingReplies.set(oscMsg.address, pending - 1);
    } else if (!REC_POLL_ONLY.has(oscMsg.address)) {
      this.lastPushAt = now;
    }

    if (!wasConnected && this.requeryOnNextConnection) {
      this.requeryOnNextConnection = false;
      this.queryInitialState();
    }

    const address = oscMsg.address;
    const args = oscMsg.args || [];
    this.recording.observe(address, args, now);
    if (Object.values(SESSION_REC).includes(address)) this.emit('session-recording-observation',{address,args,at:now});
    if (Object.values(REC_PREFLIGHT).includes(address) || address === CLIP.getTrackNames || address === REC_LOOP.getStart || address === REC_LOOP.getLength || address === GET.tempo || address === GET.isPlaying || address === REC.getRecordMode) {
      this.emit('recording-observation', { address, args, at: now });
    }

    let updated = false;

    if (address === RESPONSE.tempo) {
      const bpm = args[0]?.value;
      if (typeof bpm === 'number') {
        this.state.tempo = bpm;
        updated = true;
      }
    } else if (address === RESPONSE.isPlaying) {
      const val = args[0]?.value;
      if (args.length === 1 && (val === 0 || val === 1 || typeof val === 'boolean')) {
        const isPlaying = val === 1 || val === true;
        if (this.state.isPlaying !== isPlaying) {
          this.state.isPlaying = isPlaying;
          updated = true;
        }
      }
    } else if (address === RESPONSE.currentSongTime) {
      const time = args[0]?.value;
      if (typeof time === 'number' && Number.isFinite(time)) {
        this.state.currentSongTimeBeats = time;
        this.lastSongTimeUpdateAt = Date.now();
        this.emit('position', {
          beat: time,
          tempo: this.state.tempo,
          signatureNumerator: this.state.signatureNumerator,
          signatureDenominator: this.state.signatureDenominator,
        });
        updated = true;
      }
    } else if (address === RESPONSE.metronome) {
      const val = args[0]?.value;
      const metronome = val === 1 || val === true || val === 'true';
      if (this.state.metronome !== metronome) {
        this.state.metronome = metronome;
        updated = true;
      }
    } else if (address === RESPONSE.signatureNumerator) {
      const val = args[0]?.value;
      if (typeof val === 'number' && this.state.signatureNumerator !== val) {
        this.state.signatureNumerator = val;
        updated = true;
      }
    } else if (address === RESPONSE.signatureDenominator) {
      const val = args[0]?.value;
      if (typeof val === 'number' && this.state.signatureDenominator !== val) {
        this.state.signatureDenominator = val;
        updated = true;
      }
    } else if (address === RESPONSE.beat) {
      const val = args[0]?.value;
      if (typeof val === 'number') {
        this.state.beat = val;
        this.emit('beat', val);
        updated = true;
      }
    } else if (address === RESPONSE.cuePoints) {
      const cues: Array<{ name: string; time: number }> = [];
      for (let i = 0; i < args.length; i += 2) {
        const name = args[i]?.value;
        const time = args[i + 1]?.value;
        if (typeof name === 'string' && typeof time === 'number') {
          cues.push({ name, time });
        }
      }
      cues.sort((a, b) => a.time - b.time);
      this.state.locators = cues;
      updated = true;
    } else if (address === RESPONSE.selectedTrack) {
      const idx = args[0]?.value;
      if (typeof idx === 'number' && this.state.selectedTrackIndex !== idx) {
        this.state.selectedTrackIndex = idx;
        updated = true;
      }
    } else if (address === RESPONSE.selectedDevice) {
      const trackIdx = args[0]?.value;
      const deviceIdx = args[1]?.value;
      if (typeof trackIdx === 'number' && typeof deviceIdx === 'number') {
        if (this.state.selectedTrackIndex !== trackIdx || this.state.selectedDeviceIndex !== deviceIdx) {
          this.state.selectedTrackIndex = trackIdx;
          this.state.selectedDeviceIndex = deviceIdx;
          updated = true;
        }
      }
      this.emit('selection', this.state);
    } else if (address === CLIP_RESPONSE.globalQuantization) {
      const val = args[0]?.value;
      if (args.length === 1 && typeof val === 'number' && Number.isInteger(val) && val >= 0 && val <= 13) {
        this.globalQuantization = val;
        this.emit('clip-global-quantization', val);
      }
    } else if (address === CLIP_RESPONSE.firedSlot || address === CLIP_RESPONSE.playingSlot) {
      const trackIndex = args[0]?.value;
      const value = args[1]?.value;
      if (Number.isInteger(trackIndex) && typeof value === 'number' && Number.isFinite(value)) {
        this.emit('clip-track-slot', {
          trackIndex,
          kind: address === CLIP_RESPONSE.firedSlot ? 'fired' : 'playing',
          value: Math.trunc(value),
          at: now,
        });
      }
    } else if (address === CLIP_RESPONSE.playingPosition) {
      const trackIndex = args[0]?.value;
      const slotIndex = args[1]?.value;
      const position = args[2]?.value;
      if (Number.isInteger(trackIndex) && Number.isInteger(slotIndex)
        && typeof position === 'number' && Number.isFinite(position)) {
        this.emit('clip-position', { trackIndex, slotIndex, position, at: now });
      }
    } else if (
      address === CLIP_RESPONSE.launchQuantization
      || address === CLIP_RESPONSE.launchMode
      || address === CLIP_RESPONSE.legato
    ) {
      const trackIndex = args[0]?.value;
      const slotIndex = args[1]?.value;
      const raw = args[2]?.value;
      const property: ClipPropertyName = address === CLIP_RESPONSE.launchQuantization
        ? 'launch_quantization'
        : address === CLIP_RESPONSE.launchMode ? 'launch_mode' : 'legato';
      const value = typeof raw === 'boolean' ? (raw ? 1 : 0) : raw;
      if (Number.isInteger(trackIndex) && Number.isInteger(slotIndex)
        && typeof value === 'number' && Number.isFinite(value)) {
        this.emit('clip-property', { trackIndex, slotIndex, property, value: Math.trunc(value) });
      }
    } else if (address === CLIP_RESPONSE.trackNames) {
      const names = args.map((arg: any) => arg?.value);
      if (names.every((name: unknown) => typeof name === 'string')) {
        this.emit('clip-track-names', names);
      }
    }

    if (updated) {
      this.emit('update', this.state);
    }
  }

  private queryInitialState(): void {
    this.registerListeners();

    // Get cue points once
    this.send(GET.cuePoints);
  }

  /** Send the start_listen set. Safe to repeat: AbletonOSC replaces a listener it already has. */
  public registerListeners(now: number = Date.now()): void {
    this.send(LISTEN.isPlaying);
    this.send(LISTEN.tempo);
    this.send(LISTEN.metronome);
    this.send(LISTEN.signatureNumerator);
    this.send(LISTEN.signatureDenominator);
    this.send(LISTEN.currentSongTime);
    this.send(LISTEN.beat);
    this.send(LISTEN.selectedTrack);
    this.recording.registerListeners();
    if (this.clipLaunchActive) {
      this.send(CLIP.listenGlobalQuantization);
      for (const trackIndex of this.trackSlotListeners) this.sendTrackSlotListen(trackIndex);
      for (const [trackIndex, slotIndex] of this.clipPositionListeners.values()) {
        this.send(CLIP.listenPlayingPosition, [oscInt(trackIndex), oscInt(slotIndex)]);
      }
    }
    this.lastListenerRegistrationAt = now;
  }

  // ── Launch Clip ──────────────────────────────────────────────────────────

  /** Turned on while at least one Launch Clip mapping exists. */
  public setClipLaunchActive(active: boolean): void {
    if (this.clipLaunchActive === active) return;
    this.clipLaunchActive = active;
    if (active) {
      this.send(CLIP.listenGlobalQuantization);
      this.send(CLIP.getGlobalQuantization);
      return;
    }
    for (const trackIndex of [...this.trackSlotListeners]) this.unlistenTrackSlots(trackIndex);
    for (const [trackIndex, slotIndex] of [...this.clipPositionListeners.values()]) {
      this.unlistenClipPosition(trackIndex, slotIndex);
    }
  }

  /** Press the slot's launch button. No extra argument: Live quantizes. */
  public fireClipSlot(trackIndex: number, slotIndex: number): void {
    this.send(CLIP.fireSlot, [oscInt(trackIndex), oscInt(slotIndex)]);
  }

  /** Native empty-slot REC; Global omits the per-fire quantization override. */
  public recordEmptyClipSlot(trackIndex: number, slotIndex: number, beats: number, quantization: 'global' | 0 | 4 | 7): void {
    this.send(CLIP.fireSlot,[oscInt(trackIndex),oscInt(slotIndex),{type:'float',value:beats},...(quantization==='global'?[]:[oscInt(quantization)])]);
  }

  /** Track.stop_all_clips with Live's default (quantized). */
  public stopTrackClips(trackIndex: number): void {
    this.send(CLIP.stopTrack, [oscInt(trackIndex)]);
  }

  private sendTrackSlotListen(trackIndex: number): void {
    this.send(CLIP.listenFiredSlot, [oscInt(trackIndex)]);
    this.send(CLIP.listenPlayingSlot, [oscInt(trackIndex)]);
  }

  public listenTrackSlots(trackIndex: number): void {
    this.trackSlotListeners.add(trackIndex);
    this.sendTrackSlotListen(trackIndex);
  }

  public unlistenTrackSlots(trackIndex: number): void {
    if (!this.trackSlotListeners.delete(trackIndex)) return;
    this.send(CLIP.unlistenFiredSlot, [oscInt(trackIndex)]);
    this.send(CLIP.unlistenPlayingSlot, [oscInt(trackIndex)]);
  }

  public get listenedTrackSlots(): number[] {
    return [...this.trackSlotListeners];
  }

  public listenClipPosition(trackIndex: number, slotIndex: number): void {
    this.clipPositionListeners.set(`${trackIndex}:${slotIndex}`, [trackIndex, slotIndex]);
    this.send(CLIP.listenPlayingPosition, [oscInt(trackIndex), oscInt(slotIndex)]);
  }

  public unlistenClipPosition(trackIndex: number, slotIndex: number): void {
    if (!this.clipPositionListeners.delete(`${trackIndex}:${slotIndex}`)) return;
    this.send(CLIP.unlistenPlayingPosition, [oscInt(trackIndex), oscInt(slotIndex)]);
  }

  /** Read-only: the clip's launch quantization, launch mode and legato. */
  public requestClipProperties(trackIndex: number, slotIndex: number): void {
    const args = [oscInt(trackIndex), oscInt(slotIndex)];
    this.send(CLIP.getLaunchQuantization, args);
    this.send(CLIP.getLaunchMode, args);
    this.send(CLIP.getLegato, args);
  }

  public requestTrackNames(): void {
    this.send(CLIP.getTrackNames);
  }

  public requestGlobalClipQuantization(): void {
    if (!this.state.available || !this.state.connected) return;
    this.send(CLIP.listenGlobalQuantization);
    this.send(CLIP.getGlobalQuantization);
  }

  /** Explicit, transient Set write. A UDP send is never an acknowledgement. */
  public async setGlobalClipQuantization(args: unknown): Promise<{ quantization: number }> {
    const value = validateGlobalClipQuantization(args);
    if (!this.state.available || !this.state.connected) throw new Error('AbletonOSC is not connected');
    if (this.globalQuantizationPending) throw new Error('A global quantization request is pending');
    if (this.globalQuantization === value) return { quantization: value };
    return new Promise((resolve, reject) => {
      const finish = (error?: Error) => {
        if (this.pendingGlobalQuantization !== fail) return;
        this.pendingGlobalQuantization = null;
        clearTimeout(timer);
        this.off('clip-global-quantization', confirmed);
        this.off('update', checkLink);
        this.emit('clip-quantization-write', { pending: false, error: error?.message ?? null });
        if (error) reject(error);
        else resolve({ quantization: value });
      };
      const fail = (error: Error) => finish(error);
      const confirmed = (observed: number) => { if (observed === value) finish(); };
      const checkLink = (state: TransportLiteState) => {
        if (!state.available || !state.connected) fail(new Error('AbletonOSC disconnected before quantization confirmation'));
      };
      const timer = setTimeout(() => fail(new Error('Live did not confirm global quantization within 2000 ms')), GLOBAL_QUANTIZATION_CONFIRM_MS);
      this.pendingGlobalQuantization = fail;
      this.on('clip-global-quantization', confirmed);
      this.on('update', checkLink);
      this.emit('clip-quantization-write', { pending: true, error: null });
      try {
        this.send(CLIP.setGlobalQuantization, [oscInt(value)]);
        if (this.globalQuantizationPending) this.send(CLIP.getGlobalQuantization);
      } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  /**
   * True when the push stream has gone quiet long enough that we can no longer
   * assume the registered listeners are feeding us.
   *
   * `queryInitialState` registers `start_listen` for tempo, is_playing,
   * metronome, both signature halves, current_song_time, beat and
   * selected_track — AbletonOSC pushes all of those on change. Asking for the
   * same values on a fixed 500 ms cadence on top of that was ~12 messages a
   * second out and as many back, forever, restating what had just been pushed.
   * The polling is a recovery path, so it only runs when there is something to
   * recover from.
   */
  public isListenerStreamQuiet(now: number = Date.now()): boolean {
    return this.lastPushAt === null
      || now - this.lastPushAt > LISTENER_QUIET_MS;
  }

  /**
   * Ask AbletonOSC for the current selection. Only MAP mode's "use selected"
   * button reads it, and AbletonOSC raises inside Live (and logs a traceback)
   * whenever selected_device is asked while no device is selected, so this is
   * never polled on a cadence: it is sent when someone needs the answer.
   */
  public refreshSelection(): void {
    this.send(GET.selectedTrack);
    this.send(GET.selectedDevice);
  }

  /** refreshSelection() and wait for the device reply, or give up after `timeoutMs`. */
  public requestSelection(timeoutMs: number = 300): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.off('selection', finish);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      this.on('selection', finish);
      this.refreshSelection();
    });
  }

  /** One polling turn. Public so the cadence can be tested without timers. */
  public pollTick(now: number = Date.now()): void {
    this.recording.pollTick(now);
    const quiet = this.isListenerStreamQuiet(now);
    // Beat/tempo pushes do not prove that the position listener survived.
    // Recover that channel at the existing 500 ms cadence, leaving margin
    // for reply latency before the 1000 ms clock freshness deadline.
    const recoverPosition = this.state.isPlaying && (quiet || now - this.lastSongTimeUpdateAt >= 250);
    if (recoverPosition) this.send(GET.currentSongTime);
    if (!quiet) {
      if (recoverPosition) this.send(GET.isPlaying);
      return;
    }

    // Quiet stream: either AbletonOSC restarted and dropped our listener
    // registrations, or Live is idle. Re-ask for the listener-backed state.
    this.send(GET.tempo);
    this.send(GET.isPlaying);
    this.send(GET.metronome);
    this.send(GET.selectedTrack);
  }

  /**
   * The link stopped answering. Emitted on the edge, not sampled: the
   * heartbeat's own probe can be answered (and reconnect) before any timer
   * would see the link down.
   */
  private markLinkLost(): void {
    const wasConnected = this.state.connected;
    this.state.connected = false;
    this.recording.invalidate();
    if (wasConnected) this.emit('link-lost');
  }

  /** One heartbeat turn. Public so the cadence can be tested without timers. */
  public heartbeatTick(now: number = Date.now()): void {
    // Mark disconnected only when BOTH the socket is silent AND we have
    // already established at least one connection. Before first message,
    // the listener hasn't received anything yet so lastSeenAt is null.
    if (
      this.state.lastSeenAt !== null &&
      now - this.state.lastSeenAt > 5000
    ) {
      this.requeryOnNextConnection = true;
      this.pendingGlobalQuantization?.(new Error('AbletonOSC disconnected before quantization confirmation'));
      this.globalQuantization = null;
      this.markLinkLost();
    }
    this.retryPreferredPort();
    // Liveness probe. Anything arriving on the socket already refreshes
    // lastSeenAt, so while the push stream is flowing the link is proven and
    // the probe is pure noise. is_playing rides along to recover confirmed
    // play/pause state once the listeners are gone.
    if (this.isListenerStreamQuiet(now)) {
      this.send(GET.tempo);
      this.send(GET.isPlaying);
      if (
        this.lastListenerRegistrationAt === null ||
        now - this.lastListenerRegistrationAt > LISTENER_REREGISTER_MS
      ) {
        this.registerListeners(now);
      }
    }
  }

  private startPolling(): void {
    this.pollInterval = setInterval(() => this.pollTick(), 500);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => this.heartbeatTick(), 2000);
  }

  // Transport Command Helpers
  public play(): void {
    this.send(CMD.startPlaying);
    this.send(GET.isPlaying);
  }

  public stopPlayback(): void {
    this.send(CMD.stopPlaying);
    this.send(GET.isPlaying);
  }

  public toggle(): void {
    if (this.state.isPlaying) {
      this.stopPlayback();
    } else {
      this.play();
    }
  }

  public prevLocator(): void {
    this.send(CMD.jumpToPrevCue);
  }

  public nextLocator(): void {
    this.send(CMD.jumpToNextCue);
  }

  public jumpToLocator(indexOrName: number | string): void {
    if (indexOrName === undefined || indexOrName === null) return;
    const type = typeof indexOrName === 'number' ? 'integer' : 'string';
    this.send(CMD.cuePointJump, [{ type, value: indexOrName }]);
  }

  public refreshLocators(): void {
    this.send('/live/song/get/cue_points');
  }
}

// Export singleton instance
export const oscTransport = new OSCTransport();
