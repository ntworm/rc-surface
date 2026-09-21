# Tester Guide

Thank you for testing RC Surface v1.0.0.

## Current candidate r12: Stutter regression fix

Use `stutter-fix-r12/RC-Surface-1.0.0-stutter-fix-r12.ablx` and reload the browser;
no AMXD replacement. One integrated check on the existing target: at 120 BPM,
choose 1/16 and confirm the button flashes; drag horizontally to change speed,
vertically for amplitude, then OFF. In settings 1/32–1/128 must be disabled at
120 BPM without ratchet/swing; 1/128 would need 64 Hz, above the 15 Hz ceiling.
An old saved 1/128 shows requested → effective; horizontal drag releases that
shared pin. FREE now uses the full 1–15 Hz gesture (legacy ratchet raises the
minimum), and Auto distributes only reachable SYNC speeds, so stored normalized
rates may differ from r11. No fixed high-rate visual or fake slower pulse.
Animation is local, not proof of delivery; slow frames may miss pulses and never
replay them. LFO shapes/ceilings and the deferred AUDIO bench are unchanged.

## Previous experimental candidate r11: shape limits and Stutter feedback

Use `shape-limits-r11/RC-Surface-1.0.0-shape-limits-r11.ablx`, then reload the
browser. No AMXD replacement. Keep r10 for comparison; use a copy of your Set.

One integrated recording on the existing Auto Filter target: open ⚙ next to SYNC → LFO Config → Shape, select each shape, sweep FREE speed from low to its maximum (sine 5 Hz,
triangle 8 Hz, ramps 6 Hz, square 15 Hz). Shift+horizontal drag is fine control.
Rate changes should accelerate without phase resets; changing shape can change
the output value. Compare curve/vertices/pulse timing in the recording, not just
the browser animation. Try SYNC too: beat subdivisions can yield a lower maximum
(e.g. sine 4 Hz, square 12 Hz in Auto at 120 BPM).

Then use Stutter: X changes speed; Y still changes amplitude, without extra
AMP/status labels. Both LFO and Stutter show only Hz in FREE or musical note
duration in SYNC (1/4 = one beat; 1/8 = half a beat; T/D = triplet/dotted).
The initial r11 high-rate steady view was rejected and replaced in r12. Check gate-open amplitude and
OFF without a delayed tail. SYNC now slows old fast pins by octaves, including
ratchet/swing; the shortest intended half-pulse is bounded. Saved FREE LFO rates
can be faster with the expanded range. Physical fidelity/latency is still pending.
The AUDIO latency bench remains separate and deferred.

## Previous candidate r10: browser LFO control

Use the latest `browser-lfo-r10` ABLX and reload the browser page. L1–L4 continue
through the browser surface and existing extension mappings; no AMXD replacement
or target-automation lock is required. The owner canceled the native Max LFO r9
experiment; its local package is retained only for historical recovery.

One integrated check in the existing Auto Filter test is sufficient: record a
sine LFO speed sweep in continuous FREE (0.1–4 Hz), use Shift+horizontal drag on
desktop for fine adjustment, then change SYNC rates and pinned subdivisions at
120 BPM. Auto now has ten speeds within 4 Hz, including triplet/dotted choices.
Rate/subdivision changes while running should continue the existing phase.
Briefly pause/resume, then turn LFO OFF: pause keeps it moving, resume/seek can
realign it to the beat, and OFF should stop modulation without replaying pending
old values. Different rate-gesture histories need not produce the same phase
before the next transport alignment. A seamless SYNC/FREE switch is not promised.

The earlier r8 trial showed angular/jittered automation. This candidate does not
establish physical waveform fidelity or measured latency; preserve the recording
if jitter remains. Accepted Stutter, Receiver and XY/MIX checks stay closed.
The previous notes below are historical, not additional test requests.

### Previous candidate r8: LFO automation bandwidth

