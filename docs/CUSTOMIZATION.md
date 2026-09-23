# Customization Guide

This guide explains where to change RC Surface without duplicating old code.
It is written for maintainers and contributors.

Read first:

- `CONTRIBUTING.md`
- `internal/README.md`

## Current Architecture

Backend:

- `src/extension.ts` - bootstrap only.
- `src/server/state.ts` - server lifecycle.
- `src/server/http.ts` - HTTP/static serving.
- `src/server/ws.ts` - WebSocket clients, dispatch, snapshot handling.
- `src/server/cert.ts` - self-signed cert generation and SAN checks.
- `src/live/mappings.ts` - command registry, mapping engine, curves, smoothing, and event modes.
- `src/live/safe-input.ts` - continuous takeover, loss states, and sensor filtering.
- `src/live/project-config.ts` - versioned `.rcsurface` profiles, semantic relink, atomic backup, and rollback.
- `src/live/state.ts` - playhead/live state loop.
- `src/server/autostart.ts` - whether the bridge takes the network at launch. Only the automatic start is gated; the panel's Start button never consults it.
- `src/ui/panel.ts` - Ableton panel dialogs.
- `src/runtime/safety.ts` - process safety handlers.

Frontend:

- `static/phone-v3/` - phone performance client.
- `static/panel/` - Ableton panel UI.
- `static/admin/` - admin dashboard.

All static clients are plain browser JS. No bundler. Tests live beside the static files.

## Development Loop

Install:

```powershell
npm install
```

Check:

```powershell
npm test
npx tsc --noEmit
```

Build:

```powershell
npm run build
npm run build:prod
npm run package
```

Hot reload:

- `static/**` change: refresh phone/panel browser.
- `src/**` change: rebuild, then disable/enable extension in Ableton Live.
- `npm run watch` can sync built files into Ableton AppData during development.

## Control Names

Control updates use:

```javascript
{ name: "pad-1", value: 1 }
```

Canonical groups:

- `pad-1` through `pad-12`
- `knob-1` through `knob-8`
- `fader-1` through `fader-8`
- `xy-1.x`, `xy-1.y`, `xy-2.x`, `xy-2.y`
- `toggle-1` through `toggle-4`
- `button-1` through `button-4`
- `sensor.motion.*`
- `sensor.orient.*`
- `sensor.audio.*`
- `sensor.vision.*`

Before adding a control:

1. Search current source.
2. Reuse existing owner.
3. Emit through existing snapshot/controls flow.
4. Add panel/admin target entry if user should map it.
5. Add tests.
6. Update this file if public.

## Phone Controls

Main files:

- `static/phone-v3/index.html` - DOM.
- `static/phone-v3/style.css` - layout and visuals.
- `static/phone-v3/app.js` - app state, WebSocket, sensors, snapshots.
- `static/phone-v3/controls.js` - touch controls.
- `static/phone-v3/mode-engine.js` - scalar mode behavior.
- `static/phone-v3/mapping-mode.js` - mobile MAP workflow and target editor.

Pad modes:

- A: momentary, releases to zero.
- B: hold/edit, keeps last value.
- C: toggle with editable max while held.
- D: burst, attack/release pulse.

If mode behavior changes, update:

- `static/phone-v3/mode-engine.js`
- `static/phone-v3/controls.js`
- `static/phone-v3/mode-engine.test.mjs`
- specific UI tests such as `static/phone-v3/stutter-mode.test.mjs`

## Mobile MAP Mode

The phone MAP workflow lets users create and edit mappings without
opening the Ableton panel. It uses the same backend command registry as
the panel/admin UI.

Main files:

- `static/phone-v3/index.html` - MAP button and overlay containers.
- `static/phone-v3/app.js` - `window.sendPhoneCommand`, command response
  callbacks, mapping-mode telemetry throttling, and WebSocket lifecycle
  events.
- `static/phone-v3/mapping-mode.js` - mobile mapping state, selection
  interception, target picker, presets, trigger-note flow, and rich editor.
- `static/phone-v3/style.css` - MAP highlighting, overlay, target tree,
  MIDI note controls, and curve editor visuals.
- `static/phone-v3/mapping-mode.test.mjs` and
  `static/phone-v3/mobile-ui.test.mjs` - static UI regressions.

Important behavior:

