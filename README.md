# RC Surface

[![PolyForm Noncommercial](https://img.shields.io/badge/license-PolyForm--Noncommercial-blue.svg)](LICENSE)
[![v2.1.0](https://img.shields.io/badge/version-2.1.0-blue.svg)](https://github.com/ntworm/rc-surface/releases/tag/v2.1.0)
[![CI](https://github.com/ntworm/rc-surface/actions/workflows/ci.yml/badge.svg)](https://github.com/ntworm/rc-surface/actions/workflows/ci.yml)

**Português:** [README.pt-BR.md](README.pt-BR.md) · [página em português](https://ntworm.github.io/rc-surface/pt-br.html)

[Live landing page](https://ntworm.github.io/rc-surface/): interactive surface map, install walkthrough and workflow reference.

RC Surface is an extension for Ableton Live 12 that serves a control surface in the browser of a phone or tablet. It does the work of a hardware controller: pads, knobs, faders, XY pads, mixer, transport and recording. It takes the phone's motion sensors, microphone and camera as control sources. The extension runs inside Live on the official Extensions SDK. It serves the surface over local HTTPS/WSS, and the phone client runs in plain browser JavaScript.

## Requirements

- Ableton Live 12.4.5+ Suite (Beta) with the official Extensions SDK.
- A phone or tablet on the same trusted Wi-Fi/LAN: iOS 15.4+ Safari or Chromium on Android, held in landscape.
- **AbletonOSC** (UDP `11000` / `11001`), optional: core parameter bindings and sensors work without it; `REC`, `Launch Clip`, `TRN`, `AUT` in `SYNC` and Deep Sync need it.

## Quick start

1. **Download.** `RC-Surface-2.1.0.ablx` and `RC-Midi-Receiver.amxd` (plus the optional `RC-Audio-Sender.amxd`) from the [2.1.0 release](https://github.com/ntworm/rc-surface/releases/tag/v2.1.0). Verify the files with `SHA256SUMS.txt`.
2. **Install.** Double-click `RC-Surface-2.1.0.ablx` to install in Live (restart Live if it is open), then enable **RC Surface** under *Options → Preferences → Extensions*.
3. **Connect.** Open the RC Surface panel in Live and scan the QR code with the phone. Install the certificate authority of this computer once, from the plain page at the HTTPS port + 1; the **Certificate** section of the **Network** tab links that page. If the phone does not open the page, open the **Network** tab: it shows the address the QR code uses and has **FIND SETUP**.
4. **Control.** Use the seven surface tabs to control Live. Tap **MAP** in the header to bind parameters, trigger MIDI notes or launch clips.

> **Storage:** RC Surface stores projects, presets and mappings in `storageDirectory/surface-v2/` (schema 2). See [docs/INSTALL.md](docs/INSTALL.md).

## Pages

| Page | What it does |
| :--- | :--- |
| **`PERF`** | 12 velocity/pressure pads (modes A/B/C/D), two Static/Physics XY pads, 8 synced LFO/Square toggles (`T1`–`T8`) and 4 snapshot slots. |
| **`MIX`** | 8 mappable rotary knobs (`270°` arc) and 8 mappable full-height faders. |
| **`SNP`** | 16 snapshot slots that recall surface control states. |
| **`SNS`** | Phone motion (accelerometer/gyroscope) and 3D orientation sensors with posture calibration. |
| **`AUD`** | Real-time microphone analysis with 12 spectral/band-onset descriptors. |
| **`VID`** | Local single-hand camera tracking (bundled MediaPipe Hands) with continuous `X / Y / Z / PALM / FACE` inputs and up to 15 learned poses (`G1`–`G15`). `RC-Midi-Receiver.amxd` passes upstream MIDI through byte-for-byte (`midiin → midiout`). |
| **`REC`** | Recording station with three local views (**RECORD / ARRANGEMENT / CLIP**, with **Record** as the default) sharing one fixed capture bar (**REC / STOP**, **PRE-ROLL**, **PASSES**, **START / END**, **CLICK**) and one fixed mode bar. Record shows the native track rows and a compact marker list; only the track list scrolls, and this view reads no clips, takes or waveforms. Arrangement adds the marker timeline, the native Arrangement clips and take inspection. Clip captures an empty Session scene. |
| **`MAP`** | Header overlay for on-phone mapping: bind a touch or sensor source to a Live parameter (**Bind**), trigger quantized MIDI notes through `RC-Midi-Receiver.amxd` (**Trigger Note**) or fire Session clips and clip-advance rules (**Launch Clip**). The response-curve and Burst handles need a `0.6 s` hold. |
| **`TRN`** | Header overlay for transport and locators. |
| **`AUT`** | Header overlay for XY gesture loops: record and loop movement on `XY 1` and `XY 2` after a `3–2–1` countdown, synced to Live (`1–5 bars`) or free (`1–30 seconds`). |
| **`CFG`** | Config Mode (CFG): customize individual pads (modes A/B/C/D and Mode D burst timing), `T1`–`T8` modulators and the independent Static/Physics XY behavior (friction, bounce, speed, trails). |

## Performance 2.0

- **LFO waveform preview:** inspect the active modulator shape (sine, triangle, ramp up, ramp down, square pulse with swing/ratchet) and the rate ceiling in the SYNC modal before sending to Live.
- **Desktop keyboard control:** nudge any continuous control (knob, fader, XY pad, toggle, square) from the keyboard when the client has focus.
- **K-weighted loudness:** monitor momentary, short-term and integrated loudness on `AUD`, with ITU-R BS.1770 weighting.

## What is new in 2.1.0

- **REC.** Three views (Record, Arrangement, Clip) share one capture bar; tracks are listed with **ARM / SOLO / MUTE** and a volume fader.
- **Network tab.** The QR code uses the address that reaches the network. The tab shows the reason for the choice, **USE** pins an address and **FIND SETUP** lists each address with its own QR code.
- **Local certificate.** A certificate authority of this computer signs the server certificate for localhost and private network addresses. The **Certificate** section of the **Network** tab links an install page on the HTTPS port + 1.
- **CFG.** Tap **CFG** in the header to enter configuration mode, then tap a pad, knob, fader or XY pad to edit its settings.
- **AUT.** AUT warnings appear once, in the yellow toast.
- **macOS.** The AbletonOSC link starts with the server. Live's playhead listener runs only while a **Launch Clip** mapping needs it.
- **Fixes.** A resumed phone keeps its client card; a malformed path returns 400; the Network selector keeps a pending choice.
- **Compatibility.** 2.0 mappings, presets and projects work unchanged; reload the browser after installing. Recording and playback have not yet been verified in Live on macOS.

See the [2.1.0 release](https://github.com/ntworm/rc-surface/releases/tag/v2.1.0) for the files and the full notes.

## Documentation

- [User Guide](docs/USER-GUIDE.md): surface tabs, gestures, mapping modes, snapshots, calibration and Stage mode.
- [Installation Guide](docs/INSTALL.md): certificates, LAN setup, companion Max for Live devices and troubleshooting.
- [Customization & Control Catalog](docs/CUSTOMIZATION.md): complete control name catalog (`pad-*`, `knob-*`, `fader-*`, `xy-*`, `toggle-*`, `sensor.*`) and extension points.
- [Compatibility](docs/COMPATIBILITY.md) · [Contracts](docs/CONTRACTS.md) · [FAQ](docs/FAQ.md)
- [Security Policy](docs/SECURITY.md) · [Privacy](docs/PRIVACY.md) · [Contributing](CONTRIBUTING.md)

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

## Security

> [!WARNING]
> **Security notice:** RC Surface runs an HTTPS/WebSocket server on your local network. Controller and admin actions require rotating session tokens, but the bridge is designed strictly for trusted home or studio networks. Do not expose ports to the public internet or share session QR codes or URLs. See [docs/SECURITY.md](docs/SECURITY.md) for the full threat model.

- **Local processing.** Camera frames and microphone audio are analyzed locally in the phone browser; raw media never leaves the device.
- **Max for Live devices.** `Trigger Note` requires `RC-Midi-Receiver.amxd` on the target MIDI track. Replace legacy v1 receiver instances in older Sets so no unauthenticated UDP port stays open.

## License

PolyForm Noncommercial 1.0.0: free for noncommercial use, redistribution and modification; commercial sale of this software or modified versions is not permitted. See [LICENSE](LICENSE) for the full text and the Required Notice.
© Gabriel Worm · <https://github.com/ntworm/rc-surface>.

Ableton and Live are trademarks of Ableton AG. RC Surface is an independent project, not affiliated with, endorsed by, or sponsored by Ableton AG.