Replace the extension with r8 and reload the browser page; AMXDs are unchanged.
One integrated check in the saved Auto Filter test is sufficient: record a sine
LFO speed sweep to maximum in FREE, then SYNC at120BPM, briefly pause/resume and
turn LFO OFF. Max is4Hz (four cycles/second), not the old noisy20–64Hz extreme.
The wave should remain recognizable, pause should keep it moving and OFF should
stop modulation. Preserve the recording if any jitter remains. No Receiver,
XY/MIX or accepted-stutter retests. Physical audio/latency benchmark remains open.
Snapshots/presets keep normalized rates but play through the narrower frequency
range; Deep Sync shows effective pinned divisions. No claim of physical PASS.

### Previous candidate r7: LFO pause/resume

Owner r6 feedback accepts stutter as responsive with no apparent issue; do not
reopen those checks. r7 corrects frozen LFO preview on Stop: it keeps advancing
and re-locks on Play, including return to the same song position. Internal clock
ignores transport position. Pinned LFO subdivisions now reach the host fallback.
Only verify that pause/resume behavior after extension/page reload; no new AMXD.
Fast LFO distortion and the reported SYNC/FREE jump remain open, not approved.

### Previous candidate r6 scope

After updating the extension and reloading the phone page, use the existing
Auto Filter test: stutter X changes speed and Y changes amplitude. OFF should
not replay a trail of old pulses. FREE LFO rate sweeps should no longer jump
phase when speed changes. Preserve the recorded Set for point-density analysis;
high-frequency waveform fidelity is NOT approved by the automated tests.
The accepted Receiver/XY/MIX checks are not being reopened.
Physical audio/latency recording remains pending; the 8 ms dispatch spacing is
not an end-to-end measurement. See `internal/CONTROL-LATENCY-AUDIT-2026-09-09.md`.

This kit contains the production-equivalent `.ablx` and the docs you need
to install it, open the panel, connect your phone, and report any issues
you find.

Follow Detected Note and its code were removed after unreliable musical tests.
Use the current
[Audio Audit protocol](../docs/AUDIO-AUDIT.md)
([Português](../docs/AUDIO-AUDIT.pt-BR.md)) for Browser descriptor checks.
The old tonal Audio Lab no longer exists.
Use the descriptor checks below; physical microphone tests remain required.

## What's in the kit

| File | Purpose |
|---|---|
| `RC-Surface-1.0.0.ablx` | The extension to install in Live |
| `RC-Midi-Receiver.amxd` | Max for Live receiver device for MIDI trigger notes |
| `RC-Audio-Sender.amxd` | Max for Live audio-track pitch sender |
| `README.md` | Quick start and architecture summary |
| `LICENSE` | PolyForm Noncommercial 1.0.0 license text |
| `CHANGELOG.md` | Version history |
| `CONTRIBUTING.md` | Development workflow and contribution notes |
| `internal/README.md` | Canonical docs index |
| `docs/INSTALL.md` | Step-by-step install and phone connection |
| `docs/USER-GUIDE.md` | Phone controller usage guide |
| `docs/FAQ.md` | Common questions and answers |
| `docs/PRIVACY.md` | Local data flow and third-party runtime notes |
| `docs/SECURITY.md` | Threat model, certificate policy, network behavior |
| `docs/CUSTOMIZATION.md` | Controls, sensors, mappings, extension points |
| `internal/TESTER-GUIDE.md` | This file |
| `internal/PESQUISA_CELULAR_GESTUAL.md` | Research and roadmap evidence |
| `Migrate-RC-Surface-Data.cmd` / `.ps1` | Windows data migrator (Ableton-RC-Surface → RC Surface) |
| `Migrate RC Surface Data.command` | macOS data migrator |
| `SHA256SUMS.txt` | File hashes for integrity checks |

All six public guides under `docs/` also include Portuguese (PT-BR) translations.

No source maps, no test files, no certs, and no keys are included. You can
inspect the zip before installing.

## Migrating from a previous Ableton-RC-Surface install

