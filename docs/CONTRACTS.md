# Contracts — RC Surface

This document records the cross-side contracts the host and the phone share.
Every section is exercised by tests that fail when the contract drifts; the
source of truth lives in the implementation, this document just describes it
so reviewers do not have to spelunk both trees.

---

## Rhythmic policy (LFO and Stutter)

The rhythmic shapes are computed in two places that must agree byte-for-byte:

- **Host:** `src/live/transport-clock.ts`
  — `getLfoSubdivision`, `getLfoMaxHz`, `getStutterTiming`
- **Phone:** `static/phone-v3/controls.js`
  — `LFO_SHAPE_MAX_HZ`, `LFO_SUBDIVISIONS`, `STUTTER_SUBDIVISIONS`,
    `getLfoSubdivision`, `getLfoMaxHz`, `getStutterSubdivisions`,
    `getStutterTiming`, `advanceStutterPhase`

**Parity test:** `tests/modulator-policy-parity.test.mjs` evaluates the host
and the browser over every shape, tempo, Auto/free and old pin combination and
asserts the two implementations agree.

### Shape ceilings (`LFO_SHAPE_MAX_HZ`)

| Shape     | Max Hz |
| --------- | ------ |
| sine      | 4      |
| triangle  | 3      |
| ramp_up   | 3      |
| ramp_down | 3      |
| square    | 12     |

These caps are the contract; a browser-only or host-only change would let
one side accept a gesture the other rejects, and the user would see a control
that stopped following the finger with no error surfaced.

Source: `internal/LIVE-WRITE-CEILING-1.0.md`, rule
`maxHz(shape) = floor(teto_efetivo / minPointsPerCycle(shape))`, where
`teto_efetivo` is the effective write ceiling. The table above is the
**fallback** for an effective ceiling of about 50 writes/s (the live
write-ceiling task P04 was still pending as of 2026-09-17). When `teto_efetivo`
is measured, regenerate the table and update this doc, both source files
(`src/live/transport-clock.ts:11`, `static/phone-v3/controls.js:17`) and the
frozen contract test (`tests/contracts-freeze.test.mjs`).

### Sync speeds

`getLfoSubdivision(rate, bpm, pin)` snaps the finger position to the
divisions that keep the rendered Hz at or below the per-shape cap above,
across tempos 30–300 BPM and the legacy pins (3, 2/3, 1/8, 1/32).

### Stutter Auto distribution

With `syncMode === "sync"`, `getStutterTiming(rate, beat, bpm, auto)` walks the
gesture from rate 0 to rate 1 and only emits speeds reachable under the sync
ceiling. The classic reachable set at 120 BPM is:

| rate | frequency |
| ---- | --------- |
| 0    | 2         |
| 0.4  | 4         |
| 0.8  | 8         |
| 1    | 8         |

### Stutter FREE

`auto === false` reads the gesture across the whole bar without a capped dead
zone; the audible limit is the host's own playback ceiling, not a phone-side
cap.

### Why two implementations

The browser needs the numbers to render the dial, label and gate, all on the
critical frame budget. The host needs the same numbers to compute write
scheduling for the LFO/stutter parameters that go back to Live. Either side
treating the table as its own is a bug: the dial would draw a position the host
refuses to honour, and the user would think the controller is broken. The
parity test is the only thing keeping them honest — treat any drift there as
a release blocker, not a refactor opportunity.

---

## Wire protocol bounds (ADR-004 / frozen)

The phone and the server share the same numeric limits so a payload that
passes on the phone also passes on the server. `src/server/ws-bounds.ts`
is the single source of truth; `tests/contracts-freeze.test.mjs` asserts
every value in this table matches the runtime. A change here is a protocol
version bump, not a refactor — bump `controlStreamVersion` in
`src/server/ws.ts` hello payload and ship both sides together.

