# RC Surface

[![PolyForm Noncommercial](https://img.shields.io/badge/license-PolyForm--Noncommercial-blue.svg)](LICENSE)
[![v2.0.0](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/ntworm/rc-surface/releases)
[![CI](https://github.com/ntworm/rc-surface/actions/workflows/ci.yml/badge.svg)](https://github.com/ntworm/rc-surface/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/ntworm/rc-surface.svg?style=social)](https://github.com/ntworm/rc-surface/stargazers)

**Português:** [README.pt-BR.md](README.pt-BR.md) · [página em português](https://ntworm.github.io/rc-surface/pt-br.html)

[**:globe_with_meridians: Live landing page**](https://ntworm.github.io/rc-surface/) — interactive surface map, install walkthrough, and workflow reference.

**RC Surface** is a source-available Ableton Live 12 extension that turns any phone or tablet browser on your local network into a low-latency performance controller, mixer, multi-sensor modulator, and recording station.

The host runs inside Ableton Live on the official Extensions SDK; the phone client runs in plain browser JavaScript over local HTTPS/WSS with zero app install.

## Overview

The mobile interface is organized into **seven pages** plus **four contextual header modes**:

| Surface | Role |
| :--- | :--- |
| **`PERF`** | 12 velocity/pressure pads (modes A/B/C/D), two Static/Physics XY pads, 8 synced LFO/Square toggles (`T1`–`T8`), and 4 quick snapshot slots. |
| **`MIX`** | 8 mappable rotary knobs (`270°` arc) and 8 mappable full-height faders. |
| **`SNP`** | 16 snapshot slots for instant recall of surface control states. |
| **`SNS`** | Phone motion (accelerometer/gyroscope) and 3D orientation sensors with posture calibration. |
| **`AUD`** | Real-time microphone analysis with 12 spectral/band-onset descriptors and ITU-R BS.1770 K-weighted loudness. |
| **`VID`** | Local single-hand camera tracking (bundled MediaPipe Hands) with continuous `X / Y / Z / PALM / FACE` inputs and up to 15 learned poses (`G1`–`G15`). |
| **`REC`** | Arrangement & Session recording station (**ARRANGEMENT / CLIP**) with marker timeline, pre-roll, loop passes, and live track arm/solo/mute/volume cards. |
| **`MAP` · `TRN` · `AUT` · `CFG`** | Header overlays for on-phone mapping (**Bind**, **Trigger Note**, **Launch Clip**), transport/locators (`TRN`), XY gesture loops (`AUT`), and per-control configuration (`CFG`). |

## Performance 2.0

- **Arrangement & Session REC (`REC`):** switch between **ARRANGEMENT / CLIP**. Record Arrangement takes along a scaled bar/beat marker timeline with `ZOOM`, `START / END` (`1–10` passes, `∞`, or `FREE` until `STOP`), and `PRE-ROLL` (`OFF / 1 / 2 / 4` bars), or capture an empty Session scene across all armed tracks (`1 / 2 / 4 / 8 / 16` bars, launch quantization, and `BACK TO ARR`). Track cards provide `ARM MULTI / EXCLUSIVE`, `SOLO`, `MUTE`, live `270°` volume knobs, and double-click inline track rename.
- **XY Gesture Loops (`AUT`):** record and loop movements independently on `XY 1` and `XY 2` after a `3–2–1` countdown, synced to Live (`1–5 bars`) or free (`1–30 seconds`).
- **On-Phone Mapping (`MAP`):** bind any touch or sensor source to Live parameters (**Bind**), trigger quantized MIDI notes via `RC-Midi-Receiver.amxd` (**Trigger Note**), or fire Session clips and clip-advance rules (**Launch Clip**). Touch response-curve and Burst handles require a `0.6 s` hold so scrolling never alters a value.
- **Config Mode (CFG):** customize individual pads (modes A/B/C/D and Mode D burst timing), `T1`–`T8` modulators, and independent Static/Physics XY behavior (friction, bounce, speed, trails).
- **LFO waveform preview:** inspect the active modulator shape (sine, triangle, ramp up, ramp down, square pulse with swing/ratchet) and rate ceiling in the SYNC modal before sending to Live.
- **Expanded Vision (`VID`) & MIDI Thru:** train up to 15 custom hand poses (`3–6` captures per pose, `RETAKE / KEEP` conflict review, configurable tracking-loss hold/release) and map normalized `PALM` and `FACE` orientation. `RC-Midi-Receiver.amxd` passes upstream MIDI through byte-for-byte (`midiin → midiout`).
- **K-weighted loudness:** monitor momentary, short-term, and integrated loudness alongside 12 spectral and band-isolated attack descriptors on `AUD`.
- **Desktop keyboard control:** nudge any continuous control (knob, fader, XY pad, toggle, square) from the keyboard when the client has focus.

## Quick Start

1. **Requirements:** Ableton Live 12.4.5+ Suite (Beta) with Extensions SDK support, a modern mobile browser on the same trusted Wi-Fi/LAN, and optional **AbletonOSC** (ports `11000` / `11001`) for `REC`, `Launch Clip`, `TRN`, and beat sync.
2. **Download:** grab `RC-Surface-2.0.0.ablx` and `RC-Midi-Receiver.amxd` (plus optional `RC-Audio-Sender.amxd`) from [Releases](https://github.com/ntworm/rc-surface/releases) and verify with `SHA256SUMS.txt`.
3. **Install:** double-click `RC-Surface-2.0.0.ablx` to install in Live (restart Live if already open), then enable **RC Surface** under *Options → Preferences → Extensions*.
4. **Connect:** open the RC Surface panel in Live, scan the QR code with your phone, and accept the local self-signed HTTPS certificate once.
5. **Play & Map:** use the 7 surface tabs to perform, or tap **MAP** in the header to bind parameters, trigger MIDI notes, or launch clips.

> **Upgrading from 1.x:** RC Surface `2.0.0` stores projects, presets, and mappings in `storageDirectory/surface-v2/` (schema 2). Configure 2.0 from a fresh state; existing 1.x files are left untouched. See [`docs/INSTALL.md`](docs/INSTALL.md) for full setup details.

## Documentation

- [User Guide](docs/USER-GUIDE.md) — surface tabs, gestures, mapping modes, snapshots, calibration, and Stage mode.
- [Installation Guide](docs/INSTALL.md) — certificates, LAN setup, companion Max for Live devices, and troubleshooting.
- [Customization & Control Catalog](docs/CUSTOMIZATION.md) — complete control name catalog (`pad-*`, `knob-*`, `fader-*`, `xy-*`, `toggle-*`, `sensor.*`) and extension points.
- [Compatibility](docs/COMPATIBILITY.md) · [Contracts](docs/CONTRACTS.md) · [FAQ](docs/FAQ.md)
- [Security Policy](docs/SECURITY.md) · [Privacy](docs/PRIVACY.md) · [Contributing](CONTRIBUTING.md)
- [Internal Documentation Index](internal/README.md) · [Tester Guide](internal/TESTER-GUIDE.md)

## Development

Requires **Node.js 24.16.0** (Node 24.x) and the Ableton Extensions SDK/CLI tarballs (`1.0.0-beta.0`) placed in `vendor/` (see `vendor/README.md`).

```powershell
npm run check:vendor
npm ci
npm test
npm run lint
npm run ci
npm run build:prod-ablx
```

## Security & Limitations

> [!WARNING]
> **Security Notice**: RC Surface runs an HTTPS/WebSocket server on your local network. Controller and admin actions require rotating session tokens, but the bridge is designed strictly for trusted home or studio networks. Do not expose ports to the public internet or share session QR codes/URLs. See [SECURITY.md](docs/SECURITY.md) for the full threat model.

- **Local Processing:** camera frames and microphone audio are analyzed locally in the phone browser; raw media never leaves the device.
- **AbletonOSC Scope:** core parameter bindings and sensors work standalone via the Extensions SDK; `REC`, `Launch Clip`, `AUT` in `SYNC`, Deep Sync, and locator transport require AbletonOSC.
- **Max for Live Devices:** `Trigger Note` requires `RC-Midi-Receiver.amxd` on the target MIDI track. Replace any legacy v1 receiver instances in older Sets so no unauthenticated UDP port remains open.

## License

PolyForm Noncommercial 1.0.0 — free for noncommercial use, redistribution, and modification; commercial sale of this software or modified versions is not permitted. See [LICENSE](LICENSE) for the full text and Required Notice.
© Gabriel Worm · <https://github.com/ntworm/rc-surface>.

Ableton and Live are trademarks of Ableton AG. RC Surface is an independent project, not affiliated with, endorsed by, or sponsored by Ableton AG.