If you tested earlier candidates that still used the old name, your data
folder is `worm.ableton-rc-surface`. Installing `RC-Surface-1.0.0.ablx` moves
Live's data identity to `worm.rc-surface` (derived from the manifest `name`).
Before installing the new `.ablx`, run the kit's migrator to copy your
previous data into the new folder without overwriting anything:

- Windows: double-click `Migrate-RC-Surface-Data.cmd` (or run `Migrate-RC-Surface-Data.ps1`)
- macOS: double-click `Migrate RC Surface Data.command`

The script never moves or deletes the source. If the source folder does not
exist (fresh install), it exits with a message and exit 0.

## Tempo-locked controls

Both need Live running and a tempo on the header. Set Live to something that
is not 120 so a wrong reading is obvious.

- [ ] SNP: switch the transition pair to **Sync**, pick `1 bar`, recall a
      slot. The move should take one bar, and the readout should say `1 bar`
      rather than a number of seconds.
- [ ] Change Live's tempo and recall again without touching the slider. The
      transition should follow the new tempo.
- [ ] PERF: set pads to mode **D**, open Deep Sync Settings, and set
      **Burst Config** length to `1 beat`. A touch should decay over one beat.
- [ ] Switch the header to **FREE**. The burst should return to its fixed
      520 ms and ignore both burst controls.
- [ ] SNP: press **Vector XY (1-4)**. The pad should appear with a marked
      corner for each loaded slot, and dragging should blend all four.

## Manual validation status

### Lifecycle and mapping cancellation — F01/F02

Automated regression coverage is available; the following checks in Live are
still pending. These do not require resuming the deferred native audio bench.
No new candidate has been installed by the agent for this round.

- [ ] Panel: press Start repeatedly, then Stop while starting. It must remain
      stopped until another explicit Start. Start again and reconnect the phone.
- [ ] Disable/re-enable the extension while startup is pending; no old server
      should reappear and the current autostart preference should be respected.
- [ ] With a disposable mapping, move a continuous control and tap a pad/toggle,
      then remove/replace the mapping or Clear All. Old gestures must not replay.
- [ ] Hold a trigger-note pad, remove its mapping, and confirm Note Off. Also
      confirm release after disconnect and extension deactivation.
- [ ] Load a preset and move the newly bound control, including the same value
      used by the previous binding. Confirm that the new mapping responds.

An SDK call already sent may finish; cancellation is not undo. Explicit note
and gate releases are expected, not evidence of an obsolete gesture replay.

### Focused visual retest

- [ ] AUD: turn each analysis dial through its range on phone and desktop.
      The needle must stay radial, aligned with the end of the amber arc,
      from lower-left through up to lower-right. Repeat in STAGE.
- [ ] VID desktop: the camera commands start at the top; the larger preview
      preserves image proportions. G1/G2/G3 and all four native-detector labels
      remain readable. Confirm the phone layout still fits without scrolling.
- [ ] AUD shows twelve readable detector cards and no Follow panel or Decisions
      counters. Entering AUD must not enable audio or create a mapping.

Automated tests can verify build, packaging, protocol helpers, and static
client logic. They do not prove that a release works in Ableton Live with
real phones. Treat a build as release-ready only after this checklist has
been completed on the target Ableton, OS, browser, and phone matrix.

## Install the `.ablx`

1. **Quit Ableton Live** if it is running.
2. **Double-click** `RC-Surface-1.0.0.ablx`.
3. Live's extension installer opens. Click **Install**.
4. Live places the file under your **User Library / Extensions**.
5. **Restart Live** if it was already running.

## Install Optional Dependencies