| Constant                          | Value             | Purpose                                                |
| --------------------------------- | ----------------- | ------------------------------------------------------ |
| `MAX_PAYLOAD_BYTES`               | 100 KiB           | Reject oversized frames at the `ws` layer              |
| `MAX_WS_CONNECTIONS`              | 64                | Total open sockets (phone + admin)                    |
| `MAX_WS_CONNECTIONS_PER_IP`       | 16                | Per-IP cap so NATs do not get a single-client lockout |
| `WS_HEARTBEAT_INTERVAL_MS`        | 15 000            | Liveness probe cadence                                 |
| `MAX_CLIENT_NAME_LENGTH`          | 64 code-points    | Truncate via `Array.from`, not `length`                |
| `MAX_CONTROL_NAME_LENGTH`         | 128 chars         | Reject names that are too long                         |
| `MAX_CONTROLS_PER_SNAPSHOT`       | 128               | Hard reject at the snapshot choke point                |
| `MAX_CONTROLS_PER_IMMEDIATE_BATCH`| 12                | Descriptor-only high-rate path                         |
| `HISTORY_RING_SIZE`               | 120               | Per-control ring buffer                                |
| `RATE_BURST`                      | 600 messages      | Token bucket size                                      |
| `RATE_SUSTAINED_PER_SEC`          | 300               | Sustained replenishment                                |
| `RATE_WINDOW_MS`                  | 1 000             | Refill window                                          |
| `RATE_NOTICE_INTERVAL_MS`         | 1 000             | Minimum spacing for rate-limit notices                 |
| `CACHE_MAX_ENTRIES`               | 2 048             | Cache cap                                              |
| `BACKPRESSURE_DROP_THRESHOLD`     | 512 KiB           | Drop non-critical telemetry above this                 |
| `BACKPRESSURE_DISCONNECT_THRESHOLD`| 2 MiB            | Slow-client close code 4008                           |
| `LISTENER_QUIET_MS` (osc-tokens)  | 1 500             | Push-stream silence before polling kicks in           |

---

## OSC address registry (frozen)

The server is the only side that talks OSC; the phone talks WebSocket and
the server translates. Every OSC address the host emits is therefore a
host contract, centralised in `src/osc-tokens.ts`. `osc-transport.ts`
imports from the registry and never hand-writes an address string. The
freeze test asserts:

1. Every frozen address exists in `src/osc-tokens.ts`.
2. `src/live/osc-transport.ts` imports from `../osc-tokens.ts` and
   references `LISTEN`, `GET`, `CMD` and `RESPONSE` (no parallel arrays,
   no inline concatenation).
3. `LISTENER_QUIET_MS` exported from the transport equals the registry's
   `LISTENER_QUIET_MS`.

A drift between the registry and the runtime means a typo in either place
silently turns into a no-op against Live; the freeze test is the only
thing that catches it.

### Listener registrations (push from Live)

```
/live/song/start_listen/is_playing
/live/song/start_listen/tempo
/live/song/start_listen/metronome
/live/song/start_listen/signature_numerator
/live/song/start_listen/signature_denominator
/live/song/start_listen/current_song_time
/live/song/start_listen/beat
/live/view/start_listen/selected_track
```

### Poll / heartbeat getters

```
/live/song/get/cue_points
/live/view/get/selected_device
/live/song/get/tempo
/live/song/get/is_playing
/live/song/get/metronome
/live/view/get/selected_track
/live/song/get/current_song_time
```

### Transport commands

```
/live/song/start_playing
/live/song/stop_playing
/live/song/jump_to_prev_cue
/live/song/jump_to_next_cue
/live/song/cue_point/jump
```

---

## Hello contract (frozen)

`src/server/ws.ts` `sendHello` is the only place that builds the welcome
message. The freeze test asserts every field below is still present.
Removing one is a breaking change for older clients.

| Field                  | Type                | Notes                                         |
| ---------------------- | ------------------- | --------------------------------------------- |
| `type`                 | `"hello"`           | Discriminator                                 |
| `controlStreamVersion` | `1`                 | Bumped with every protocol change              |
| `client_id`            | string              | The server-assigned identity                   |
| `role`                 | string              | Server's record of admin / phone              |
| `tokenStatus`          | string              | Capability-token state                        |
| `path`                 | string              | The URL path the phone loaded                  |
| `commands`             | string[]            | Server-side command registry (for panel/help) |
| `tempo` / `signature` / `scale` | numbers / string | Live song snapshot at connect time            |
| `playheadActive` / `playheadTimeMs` | bool / number | Live playhead at connect time              |
| `values`               | object              | Initial control-value cache                   |
| `bipolarControls`      | string[]            | Controls that should render with a centre dot |
| `projectConfig`        | object              | ProjectConfig panel snapshot                  |

The phone tolerates missing optional fields (older builds did not send some
of them) and ignores unknown fields it does not recognise. Both directions
of the upgrade story are guarded by `tests/upgrade-regression.test.mjs`.

---

## Upgrade policy

The protocol supports a narrow forward / backward range by construction:

- **New optional server field**: the phone must not crash when a field it
  does not know about appears. The upgrade-regression test asserts the
  hello payload contains the known field set without requiring the phone
  to consume them.
- **New optional client field**: the server must ignore unknown keys on
  snapshot, control and set-display-name messages; `boundControlFrame`
  in `ws-bounds.ts` is the choke point.
- **Hard contract change** (limit, address, capability): bump
  `controlStreamVersion` in `src/server/ws.ts`, record the new value in
  this document, and ship both sides of the conversation together.

Removing a frozen field or bumping a limit without recording the change
here is the failure mode this document exists to prevent.

---

## Trigger note scheduling and schema (`trigger_note`)

Trigger note targets allow controls and learned gestures to trigger MIDI notes with transport-synchronized quantization and safe Note-Off guarantees.

