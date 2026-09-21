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
import { LISTEN, GET, CMD, RESPONSE, LISTENER_QUIET_MS as OSC_LISTENER_QUIET_MS } from '../osc-tokens.js';

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

const GET_ADDRESSES: ReadonlySet<string> = new Set(Object.values(GET));
const PENDING_REPLY_CAP = 8;

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
          serverSocket.on('error', (err) => {
            this.state.error = err.message;
            this.state.available = false;
            this.state.connected = false;
          });

          g.abletonOSCSocket = serverSocket;
          g.abletonOSCListeners = new Set();
          g.abletonOSCListeners.add(this.onMessageCallback);

          serverSocket.on('message', (msg) => {
            if (g.abletonOSCListeners) {
              for (const cb of g.abletonOSCListeners) {
                try { cb(msg); } catch {}
              }
            }
          });

          this.server = serverSocket;
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

  public dispose(): void {
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
    if (this.client) {
      try { this.client.close(); } catch {}
      this.client = null;
    }
    this.state.available = false;
    this.state.connected = false;
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
    } else {
      this.lastPushAt = now;
    }

    if (!wasConnected && this.requeryOnNextConnection) {
      this.requeryOnNextConnection = false;
      this.queryInitialState();
    }

    const address = oscMsg.address;
    const args = oscMsg.args || [];

    let updated = false;

    if (address === RESPONSE.tempo) {
      const bpm = args[0]?.value;
      if (typeof bpm === 'number') {
        this.state.tempo = bpm;
        updated = true;
      }
    } else if (address === RESPONSE.isPlaying) {
      const val = args[0]?.value;
      const isPlaying = val === 1 || val === true || val === 'true';
      if (this.state.isPlaying !== isPlaying) {
        this.state.isPlaying = isPlaying;
        updated = true;
      }
    } else if (address === RESPONSE.currentSongTime) {
      const time = args[0]?.value;
      if (typeof time === 'number') {
        this.state.currentSongTimeBeats = time;
        this.lastSongTimeUpdateAt = Date.now();
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
    this.lastListenerRegistrationAt = now;
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
    if (!this.isListenerStreamQuiet(now)) return;

    // Quiet stream: either AbletonOSC restarted and dropped our listener
    // registrations, or Live is idle. Re-ask for the listener-backed state.
    this.send(GET.tempo);
    this.send(GET.isPlaying);
    this.send(GET.metronome);
    this.send(GET.selectedTrack);
    if (this.state.isPlaying) {
      this.send(GET.currentSongTime);
    }
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
      this.state.connected = false;
      this.requeryOnNextConnection = true;
    }
    // Liveness probe. Anything arriving on the socket already refreshes
    // lastSeenAt, so while the push stream is flowing the link is proven and
    // the probe is pure noise. is_playing rides along because play() and
    // stopPlayback() set it optimistically and only a reply can correct it
    // once the listeners are gone.
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
    this.state.isPlaying = true;
  }

  public stopPlayback(): void {
    this.send(CMD.stopPlaying);
    this.state.isPlaying = false;
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