### 1. AbletonOSC (for Deep Sync features)
To test beat-accurate LFO/Stutter sync, metronome flash, and locator transport overlays:
- Download the repository: [AbletonOSC GitHub](https://github.com/ideoforms/AbletonOSC) (Download ZIP).
- Place the extracted `AbletonOSC` folder into your Live's `MIDI Remote Scripts` directory.
- In Live Preferences -> **Link/Tempo/MIDI**, select **AbletonOSC** as a Control Surface.

### 2. RC-Midi-Receiver.amxd (for MIDI Trigger Notes)
To test trigger note mapping functionality:
- Use Receiver v2 (**SDK / LOCAL MAX — NO UDP**). Back up the Set and replace
  every old Receiver instance; keep one v2 per destination. Upgrading only the
  extension does not remove old UDP listeners. Keep legacy firewall protection
  until those devices are unloaded; see [SECURITY.md](../docs/SECURITY.md).
- Copy the `RC-Midi-Receiver.amxd` file (included in this ZIP kit) into your Ableton **User Library** (e.g., under `User Library/Presets/MIDI Effects/Max MIDI Effect/`).

Use **Receiver v2.2**: v2.1's short-name mismatch falsely reports an old
Receiver. Verify `RC MIDI Packet v2` (Float, 0..4194303) via the Live API first.
**SDK Notes** arms itself after the device finishes loading: a fresh phone pad
press/release must play with no click. Turn it OFF and verify a pad is blocked,
then ON again. Hold a note and use OFF/Panic: it must release and stay
disarmed (Panic stays OFF until clicked). Save/reopen: no notes on load, SDK
Notes ON by itself. Repeat Device On off/on (re-arms) and check two-track isolation.
Never automate/map the internal packet; automation/Undo while armed is not
authenticated. The trial folder contains only the changed AMXD; keep ABLX r3.
Disarm before recalling device presets on an already running instance; the
post-initialization reset cannot block values restored before its notification.

### 3. RC-Audio-Sender.amxd (for audio-track pitch detection)

> **v2 must be retested in Live.** Previous field evidence belongs to the UDP
> devices. Enable Audio Sender input on the intended v2 Receiver (OFF at load).
> This local Max bus is separate from the phone's track-addressed SDK path.
> Keep the sound probe below as a smoke test, not a latency measurement.

To test pitch detection from an Ableton audio track:
- Copy the `RC-Audio-Sender.amxd` file (included in this ZIP kit) into your
  Ableton **User Library** (e.g., under
  `User Library/Presets/Audio Effects/Max Audio Effect/`).

### Windows

Use the `.ablx` from the locally verified kit and compare its hash with
`SHA256SUMS.txt`. The HTTPS certificate is not a package-signing certificate.
If Windows or Live refuses the artifact, record the exact error before
changing any security setting.

### macOS

Use the matching kit and verify its hash. Record any installer or security
warning verbatim; do not disable system protection as a general workaround.

## Open the bridge

1. In Live, open **Extensions** (or `Cmd-Shift-A` / `Ctrl-Shift-A`).
2. Look for **RC Surface** and click **Show panel**.
3. A window opens with a **Performance QR** for the phone client
   (controller with the MIX tab built in). An **admin** link sits
   under the Performance QR. The current interface has no separate Mix QR.
4. Plain HTTP binds only to loopback (`127.0.0.1`) on **8730** for the local
   panel/admin surfaces. Phone traffic binds HTTPS/WSS on the LAN, normally on
   **8731**. Keeping the port stable means a phone page that was
   already open reconnects by itself after Live restarts, instead of retrying
   a dead port forever. If another extension already owns 8730, Surface falls
   back to an OS-assigned port and the panel shows the one actually in use.
   Set `RC_SURFACE_PORT` to override.

## Connect your phone

1. **Scan the Performance QR** with your phone's camera.
2. Your phone's browser opens `https://<your-lan-ip>:<port>/`.
3. The browser warns **Your connection is not private** because the
   bridge uses a self-signed certificate unique to your install. This
   is expected.
   - **Chrome on Android**: tap *Advanced* → *Proceed anyway*.
   - **Safari on iOS**: tap *Show details* → *visit this website* → *Visit*.
4. Once accepted, the controller loads. Hold your phone in landscape
   with both thumbs on the screen.

For full detail see `docs/INSTALL.md`.

### If the phone does not connect

Open `https://<lan-ip>:8731/diag?token=<token from the QR URL>` in the same
browser that fails. The page reports what the server actually received —
the `Origin`/`Host` headers, the same-origin verdict and its reason, whether
the token matched, the bound ports, and the real WebSocket close code. Copy
that report into any bug report; it is far more useful than "it failed".

The phone also self-diagnoses: when a handshake never completes it asks the
server why and prints the reason to the browser console.

### Tokens are regenerated every time the server starts

A page left open across a Live restart reconnects but its token is no longer
valid, so the session drops to read-only. The status bar shows
**SESSION EXPIRED — RESCAN QR**. That is expected — rescan the QR to regain
control. Transport, pads and knobs are rejected until you do. Repeat this test
with **Stop**, then **Start**, in the panel without restarting Live.

## Test checklist

Walk through this list at least once per release. Mark any failure so
the report below is precise.

- [ ] **Install**: `.ablx` installs without errors.
- [ ] **v2 MIDI isolation**: replace every old Receiver in the Set, then
      confirm no UDP 9000 listener attributable to these devices. With a MIDI
      monitor (speakers muted), test two selected tracks independently and OFF
      on release/disconnect/Clear All/reorder. Reject an old or duplicate
      Receiver with a useful message. No second-machine firewall proof is
      claimed for old devices: keep them unloaded or separately protected.

- [ ] **Panel opens**: the QR + admin dialog renders the Performance QR.
- [ ] **Phone connects**: scanning the Performance QR lands on the
      controller page after accepting the cert.
- [ ] **Phone MIX tab works**: open the MIX tab inside the Performance
      client and verify the structure-aware mobile mixer responds to
      bindings.
- [ ] **Workspace scaling**: at desktop sizes such as 1280×960 and 1920×1200,
      check readable AUD labels/dials and all twelve descriptors in the right column (the column scrolls only on short phone screens).
      VID should show a proportional camera preview and three stacked pose
      cards, without towering buttons. In phone landscape and desktop, MIX
      knob/fader panels must have equal width/height and fill the workspace.
      Repeat in STAGE; drag a knob and fader to verify their mappings still work.
- [ ] **MIX reset**: move a normal fader, then double-click/tap it. It returns
      to 85%; after mapping that fader to pan, the reset returns to 50%.
- [ ] **SNP/VID polish**: Free and Sync both use a surface-styled transition
      fader, with seconds/divisions unchanged. In PT-BR, G1/G2/G3 show
      `CAPTURAR / POSE` and `APAGAR / ÚLTIMA` on two unclipped lines.
- [ ] **Mobile MAP opens**: tap **MAP** near the BPM display. Verify the
      current performance page remains visible, mappable controls show
      the MAP highlight, and normal performance touches are intercepted.
- [ ] **Bind from phone**: select **knob-1** or **fader-1**, tap
      **Bind**, browse the hierarchical tree, and bind it to a device
      parameter. Leave MAP mode and verify the Live parameter follows.
- [ ] **Return/Main targets**: from the phone picker, verify **Song /
      Main / Master**, **Tracks**, and **Return Tracks** groups appear.
      Bind one return-track or main/master mixer target if the Live set
      contains one.
- [ ] **XY axis mapping**: select an XY pad in MAP mode, switch between
      X and Y axes, bind both axes, then move the XY pad and verify both
      mapped values move independently.
- [ ] **Curve editor**: on a continuous target, adjust **Curve**,
      **Target scale**, **Drive**, **Comp**, **In/Out Min/Max**, and **Smooth**. Verify the
      canvas curve and moving dot update while the control moves.
- [ ] **Target ranges**: map Audio Brightness to Song Tempo and Pinch Clutch X
      to a filter frequency. Confirm both travel through intermediate values,
      stay within the Live target range, and do not jump only between minimum
      and maximum. Compare Auto, Linear, and Geometric where appropriate.
- [ ] **Toggle/threshold mode**: change a target mode to **Toggle** and
      verify **Threshold** appears and the mapped output follows the
      threshold behavior.
- [ ] **Trigger Note**: select **pad 1**, tap **Trigger Note**, choose a
      MIDI track, set Pitch/Octave and Velocity, arm the track, and verify
      the note fires. If the Receiver is absent, verify the message gives
      manual placement guidance without a technical insertion error. Add
      `RC-Midi-Receiver.amxd` to the MIDI track, choose it again, and retry.
- [ ] **Mapping presets**: save a mobile mapping preset, load it, delete
      it, and verify mappings refresh without reconnecting the phone.
- [ ] **Snapshots morph mappings**: capture two different states for a
      mapped LFO, Stutter, knob, or fader. Recall a snapshot with a
      visible transition time and verify the mapped Ableton parameter
      moves during the transition instead of jumping only at the end.
- [ ] **Audio sensor**: in the phone app, enable the audio panel. Verify
      the 2.5-second signal/descriptor timeline paints, and verify detector
      SENS/RELEASE/SMOOTH/WINDOW settings update without restarting capture.
      Confirm RMS and all twelve active descriptors move; no retired pitch controls.
- [ ] **Retired mapping**: load a copy of a profile with an old Follow mapping. Confirm
      the unsupported binding is discarded, emits no notes and cannot be created from AUD,
      phone MAP, or panel Mappings. Audio Lab is not included in the production package.
- [ ] **Built-in audio detectors**: all twelve descriptors can be chosen as MAP
      sources with finite values in 0..1. Centroid/Spread/Rolloff cards show Hz;
      those physical readouts do not change normalized mapping values.
- [ ] **Band separation**: play a kick and a hat into the same input. Kick must
      move Kick and barely move Snare, and the hat the reverse. Then widen
      WINDOW to x4 and repeat with a snare that has a strong low body: the
      narrow window cannot resolve a 200 Hz body from the kick band.
- [ ] **Detector knobs**: SENS, RELEASE and CURVE change the attacks and only
      the attacks; SMOOTH changes its own group; GAIN scales its group's
      normalized outputs (not the Hz descriptors); WINDOW resizes the analysis
      and survives a reload. Vertical drag, keyboard arrows and double-click
      reset must work with flat arc bodies and the group's focus accent.
- [ ] **Audio SYNC**: at 120 BPM select RELEASE 1/1 and each SMOOTH 1/4:
      expect 2000/500 ms. Change Live to 60 BPM: expect 4000/1000 ms without
      touching a knob. Also test 30 BPM (8000/2000 ms), tempo automation during
      drag, and all 24 straight/triplet/dotted divisions from 1/128 to 1/1.
      At 120 BPM 1/128 displays16 ms but processes15.625 ms; 1/128 T at240 BPM
      displays5 ms and processes5.2083 ms. FREE RELEASE still spans10..500 ms.
      FREE restores the previous milliseconds;
      SYNC restores the chosen divisions. OFF smoothing passes directly in both
      modes. Reload, reconnect, and change the analysis window; settings survive.
      Audio-derived BPM must never replace the header clock, even in FREE.
      Times describe exponential time constants, not beat-grid quantization.
- [ ] **Dormant pitch lane**: pitch, note, BPM, clarity and bend have no
      readout, no dial and no MAP entry. A profile saved with one of those
      mappings still loads, and nothing fires from it.
      Follow the isolated probes below; do not require MIDI note recognition.
- [ ] **Audio Sender in Max**: place `RC-Audio-Sender.amxd` on an audio track
      and route its pitch output through the bridge to a MIDI track. Confirm
      the device loads without Max errors. Play a stable note, stop into
      silence, then play the same note again. Verify Live receives a note-off
      during silence and a fresh note-on when the pitch returns, without a
      stuck note or a missed retrigger.

### Audio descriptor and responsiveness checks

Check AUD in landscape with browser bars visible and in STAGE, microphone
off/on, both languages, and sizes 568x320, 851x300, 851x393, 1024x900,
1133x1000, 1280x960 and 1920x1200. The signal graph, grouped detector knobs,
WINDOW picker and cards must fit without clipped values or overlap.
The twelve cards are always on screen; on short phone screens their column
scrolls. Exercise every graph view, including All, and confirm the legend row
wraps without losing a name. Colored legends toggle individual curves and the
graph ceiling readout must follow what is actually drawn.
In All, four labelled control groups grow with content and end at the card's
inner bottom edge, with no dead row below. WINDOW is separate. On short screens
scroll the groups horizontally; the graph keeps at least 28 px of signal area.
Bands still measure linear RMS, not perceived loudness. A quiet High reading
alone does not establish a broken detector; use equal-amplitude reference tones.
All twelve descriptor curves and their card/legend swatches are continuous,
with three tones per family; the Amplitude gate reference remains dashed.
Use labels and legend isolation for ambiguous or overlapping colours.
There is no Follow panel, Decisions mode, or OUT counter in the active surface.

Palette audit (2026-09-05): the supplied dataviz validator passed >=3:1
contrast for all twelve marks against #0e0e0e, adjacent normal-vision
separation (minimum OKLab Delta E 15.5), and adjacent protan/deutan simulation
(minimum 11.4; tritan 11.8). Its overall categorical gate did **not** pass:
the deliberately pale steps exceed its narrow dark-mode lightness band and
fall below its chroma floor. These are four labelled shade families, not twelve
independent categorical hues; no all-pairs colour-vision guarantee is claimed.
The user's accepted design relies on names and legend toggles as well as colour.

1. **Silence and lifecycle:** with input off, all twelve descriptors must be zero.
   Enable input and note the microphone's background noise; digital silence
   should return to zero. Start/stop/start quickly, switch tabs, deny permission and retry, and
   suspend or unplug the input. Old capture completions must not revive audio;
   lost input must release values instead of leaving a frozen pulse.
2. **Transient:** play separated taps at different strengths. Each attack
   should give a prompt pulse and decay, not repeated pulses from a steady
   held tone. Do not confuse the pulse release with attack latency.
3. **Kick / Snare:** alternate isolated kicks and snares, then test a full mix.
   Compare relative responses. These are spectral attack heuristics, not
   guaranteed instrument separation; document crosstalk rather than claiming
   classification accuracy. Test the actual microphone/input sample rate.
4. **Brightness:** compare a dark sustained sound with a brighter one at
   comparable level. Verify a useful continuous change and zero in silence.
5. **Mapping:** MAP each card to a synth parameter with a conservative output
   range and Smooth = 0. Check the real Live parameter and audible modulation,
   not only the card meter. Change gate/pitch/stability settings: they must not
   hold up the twelve descriptors. Repeat while another modulator is active.
6. **Timing:** record the audible attack and resulting synth modulation in one
   session. Report the input device, sample rate, browser, network, and Live
   buffer size. No absolute microphone-to-Live latency is established by
   automated DSP tests or the drawing's refresh rate.
7. **Spectral accuracy:** compare equal-level low/high tones: Centroid and
   Rolloff should move upward. Compare a tone and noise: Flatness should rise
   for noise. Change spectral shape: Flux should pulse; changing only level
   should not. Broaden the spectrum: Spread should increase. Test RMS bands
   with isolated low/mid/high tones. Digital silence and restart clear values;
   do not interpret the first timbre window of zeros as a capture failure.
8. **Loopback/music:** choose the PC loopback input in the browser on that PC,
   then play music. A phone microphone is room capture, not PC loopback. Use
   Bands/Texture for continuous modulation, Attacks for pulses. Record source
   and synth output together to distinguish musical usefulness from timing.
9. **Disconnect and recovery:** interrupt network/audio during a pulse and
   reconnect. Verify no stuck output, stale burst replay, or unwanted notes.

- [ ] **Vision sensor (offline)**: disconnect public internet, enable the
      camera panel, and show one hand. Verify `sensor.vision.fist`,
      `sensor.vision.open`, direct X/Y/Z, and Pinch Clutch X/Y/Z track
      correctly. Confirm PALM/FACE remain diagnostics rather than MAP targets.

### Video/vision recovery checks

Also map a Pinch Clutch axis, move it away from centre, briefly release while
repositioning the hand, and pinch again immediately. It must retain the held
value while the hand stays still, then respond to new movement without a jump.
Repeat after a longer release and after a momentary
tracking loss; release debounce must not turn hand repositioning into a jump.

1. Open VID in phone landscape fullscreen and confirm no vertical page scroll.
2. Grant camera permission on the first Camera tap; confirm the preview starts without reload.
3. Stop and restart Camera; simulate/observe a failed acquisition and retry without reload.
4. Enter MAP and select X, Y, and Z from the bottom signal strip.
5. Capture three examples of one pose, verify TEST recognizes it at a different position/distance and slight wrist angle.
6. Reload the page, start Camera, and verify the saved pose still recognizes.
7. Show a clearly different pose and verify the learned slot does not trigger.

- [ ] **Reconnect**: kill the phone browser tab, reopen the QR link;
      verify the controller reconnects without restarting Live.
- [ ] **Self-test cert**: verify the connection survives a Live restart
      without re-prompting (cert is cached for the lifetime of the cert,
      about a year).
- [ ] **No haptics**: confirm no vibration prompts appear and no
      haptic settings UI is exposed. Haptics are retired in this test
      series.

## Report a bug

Open a focused report in the project issue tracker:
`https://github.com/ntworm/ableton-rc-surface/issues`.
Security problems must use the private process in `docs/SECURITY.md`.

Please include:

- **OS**: Windows 11 / macOS 14 / iOS 17 / Android 14 / etc.
- **Ableton Live version**: Help → About Live.
- **Extension version**: 1.0.0 (this kit).
- **Phone browser**: Chrome 124 / Safari 17 / Edge 124 / etc.
- **Phone model** (only if vision / sensor behavior is involved).
- **Steps**: the exact sequence you ran before the bug.
- **Expected**: what you expected to happen.
- **Actual**: what actually happened.
- **Screenshot or short screen recording** if the bug is visual.
- **Logs**: Live log (Help → Show Log) plus the browser console
  (Desktop: F12 → Console; phone: use a remote-debug session or
  a desktop browser with the same URL).

If a panel UI element does not behave as expected, mention the exact
button or control and the value you tried to set.

## Verifying the kit

If you received this kit over a chat or email, you can verify the
contents with:

```bash
sha256sum -c SHA256SUMS.txt
```

(or `shasum -a 256 -c SHA256SUMS.txt` on macOS). All listed files should
report OK.

## Uninstall

In Live: **Extensions** → **Manage Extensions** → remove the entry.
Then delete the cert folder under
`Preferences/Extensions/<extension-id>/` if you want a clean slate.

## License

PolyForm Noncommercial 1.0.0. See `LICENSE` in the source repository for the full text. Free to download, modify, and redistribute for noncommercial purposes.
# Contextual CALIBRATE candidate — 2026-09-13

New physical check only: SNS (still posture, 1 s); AUD (normal playing sound,
5 s; RMS/envelope response only); VID (hand raised, 4 s; lighting/tracking check,
automatic camera modes only when supported). CALIBRATE is absent on PERF/MIX/SNP.
Read USER-GUIDE / USER-GUIDE.pt-BR, CALIBRATE section. Cancel, reset and input
change must not affect another page. No fake success without fresh readings.
Camera may legitimately report checked without settings changed.

Owner already accepted r12 Stutter with a small unmeasured timing offset;
do not repeat MIDI/XY/Stutter micro-tests. Audio latency bench remains separate.
This calibration candidate is not physically accepted or a public release.