- MAP mode intercepts touch/click events during capture phase on
  `[data-name]` controls. Do not let normal performance gestures leak
  through while MAP is active.
- Visible performance controls are selected directly from the live UI.
  The fallback control list still includes sensors and all canonical
  controls.
- XY pads are mapped per axis: `xy-1.x`, `xy-1.y`, `xy-2.x`, `xy-2.y`.
- The target picker must preserve hierarchy: Song / Main / Master,
  Tracks, Return Tracks, devices, and parameters. Avoid flat lists for
  user-facing target selection.
- Targets can include `trackKind: "track" | "return" | "main"`. Preserve
  this field when adding mapping targets; backend routing depends on it.
- Trigger-note targets use `mode: "trigger_note"` with
  `type: "device_param"` for compatibility with the mapping engine.
  Identity is track + MIDI note, not device/parameter slot.
- Mappings are shared by control name across connected phones. Legacy
  `client-id::control` keys are migration input only: the mobile mapping layer
  folds them onto the canonical control and removes the scoped key on write.
  Always use the local `mappingKey()` helper rather than rebuilding keys.

Editor fields currently exposed on mobile:

- `mode`: `continuous`, `toggle`, `trigger_note`
- `curve`: `linear`, `exponential`, `logarithmic`, `s-curve`
- `targetScale`: `auto`, `linear`, `geometric`
- `inMin`, `inMax`, `outMin`, `outMax`
- `drive`, `compressor`, `smooth`, `threshold`
- `midiNote` via Pitch/Octave selectors
- `midiVelocity`
- `takeoverMode`: `scale` (default), `pickup`, or advanced `jump`
- `neutralPolicy` and `neutralValue` for signal-loss behavior

Unsupported/retired mapping modes are discarded on load and rejected on creation.

The curve canvas is a local visual preview of the mapping response. If
the backend curve implementation changes, update both the backend tests
and the mobile preview math.

## Safe Input Layer

Continuous mappings use soft takeover by default. The backend reads the
confirmed Live parameter value, starts at that value, and scales phone
movement until capture. A 500 ms host reconciliation loop re-arms takeover
when Live changes the target while the phone is idle. `jump` remains available
only as an explicit mapping or project preference.

Momentary pads, trigger notes, and stutters bypass takeover and release on
touch cancellation or disconnect. Toggle and LFO state is preserved. Sensor
loss uses a short hold followed by a smooth release to the mapping's neutral
value. Never delete a mapping as part of error recovery.

Phone-side safety primitives live in `static/phone-v3/safe-input-layer.js`:

- audio timeout, outlier rejection, hold/release, and smooth recovery;
- a 47-dimension static-pose descriptor combining 42 normalized landmark
  coordinates with five articulation dimensions for finger spread and thumb
  opposition;
- per-gesture tolerance learned from each slot's own takes, with the base
  threshold as a floor so calibration can only widen acceptance;
- gesture templates trained only in Learn mode and immutable in performance.

Hand-position smoothing lives in `static/phone-v3/vision-processor.js`, where
one One Euro filter design steadies X/Y/Z while opening its cutoff for fast
movement.

MediaPipe Hands and Camera Utilities are npm runtime dependencies copied into
`dist/static/phone-v3/vendor/mediapipe/` by the build. Vision therefore starts
without a CDN or internet connection after the extension has been built.

Motion/orientation values receive the same jitter and confirmed-spike filtering
in the backend before takeover and mapping dispatch.

## Set Project Profiles

Mappings and set-specific safety state are stored as schema-versioned
`.rcsurface` files under the extension storage `projects/` directory. Writes
are validated and atomic, and the previous file is retained as `.bak` for
rollback. Import/export commands provide portability between computers.

The current SDK does not expose the Live Set path or name. Association therefore
uses a semantic set fingerprint and target signatures (track/device/parameter
names, types, ranges, quantization, and positions). SDK handles are session IDs,
not persistent IDs, and are weighted only as weak diagnostics. High-confidence
matches relink automatically; medium or ambiguous matches require confirmation;
low-confidence targets remain preserved but disconnected.

## Vision

Vision is single-hand by design.

Files:

- `static/phone-v3/vision-processor.js`
- `static/phone-v3/vision-processor.test.mjs`
- `static/phone-v3/safe-input-layer.js`
- `static/phone-v3/app.js`
- `static/panel/app.js`

