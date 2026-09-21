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
`maxHz(shape) = floor(teto_efetivo / minPointsPerCycle(shape))`. The ceiling
table above is the **fallback** for `teto_efetivo ≈ 50 escritas/s` (live
write-ceiling task P04 still pending as of 2026-09-17). When `teto_efetivo`
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
treating the table as its own is a bug: a face would draw a position the host
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
