# Install and first-run guide

RC Surface is an Ableton Live extension that serves a control surface in the
browser of a phone. This guide covers the install on Windows or macOS, the
connection of the phone, and the first mapping.

> [!WARNING]
> **Security Notice**: This extension runs a WebSocket server on your local network. Controller and admin actions require session tokens, but the bridge should still be used only on trusted networks. Do not share QR or admin URLs. See [SECURITY.md](./SECURITY.md) for the threat model.

For the short version, see the [Quick start](../README.md#quick-start) in the README.

## Requirements

You need:

- **Ableton Live 12.4.5+ Suite (Beta)** with the Extensions SDK host enabled.
- A computer and a phone on the **same WiFi network**.
- A modern browser on the phone: Chrome 90+, Safari 15.4+, Edge 90+, or any Chromium-based Android browser.
- **Required for REC, Launch Clip, TRN, `AUT` in `SYNC` and Deep Sync; optional for basic control**: [AbletonOSC](https://github.com/ideoforms/AbletonOSC) installed and configured in Live.
- **Optional (for MIDI Trigger Notes)**: `RC-Midi-Receiver.amxd` saved in your Ableton User Library.
- Optional, for advanced features: a phone with a working gyroscope, accelerometer, microphone, and camera.
- Camera hand tracking works on the local network; its MediaPipe runtime and
  model files are bundled with the extension.

The extension itself is built on the
[Ableton Extensions SDK](https://github.com/ableton-extensions/sdk)
1.0.0-beta. No additional runtime is required on the host computer.

## Install

### Release package

Version 2.1.0 is distributed as a
[pre-release](https://github.com/ntworm/rc-surface/releases/tag/v2.1.0).

1. Download the latest `RC-Surface-X.Y.Z.ablx` from the
   project Releases page, or use the test package shared by the maintainer.
   A local candidate is not a declaration that the matching public release
   exists. Use the version and verification instructions supplied with the
   actual package.
2. Double-click the file. Live's extension installer opens.
3. Click *Install*. Live places the file under
   `User Library / Extensions`.
4. Restart Live if it was already running.

Before a performance, check Start/Close and the QR in the native Live panel,
then record and replay a take in a copy of your Set on the target Mac.
Automated CI does not replace that acceptance.

### From source

If you cloned the repository and ran `npm ci` followed by
`npm run build:prod-ablx`, you'll have
the same `.ablx` file in the project root. Install it the same way
(double-click).

### AbletonOSC

AbletonOSC enables beat-accurate sync for toggle, the flashing metronome
header, and the full-screen transport control overlay (`TRN` button). Install
it in Remote Scripts inside the configured User Library, rather than inside
the Live application, so the install survives Live updates.

1. Download **AbletonOSC** from the repository: [AbletonOSC GitHub](https://github.com/ideoforms/AbletonOSC). Click **Code** -> **Download ZIP**.
2. Extract the ZIP and place the `AbletonOSC` folder in your Ableton Live **MIDI Remote Scripts** directory:
   - **Windows**: `C:\Users\<user>\Documents\Ableton\User Library\Remote Scripts\AbletonOSC\`
   - **macOS**: `~/Music/Ableton/User Library/Remote Scripts/AbletonOSC/`.
3. Open Ableton Live's **Link/Tempo/MIDI** Preferences.
4. Add **AbletonOSC** as a Control Surface in the list. Under **Input** and **Output**, leave them as **None**.
5. Once configured, the extension will automatically detect it and sync using ports `11000` (outgoing) and `11001` (incoming). Stock AbletonOSC replies only on `11001`: if another RC extension holds it while Live starts, the surface listens on a fallback port and moves back to `11001` as soon as it frees.

### RC-Midi-Receiver.amxd

To let pads or other controls trigger MIDI notes on a selected MIDI track:

Use **Receiver v2**, labelled **SDK / LOCAL MAX — NO UDP**. Back up your Set,
then replace old Receiver instances; a library update alone does not replace
loaded devices. Keep only one v2 Receiver per destination track. See the
[v2 migration](./SECURITY.md#bundled-max-devices--v2-migration). Old UDP
Receivers are rejected; there is no insecure compatibility fallback.

1. Locate the `RC-Midi-Receiver.amxd` file (included in the root of the release ZIP kit, or under the `static/` directory in the repository source).
2. Copy this file into your Ableton **User Library** so that Live can find it:
   - Place it under `User Library/Presets/MIDI Effects/Max MIDI Effect/` (or anywhere else in your indexed User Library).
3. Drag the Receiver from your User Library onto each target MIDI track. The
   extension reuses it once present, but Live's Extensions SDK cannot insert a
   Max for Live device automatically. Trigger Note tells you to place the
   copy from your User Library.

### RC-Audio-Sender.amxd

The extension cannot hear a Live track — the Extensions SDK exposes no audio at
all — so listening to one is done by a Max device inside Live's audio path.

1. Find `RC-Audio-Sender.amxd` in the release kit, or under `static/` in the
   source.
2. Drop it on the **audio track you want to listen to**.
3. Put `RC-Midi-Receiver.amxd` on the **MIDI track that should play**.

4. Enable **Audio Sender input** on the intended Receiver v2. It starts OFF.
   Both devices must be v2: they use an internal Max bus, not UDP. All Receivers
   with that input enabled hear the Sender; leave the others OFF. Trigger Note
   from the phone uses the SDK and does not need that input enabled.

Requires Max for Live, which is included with Live Suite.

> **Transport v2 awaits a new Live test.** Earlier field results refer to the
> old UDP version, not this replacement. Verify loading, stereo pass-through,
> notes/OFF and measured latency before performance use.

## Data storage

Mappings, presets and projects are stored under `storageDirectory/surface-v2/`,
with schema 2. Files from the 1.x line are neither deleted nor automatically
imported. Do not copy 1.x data into this folder.

## Start the bridge

1. In Live, open the **Extensions** menu (or `Cmd-Shift-A` / `Ctrl-Shift-A`).
2. Look for **RC Surface** and click *Show panel* (or *Open*,
   depending on your Live version).
3. A modal window appears with the **Performance QR** for the phone
   client (the pads / knobs / sensors / **MIX** tab controller at `/`).
   The MIX macro view lives inside the Performance client as
   a dedicated tab; there is no separate Mix QR in the panel.
   An admin URL is also shown as a small `admin ↗` link under the
   Performance QR; the admin dashboard at `/static/admin/` shows
   live mappings.

The server keeps plain HTTP on loopback at **8730** and exposes the phone over
LAN HTTPS/WSS, normally at **8731**. Stable ports let a phone find the server
after a restart, but its old session is read-only until you scan the new QR.
This also applies to Stop/Start in the panel. If a port
is already occupied, Surface falls back to an OS-assigned port and the panel
shows the one actually in use. Set `RC_SURFACE_PORT` to override the preferred
HTTP port. LAN access is available only through the generated HTTPS URL, so
use a trusted studio/home network.

The generated QR URL grants the controller role through a rotating session
token, so treat the QR code and copied controller/admin URLs as credentials.

### Start automatically with Live

At the bottom of the panel there is a **Start automatically with Live** switch.
It is on by default.

Turn it off when another RC extension shares the machine and you want to choose
which one takes the ports for a session rather than have them race at load.
Only the automatic start is affected: the panel's **Start** button still works,
and the panel renders from disk when nothing is listening, so the switch is
always reachable — including in the state it creates. The choice persists
between sessions.

The stopped-server panel includes all its scripts and font, so **Start** and
the automatic-start preference work offline.

## Connect the phone

> [!IMPORTANT]
> **Single controller policy**: RC Surface supports one controller at a time. Control your session from the phone or desktop, never both simultaneously. While multiple browser windows can technically connect on the LAN, simultaneous inputs are not supported and will conflict.

Pick one:

- **Scan the QR code** with the phone's camera app. It will open in
  your default browser.
- Or **type the phone URL manually** in the phone's browser address
  bar.

By default, the URL looks like `https://192.168.x.y:8731/`. If the preferred
port was overridden or unavailable, use the actual URL shown in the panel.

### The "Your connection is not private" warning

The phone does not trust the certificate of the bridge yet, so the browser
warns you the first time. This is expected. To proceed:

- **Chrome on Android**: tap *Advanced* → *Proceed anyway*.
- **Safari on iOS**: tap *Show details* → *visit this website* → *Visit*.
  iOS only shows the bypass on iOS 15.4+; older versions block the
  connection entirely and you will not be able to use the camera or
  microphone.

Your browser will remember the decision for the lifetime of the cert
(about a year, see [Certificate lifecycle](#certificate-lifecycle)
below).

The **Certificate** section of the **Network** tab links an install page on the
HTTPS port + 1, where the phone installs the certificate authority of this
computer. With the authority installed, the browser opens the pages without a
warning.

### What you see

The controller works in landscape orientation. Hold the phone with both thumbs
on the screen; in portrait, an overlay appears.

Sensors start automatically when your browser allows it. If sensor access
needs a tap, open **SNS**, tap the **⚙** gear in the top bar, then tap
**Enable sensors**. You can retry after a denial or an error. Camera and
microphone require separate permission.

## First mapping

With the phone connected:

1. In Live, create or select a track with an obvious parameter, such as
   Auto Filter frequency or a track volume fader.
2. On the phone, tap **MAP** near the BPM display.
3. Tap a highlighted control, for example **knob 1** on the MIX tab or
   **pad 1** on the PERF tab.
4. Tap **Bind**.
5. Browse **Song / Main / Master**, **Tracks**, or **Return Tracks**,
   then open the target track/device and choose the parameter.
6. Leave MAP mode and move the selected phone control. The Live parameter
   should follow it.

To test MIDI note triggering instead:

1. Add or select a MIDI track in Live.
2. On the phone, enter **MAP**, select a control, and tap **Trigger Note**.
3. Pick the MIDI track.
4. If `RC-Midi-Receiver.amxd` is not already on the track, place the copy from
   your User Library on that MIDI track and retry.
5. Choose the note with the Pitch/Octave selectors, set Velocity, leave
   MAP mode, and trigger the selected phone control.

If the Live parameter or MIDI note responds, the bridge and mapping engine
are working. The admin dashboard at `/static/admin/` remains useful for
inspection and troubleshooting, but day-to-day mappings can be created from
the phone.

To test audio modulation, enable **Audio input** in **AUD**. Enter **MAP**,
choose the **Kick** detector card, then Bind a synth parameter with a small
output range and **Smooth = 0**. Leave MAP and play isolated kicks, then snares
and silence. Compare the sound with the actual Live parameter, not only the
meter. Repeat with Transient, Snare, and Brightness. Kick/snare are spectral
heuristics; microphone, network, and Live latency still require a physical test.

Follow Detected Note and its tonal analysis are not available. Unsupported mapping
modes are discarded on load; supported bindings remain. The twelve descriptors
analyze the selected browser audio input (microphone, interface or loopback
where available). The optional Max Audio Sender does not feed these controls.

## Operating system notes

### Windows

- Live's persistent storage is under
  `%USERPROFILE%\Documents\Ableton\User Library\`.
- The bridge's generated certs live under
  `…\User Library\Preferences\Extensions\<extension-id>\certs\`.
- Windows Defender SmartScreen might block the `.ablx` install the
  first time. Click *More info* → *Run anyway*.

### macOS

- Live's persistent storage is under
  `~/Music/Ableton/User Library/`.
- The certs live under
  `~/Music/Ableton/User Library/Preferences/Extensions/<id>/certs\`.
- The first time you double-click the `.ablx`, macOS may show a
  *cannot be opened because the developer cannot be verified* dialog.
  Right-click the file, choose *Open*, then *Open* again in the
  confirmation prompt.

## Network boundary

The supported deployment is a trusted studio/home LAN with the phone and
computer on the same network. Do not expose the bridge with port forwarding,
a public tunnel, or a public reverse proxy. Those deployments are outside the
tested threat model, even when the public endpoint supplies a trusted
certificate.

A public IP never goes into the QR by itself, because the QR carries the
control token. If a public address is all the computer has, the panel says so
and only shows a QR after you click **USE** on that address.

The QR uses the address that reaches your network: the one with a route out
first, then one with a gateway, and virtual adapters and VPNs last. The
**Network** tab in the panel shows why and lets you pin an address.
**Network address** on the Main tab offers the same choice and the server
remembers it.

## Certificate lifecycle

The bridge generates a fresh certificate on first run. A certificate authority
of this computer signs it for `localhost` and the private addresses of the
network; a public address chosen with **USE** keeps a self-signed certificate,
made with the `selfsigned` npm package. The certificate:

- Is RSA 2048-bit, signed with SHA-256.
- Has a one-year validity (`notAfterDate` defaults to one year from
  generation).
- Includes `subjectAltName` entries for `localhost`, `127.0.0.1`, and the
  addresses of the physical adapters, keeping earlier ones up to 32 entries.
  A new address on a virtual adapter does not touch the cert. When the
  computer moves to a network the cert does not cover, the extension issues
  a new one without a restart, and the phone asks you to accept it once.
- Is stored with `0600` permissions in the Live storage directory.

To force a new cert, stop Live, delete the `certs/` folder under
`Preferences/Extensions/<id>/`, and restart.

## Troubleshooting

### The page opens on the computer but not on the phone

The computer opens the page on any of its own addresses, so that proves
nothing about the network. Open the **Network** tab in the panel:

- See which address the QR uses and why. The phone cannot reach an address
  on a virtual adapter.
- Click **FIND SETUP**. The panel shows one QR per address, 25 seconds each.
  Point the phone at it. When the phone connects, that address is remembered
  on this network for 30 days.
- Read **Diagnosis**. It reads the certificate and the firewall without
  changing them. If a firewall rule is missing, it gives you the command to
  copy. Run it yourself in PowerShell as administrator.
- If no address reaches the phone, check that the phone is off mobile data
  and on the same network, then look for client isolation or a guest network
  on the router. The computer cannot detect those from here.

### Phone shows "ERR_CONNECTION_REFUSED"

- The phone and the computer are on different WiFi networks. Connect
  both to the same one.
- Some routers (especially guest networks) isolate clients. Use the
  main SSID, not a guest one.

### Phone shows "Your connection is not private" and there's no bypass

- iOS 14.5 and below cannot accept self-signed certs for HTTPS websites.
  Upgrade the phone or use another supported browser/device on the same LAN.
- Some corporate-managed phones have admin policies that block
  certificate bypass. Use a personal phone.

### Phone shows "ERR_LOCAL_NETWORK_PERMISSION_MISSING"

- This error means the browser blocked this site's access to the local network.
- **Chrome on Android**: open the site info (the icon left of the address bar)
  → *Permissions* → *Local network access* → *Allow* for the current Surface
  address, then reload the same QR URL.
- If the per-site option is missing, open *Chrome Settings* → *Site settings* →
  *Local network access*, allow the site, then reload.
- If the page still will not load, continue with the connection checks below.
  Certificate warnings are separate.
  Chrome's reference: <https://support.google.com/chrome/answer/114662?co=GENIE.Platform%3DAndroid&hl=en>

### Camera and microphone don't work

- Make sure the phone URL is **HTTPS**, not HTTP. The camera and
  microphone APIs are gated on Secure Context.
- Camera hand tracking uses the MediaPipe Hands runtime and model files bundled
  with the extension. It does not require public internet or a CDN after the
  extension is installed.

### Latency is bad

- Both devices should be on 5 GHz WiFi, not 2.4 GHz.
- The bridge sends phone control and sensor events at the browser's
  `requestAnimationFrame` cadence, plus low-rate Live state updates.
  On a slow LAN this can drop noticeably. The admin dashboard shows
  the actual message rate.
- Some phones throttle background WebSocket connections; keep the
  phone unlocked and the browser in the foreground during performance.

### Live crashes when the extension loads

- Check the Live log: `Help` → *Show Log*.
- Most common cause: a stale cert in the storage directory with the
  wrong format. Delete `certs/` and let the extension generate a new one.

## Uninstall

In Live: *Extensions* menu → *Manage Extensions* → remove the entry.
Then delete the cert folder under
`Preferences/Extensions/<extension-id>/` if you want a clean slate.

## Trademarks

Ableton and Live are trademarks of Ableton AG. RC Surface is an independent
project, not affiliated with, endorsed by, or sponsored by Ableton AG.