Runtime vision diagnostics:

- `sensor.vision.active`
- `sensor.vision.x`
- `sensor.vision.y`
- `sensor.vision.z`
- `sensor.vision.palm`
- `sensor.vision.face`
- `sensor.vision.fist`
- `sensor.vision.pinch`
- `sensor.vision.victory`
- `sensor.vision.rotateVal`
- `sensor.vision.open`
- `sensor.vision.fingers`
- `sensor.vision.pinch_x`
- `sensor.vision.pinch_y`
- `sensor.vision.pinch_z`
- `sensor.vision.color.r`
- `sensor.vision.color.g`
- `sensor.vision.color.b`
- `sensor.vision.gesture.1`
- `sensor.vision.gesture.2`
- `sensor.vision.gesture.3`

Public vision mapping controls are intentionally narrower: direct `x/y/z`,
the four opt-in detectors, `rotateVal`, Pinch Clutch `pinch_x/y/z`, and the
three numbered learned-pose slots. `active`, `palm`, `face`, finger counts,
individual fingers, handedness, and whole-frame RGB stay diagnostic and must
not be added to a picker merely because telemetry exists.

Do not reintroduce two-hand names from old plans unless the user asks for a new migration.

## Audio

Files:

- `static/phone-v3/audio-processor.js` — capture, the frame loop, and what is published.
- `static/phone-v3/audio-analysis-controls.js` — every analysis primitive, each one testable on its own.
- `static/phone-v3/audio-descriptors.js` — pure transient/kick/snare/brightness DSP: band-local rises against each band's own running energy, a soft knee for sensitivity, an exponential release and a response curve. `normalizeSettings` is the single clamp for every detector setting.
- `static/phone-v3/audio-spectral-descriptors.js` — eight defined spectral features.
- `static/shared/audio-descriptor-catalog.js` — shared mapping IDs, groups, three shades per family and Hz readout scales. Preserve catalog order and >=3:1 mark contrast against #0e0e0e. Descriptor curves and swatches are solid; their labelled legend toggles are the non-colour identifier.
- `static/phone-v3/audio-workspace.js`, `audio-timeline.js` — the twelve grouped cards, the single graph-view control and bounded selectable histories. The normalized views scale to the loudest visible curve and publish that ceiling on `#audio-timeline[data-scale]`; amplitude scales from RMS/envelope.
- `static/phone-v3/audio-descriptor-stream.js` — contiguous sample windows and reusable FFT buffers.
- `static/phone-v3/audio-descriptor-worklet.js` — continuous capture with one pending, acknowledged descriptor message.
- `static/phone-v3/style.css` — grouped flat arc dials (horizontal group scroll on short screens), a separate WINDOW toolbar.
- `static/phone-v3/audio-detector-timing.js` — quarter-note-based subdivisions for RELEASE/SMOOTH: 1/128..1/1, straight/triplet/dotted, sorted by duration. Saved `*Beats` choices and FREE `*Ms` values stay independent; app.js resolves fractional milliseconds when Live tempo/SYNC changes through the existing worklet settings path. DSP RELEASE supports 1.25..360000 ms (1/128 T at 1000 BPM through 1/1 D at 1 BPM); FREE UI stays 10..500 ms and SMOOTH 0..200 ms. Only labels round. Tempo updates preserve active dials. Band outputs remain linear RMS, not loudness-weighted.
- `static/phone-v3/audio-processor.test.mjs`, `audio-analysis-controls.test.mjs`
- `static/phone-v3/app.js`
- `static/panel/app.js`

### Fast descriptors