### Target Schema

Targets with `mode: 'trigger_note'` adhere to the following schema constraints:

| Field | Type | Validation rules |
| ----- | ---- | ---------------- |
| `mode` | `'trigger_note'` | Required discriminator. Continuous mapping controls are hidden in UI. |
| `midiNote` | string | Standard note name (e.g. `'C2'`). Range: `C-2` (MIDI 0) to `G8` (MIDI 127). Pitches above G8 (MIDI 128+) are rejected. Default `'C2'`. |
| `midiVelocity` | number | Integer in range `1..127`. Default `100`. |
| `noteTiming` | string | `'immediate'`, `'beat'`, or `'bar'`. Default `'immediate'`. |
| `noteGate` | string | `'pulse'` or `'hold'`. Default `'hold'`. |
| `noteDurationMs`| number | Integer in range `20..2000` ms. Default `80`. |
| `noteDurationMode` | string | `'ms'` (legacy/default when absent) or `'grid'` (pulse with immediate, beat or bar onset). |
| `noteDurationBars` | number | For grid mode: exactly `1/16`, `1/8`, `1/4`, `1/2`, `1`, `2`, or `4`. New UI sync selections use `1/4`. |

**Timing & Gate Invariant (D04):** `hold + sync` is rejected. If `noteTiming` is `'beat'` or `'bar'`, `noteGate` must be `'pulse'`. If `noteGate` is `'hold'`, `noteTiming` must be `'immediate'`.

### OSC Clock Contract

- Quantization calculates the next quarter-note beat (`beat`) or next bar boundary (`bar`) strictly from the fresh host OSC position (`/live/song/get/current_song_time`) observed within `<=1000 ms`.
- If the transport is stopped (`!isPlaying`), the song position is stale (`>1000 ms`), or tempo is non-positive, scheduling reports `unavailable` / `NO SYNC` and drops the trigger safely.
- Quantized trigger beats are strictly future (`nextTriggerBeat > currentBeat`).
- Grid duration is resolved from the fresh OSC snapshot at actual Note-On: `bars × beatsPerBar × 60000 / BPM`, frozen for that voice. Invalid or unbounded durations do not dispatch. Legacy `noteDurationMs` profiles keep their saved duration.
- Immediate pulse may use the same grid duration without quantizing onset. A stopped, connected, previously observed clock retains BPM/meter metadata; a stationary position does not expire it. Playing clocks still require a position within 1000 ms, and disconnected/unknown/invalid metadata does not dispatch. Grid with hold is invalid; legacy ms behavior is unchanged.

### Scheduler Contract

- **Lanes & Concurrency:** The queue is keyed by destination track object lane, capped at `MAX_TRACK_LANES = 64`.
- **Latest-Wins Policy:** When multiple triggers arrive for the same track lane, the latest scheduled trigger supersedes any pending trigger on that lane.
- **Timing & Lateness Window:** Timers sleep until the computed trigger beat. If execution delay exceeds `20 ms` past scheduled time, the trigger is dropped as `missed` with no catch-up note.
- **Guaranteed Note-Off:** Every started Note-On registers an active held voice with a release timer. On same-lane retrigger, the old timer is cancelled and its OFF completes before the replacement ON. The replacement gets its own full duration.
- **Safe Cancellation:** Transport stop, seek, loop jump, meter change, a stale or disconnected OSC clock, client disconnection, or mapping unbind/replacement cancels the affected pending triggers. Transport stop, a stale or disconnected clock (applied on the next OSC update), client disconnection, and unbind/replacement also release active scheduled voices. Seek, loop jump, and meter change only advance the clock epoch, so a voice already sounding ends at its own Note-Off.
- **Immediate notes:** `immediate` (Now) notes are not scheduled and do not follow the transport. A `pulse` ends at its own Note-Off and a `hold` at control release; unbind/replacement and client disconnection release them early.

### Vision Safe Loss

Temporary missing-hand or malformed-landmark frames hold the last real vision output and learned pose, including immediate/hold notes. A real pose change or release reconciles the edge once. Camera OFF, pagehide, Panic, unbind and socket disconnect retire vision notes and pending triggers. New vision mappings default to `neutralPolicy: 'hold'`; legacy vision `release` defaults migrate once to hold with `visionSafeLossVersion: 2`, while explicit `zero`/`center`/`custom`, newer deliberate `release`, and non-vision settings remain intact.

### Command Authorization (`testTriggerNote`)

- `testTriggerNote({ control, targetIndex })`: Live-write command executed only on saved mapping bindings.
- Evaluates within a trusted `CommandExecutionContext` (`clientId`, `isCurrent()`) created by the server from socket connection context (never from client request parameters).
- Authorized only for `controller` or `admin` roles; unauthorized or stale sessions are rejected.
