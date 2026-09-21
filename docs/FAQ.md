# Frequently Asked Questions

> Answers to the most common questions about **RC Surface**.
> Last updated: July 2026.

## Contents

- [Compatibility](#compatibility)
- [Install and first use](#install-and-first-use)
- [Features and functionality](#features-and-functionality)
- [Privacy and security](#privacy-and-security)
- [Community and contribution](#community-and-contribution)

---

## Compatibility

### Does it work with Live 11?

No. The documented release target is Ableton Live 12.4.5+ Suite (Beta)
because the project uses the Ableton Extensions SDK host.

### Does it work with FL Studio / Logic / Bitwig / Reaper?

No. The extension code is Live-specific. The phone UI could be reused by
someone who writes a different host, but this project does not provide that
host.

### Which Ableton Live versions are supported?

The documented release target is **Ableton Live 12.4.5+ Suite (Beta)** with
Extensions SDK support.

### Does it work on Windows and Mac?

Target support is Windows 10/11 and macOS on Intel or Apple Silicon.
Linux is not supported because Ableton Live does not run on Linux.

### Does it work on iPhone and Android?

Target support is iOS 15.4+ Safari and modern Chromium-based Android
browsers. Touch, sensors, microphone, and camera require browser
permissions. iOS 14.5 or below cannot accept the self-signed HTTPS
certificate, so the connection will fail.

Run the tester checklist on real iOS and Android devices before treating a
build as public-release validated.

### What is the latency? Is it usable for live performance?

On the current candidate, gestures and audio share a realtime path: first frame
immediate, subsequent batches spaced by at least 8 ms. MAP's visual snapshots
cannot delay those commands. Smooth 0 adds no mapping ramp. This is not a measured
end-to-end latency; older hosts use the legacy snapshot path. The client is designed for
low-latency local Wi-Fi. Actual latency depends on the host, phone,
browser, router, and network congestion. Use 5 GHz Wi-Fi for the most
consistent results, and test the exact setup before a show.

---

## Install and first use

### How do I get started?

1. Install Ableton Live 12.4.5+ Suite/Beta with Extensions SDK support.
2. Use the `.ablx` from the tester kit or release package you received.
3. Double-click the `.ablx`; Live offers to install it.
4. Open RC Surface from Live's Extensions menu.
5. Scan the QR code with your phone.
6. Accept the self-signed certificate warning once.

### Do I need an internet connection?

For core controls, no. The bridge runs on your local network, and the phone
and computer running Live only need to be on the same Wi-Fi. No telemetry or
project data is sent to a cloud service.

Camera hand tracking also works offline. The build bundles the MediaPipe Hands
runtime and model files with the extension, and processing stays in the phone
browser.

### Do I need to know how to code to use it?

No. Install the extension, scan the QR, and play. Coding is only needed if
you want to customize the phone UI or contribute code.

### My antivirus is flagging the `.ablx`. Is it malware?

No. Local WebSocket, HTTPS, and generated certificates can look unusual to
security software. The project is source-available and the `.ablx` contains the
extension code plus static browser assets, not bundled private keys or
certificates.

---

## Features and functionality

### Do the pads/knobs work with any MIDI device in Live?

They work with Live targets exposed to the extension: mixer values, track
state, device parameters, and supported note/clip actions. For device
control, tap **MAP** on the phone and use **Bind** to choose a Live
parameter. The older panel/admin mapping editors are still useful for
inspection and troubleshooting.

### Can I create mappings from the phone?

Yes. Tap **MAP** near the BPM display, select a highlighted control, then
choose the action that matches the source:

- **Bind** maps the selected phone control to song tempo, main/master,
  normal track, return track, mixer, device, or parameter targets.
- **Trigger Note** maps the selected phone control to a MIDI note on a
  chosen MIDI track through `RC-Midi-Receiver.amxd`.

Follow Detected Note was removed. Unsupported mapping modes are discarded on
load; supported bindings, including fixed Trigger Note, are retained.

Use Receiver v2 (**SDK / LOCAL MAX — NO UDP**) and replace old Set instances;
only one compatible Receiver is accepted per destination track.
The Extensions SDK cannot add a Max for Live receiver automatically. If the
track does not already contain it, place `RC-Midi-Receiver.amxd` from your User
Library on the MIDI track in Live and retry.

### How many phones can connect at the same time?

RC Surface 1.0 supports one controller at a time. Control performance either
from the phone or desktop, never both simultaneously. While multiple browser
windows can open the page on the LAN and receive isolated client IDs, simultaneous
control from multiple devices is not supported and will cause conflicting control
states.

### Does the phone vibrate when I hit a pad?

No. Haptics/vibration are retired in v1.0.0 to keep the UI
predictable across iOS and Android.

### Can it turn what I play into MIDI notes?

No. **Follow Detected Note** and its tonal analysis were removed after repeated
musical tests did not produce reliable results. Fixed **Trigger Note** mappings
remain; they do not estimate the note being played.

### What can I map from audio instead?

The AUD page contains twelve descriptors in Attacks, Tone, Texture and Bands:
Transient, Kick, Snare, Brightness, Centroid, Flux, Flatness, Spread, Rolloff 95%,
and low/mid/high RMS. The graph selector and colored legend isolate their curves.
Tap **MAP**, select a detector card and **Bind** it to a Live parameter.
For kick-to-synth modulation, begin with a small target range and Smooth at zero.

Transient measures attacks; Kick and Snare weight those attacks by low and
mid/high spectral energy. Brightness describes the dark-to-bright spectrum.
All twelve mapping values are normalized to 0–1. Kick/Snare are heuristics: a full mix,
room noise or another instrument can activate them. They do not separate drums.

The descriptors use the browser audio input. `RC-Audio-Sender.amxd` retains its
existing track-analysis role; it does not supply these browser descriptors.

### Does the browser process the audio before I get it?

The application requests echo cancellation, noise suppression and automatic
gain control off, to preserve amplitude and spectral descriptors. That does not
guarantee bit-perfect capture: the browser, operating system or input driver may
still resample/process audio. Select the intended loopback/interface in AUD.

### Can I stop it starting with Live?

Yes, with the **Start automatically with Live** switch at the bottom of the
panel. Useful when another RC extension shares the machine. The panel's Start
button is unaffected, and the panel opens even with nothing listening.

### Can I customize the phone controller UI?

Yes. The phone code is plain HTML/CSS/JavaScript under `static/phone-v3/`.
See `docs/CUSTOMIZATION.md`.

### Can I save and share mappings?

Save and load local mapping presets, yes. v1.0.0 does not include
export/import of shareable mapping bundles; presets remain local to the
extension storage.

### How do I update to a new version?

Download the newest `.ablx` from the project Releases page, double-click it,
and let Live replace the installed extension. Restart Live if it was open
during the update.

---

## Privacy and security

### Does the data go to the cloud?

No telemetry, analytics, or project data is sent to a cloud service. The
supported bridge traffic stays between the host and browser clients on your
trusted LAN. Camera and microphone streams are processed in the browser and
are not sent as raw media to the extension.
MediaPipe runtime/model files are served by the extension over the same local
connection; camera hand tracking does not require a public CDN.

### Is there a privacy policy?

Yes: `docs/PRIVACY.md`.

### Are there any security risks in leaving this running?

Yes, in the same way any local control surface has risk. The bridge opens a
LAN-reachable port and accepts supported WebSocket commands from browser
clients that can reach the bridge URL. Run it only on trusted home/studio
Wi-Fi, and close it when you are done. Do not expose it to public networks
through tunnels, reverse proxies, or port forwarding; those deployments are
outside the v1.0 threat model. The full threat model is in `docs/SECURITY.md`.

### Do I have to pay? Is there a Pro version?

No. The project is source-available under the PolyForm Noncommercial 1.0.0
license, and has no Pro version or
locked features. The Gumroad page is **pay what you want** (suggested R$25,
minimum R$0). R$0 is the default so cost is never a barrier. See
[`FUNDING.md`](../FUNDING.md) for details. Only trust links published in
this repository's README and release notes.

---

## Community and contribution

### Is there a Discord or community to talk about it?

No dedicated community exists. Use the project issue tracker for reproducible
bugs. The official Ableton Discord `#extensions` channel is independent from
this project; follow its current rules if discussing the extension there.

### How do I contribute?

Open a focused issue or pull request in the project repository. Read
[`CONTRIBUTING.md`](../CONTRIBUTING.md) before changing code, and report
security problems through the private channel in `docs/SECURITY.md` instead
of a public issue.

## See also

- [`INSTALL.md`](./INSTALL.md) - detailed install guide
- [`PRIVACY.md`](./PRIVACY.md) - full privacy policy
- [`SECURITY.md`](./SECURITY.md) - threat model and security design
- [README](../README.md) - project overview