Transient measures a new attack; Kick and Snare weight it by low-band and
upper-band spectral energy. They are heuristics, not instrument classification.
Brightness preserves the logarithmic power centroid (100–12000 Hz); new
Centroid uses full-range magnitude weights. They are related, not duplicates
with identical scaling. New spectral definitions/units are in the
[User Guide](./USER-GUIDE.md#built-in-audio-detectors).
Timbre uses a 2N Hann window at hop N; attacks retain rectangular N. The
compatibility AnalyserNode uses Blackman (mean-square .3046), with band energy
corrected accordingly. No per-descriptor queue, automatic gain or lookahead.
The legacy `controls` packet accepts complete legacy4/current12 descriptor batches.
Negotiated `control_frame` shares one bounded clock across controls and audio;
`app.js` publishes the descriptor set atomically into that stream. New snapshots
set `controlsRealtime:true` and never actuate Live. Keep the legacy reader for
mixed versions; negotiate with `hello.controlStreamVersion=1` before switching.
Extend capture zero/reset, catalog, bounds and mapping dispatch together.
The fast descriptor path is independent of amplitude analysis and the general
30 Hz state snapshot. Continuous capture uses a descriptor-only AudioWorklet;
the labelled compatibility path falls back to animation-frame analysis.
Parameter writes are single-flight and retain only the newest destination.
Preserve that separation: added smoothing, UI painting,
or stale queued frames must not delay control delivery. Validate physical
microphone-to-Live latency separately; a DSP window is not an end-to-end result.

### Amplitude primitives

`audio-analysis-controls.js` retains only `HystereticGate`, `OnsetGate`
and `VelocityWindow` for the existing amplitude mapping sources. No tonal
analysis, note-hold, key estimator or audio BPM estimator remains.
Amplitude defaults no longer read the retired browser preferences.
Detector settings and musical timing live in the dedicated descriptor modules.

### Listening to a track

`static/RC-Audio-Sender.amxd`, generated by `scripts/build-audio-sender.js`
using the container reader in `scripts/amxd.js`. Regenerate rather than editing
the binary:

```powershell
node scripts/build-audio-sender.js static/RC-Midi-Receiver.amxd static/RC-Audio-Sender.amxd
```

It exists because the Extensions SDK exposes no audio: no meter, no buffer, no
stream, only an offline arrangement render. It communicates with `RC-Midi-Receiver.amxd`
over Max's internal send/receive bus (no UDP sockets), because a Max Audio Effect
cannot route MIDI to a track other than its own. This is an independent
track-listening path, not a source of browser audio descriptors.

Public audio mapping controls (all finite normalized `0..1` at the mapping boundary):

- `sensor.audio.rms`
- `sensor.audio.envelope`
- `sensor.audio.gate`
- `sensor.audio.attack`
- `sensor.audio.transient`
- `sensor.audio.kick`
- `sensor.audio.snare`
- `sensor.audio.brightness`
- `sensor.audio.{centroid,rolloff,flux,flatness,spread,low,mid,high}`

Prefer extending `sensor.audio.*` with normalized values rather than new namespaces.

## Mapping UI

Files:

- `static/panel/index.html`
- `static/panel/app.js`
- `static/panel/mappings.js`
- `static/panel/mappings.test.mjs`
- `static/phone-v3/mapping-mode.js`
- `static/phone-v3/mapping-mode.test.mjs`

Mapping UI must support:

- multiple targets per control;
- inline curve/range editing per target;
- conflict warnings without blocking `alert()`;
- replace flow that removes old mapping before setting new one;
- live graph update while dragging sliders.
- mobile-first binding through the phone MAP mode;
- trigger-note mappings with `RC-Midi-Receiver.amxd` reuse/manual fallback;
- normal tracks, return tracks, and main/master targets.

Do not add another modal if inline editing can solve it.

## Backend Commands

Command registry lives in `src/live/mappings.ts`.

Mobile MAP mode currently depends on these commands:

- `getTargets`
- `getMappings`
- `setMapping`
- `removeMapping`
- `getClients`
- `listPresets`
- `savePreset`
- `loadPreset`
- `deletePreset`
- `addUdpReceiverToTrack`

When adding a command:

1. Add handler in current command registry.
2. Keep args JSON-serializable.
3. Return diagnostic data, not only boolean success.
4. Add source-side test in `tests/*.test.mjs`.
5. Wire UI only after handler test passes.

## WebSocket Protocol

Typed phone messages such as `snapshot`, `ping`, and display-name updates are not Live commands.
Command envelopes are separate.

When adding a message type:

- update dispatch filtering in `src/server/ws.ts` if needed;
- preserve snapshot `controls[]` shape;
- add tests to avoid "foreign msg" log spam.

## Docs Checklist

Update docs when public behavior changes:

- Install/certs/network: `docs/INSTALL.md`, `docs/SECURITY.md`.
- Data flow/privacy: `docs/PRIVACY.md`.
- New controls/sensors: `docs/CUSTOMIZATION.md`, `README.md`.
