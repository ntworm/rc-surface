# RC Surface

[![PolyForm Noncommercial](https://img.shields.io/badge/license-PolyForm--Noncommercial-blue.svg)](LICENSE)
[![v2.0.0](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/ntworm/rc-surface/releases)
[![CI](https://github.com/ntworm/rc-surface/actions/workflows/ci.yml/badge.svg)](https://github.com/ntworm/rc-surface/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/ntworm/rc-surface?style=social)](https://github.com/ntworm/rc-surface/stargazers)

**Português:** [README.pt-BR.md](README.pt-BR.md) · [página em português](https://ntworm.github.io/rc-surface/pt-br.html)

[**:globe_with_meridians: Live landing page**](https://ntworm.github.io/rc-surface/) — visual overview, install walkthrough, and feature showcase in your browser.

RC Surface is a source-available Ableton Live extension that turns a phone browser into a performance, mix, mapping, and sensor controller.

> [!WARNING]
> **Security Notice**: This extension runs a WebSocket server on your local network. Controller and admin actions require session tokens, but the bridge should still be used only on trusted networks. Do not share QR or admin URLs. See [SECURITY.md](docs/SECURITY.md) for the threat model.

The host side is built on the Ableton Extensions SDK. The phone side is plain browser JavaScript: no native app, no bundler, no install on the phone.

**2.0.0 breaks compatibility:** previous project profiles, presets, mappings and browser performance settings are not imported. Configure this version from a fresh state in `storageDirectory/surface-v2/` (schema 2). Existing 1.x files are not deleted.

Eight uniform toggles start in Global. Square is the single 0-to-depth pulse waveform, with swing/ratchet in Advanced; there is no separate Stutter option. CFG hides touch-owned rate/depth and filters subdivisions by the actual ceiling. Both physics XY panels have trails and frame-independent friction. Live waveform changes retain activation, including Square, and visual fill uses transforms instead of resizing every frame.

CFG waveform, mode and timing use direct buttons. Subdivision opens a compact note-value/rhythm editor for the effective waveform in SYNC; FREE hides it. Static XY hides physics settings while retaining them for a later switch. Toggle values fill the whole width in their mode colour.

Seven pages: **PERF / MIX / SNP / SNS / AUD / VID / REC**. **MAP** is an overlay; **AUT**, in the PERF header, records independent XY movements after a 3–2–1 countdown in SYNC (1–5 bars) or FREE (1–30 seconds in steps of one second). REC selects **ARRANGEMENT / CLIP**: a marker timeline with a bar/beat grid, Zoom, START/END (`1–10` passes or `∞`, or FREE until STOP) and pre-roll OFF/1/2/4 for Arrangement, or one empty Session scene across every armed input with native 1/2/4/8/16-bar length, launch quantization and `BACK TO ARR`. Both views share track cards with ARM MULTI/EXCLUSIVE, SOLO, MUTE, live volume knobs and double-click inline rename. VID supports up to fifteen pose cards, 3–6 captures per pose, RETAKE/KEEP review, contextual tracking-loss policy and real PALM/FACE mapping inputs.

## Highlights

- 12 performance pads with modes A/B/C/D.
- Two identical XY panels, each independently configurable as Static or Physics (friction, bounce and speed) with independent gesture loop automation (`AUT`).
- Eight configurable LFO slots (`toggle-1`..`toggle-8`), each with Square among its waveforms, and performance utility controls (CAP, OFF, 4 snapshot slots).
- Seventh **REC** page for Arrangement and Session **CLIP** recording directly from the phone.
- Phone sensors: motion, orientation, audio, and optional camera hand tracking
  via bundled MediaPipe Hands (no CDN).
- Single-hand vision tracking by design, with up to 15 learned poses (`G1`–`G15`) and continuous `X / Y / Z / PALM / FACE` mapping inputs.
- Contextual CALIBRATE on SNS/AUD/VID: stable posture, audio-control response,
  and camera lighting/tracking checks, with independent states and reset.
- Phone **MAP** mode for binding controls to Live parameters (**Bind**), sending MIDI notes to a selected MIDI track through the included Max for Live receiver (**Trigger Note**), or firing Session clips, advancing clip lists, and stopping tracks with optional *After it starts* continuation rules (**Launch Clip**).
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

## Performance 2.0

- **Config Mode (CFG):** configure each LFO slot (T1–T8), including Square as a waveform, and choose Static or Physics independently for each XY. Physics has separate friction, bounce and speed. Pad modes, knob sensitivity and fader reset values remain configurable. Open `CFG` in the phone header; hold it to clear overrides. Performance settings use `ableton-rc:v3:control_config` and are included in new projects and presets.
- **Individual pad CFG:** follows its effective A/B/C/D mode: A touch level, B optional tap-to-zero, C remembered or fixed On level, plus drag travel/response in A/B/C. D has its own sync/free length, attack and peak. Pad settings round-trip in projects, presets and snapshots; output level is not MIDI velocity. A second right-click on the same control closes CFG.
- **Arrangement & Session REC (`REC`):** switch between **ARRANGEMENT / CLIP**. In Arrangement, use the scaled bar/beat timeline with `ZOOM`, `START` at the cursor or a locator, optional `END` (`1–10` passes or `∞`) or `FREE` (until `STOP`), and `PRE-ROLL` (`OFF / 1 / 2 / 4` bars). In `CLIP`, record an explicitly empty Session scene across all armed inputs with native `1 / 2 / 4 / 8 / 16`-bar length, `Global / None / 1 bar / 1 beat` launch quantization, and `BACK TO ARR` when the Session is idle. Track cards show observed `ARM` (`ARM MULTI` or `EXCLUSIVE`), `SOLO`, `MUTE`, live `270°` volume knobs operable during recording, and inline double-click track rename. `STOP` has priority and keeps your inputs armed for the next take.
- **XY Gesture Loops (`AUT`):** tap `AUT` in the `PERF` header to record and loop movements independently on `XY 1` and `XY 2` after a `3–2–1` countdown, synced to Live (`1–5 bars`) or free (`1–30 seconds`). Hold an XY for `0.6 s` (or right-click on desktop) with `AUT` active to open its loop settings; changing loop length discards that XY's recording. `AUT` repeats control movements and does not write native Live arrangement automation.
- **Safer touch editing (`0.6 s` hold):** on touch screens, MAP response-curve points and Mode D Burst peak handles unlock only after a `0.6 s` hold, preventing accidental edits while scrolling. Double-tap resets.
- **Contextual header:** `AUT` appears only on `PERF`, `CFG` on `PERF` and `MIX`, `CALIBRATE` on `SNS / AUD / VID`, and `MAP` on all pages except `REC`. Shared buttons keep fixed positions across tabs and `STAGE / EXIT` stays visible.
- **Expanded Vision (`VID`) & MIDI Thru:** `+ ADD POSE` grows the pose bank from 3 to 15 cards (`3–6` captures per pose, `RETAKE / KEEP` conflict review, local finger-bend evidence, and contextual tracking-loss policy: hold, timed hold default `10 s`, or release). `PALM` and `FACE` (palm/back orientation, not facial tracking) join `X / Y / Z` as normalized `0–1` `MAP` inputs. `RC-Midi-Receiver.amxd` passes upstream MIDI through byte-for-byte (`midiin → midiout`) alongside Trigger Note.
- **LFO waveform preview:** the SYNC settings modal draws the active LFO shape (sine, triangle, ramp up, ramp down, square) so you can see the curve you are about to push to Live, including the locked 32-beat subdivision and the per-control ceiling (sine tops at 4 Hz, square at 15 Hz).
- **Desktop keyboard control:** every continuous control (knob, fader, XY pad, toggle, square) accepts keyboard nudges while the phone client has focus, so the desktop mapping panel and the phone UI share the same gesture model.
- **K-weighted loudness:** the AUD tab reports ITU-R BS.1770 K-weighted momentary, short-term and integrated loudness, alongside the existing twelve descriptors.

## AbletonOSC Integration (Transport Lite & Deep Sync)

RC Surface includes built-in optional integration with **AbletonOSC** to enable recording, clip launch, advanced transport, and beat synchronization directly from the mobile client:

- **Transport Lite (`TRN`)**: Tap `TRN` in the header topbar to open the transport overlay. Uses a two-row header: `PLAY / STOP / PREV / NEXT`, followed by `CLICK` (shared metronome, never locked by `REC`), Live's `Global Quantization` (read from the Set on opening), and `REFRESH`, above a searchable locator list.
- **Visual Metronome**: The `TRN` button rhythmically flashes in sync with Ableton Live's playback beat (Beat 1 flashes green, other beats flash blue).
- **Deep Sync Settings**: Tap the gear icon (`⚙`) next to `SYNC` (or long-press `SYNC`) to open the Deep Sync Settings panel. Select Clock Source (AbletonOSC, SDK BPM Simulator, or Free/Internal), and configure subdivisions, phase offsets, swing, and shapes for LFOs and Squares. Settings are persisted in local storage.
- **Selected Target Picker Helper**: Tap `Selected in Live` in the mobile parameter mapping view to automatically query the selected track and device from the host and pre-populate the search filter.

To use the AbletonOSC features, ensure the **AbletonOSC** extension is running in Ableton Live (outgoing port `11000`, incoming port `11001`). The extension automatically detects its presence, updates the status (`SYNCED` / `SDK` / `FREE`), and automatically moves its listener back to port `11001` once freed if another extension briefly held it at startup.

## Release status

The current release is **2.0.0**. Install `RC-Surface-2.0.0.ablx` from the GitHub Releases page and verify it with `SHA256SUMS.txt`. Configuration starts fresh in `storageDirectory/surface-v2/` (schema 2); see `docs/INSTALL.md` for the breaking upgrade.

## Quick Start

1. Install Ableton Live 12.4.5+ Suite (Beta) with Extensions SDK support.
2. Download `RC-Surface-2.0.0.ablx` (and `RC-Midi-Receiver.amxd` if using Trigger Note) from [Releases](https://github.com/ntworm/rc-surface/releases), or build it locally with
   `npm run build:prod-ablx`.
3. Install the `.ablx` in Live.
4. Open RC Surface from the Extensions menu.
5. Scan the Performance QR code with the phone.
6. Accept the self-signed certificate warning once.
7. Use the phone controller to perform. The built-in **MIX** tab inside
   the phone client handles eight knobs and eight faders.
8. Tap **MAP** near the BPM display to bind phone controls to Live parameters (**Bind**),
   trigger fixed MIDI notes (**Trigger Note**), or fire Session clips (**Launch Clip**).

Detailed setup lives in `docs/INSTALL.md`.

## Documentation

- `internal/README.md` - canonical documentation index.
- `docs/USER-GUIDE.md` - how to use the phone controller (modes, gestures, mobile mapping, snapshots, calibration, Stage mode).
- `docs/INSTALL.md` - install, certificates, phone connection, troubleshooting.
- `docs/CUSTOMIZATION.md` - controls, sensors, mappings, audio, vision, UI extension points.
- [historical reference](https://github.com/ntworm/rc-surface/blob/main/internal/PESQUISA_CELULAR_GESTUAL.md) - research and roadmap evidence for expressive phone control.
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
- `toggle-1` through `toggle-8`
- `sensor.motion.*`
- `sensor.orient.*`
- `sensor.audio.rms`
- `sensor.audio.envelope`
- `sensor.audio.gate`
- `sensor.audio.attack`
- `sensor.audio.{transient,kick,snare,brightness,centroid,rolloff,flux,flatness,spread,low,mid,high}`
- `sensor.vision.{x,y,z,palm,face,fist,pinch,victory,rotateVal,open}`
- `sensor.vision.{pinch_x,pinch_y,pinch_z}`
- `sensor.vision.gesture.1` through `sensor.vision.gesture.15`

`sensor.vision.palm` (hand scale) and `sensor.vision.face` (palm/back orientation, normalized `0–1`) are public mapping inputs. Presence (`active`), finger curl detail and whole-frame RGB colour remain internal diagnostics, not public mapping inputs.

Vision is single-hand. Do not add left/right hand control names without an explicit migration plan.

## Security

Phone camera and microphone require HTTPS. The extension generates a per-install self-signed certificate and includes current LAN IPs in the certificate SAN list.

Traffic stays on the local network. The supported deployment is a trusted
studio/home LAN; public tunnels, port forwarding, and public reverse proxies
are outside the v2.0 support and threat model. Write commands require rotating
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
- AbletonOSC is optional for core parameter mappings, but required for `REC`, `Launch Clip`, `AUT` in `SYNC`, Deep Sync, and locator transport.
- MIDI trigger notes require `RC-Midi-Receiver.amxd` in the Ableton User Library.

## License

PolyForm Noncommercial 1.0.0 — free for noncommercial use, redistribution,
and modification; commercial sale of this software or modified versions is
not permitted. See [LICENSE](LICENSE) for the full text and Required Notice.
© Gabriel Worm · <https://github.com/ntworm/rc-surface>.

Ableton and Live are trademarks of Ableton AG. RC Surface is an independent
project, not affiliated with, endorsed by, or sponsored by Ableton AG.
