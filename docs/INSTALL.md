# Install and first-run guide

This document walks you through installing **RC Surface** on
Windows or macOS, scanning the QR code from your phone, and getting
your first pad-to-Live mapping working.

> [!WARNING]
> **Security Notice**: This extension runs a WebSocket server on your local network. Controller and admin actions require session tokens, but the bridge should still be used only on trusted networks. Do not share QR or admin URLs. See [SECURITY.md](./SECURITY.md) for the threat model.

If you only want the short version: see the [Quick start](../README.md#quick-start)

## Upgrading from Ableton-RC-Surface (1.0.0)

The product was previously distributed as "Ableton-RC-Surface". Live derives the
data folder identity from the manifest's `name` field, so installing the renamed
`RC-Surface-1.0.0.ablx` creates a fresh data folder at
`%LOCALAPPDATA%\Ableton\Extensions Data\worm.rc-surface\` (Windows) or
`~/Library/Application Support/Ableton/Extensions Data/worm.rc-surface/` (macOS).
Your previous mappings, presets, certificates, locale, autostart, and projects
stay in `worm.ableton-rc-surface`.

To move that data into the new folder without overwriting anything, run the
migrator from the tester kit **before** installing the new `.ablx`:

- Windows: double-click `Migrate-RC-Surface-Data.cmd` (or run `Migrate-RC-Surface-Data.ps1`)
- macOS: double-click `Migrate RC Surface Data.command`

The script copies every file and skips anything that already exists in the
destination. It never moves or deletes the source. If the source folder does not
exist (fresh install), it exits cleanly with a message.
in the README.

## 1. Prerequisites

You need:

- **Ableton Live 12.4.5+ Suite (Beta)** with the Extensions SDK host enabled.
- A computer and a phone on the **same WiFi network**.
- A modern browser on the phone: Chrome 90+, Safari 15.4+, Edge 90+, or any Chromium-based Android browser.
- **Optional (for Deep Sync)**: [AbletonOSC](https://github.com/ideoforms/AbletonOSC) installed and configured in Live.
- **Optional (for MIDI Trigger Notes)**: `RC-Midi-Receiver.amxd` saved in your Ableton User Library.
- Optional, for advanced features: a phone with a working gyroscope, accelerometer, microphone, and camera.
- Camera hand tracking works on the local network; its MediaPipe runtime and
  model files are bundled with the extension.

The extension itself is built on the
[Ableton Extensions SDK](https://github.com/ableton-extensions/sdk)
1.0.0-beta. No additional runtime is required on the host computer.

## 2. Download and install

### From a test candidate or published release

1. Download the latest `RC-Surface-X.Y.Z.ablx` from the
   project Releases page, or use the test package shared by the maintainer.
   The source version is **1.0.0**; the local candidate is not a declaration
   that a public release exists. Use the version and verification instructions
   supplied with the actual package.
2. Double-click the file. Live's extension installer opens.
3. Click *Install*. Live places the file under
   `User Library / Extensions`.
4. Restart Live if it was already running.

### From source

If you cloned the repository and ran `npm ci` followed by
`npm run build:prod-ablx`, you'll have
the same `.ablx` file in the project root. Install it the same way
(double-click).

### Optional: Install AbletonOSC (for Deep Sync)

To enable beat-accurate sync for LFO/Stutter, the flashing metronome header, and the full-screen transport control overlay (`TRN` button), you must install and configure **AbletonOSC**:

1. Download **AbletonOSC** from the repository: [AbletonOSC GitHub](https://github.com/ideoforms/AbletonOSC). Click **Code** -> **Download ZIP**.
2. Extract the ZIP and place the `AbletonOSC` folder in your Ableton Live **MIDI Remote Scripts** directory:
   - **Windows**: `C:\ProgramData\Ableton\Live 12 Suite\Resources\MIDI Remote Scripts\`
   - **macOS**: Right-click the Ableton Live app in Applications, choose **Show Package Contents**, and navigate to `Contents/App-Resources/MIDI Remote Scripts/`.
3. Open Ableton Live's **Link/Tempo/MIDI** Preferences.
4. Add **AbletonOSC** as a Control Surface in the list. Under **Input** and **Output**, leave them as **None**.
5. Once configured, the extension will automatically detect it and sync using ports `11000` (outgoing) and `11001` (incoming).

### Optional: Install RC-Midi-Receiver.amxd (for MIDI Trigger Notes)

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

### Optional: RC-Audio-Sender.amxd (to listen to a Live track)

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

## 3. Start the bridge

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
It is on by default, which is what every install did before it existed.

Turn it off when another RC extension shares the machine and you want to choose
which one takes the ports for a session rather than have them race at load.
Only the automatic start is affected: the panel's **Start** button still works,
and the panel renders from disk when nothing is listening, so the switch is
always reachable — including in the state it creates. The choice persists
between sessions.

## 4. Connect your phone

> [!IMPORTANT]
> **Single controller policy**: RC Surface 1.0 supports one controller at a time. Control your session from the phone or desktop, never both simultaneously. While multiple browser windows can technically connect on the LAN, simultaneous inputs are not supported and will conflict.

Pick one:

- **Scan the QR code** with the phone's camera app. It will open in
  your default browser.
- Or **type the phone URL manually** in the phone's browser address
  bar.

By default, the URL looks like `https://192.168.x.y:8731/`. If the preferred
port was overridden or unavailable, use the actual URL shown in the panel.

### The "Your connection is not private" warning

Because the bridge uses a self-signed certificate unique to your
install, the phone's browser will warn you the first time. This is
expected. To proceed:

- **Chrome on Android**: tap *Advanced* → *Proceed anyway*.
- **Safari on iOS**: tap *Show details* → *visit this website* → *Visit*.
  iOS only shows the bypass on iOS 15.4+; older versions block the
  connection entirely and you will not be able to use the camera or
  microphone.

Your browser will remember the decision for the lifetime of the cert
(about a year, see [Certificate lifecycle](#certificate-lifecycle)
below).

### What you see

A landscape-only controller. The phone is best held with both thumbs
on the screen in landscape orientation; a portrait overlay will show
otherwise.

The first time you open the app, your browser will ask for permission
to access sensors (motion, orientation). Tap *Allow* — these are
required for the sensor panel and the level bubble.

## 5. Sanity check: make your first mobile mapping

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

Follow Detected Note and its tonal analysis were removed. Unsupported mapping
modes are discarded on load; supported bindings remain. The twelve descriptors
analyze the selected browser audio input (microphone, interface or loopback
where available). The optional Max Audio Sender does not feed these controls.

## 6. OS-specific notes

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
  `~/Music/Ableton/User Library/Preferences/Extensions/<id>/certs/`.
- The first time you double-click the `.ablx`, macOS may show a
  *cannot be opened because the developer cannot be verified* dialog.
  Right-click the file, choose *Open*, then *Open* again in the
  confirmation prompt.

## 7. Network boundary

The v1.0 supported deployment is a trusted studio/home LAN with the phone and
computer on the same network. Do not expose the bridge with port forwarding,
a public tunnel, or a public reverse proxy. Those deployments are outside the
tested threat model, even when the public endpoint supplies a trusted
certificate.

## 8. Certificate lifecycle

The bridge generates a fresh self-signed cert on first run, using
the `selfsigned` npm package. The cert:

- Is RSA 2048-bit, signed with SHA-256.
- Has a one-year validity (`notAfterDate` defaults to one year from
  generation).
- Includes `subjectAltName` entries for `localhost`, `127.0.0.1`, and
  current LAN IPs. If the LAN IP changes and the stored cert no longer
  covers the phone URL, the extension regenerates the cert.
- Is stored with `0600` permissions in the Live storage directory.

To force a new cert, stop Live, delete the `certs/` folder under
`Preferences/Extensions/<id>/`, and restart.

## 9. Troubleshooting

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
  wrong format. Delete `certs/` and let the extension regenerate.

## 10. Uninstall

In Live: *Extensions* menu → *Manage Extensions* → remove the entry.
Then delete the cert folder under
`Preferences/Extensions/<extension-id>/` if you want a clean slate.

## Trademarks

Ableton and Live are trademarks of Ableton AG. RC Surface is an independent
project, not affiliated with, endorsed by, or sponsored by Ableton AG.
