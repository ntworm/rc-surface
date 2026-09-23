# RC Surface

[![PolyForm Noncommercial](https://img.shields.io/badge/license-PolyForm--Noncommercial-blue.svg)](LICENSE)
[![v1.0.0](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/ntworm/rc-surface/releases)
[![CI](https://github.com/ntworm/rc-surface/actions/workflows/ci.yml/badge.svg)](https://github.com/ntworm/rc-surface/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/ntworm/rc-surface?style=social)](https://github.com/ntworm/rc-surface/stargazers)

[**:globe_with_meridians: Live landing page**](https://ntworm.github.io/rc-surface/) — visual overview, install walkthrough, and feature showcase in your browser.

RC Surface is a source-available Ableton Live extension that turns a phone browser into a performance, mix, mapping, and sensor controller.

> [!WARNING]
> **Security Notice**: This extension runs a WebSocket server on your local network. Controller and admin actions require session tokens, but the bridge should still be used only on trusted networks. Do not share QR or admin URLs. See [SECURITY.md](docs/SECURITY.md) for the threat model.

The host side is built on the Ableton Extensions SDK. The phone side is plain browser JavaScript: no native app, no bundler, no install on the phone.

## Highlights

- 12 performance pads with modes A/B/C/D.
- Two XY pads: one standard/direct (`xy-1`) and one physics joystick (`xy-2`).
- 4 LFO toggles (`toggle-1`..`toggle-4`), 4 stutter buttons (`button-1`..`button-4`), and performance utility controls (CAP, OFF, 4 snapshot slots).
- Phone sensors: motion, orientation, audio, and optional camera hand tracking
  via bundled MediaPipe Hands (no CDN).
- Single-hand vision tracking by design.
- Contextual CALIBRATE on SNS/AUD/VID: stable posture, audio-control response,
  and camera lighting/tracking checks, with independent states and reset.
- Phone **MAP** mode for binding controls to Live parameters without leaving
  the mobile interface.
- Mobile trigger-note mappings for sending MIDI notes to a selected MIDI track
  through the included Max for Live receiver.
- Twelve audio descriptors: attacks, brightness, centroid, flux, flatness,
  spread, 95% rolloff and low/mid/high RMS. Each attack is measured inside its
  own band against that band's recent energy, so a kick and a hat drive
  different controls. Grouped cards, selectable history curves and a small set
  of group knobs (sensitivity, release, curve, smoothing, analysis window).
- Target-aware mapping ranges, geometric frequency travel, quantized clamping,
  and single-flight latest-value parameter writes; Smooth 0 adds no hidden ramp.
- Realtime control independent of MAP telemetry, with immediate first delivery
  and bounded 8 ms batching. Actual end-to-end latency still requires measurement.
- Live AUD history with selectable curves, twelve descriptors and grouped
  controls; browser audio-input selection with explicit disconnect/error feedback.
- Panel UI with a local QR code, live controls, CPU telemetry, and mapping editor.
- Built-in phone **MIX** tab with eight mappable knobs and eight mappable faders.
- Bidirectional HTTPS/WSS transport on the local network.
- Modular TypeScript backend with `src/extension.ts` as bootstrap only.

## 1.0 Highlights

- **Config Mode (CFG):** per-instance overrides for performance controls: pad modes (A/B/C/D), stutter modes (A/B/C/D), LFO waveform shapes, knob drag ranges, fader double-tap reset values, and XY 2 physics (friction, bounce). Open `CFG` from the phone header (long-press `CFG` to clear all overrides) or right-click a control on the desktop mapping panel to open a per-instance menu. Settings persist per control in `localStorage` under `ableton-rc:control_config`.
- **LFO waveform preview:** the SYNC settings modal draws the active LFO shape (sine, triangle, ramp up, ramp down, square) so you can see the curve you are about to push to Live, including the locked 32-beat subdivision and the per-control ceiling (sine tops at 4 Hz, square at 12 Hz).
- **Desktop keyboard control:** every continuous control (knob, fader, XY pad, toggle, stutter) accepts keyboard nudges while the phone client has focus, so the desktop mapping panel and the phone UI share the same gesture model.
- **K-weighted loudness:** the AUD tab reports ITU-R BS.1770 K-weighted momentary, short-term and integrated loudness, alongside the existing twelve descriptors.

## AbletonOSC Integration (Transport Lite & Deep Sync)

RC Surface includes built-in optional integration with **AbletonOSC** to enable advanced transport and beat synchronization directly from the mobile client:

- **Transport Lite**: Tap the `TRN` button in the header topbar to open a full-screen transport overlay. Control Play, Stop, Prev/Next locator, and trigger locator jumps. Includes a search input to filter locators list dynamically.
- **Visual Metronome**: The `TRN` button rhythmically flashes in sync with Ableton Live's playback beat (Beat 1 flashes green, other beats flash blue).
- **Deep Sync Settings**: Tap the gear icon (`⚙`) next to `SYNC` (or long-press `SYNC`) to open the Deep Sync Settings panel. Select Clock Source (AbletonOSC, SDK BPM Simulator, or Free/Internal), and configure subdivisions, phase offsets, swing, and shapes for LFOs and Stutters. Settings are persisted in local storage.
- **Selected Target Picker Helper**: Tap `Selected in Live` in the mobile parameter mapping view to automatically query the selected track and device from the host and pre-populate the search filter.

To use the AbletonOSC features, ensure the **AbletonOSC** extension is running in Ableton Live (outgoing port `11000`, incoming port `11001`). The extension automatically detects its presence and updates the status (`SYNCED` / `SDK` / `FREE`).

## Candidate status

The source version is 1.0.0; this worktree produces a local Browser release
candidate, not a declaration that a public v1.0.0 release exists. Native Track
and measured end-to-end latency remain pending owner validation.

## Quick Start

1. Install Ableton Live 12.4.5+ Suite (Beta) with Extensions SDK support.
2. Obtain the local test candidate or an asset from [Releases](https://github.com/ntworm/rc-surface/releases), or build it with
   `npm run build:prod-ablx`.
3. Install the `.ablx` in Live.
4. Open RC Surface from the Extensions menu.
5. Scan the Performance QR code with the phone.
6. Accept the self-signed certificate warning once.
7. Use the phone controller to perform. The built-in **MIX** tab inside
   the phone client handles eight knobs and eight faders.
8. Tap **MAP** near the BPM display to bind phone controls to Live parameters,
   including the twelve built-in audio descriptors, or trigger fixed MIDI notes.

Detailed setup lives in `docs/INSTALL.md`.

## Documentation

- `internal/README.md` - canonical documentation index.
- `docs/USER-GUIDE.md` - how to use the phone controller (modes, gestures, mobile mapping, snapshots, calibration, Stage mode).
- `docs/INSTALL.md` - install, certificates, phone connection, troubleshooting.
- `docs/CUSTOMIZATION.md` - controls, sensors, mappings, audio, vision, UI extension points.
- `internal/PESQUISA_CELULAR_GESTUAL.md` - research and roadmap evidence for expressive phone control.
- `docs/FAQ.md` - common user questions.
- `docs/PRIVACY.md` - local data flow.
- `docs/SECURITY.md` - threat model and certificate policy.
- `internal/TESTER-GUIDE.md` - tester checklist, bug-report template, install flow.
- `CONTRIBUTING.md` - development workflow and source map.

## Architecture

Backend:

```text
src/
  extension.ts          bootstrap: activate/deactivate
  context.ts            SDK context access
  runtime/safety.ts     runtime exception handlers
  ui/panel.ts           Ableton panel dialogs
  util/                 helpers and CPU sampling
  server/               HTTP, HTTPS, WebSocket, certs, client ids
  live/                 mappings, commands, Live state
```

Static clients:

```text
static/
  phone-v3/             phone performance client
  panel/                Ableton panel UI
  admin/                admin dashboard
```

Tests:

```text
static/**/*.test.mjs
scripts/*.test.mjs
tests/*.test.mjs
```

## Development

Requirements:

- Node.js 24.16.0 (the supported release line is Node 24.x).
- Ableton Live 12.4.5+ Suite (Beta) with Extensions SDK support.
- The Ableton Extensions SDK and CLI tarballs (`1.0.0-beta.0`), obtained from
  Ableton and placed in `vendor/`. They are licensed material and are not
  tracked in this repository; the README inside `vendor/` explains how to obtain
  and verify them.

Commands:

```powershell
npm run check:vendor
npm ci
npm test
npx tsc --noEmit
npm run build
npm run ci
npm run build:prod-ablx
```

Hot reload:

- `static/**` changes: refresh the panel or phone browser.
- `src/**` changes: rebuild, then disable/enable the extension in Ableton Live.
- `ABLETON_RC_DEV_SYNC=1 npm run watch` opts into syncing builds to Ableton
  AppData during development. Normal builds never overwrite installed files.

## Current Control Names

Common groups:

- `pad-1` through `pad-12`
- `knob-1` through `knob-8`
- `fader-1` through `fader-8`
- `xy-1.x`, `xy-1.y`, `xy-2.x`, `xy-2.y`
- `toggle-1` through `toggle-4`
- `button-1` through `button-4`
- `sensor.motion.*`
- `sensor.orient.*`
- `sensor.audio.rms`
- `sensor.audio.envelope`
- `sensor.audio.gate`
- `sensor.audio.attack`
- `sensor.audio.{transient,kick,snare,brightness,centroid,rolloff,flux,flatness,spread,low,mid,high}`
- `sensor.vision.{x,y,z,fist,pinch,victory,rotateVal,open}`
- `sensor.vision.{pinch_x,pinch_y,pinch_z}`
- `sensor.vision.{gesture.1,gesture.2,gesture.3}`

Palm size, palm-facing sign, finger detail and whole-frame colour are diagnostics,
not public mapping inputs.

Vision is single-hand. Do not add left/right hand control names without an explicit migration plan.

## Security

Phone camera and microphone require HTTPS. The extension generates a per-install self-signed certificate and includes current LAN IPs in the certificate SAN list.

Traffic stays on the local network. The supported deployment is a trusted
studio/home LAN; public tunnels, port forwarding, and public reverse proxies
are outside the v1.0 support and threat model. Write commands require rotating
controller or admin credentials; treat generated QR codes and URLs as secrets.

Private keys are not bundled in `.ablx` packages.

Receiver v2 uses the selected track's SDK parameter for Trigger Note and
opt-in internal Max messages for the standalone Audio Sender; neither device
opens UDP. Replace old instances in saved Sets: the previous Receiver still
exposes unauthenticated UDP `9000` until unloaded. See the
[v2 migration and legacy protection](docs/SECURITY.md#bundled-max-devices--v2-migration).
The v2 transport still requires Live routing/latency acceptance.

Core controls and camera hand tracking run on the local network. MediaPipe
Hands runtime/model files are bundled with the extension. Raw camera frames
are processed in the phone browser and are not sent by this project.

## Release Validation

Automated tests, typecheck, production build, `.ablx` packaging, and tester
kit packaging are covered by repository scripts. Final publication still
requires manual validation in Ableton Live and on real iOS/Android devices;
see `internal/TESTER-GUIDE.md`.

## Current limitations

- Follow Detected Note, tonal controls and its diagnostic lab were removed after unreliable musical results. Supported MIDI Trigger and independent Max devices remain available.
- Kick and Snare are spectral onset heuristics, not instrument recognition.
  Total microphone-to-Live latency must be measured on the actual setup.

- Final release validation still needs Ableton Live and real phone hardware.
- AbletonOSC is optional but required for Deep Sync and locator transport.
- MIDI trigger notes require `RC-Midi-Receiver.amxd` in the Ableton User Library.

## License

PolyForm Noncommercial 1.0.0 — free for noncommercial use, redistribution,
and modification; commercial sale of this software or modified versions is
not permitted. See [LICENSE](LICENSE) for the full text and Required Notice.
© Gabriel Worm · <https://github.com/ntworm/rc-surface>.

Ableton and Live are trademarks of Ableton AG. RC Surface is an independent
project, not affiliated with, endorsed by, or sponsored by Ableton AG.
