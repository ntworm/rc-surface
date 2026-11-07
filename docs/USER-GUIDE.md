# RC Surface user guide

This guide describes the phone controller during setup, soundcheck and
performance.

> **Scope**: the phone client (`/phone-v3/`) is the main surface. The
> Ableton panel and the admin dashboard are covered in
> `docs/CUSTOMIZATION.md`.
> RC Surface supports one controller at a time. Control the performance from
> the phone or desktop, never both simultaneously.

---

## Realtime control

XY, MIX and sensor values use a separate control stream. The first frame is
sent immediately, and later traffic is coalesced at a minimum spacing of
8 ms. This is a dispatch limit, not a promised end-to-end latency. Newer
continuous positions replace unsent ones, and pad edges keep their order.

**Smooth = 0** adds no mapping ramp. Explicit Smooth values, musical
envelopes and safe-loss behavior still apply. Main and Master targets expand
as **Main → device → parameter**, like other tracks. Tempo stays direct.

Host storage is isolated under `surface-v2`, and the performance payload uses
schema 2. The physical latency in Live has no recorded benchmark.

Reload the phone page after updating the extension.

## 1. Phone layout

The phone UI is a single page with seven tabs. Switch tabs with the buttons on
the top strip:

| Tab  | What it does |
| --- | --- |
| PERF | Performance: pads, XY, LFOs, Squares, UTIL shortcuts |
| MIX | Eight knobs and eight faders for mixer control |
| SNP | Snapshots: 8 capture slots, morph between them |
| SNS | Sensors: live readouts for motion and orientation |
| AUD | Microphone and audio-analysis inputs |
| VID | Camera, hand tracking, and learned static poses |
| REC | Recording station: three local views (Record, Arrangement, Clip) over one shared capture bar and one fixed mode bar |

The top strip also holds the **MAP / AUT / CFG** header modes near the BPM
display, plus **SYNC**, **FULLSCREEN** and a contextual **CALIBRATE** on SNS,
AUD and VID. See [§ 7 Top-bar controls](#7-top-bar-controls) and
[§ 8 MAP mode](#8-map-mode).

The gear icon in the top bar opens the settings of the current tab. PERF opens
Deep Sync. VID opens recognition and tracking-loss settings. AUD reuses the
input and analysis controls. SNS shows the sensor capabilities with explicit
enable and calibrate actions. MIX and SNP have no header gear. Opening
settings never starts a camera, microphone or sensor permission request.
CONF and REC quick controls and the contextual **CALIBRATE** stay available.

---

## 2. Pad modes (A / B / C / D)

The pad mode selector sits in the middle column of the PERF tab:

```
┌───┬───┬───┬───┐
│ A │ B │ C │ D │
└───┴───┴───┴───┘
```

The selected mode applies to **all 12 pads** (`pad-1`..`pad-12`),
**all eight LFO slots** (`toggle-1`..`toggle-8`, `T1`..`T8`).
The mode is shared: pick one mode and every control uses it.

### Mode A: Momentary (default)

- Touch sends a non-zero value. Release sends zero.
- Drag **vertically** to scale the value from `0` at the release point to `1`
  at the top of the drag range.

### Mode B: Hold

- Touch latches the control **on**. Release without a drag sends it back off.
- Any movement, vertical or horizontal, keeps it held until you drag the value
  back to zero.
- For Squares (see [§ 4](#4-square-pulse)): a tap turns the square off.
  Release with an amplitude below `0.02` also turns it off. Horizontal speed
  changes keep it running while the amplitude is nonzero.

### Mode C: Toggle

- Tap turns the control on. Tap again turns it off.
- A small vertical drag while the control is on re-modulates the value without
  toggling it off. The drag is ignored by the toggle state.
- A tap that turns the control on restores the last value you used in this
  mode. Without a value, it starts at `1`.

### Mode D: Burst

- Touch fires a one-shot envelope that peaks at `1`.
- Drag **vertically while holding** modulates the peak between `0.15` and `1`.

Mode D applies to every control it covers, and not only to the pads. A pad
value rises and falls. An LFO or Square opens its depth over the attack and
closes it over the release. In `FREE` the envelope is a fixed 520 ms with a
70 ms attack for all of them. In `SYNC` the length comes from Live's tempo, and
**Deep Sync Settings → Burst Config (Pad Mode D)** chooses it:

| Control | What it does |
| --- | --- |
| Length (Subdivision) | One bar down to 1/16. At 120 BPM, `1 beat` is 500 ms. |
| Attack | Drag the peak along the drawn envelope. On a phone, press and hold the peak for about 0.6 s first; scrolling across the short envelope never edits it. |

Under the drawing the panel prints the resolved setting: the subdivision, the
tempo it multiplies, the clock source behind that tempo, and the resulting
milliseconds. Read that line when a length misbehaves. A stale tempo, a
different clock source and `FREE` overriding the grid look the same until the
line names which one it is. While `SYNC` is off the length grid dims, because
nothing it offers reaches the burst.

In `SYNC` the length follows the grid, so the stab starts on the grid
position. In `FREE` the burst keeps the fixed envelope and ignores both
controls. If Live has not reported a tempo yet, the length falls back to
120 BPM rather than going silent.

---

## 3. Toggles (T1–T8)

All eight slots (`toggle-1`..`toggle-8`) share the same component and start in
**Global** for waveform, mode and timing. CFG offers **Sine, Triangle, Ramp Up,
Ramp Down and Square**. The panel shows one centred TOGGLES heading, with
T1–T4 above T5–T8. Each slot shows a short waveform label and its effective
A/B/C/D mode.

The active mode colours match the pads: A blue, B amber, C green, D pink.
Waveforms do not introduce a second colour system. Drag horizontally for speed
and vertically for depth. Those two values are not in CFG.

A stops on release, B retains a dragged setting, C toggles, and D runs one
burst. The burst length, the attack and the snapshots stay available.

CFG is compact: waveform, mode, timing and a subdivision selector in SYNC.
Only rhythms supported at the current BPM and waveform are offered. Square
also accounts for ratchet and swing. A pin that the current BPM does not
support displays its effective limited rhythm. FREE hides the subdivision row.
Expand **Advanced** for phase and for the swing and ratchet of Square. The
menu body scrolls within the viewport.

Global inheritance survives project, preset and snapshot capture and recall.
Global does not mean a saved explicit A or Sine. A per-slot selection stays
local to that slot. Restoring the shared defaults removes its overrides.

The generator ceilings are sine 4 Hz, triangle and ramps 3 Hz, and Square pulse
15 Hz including ratchet. These are software limits, not measured physical
fidelity guarantees for Live.

## 4. Square pulse

Square alternates between **0 and the chosen depth**. At 50% depth it
alternates 0%/50%. Square includes swing and ratchet (1–4). There is no
separate Stutter waveform or control. The pulse does not sample or repeat
audio. Its musical effect depends on the mapped destination. Any of T1–T8 can
use it.

The local pulse indicator follows the actual gate, with a thin value rail.
It is a preview, not confirmation of Live delivery, and a display may miss fast
pulses. Changing to or from Square stops the previous algorithm before the
next touch.

## 5. PERF UTIL shortcuts

The PERF tab has a compact `UTIL` block for actions that do not need a
different page.

- **CAP** arms snapshot capture from the PERF page.
- **1-4** recall snapshot slots 1 through 4.
- **CAP + 1-4** saves the current performance state into that slot.
- **OFF** cancels active snapshot morphing, turns off pads, LFOs and Squares,
  and returns XY pads to center. It does not reset MIX knobs, faders,
  sensors, audio, vision or transport.

---

## 6. XY panels

XY1 and XY2 have identical controls. Open CFG on either pad and select Static
or Physics. Static stays where you release it. Physics coasts and rebounds.
Friction (0.002–0.05), bounce (0–0.95) and speed (0.1–4×) are independent for
each pad, and both pads start Static. Speed scales the free motion, and
friction controls the decay. Switching to Static stops residual motion
immediately. Reading a CFG value emits no control value.

Each axis maps separately as `xy-1.x/y` or `xy-2.x/y`. Position setters and
OFF stop the motion, and OFF centers both axes. The configuration is stored
with the performance profile, presets and snapshots. `xy-N.friction`, `.bounce`
and `.speed` are local numeric setters. Live destination mappings remain the
X/Y axes.

---

## 7. Top-bar controls

Three buttons on the top strip of every page.

### SYNC

Toggles the BPM clock between **SYNC** (locked to Live) and **FREE**
(internal).

- **SYNC** (cyan): LFO and Square rates are quantized to Live's BPM. The
  pad mode D burst takes its length from the grid (see
  [§ 2](#2-pad-modes-a--b--c--d)). A snapshot transition set to Sync does
  the same (see [§ 10](#10-snp-tab)). The header shows the current BPM
  (`120.0 BPM` etc).
- **FREE** (amber): the phone runs its own clock. Use it when Live is not
  running, or when the internal tempo should run regardless of Live.

Pressing SYNC restores the session BPM reported by the last Live broadcast.

### CALIBRATE

CALIBRATE is contextual: it appears only on **SNS**, **AUD** and **VID**.
Each page starts **Not calibrated** and keeps its own state during this browser
session. Switching pages cancels an unfinished collection, not a completed
calibration on another page. Reloading resets all three.

- **SNS:** hold the phone still in the desired neutral posture, then press
  CALIBRATE. One second of stable, fresh readings sets the neutral orientation.
  Rotating the screen invalidates this reference. It does not zero acceleration.
- **AUD:** enable the chosen input and keep a representative passage playing at
  its normal level for five seconds. Calibration adjusts only the **RMS/envelope
  control response**, with a bounded gain (0.25–8x). It does not touch Live
  audio volume, EQ, detector gains, thresholds, RELEASE or SMOOTH, and it does
  not remove noise. Silence is not a valid calibration passage. Stopping or
  changing the input resets the calibration.
- **VID:** enable the camera, stay in the performance frame and raise the hand
  you will use. Over four seconds the app checks image brightness, overexposure
  and continuity of actual hand detections. It enables continuous exposure and
  focus only if the camera advertises support and reports the change. Otherwise
  it says that the camera was checked without changing settings. Poor lighting
  or missing hands require a retry. Hand coordinates, neutral position, learned
  gestures and MediaPipe confidence are never modified.

The compact strip explains what to do and shows the collection progress.
**CANCEL** stops the collection. **RESET** restores the default response of the
page and any camera settings changed by the calibration. A failed or canceled
camera attempt rolls back its changes. Recalibrating replaces the previous
calibration on that page. No button opens the microphone or camera permissions
automatically. The calibration does not measure latency.

### FULLSCREEN

Toggles **Fullscreen Mode**.

- Requests browser fullscreen so the phone UI fills the screen.
- Keeps the compact header, tabs, status and transport on screen. The section
  title, the hint line and the XY readout disappear.
- The header control is a fixed expand/retract icon with no visible word
  label. Its title and its accessibility name are localized, so a screen
  reader announces it in your language. Press the same icon again, or leave
  fullscreen from the browser or the system, to end the mode.

Fullscreen Mode leaves more room for the controls. Other apps can interrupt
fullscreen.

> **Known limitation:** enabling the audio sensor or camera while Fullscreen
> Mode is active can make Chrome exit fullscreen. On the tested Samsung S25F,
> fullscreen may not become available again until the controller tab is closed
> and reopened. Enable the audio or the camera before entering Fullscreen Mode.
> When fullscreen ends this way, the mode ends with it, and the RETRACT icon
> does not stay active on a page that is not fullscreen.

### Contextual header and TRN settings

The header shows only what acts on the current tab: **AUT** on PERF (XY 1 and
XY 2 loops), **CFG** on PERF and MIX, and **MAP** on every tab except REC.
Leaving a tab turns off a mode that the tab does not support. An open MAP
closes when you enter REC, and the mappings stay unchanged. The tabs and the
transport keep their composition, and the common controls keep the same
position between tabs. The fullscreen expand/retract icon and the status remain
visible, in Fullscreen Mode and on narrow landscape screens.

**TRN** opens Transport Lite. The first row holds **PLAY**, **STOP**, **PREV**
and **NEXT**. The second row holds **CLICK**, **GLOBAL QUANTIZATION** and
**REFRESH**, always visible and without a settings button. A line below them
appears only when something needs attention (no AbletonOSC, an unconfirmed
change, a viewer).
**GLOBAL QUANTIZATION** shows the value Live confirmed and changes the Set's
`clip_trigger_quantization`. A clip with its own quantization keeps it.
**METRONOME** turns Live's click on or off. It is the same metronome as REC
**CLICK**, and a change made in TRN, REC or Live appears in both within about a
second. Opening TRN reads the current value from Live even when no Launch Clip
mapping exists. **CLICK** is never locked. Viewers can read but not write.
Nothing is replayed after a reconnect, and a missing AbletonOSC link shows the
value as unknown. The metronome's sound, rhythm and count-in are not exposed to
extensions: set them in Live, or use REC **PRE-ROLL** for a count-off.

---

## 8. MAP mode

Tap **MAP** near the BPM display to enter mapping mode from the phone.
MAP does not open a separate page in the browser. It overlays a mapping
workflow on the real controller, so you pick the control you are already
using.

### Selecting a control

While MAP mode is active, the mappable controls on the visible performance
page become selectable with a blue MAP outline and label:

- PERF controls: pads, XY pads, LFOs, Squares.
- MIX controls: knobs and faders.
- Sensor controls from the fallback list in the MAP panel.

Tap a highlighted control to select it. For XY pads, the editor exposes the
axes separately:

- `xy-1.x` / `xy-2.x` - horizontal axis.
- `xy-1.y` / `xy-2.y` - vertical axis.

### Bind to parameter

Use **Bind** to move an Ableton parameter with a phone control. The target
picker is hierarchical:

- **Song / Main / Master**: song tempo and main/master track targets.
- **Tracks**: normal Live tracks, mixer targets, devices, and parameters.
- **Return Tracks**: return-track mixer targets, devices, and parameters.

Open a track, then a device, then choose the parameter. Search filters the
tree and keeps the track and device context visible, so you can tell which
parameter belongs to which track.

### Trigger note to MIDI track

Use **Trigger Note** to send a MIDI note from a phone control, instead of
moving a parameter continuously.

1. Select a pad, LFO, Square, XY axis, knob, or fader in MAP mode.
2. Tap **Trigger Note**.
3. Pick a MIDI track.
4. The extension checks for `RC-Midi-Receiver.amxd` on that track. If the
   device is already there, the extension reuses it. Otherwise, place the
   bundled device from the release/User Library on that MIDI track in Live
   and try again. Live's Extensions SDK cannot insert Max for Live devices
   automatically.
5. Choose the note with the **Pitch** and **Octave** controls and set
   **Velocity**.

**Receiver v2.2:** **SDK Notes** arms itself once the device has finished
loading. It discards any packet value that the Set restored, so a fresh pad
press plays without a click. Disabling the device turns it OFF, and enabling
it again arms it. **Panic** turns it OFF and it stays OFF until you click it.
Turn SDK Notes OFF before recalling a preset on a loaded device. The Audio
Sender input is a separate opt-in. Do not automate or MIDI-map
`RC MIDI Packet v2`: the API requires an automatable parameter, and while SDK
Notes is ON such an automation can play notes.

The extension also passes upstream MIDI byte for byte through **midiin →
midiout**, separately from the SDK and Audio Sender gates and their Panic and
flush path. Keyboard channels, Note-Off, velocity and controllers keep their
original bytes. Replace a loaded Receiver instance with the
`RC-Midi-Receiver.amxd` from this release. Updating the extension does not
replace the devices in a Set. Check the keyboard and the generated notes in
Live before performing.

Several controls can trigger notes on the same MIDI track. Different notes are
treated as different trigger targets.

### Trigger Note mode (`trigger_note`)

Set the target mode to `trigger_note` to map a control to the notes of a MIDI
track that carries an `RcReceiver v2` device. The editor shows a contextual
interface for chord and note triggering:

- **Destination Track & Switch:** shows the target MIDI track name and a badge
  for the `RcReceiver v2` device. Tap **Change** to reassign the target track.
  The note, the velocity and the timing stay as they are.
- **Pitch and Octave:** pick the pitch (C through B) and the octave (-2 through
  8). The editor calculates the standard MIDI note number (C-2 = 0, C2 = 48,
  G8 = 127). Pitches above G8 (MIDI 128+) are rejected.
- **Velocity:** the outgoing MIDI velocity, from 1 to 127, default 100.
- **Timing:**
  - `immediate` (Now): fires the note immediately upon the gesture.
  - `beat` (Next Beat): quantizes the Note-On to the next quarter-note beat,
    from a fresh OSC transport position.
  - `bar` (Bar): quantizes the Note-On to the next bar boundary.
- **Gate:**
  - `pulse` (Short): plays for a chosen duration. A new synchronized note
    defaults to **1/4 bar**. Choose 1/16, 1/8, 1/4, 1/2, 1, 2 or 4 bars, or
    switch to free milliseconds (20–2000 ms). An existing millisecond mapping
    keeps its saved duration.
  - `hold` (While Held): sustains the note until the control or the gesture is
    released.
  - `hold` is incompatible with a quantized timing (`beat` or `bar`). Choosing
    a quantized timing switches the gate to `pulse`.
- **Editor layout:** the destination appears once. Note follows, with the
  pitch, the octave, the MIDI number and the velocity. Trigger follows, with
  the moment it fires and how long it plays. Choosing Next Beat or Bar from
  Now opens Musical, 1/4 bar, including after While Held. Choose ms explicitly
  for a free duration. An old millisecond preset stays unchanged when it is
  opened.
- **Musical duration:** available with Short in Now, Next Beat and Bar. Tap a
  fraction directly. There is no duration dropdown and no estimated-ms
  readout. Now starts immediately and uses the connected Live BPM and meter
  for its release timer, even while the playback is stopped. Unknown or
  disconnected musical metadata blocks the note and reports it. ms stays
  available. While Held uses the real gesture release instead of a fixed
  duration.
- **Advanced:** collapsed by default. It holds the trigger threshold and the
  signal-loss behavior. Bind and Trigger Note are selected at entry, and there
  is no second mapping-mode selector. Presets stay collapsed. Bind, Trigger
  Note, Unbind Target, Clear Control and Clear All Mappings sit below the
  control title and stay reachable while scrolling. Several mappings form one
  labelled block, with the Bind or Trigger Note type and the destination on
  each selectable row. Only meaningful note feedback is displayed.
- **Bind:** the Direct Continuous/Toggle and Linear/Exp/Log/S buttons come
  before a full-width interactive graph. The primary faders are the output
  min/max, the Drive, the Compression and the Smoothing. The three graph
  points follow the effective output after the Drive and the Compression. The
  output min/max remain the limits that scale that response. Dragging a point
  accounts for these settings, and a saturated or flat response keeps the
  values bounded. The input range, the target scale, the takeover, the safe
  loss, the idle and the neutral values are under Advanced. Small fader thumbs
  keep a larger interaction area and a double-click reset. On a phone, the
  three graph points change only after you press and hold one for about 0.6 s:
  it gets a ring, then you drag and lift. A quick tap, a scroll or a touch on
  the background never changes a value. Cancelling, by a system gesture, by
  leaving the panel, by changing tab or by losing the connection, restores the
  value the point had when it was selected. A mouse still drags at once, and a
  double-click still resets.
- **Safe Lifecycle & Cancellation:** a pending Next Beat or Bar note is
  cancelled by a transport stop, a meter change, a seek, a loop jump, a stale
  transport clock (>1000 ms), an unbinding or a disconnection. A sounding Next
  Beat or Bar note is released by a transport stop, a clock loss, an unbinding
  or a disconnection. After a seek, a loop jump or a meter change it ends with
  its own Note-Off. The Now notes do not follow the transport: Short ends with
  its own Note-Off, and While Held ends when the control or the gesture is
  released. An unbinding or a disconnection releases them early. A trigger that
  runs more than 20 ms late is discarded as missed. The scheduling operates per
  track lane, with a latest-wins policy and a cap of 64 active lanes. A
  retrigger on the same track retires the previous voice and its OFF timer
  before the replacement ON, so the new note keeps its full duration.

### Launch Clip (`clip_launch`)

Use **Launch Clip** when a control, typically a learned pose G1, G2 or G3,
should ask Live for a Session clip that is already in your Set. Everything is
set up from MAP. There is no loopMIDI, no auxiliary track and no Ctrl+M
mapping. Launch Clip needs AbletonOSC (see [INSTALL](INSTALL.md)). The
Extensions SDK lists tracks and clips but cannot launch them.

1. Select the control in MAP mode and tap **Launch Clip**.
2. Pick a track. Only regular tracks that hold clips are listed, with their
   real names. Group tracks are not offered, because launching a group slot
   fires a whole row.
3. Pick a clip (slot number and real clip name).

After creating, renaming or deleting tracks or clips in Live, tap **Refresh**
in the picker header. Bind, Trigger Note and both Launch Clip pickers have
this button, and the current filter and chosen track stay selected when they
are available. If saving fails, the Launch Clip picker stays open and shows
the error, so you can retry.

**Choice**, one per mapping:

- **Launch clip** (default): each activation asks for that clip. Holding the
  pose does not repeat it. Releasing lets the clip keep playing, and another
  pose chooses another clip directly, without a neutral pose in between. If
  Live already has that clip waiting or playing, nothing is sent.
- **Advance list**: 2 to 8 clips of the same track. Each new activation asks
  for the clip after the one Live is playing, and wraps at the end. Only one
  advance per quantized entry: while the requested clip is still waiting in
  Live, further activations do not move the list again.
- **Stop track**: Live's track stop, quantized by Live. It also cancels a
  launch that is still waiting on that track.

**Quantization** is always Live's: the clip's own launch quantization, or the
song setting when the clip says Global. The effective value is displayed
separately from **Set global quantization**. Choose a global value and tap
**Apply** to change the entire Set, including the other clips that use Global.
A clip with its own quantization keeps that setting. None is allowed for the
Set, and the continuation rules still require a usable quantum.

The editor waits for Live to confirm the requested value, for up to two
seconds. It keeps the observed value visible while it waits, and it reports a
disconnection or a failure. It never retries or reapplies the value after a
reconnect, after opening an editor or after loading a mapping or a preset.
Save the Set in Live to persist it.

**State** comes only from what Live reports back: Ready, Sent (waiting for
Live), Waiting in Live (next boundary), Playing, Stop waiting in Live, Track
stopped, No confirmation from Live, AbletonOSC disconnected, Destination
missing, More than one match, and a blocked state when Live and AbletonOSC
list the tracks differently. Sending a message is never shown as playback.
**Test** runs one activation with the same rules as the gesture.

A confirmed hand absence releases the learned pose and rearms its edge, and
the clip and the RC continuation keep playing. The reacquisition needs a new
stable entry. A phone disconnection or reconnection never resends anything.
The pose recognizer filters small oscillations, and a request that Live has
already received is not repeated.

Changing your mind before the boundary, for example G2 and then G1 while Base
plays: the API has no "cancel launch". Asking for Base again replaces the
waiting clip and, as documented for Live's API, restarts Base at the boundary.

**After it starts**, only in Launch clip mode and separate from the choice:

- **Let Live decide** (default): the clip loops, or its native Follow Action
  in Live takes over.
- **RC: go to clip** after N passes (1 to 8), for example Virada → Base after
  one pass.
- **RC: stop track** after N passes.

These are RC Surface rules. They do not read or change the Follow Actions in
Live, which no available API exposes. If the clip also has a native Follow
Action, both act. Use one or the other.

How a rule counts: with start marker S, loop start A, loop end E and end
marker F, the first pass lasts `E − S` and every later pass `E − A`, so N
passes last `T = (E − S) + (N − 1)(E − A)`. A clip without loop plays once
(`T = F − S`, N must be 1). The rule waits until Live confirms that the clip is
playing, follows the clip position Live reports, and hands the next request to
Live inside the last quantum before `T`. Live still does the quantization. The
editor predicts the result: the return lands at the end of pass N, or the
clip plays some beats more (looped clip), or there are some beats of silence
(clip without loop).

A rule is refused when Live's quantization is None, when the quantum is too
short at the current tempo (under 250 ms of window), when the clip has Legato
on or a launch mode other than Trigger, when the clip is unwarped audio, or
when a clip without loop is given more than one pass. A rule is cancelled, and
never resent, when another clip is chosen on the track (from RC Surface or in
Live), when the track or the transport stops, when the mapping is removed or
changed, when the AbletonOSC link drops, or when the position updates cannot
prove how many passes were played. A phone disconnect does not cancel an armed
rule. If the window is missed while the rule is still valid, the next request
is sent once and marked **Late return**.

Changing the global quantization, either here or in Live, cancels every
unsent RC continuation once the change is observed. During a pending RC
write, the returns and the new rules are suspended. A failure or a timeout
cancels the suspended rules. For a new rule, stop or choose another clip, then
activate again to obtain a new launch. A return that was already sent to Live
remains under Live's control, and RC Surface cannot undo that queued request.
Receiving the same global value again does not cancel a rule.

The precision of the return is a hypothesis that is still being validated in
Live 12, not a guarantee. When the exact timing matters more than the
gesture, configure the Follow Action in Live and choose Let Live decide.

**Destinations** are kept by track and clip name, plus Live's identity for the
open session. Reordering tracks or scenes keeps the same clip. A renamed,
deleted or duplicated clip is not launched: the editor asks you to choose it
again. An empty slot is never fired. Mappings, presets, export and import keep
the Launch Clip targets and re-point them by name when a set is reopened.

The API limits, in short: the Extensions SDK cannot launch clips, Live offers
no call to cancel a queued launch (only a stop or another launch), and
launching a clip that is playing restarts it. AbletonOSC addresses tracks and
clips by index and does not report errors back, so RC Surface checks the
destination before each request and trusts only Live's own state reports.

### Mapping editor fields

Each mapped target can be adjusted from the phone:

| Field | Meaning |
| --- | --- |
| Mode | `continuous`, `toggle`, or `trigger_note`. In `trigger_note` mode, the continuous sliders (curve, in/out ranges, drive, comp, smooth) are hidden, and their values are preserved if you switch back. |
| Curve | `linear`, `exponential`, `logarithmic`, or `s-curve`. |
| Target scale | `Auto` keeps mixer/tempo linear and uses geometric travel for recognized wide positive frequency ranges. An explicit `Linear` or `Geometric` overrides Auto when the target supports it. |
| In Min / In Max | The input range read from the phone control. |
| Out Min / Out Max | The output range sent to the Live target. |
| Drive | Pushes the response curve up or down. |
| Comp | Compresses or expands the middle of the response curve. |
| Smooth | Adds smoothing to reduce abrupt value jumps. |
| Threshold | Threshold for non-continuous modes. |
| MIDI Note | Pitch and octave for fixed trigger-note mappings (C-2 to G8). |
| Velocity | MIDI velocity for fixed trigger-note mappings (1 to 127). |
| Timing | Note scheduling quantization (`immediate`, `beat`, `bar`). |
| Gate | Note duration behavior (`pulse` with a configurable duration, or `hold`). |

The curve canvas shows the current response shape and a moving dot for the live
input and output of the selected control in continuous mode.
The phone inputs enter the mapping engine in one normalized `0..1` domain.
Centroid, Spread and Rolloff show Hz on AUD, and they map in that same `0..1`
domain. Detected pitch, note and audio BPM are not provided.
The target scale then converts that common domain into the real Live parameter
range and clamps it at the final write.

### Presets, refresh, and unbind

The MAP panel saves, loads and deletes local mapping presets. The presets are
stored in the Ableton extension storage on the host computer.

Use **Refresh** if the Live tracks or devices changed while MAP mode was open.
Use **Unbind Target** to remove one target from the selected control, or
**Clear All** to remove every mapping from that control.

Removing or replacing a binding cancels its unsent parameter commands. A
command that was already sent to Live may still finish, and it is not an undo
operation. Held trigger notes are released when their binding is removed. A
failed save keeps the previous mapping active, so resolve the error before you
assume that the mapping is gone.

When you leave MAP mode, the phone returns to the previous performance page
and the normal touch behavior resumes.

---

## 9. MIX tab

The MIX tab has eight knobs (`knob-1`..`knob-8`) and eight faders
(`fader-1`..`fader-8`).

The two panels share the available width and height equally, in FULLSCREEN as
well. The flat arc knobs use a four-by-two grid, and the drag range stays
unchanged. The IDs 1–6 and their profiles remain compatible, and 7–8 are
additional controls. Use Tab and the arrow keys, with Shift for larger steps,
and Home/End for the bounds. The knob reset returns to 50%. The fader reset is
described below.

### Knobs

- **Drag vertically** to set the value (`0..1`).

### Faders

- **Drag vertically** to set the value (`0..1`).
- **Double-click or double-tap** restores the initial position: 85% for normal
  mappings, 50% for bipolar parameters such as pan. These are normalized
  surface positions, and the range of the mapped parameter determines its
  actual dB.
- Visual: a thumb on a track, with the track filled from the bottom up to the
  current value. A fader bound to a bipolar parameter such as pan fills from
  the centre instead, because for pan the middle is rest, not half travel.

Both panels use the vertical drag range of [§ 13](#13-quick-reference).

The MIX tab is where most people wire Live's volume, pan, sends, EQ and macro
controls. Tap **MAP**, then tap a knob or a fader to bind it directly from the
phone.

---

## 9.5 Config Mode (CFG)

Tap CFG in the header, then tap a control. Holding a performance control does
not enter CFG, and the desktop right-click is available only after CFG is
enabled. All eight LFO slots expose the same waveform, mode and timing
controls, and Square adds the swing and the ratchet. Both XY panels expose
Static and Physics, and the friction, the bounce and the speed appear only in
Physics. Switching to Static preserves those settings for later use. The pads
retain A/B/C/D, the knobs keep their gesture range, and the faders keep their
reset value. The reset removes the override of that control. A long press on
CFG lists the overrides and offers Clear all. Escape or a tap outside closes
the editor.

The waveform, the mode and the timing use direct buttons, without dropdowns,
and picking one keeps the editor open. In SYNC, expand Subdivision to choose
Global, Auto or a note value plus Straight, Dotted or Triplet. Only the
combinations supported by the effective waveform, BPM, swing and ratchet are
offered, including when the waveform inherits Global. FREE hides this section.
Advanced stays collapsed until it is opened. The toggle values animate across
the full width in the A/B/C/D mode colour.

Each pad exposes the settings of its effective mode, including the Global
inheritance:

- A: touch level, drag travel (40–400 px) and Linear/Fine/Fast response. The release stays zero.
- B: drag travel and response, and Keep value or Reset to zero on a tap without a drag. A cancelled touch does not reset the latch.
- C: drag travel and response, and Remember last or Fixed On level. A tap still switches off to zero.
- D: Global/SYNC/FREE timing, musical length or 40–10000 ms, attack ratio and peak. The effective duration and attack are shown, and the minimum transmitted burst is one 30 Hz frame. The settings apply on the next gesture.

Fine gives small movements more precision, and Fast reaches larger changes
sooner. These levels control the mapped signal, not the MIDI note velocity.
The MIDI trigger threshold and the velocity remain in MAP. Changing a pad mode
releases its old state safely. The per-pad settings save with the performance
profile and the snapshots. With CFG enabled, a right click on the same control
closes its editor, and a right click elsewhere switches the editor. CFG stays
enabled until its header button is switched off. A Live waveform change,
including Square, keeps a toggle active without another tap, and a mode D
burst keeps its original end time. The visual fill uses transforms and avoids
rewriting the unchanged labels and trails. The device smoothness needs
physical testing.

The browser overrides use `ableton-rc:v3:control_config`. The modulator and XY
settings also round-trip through the host performance preference in the
project profiles and in the named presets. The saved performance
configurations preserve the Global inheritance, and loading never turns a
shared mode into a per-slot override. The snapshot capture includes the
current settings and the scalar values. It does not save the Live Set itself.
The knob and fader overrides stay on the phone.

## 10. SNP tab

The SNP tab captures the **state of all performance controls** at a moment in
time and interpolates between the captured snapshots.

### Slots

Eight slots, numbered `1`..`8`. An empty slot shows `Empty`, and a filled slot
shows its slot number.

### Capture

1. Set the controls (pads, XY, LFOs, Squares, knobs, faders) to a state you
   want to remember.
2. Press **CAPTURE** (red record button).
3. Tap an empty slot. The slot stores the current state.

### Clear

**Clear Slots** wipes all eight slots.

### Morph time

The slider at the right of the controls sets how long a recall takes. The
**Free / Sync** pair above it decides what the slider means:

- **Free**: the slider is seconds, `0.1 s` to `5.0 s`, default `1.0 s`. The
  transition ignores Live's tempo.
- **Sync**: the slider picks a musical length, and the readout shows it as
  `4 beats` or `1/4 beat` instead of a number of seconds:

  | 16 beats | 8 beats | 4 beats | 2 beats | 1 beat | 1/2 beat | 1/4 beat | 1/8 beat | 1/16 beat |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |

  The length is read from Live's tempo when the transition starts, so changing
  the tempo moves every later transition without touching the slider. At
  120 BPM, `4 beats` is 2 seconds. The beats are quarter notes, independent of
  the meter.

These straight subdivisions also appear in the square grid. The LFOs have their
own expanded rhythmic grid within the selected shape ceiling. The snapshot
transitions also offer 8 and 16 quarter-note beats for slower gestures. If Live
has not reported a tempo yet, the length falls back to 120 BPM rather than
stalling.

### Morph modes

- **Grid (1-8)**: tap any slot to morph from the current state to the state of
  that slot over the morph time. Tap another slot to morph again. The
  Transition Time, set with the Free / Sync controls, applies only to Grid
  mode.
- **Vector XY (1-4)**: a 2D vector pad appears for a direct interpolation
  without Transition Time. The pad has four corners, and each corner is tied
  to a snapshot. Drag the dot inside the pad to blend the four snapshots
  continuously and instantly. The Transition Time block (the Free/Sync slider)
  is disabled in Vector mode.

The mapped Live parameters follow the morph while the transition runs. If an
LFO, a Square, a knob or a fader is mapped to Live, the mapped value moves
through the transition instead of waiting until the morph ends.

---

## 11. SNS tab

The SNS tab shows the live readouts of the phone sensors. It has no controls.
These are the values that are broadcast to Live, so you can check that they
work and map them elsewhere.

### Sensor status

Each panel header shows the sensor state reported by the browser API:

- `ready`: real finite readings are arriving and can be mapped.
- `waiting` / `no-readings`: the page is waiting for the first reading. A
  desktop browser with no sensor hardware stays here. This is silence, and it
  is not a permission denial.
- `lost`: a working sensor stopped delivering for more than two seconds. The
  stale values are discarded and are not mapped.
- `denied`: the browser permission was explicitly refused.
- `error`: the permission call itself failed. Retry with the button.

Motion and orientation are tracked independently, and one denied API does not
affect the other. The sensors start automatically when the browser allows it.
If the sensor access needs a tap, open **SNS**, tap the gear icon in the top
bar, and then tap **Enable sensors**. You can retry after a denial or an
error. The camera and the microphone require a separate permission.

### MOTION

Six axes from the accelerometer and the gyroscope:

- `GX`, `GY`, `GZ`: gyroscope angular velocity (rad/s)
- `AX`, `AY`, `AZ`: linear acceleration (m/s²)

The values reach the live mappings as:

- `sensor.motion.ax`, `sensor.motion.ay`, `sensor.motion.az`
- `sensor.motion.gx`, `sensor.motion.gy`, `sensor.motion.gz`

### ORIENTATION

Three angles from the device orientation sensor:

- `YAW` (alpha): compass heading
- `PITCH` (beta): tilt forward / back
- `ROLL` (gamma): tilt left / right

The values reach the mappings under `sensor.orient.*`. The yaw is shown with a
compass-style orbit, and the pitch and roll with level-style orbits.

The SNS calibration starts only with fresh finite readings on all three
orientation axes. On a desktop without motion hardware, CALIBRATE shows the
neutral "No motion readings on this device" notice, and not a permission
error.

### LOCAL VIEW

Two switches toggle the visibility of the MOTION and ORIENTATION panels in
this tab. They affect only what is shown here, and they do not mute the
sensor broadcast.

---

## 12. AUD and VID tabs

The AUD and VID tabs take the inputs from the phone's microphone and camera.
The browser asks for the permission the first time you enable them.

On larger desktop windows, AUD uses larger dials and fields distributed through
the audio detector workspace. The analysis needles follow the value arc around
the dial center. VID prioritizes the camera width, with its controls at the top
and a proportional preview beside three stacked pose cards with bounded action
buttons. Short landscape screens keep the compact phone arrangement, in the
normal and in the FULLSCREEN modes.

### Audio input

Toggle **Audio input** to grant the microphone access. On a computer, the
browser also lets you choose the input, so a loopback or an interface channel
can feed the analysis instead of a room microphone.

The capture requests echo cancellation, noise suppression and automatic gain
off, so the voice processing does not intentionally reshape the dynamics or
the spectrum. The browser, the driver and the selected input can still
resample or process the audio, and the capture is not guaranteed to be
bit-perfect. Use the grouped detector controls below. There is no pitch
control and no clarity control.

Once enabled:

- `sensor.audio.rms`: input RMS amplitude, `0..1`, not perceived loudness
- `sensor.audio.envelope`: short-term amplitude envelope
- `sensor.audio.gate`: `1` while input RMS exceeds its internal threshold (with hysteresis)
- `sensor.audio.attack`: peak strength after an onset, `0..1`; no note recognition

### Selecting the browser audio input

AUD starts with **Browser default**. The selector lists the inputs that this
browser permits (microphone, interface or loopback/virtual cable). Enable the
capture to grant the permission and reveal the available labels. The selection
is saved only in this browser. Changing an enabled input releases the old
values and restarts the capture. An unplugged or denied explicit input shows
an error and never falls back silently to another microphone. Select an
available input and enable it again. A reload never auto-enables the capture.
Ableton Track mode is not part of this UI, and the native analysis and control
are experimental. No audio is uploaded, and only the numeric descriptors and
the control values are sent.

The AUDIO card shows a live 2.5-second timeline. Cyan is the raw RMS, and
green is the envelope. The bar shows the smoothed and scaled RMS control
value. All twelve descriptors below are public mapping sources. There is no
Follow Detected Note, no tonal analysis, no old controls and no diagnostic
lab: they have been removed after unreliable musical results. The unsupported
stored mapping modes are discarded on load, and the supported bindings are
preserved. The Live tempo and the SYNC remain available.

### Built-in audio detectors

Twelve cards expose the normalized `0..1` mapping sources:

- `sensor.audio.transient`: how much of the whole frame is new energy.
- `sensor.audio.kick`: a rise that happened in 35–100 Hz.
- `sensor.audio.snare`: a rise that happened in 1.5–8 kHz.
- `sensor.audio.brightness`: dark-to-bright spectral centroid, logarithmically normalized.
- `sensor.audio.centroid`: magnitude-weighted spectral center; readout in Hz, mapping = Hz / 20000.
- `sensor.audio.flux`: spectral shape change (half L1 distance of normalized magnitudes); gain changes alone do not increase it.
- `sensor.audio.flatness`: power geometric/arithmetic mean: tonal toward 0, noise-like toward 1.
- `sensor.audio.spread`: magnitude-weighted spectral standard deviation; readout in Hz, mapping = Hz / 10000.
- `sensor.audio.rolloff`: frequency containing 95% of spectral power; readout in Hz, mapping = Hz / 20000.
- `sensor.audio.low`, `sensor.audio.mid`, `sensor.audio.high`: K-weighted loudness in 20–250, 250–2000, and 2000–20000 Hz bands, mapped to `0..1` from −50 LU to −5 LU relative to the digital full scale of the input. Each band applies the ITU-R BS.1770-4 K-weighting per bin (high-shelf + RLB high-pass) and a 400 ms momentaneous integrator on the K-weighted power. `sensor.audio.flatness` uses Wiener entropy in dB: tonal → 0 (−60 dB), noise-like → 1 (0 dB).

The eight new measures use the bin centers from 20 Hz to min(20 kHz, Nyquist),
excluding DC. The bands are disjoint, and a boundary bin belongs to the higher
band. The digital silence resets all eight to zero, and the flux also resets
on a restart. The brightness keeps the logarithmic, power-weighted centroid
over 100–12000 Hz, so it is related to, but not identical to, the magnitude
centroid.

**Colour and identification:** each group owns a hue (Attacks red, Tone amber,
Texture violet, Bands cyan), and its heading and knobs use it. The three
descriptors of a group use light, medium and dark shades, matched across the
card swatch, the legend and the continuous curve. All twelve marks exceed 3:1
contrast against the graph background. A shade identifies a descriptor, not
its strength. The distinction inside a group depends on the names and the
legend toggles, and not on the colour alone. Hide the other curves when an
overlap or a colour-vision difference makes a reading ambiguous. The dashed
Amplitude gate threshold stays a reference line, and it is not a descriptor.

**Detector controls:** the knobs use the same radial body and rectangular
pointer as MIX, with the accent of their group for the focus and the
dragging. Drag vertically, use the arrow keys of the focused range, or
double-click to restore the default. In All, the strip wraps by content on
the desktop. On short screens, swipe it horizontally to reach every knob and
the WINDOW. The graph takes the remaining height, without a reserved row for
retired controls.

**Layout and graph:** all twelve cards are on screen at once, grouped as
Attacks, Tone, Texture and Bands. One control above the graph chooses what the
2.5-second history draws: Amplitude, one group, or All, which draws every
descriptor together. Tap a colored legend name to hide or show that curve.
The normalized graph scales to the loudest curve that is shown, and it prints
the ceiling it used, for example `0–0.28`, so a quiet descriptor stays
readable. The curve scrolls at screen rate whatever the WINDOW is set to.
Between two analysis frames, the last reading is held out to the right edge
for at most 120 ms, so a wide window looks continuous without inventing values
it never measured. The Hz cards still map in 0..1, and the graph never mixes
Hz and amplitude on one axis. On a short phone screen the card column
scrolls, and it does not hide a group.

**Timbre window:** the eight new descriptors use a Hann window of twice the
attack size, overlapping by 50%. At 48 kHz this is 1024 samples (21.3 ms of
signal), updated every 512 samples. The values stay zero during the first
complete-window warmup. The attack delivery does not wait an extra window.
The buffers are reused, and there is no smoothing queue or timer per
descriptor. The bands have window-energy normalization and no automatic gain.

**How an attack is decided.** Transient measures the rising energy of the
frame against the energy that frame has been carrying for the last ~300 ms,
through a soft knee. A loud hit does not pin at `1.000`, and the differences
in level are preserved. Kick and Snare then compare the new energy with the
share that the band normally holds. A band that merely carries its usual
share of the change does not fire. The band content is read from a
Hann-windowed spectrum of the same length as the attack window, because the
leakage of a loud low tone would otherwise fake an attack in an empty band.
A band that sits more than 30 dB below the frame is treated as masked.

Kick and Snare are spectral heuristics, not source separation. Anything that
adds energy in their band moves them. The frequency resolution is the limit:
at the narrow window, a snare body near 200 Hz also moves Kick, because the
46–94 Hz bins cannot tell them apart. Widen the WINDOW and they separate.

For reactive modulation, enter MAP, select a detector card and bind a synth
parameter. Start with a small output range and Smooth at zero.
**Continuous capture** uses an AudioWorklet independent of the display
refresh, with contiguous windows of the size that WINDOW selects: 1024 samples
at 44.1/48 kHz by default. The pulses have an immediate attack and the
release that you set. The default window is about 21 ms at 48 kHz.
This is not a measured microphone-to-Live latency.
The browser scheduling, the network and the Live writes also contribute.
Verify the timing with your real input and your synth.

**Compatibility capture** means the worklet was unavailable or failed. The
analysis continues through a short analyser sampled at the display refresh,
and it may miss very short attacks between the frames. This fallback is not
equally reactive. The mapping path keeps only the latest pending parameter
value if Live is slow, so it cannot guarantee a sample-accurate alignment or
preserve every attack through a stalled browser, network or host.

### The detector knobs

The flat arc knobs below the graph are arranged in four labelled groups.
All shows four Attacks knobs and two each for Tone, Texture and Bands, and a
single-family graph shows only its controls. The WINDOW has a separate
toolbar. Short screens scroll whole groups horizontally. The vertical drag,
the keyboard arrows and the double-click reset work without restarting the
microphone.

With **SYNC**, RELEASE and SMOOTH select `1/128` through `1/1` notes at the
Live BPM, with straight, triplet (**T**, ×2/3) and dotted (**D**, ×1.5)
choices, ordered by duration. At 120 BPM, the straight `1/128` is 15.625 ms
and the `1/128 T` is 10.4167 ms. At 240 BPM, the latter is 5.2083 ms. Only
the label rounds to whole milliseconds, and the processing keeps the
fractional times below 10 ms.
The `1/1` is a whole note, one bar in 4/4, and it is not a
time-signature-dependent bar.
The SMOOTH also offers **OFF** for an immediate response. The label shows the
division and the effective milliseconds. A tempo change updates both the
processing and the labels without interrupting a drag. The RELEASE is an
exponential decay time constant, not a hard note length, and the SMOOTH is a
one-pole time constant, not a quantization to the next beat. A longer
smoothing makes the modulation less immediate.

**FREE** restores the independently saved millisecond values below. The
existing nonzero timings acquire the nearest offered note on the migration,
and the zero smoothing stays OFF. The valid saved subdivisions are preserved.
A fresh 45 ms RELEASE chooses its nearest subdivision, which is 1/64 D at
120 BPM. The audio does not estimate the BPM, and the clock comes from Live
in SYNC.

The bands are **K-weighted loudness (ITU-R BS.1770-4)** with a 400 ms
momentary integrator, mapped logarithmically to `0..1` (0 = −50 LU,
1 = −5 LU, relative to the digital full scale of the input, and not SPL). The
K-weighting pre-filter and the RLB high-pass are applied per bin, so a
clearly audible high band that carries little RMS energy is not pinned near
zero. The flatness is mapped in dB (Wiener entropy): tonal → 0 (−60 dB),
noise-like → 1 (0 dB). The bands knob adds a ±dB offset on the same scale
(gain `×2` → +6 dB, gain `×0.5` → −6 dB) before the clamping, and it does not
multiply the unit value.

| Knob | Group | What it decides |
| --- | --- | --- |
| SENS | Attacks | How big a band-relative rise already reads as half scale (`0..1`, default `0.65`). Higher catches softer playing and more of the room. |
| RELEASE | Attacks | Pulse decay time constant (FREE: `10..500 ms`, default `45`). SYNC uses note divisions. Short keeps fast hits separate; long makes a pad-like envelope. |
| CURVE | Attacks | The response exponent (`0.3..3`, default `1`). Below 1 lifts moderate hits; above 1 makes the pulse behave more like a gate. Neither end of the range moves. |
| SMOOTH | Tone, Texture, Bands | A one-pole time constant (FREE: `0..200 ms`, default `0`; SYNC: OFF or note divisions). It calms a jittery curve without moving where it settles. |
| GAIN | every group | The group's output level, `×0.25..×8` around unity. For the Attacks, Tone and Texture groups the gain is multiplicative on the unit value. For the Bands group it is a dB offset on the K-weighted loudness scale: `×2` adds +6 dB, `×0.5` subtracts 6 dB, `×1` is unity. Centroid, Rolloff and Spread are excluded from gain entirely: they are printed in Hz, and scaling them would print a frequency the signal does not have. |
| WINDOW | all | The analysis size: `x1`, `x2` (default) or `x4`, that is 512, 1024 or 2048 samples at 44.1/48 kHz. Narrow reacts sooner; wide resolves low frequencies, which is what separates a kick from a snare body. |

The `x1` is not offered below 512 samples, because 256 would send more than
the 120 messages per second that the control path accepts.

The SENS and the RELEASE are shared by Transient, Kick and Snare. They set
one response for the three detectors, and there is no per-detector copy of
these knobs.

### Attack level

`sensor.audio.attack` measures the peak over 35 ms after an onset, normalized
to 0–1 over 40 dB below the largest peak of the session. It does not
recognize notes, and it does not generate MIDI velocity. The first nonzero
peak sets the reference, and stopping or restarting the capture resets it.
For a more immediate modulation, use Transient, Kick or Snare, without this
peak window.

### Listening to a track instead of a microphone

The extension cannot hear a Live track. The Extensions SDK exposes the track
names, the devices and the parameters, and one offline arrangement render.
There is no meter, no buffer and no stream, so nothing that runs inside the
extension can listen to audio. Only a device inside the audio path of Live
can.

The standalone `RC-Audio-Sender.amxd` converts the track audio to MIDI. It
does not feed the AUD descriptor graph. Put the Sender v2 on the audio track
and the Receiver v2 on the MIDI destination. Enable **Audio Sender input**
only on the intended Receivers (OFF at load). They use the internal bus of
Max, with no UDP. Several enabled Receivers intentionally receive the same
Sender notes. The phone Trigger Note instead addresses the selected Receiver
through the SDK. Replace the old devices in your Set, and see the
[v2 migration](./SECURITY.md#bundled-max-devices--v2-migration).

The device uses the frequency estimate of `fzero~` from Max and a periodic
peak-amplitude gate with a `0.015` minimum level. Unlike the phone detector,
`fzero~` does not report a clarity score, so the Max path has no
clarity-floor control. The generated device rejects the rounded MIDI
estimates outside `21..108`, and it requires a changed pitch to stay stable
for `70 ms` before sending it.

> **v2 field acceptance is pending.** Earlier F3/stereo tests used the UDP
> devices. Verify loading, note routing/OFF and measured latency before use.
> Source tests do not establish these field results.

### VID performance console

Open **VID** with the phone in landscape. The camera preview fills the left
side at the full screen height. Everything you touch sits in the column on the
right: the camera commands (**Camera**, **CONF**, **REC**), a scrollable bank
of up to fifteen learned-pose cards, the built-in detectors and the direct
signal readouts. On a tablet or a desktop, the commands sit above the preview
and the readouts run along the bottom. Tap **Camera** to grant the access. The
vision system is **single-hand** by design: it tracks one hand in front of the
phone.

If the camera access fails, the error stays inside the preview. Fix the
reported permission or camera-busy condition and tap **Camera** again. A page
reload is not required.

The camera hand tracking loads the MediaPipe Hands runtime and model files
that the extension bundles. It works on a fully offline local network once the
extension is installed.

On a phone or a tablet, the preview is the live camera image, without the hand
drawn over it, and the hand tracking runs in a background worker where the
browser supports it (a Web Worker with `OffscreenCanvas`). The inference then
does not hold up the rest of the interface while the camera is on. On a
computer with a mouse, the preview shows the analysed frame with the tracked
hand drawn on top, and the tracking runs on the page. The **MediaPipe
Latency** of the Live panel reads `worker` or `main thread` next to the time.
A browser without worker support, or a worker that fails, tracks on the page.

Output values:

- `sensor.vision.x`, `sensor.vision.y` - horizontal and vertical palm
  position in normalized image coordinates
- `sensor.vision.z` - normalized palm-size depth: it rises as the hand gets
  closer to the camera. It is a direct performance signal, not calibrated
  or simulated 3D space.
- `sensor.vision.fist`, `sensor.vision.pinch`, `sensor.vision.victory`,
  `sensor.vision.open` - gesture channels
- `sensor.vision.rotateVal` (**Victory Rotate**) - continuous wrist rotation,
  neutral at `0.5` and live only while Victory is held
- `sensor.vision.pinch_x`, `sensor.vision.pinch_y`, `sensor.vision.pinch_z`
  (**Pinch Clutch X / Y / Z**) - three continuous clutch axes
- `sensor.vision.gesture.1`, `.2`, `.3` - learned static-pose channels

Pinch to engage the clutch, move the hand to steer X/Y/Z, then release. The
axes hold where they were left, so the next pinch continues from that position
instead of snapping back. These clutch axes are always live, and they do not
require the Pinch detector to be switched on.

For a relaxed pinch, face the palm toward the camera, bring the thumb and index
tips close together and keep the other three fingers partly extended. The tips
do not need to overlap, and the index need not curl into a tight circle. The
gap allowance scales with the visible palm, and opening the fingers releases
the clutch. Back-facing hands, fists and a straight pointing index do not gain
this extra tolerance. The actual recognition still depends on the camera
tracking.

The lower **MAP** strip offers **X/Y/Z**, **PALM** (apparent palm size) and
**FACE** (palm facing versus back of hand, and not face tracking). The PALM
keeps its raw 0–1 readout. The FACE shows a signed −1–1 readout and maps to
0–1. They can drive parameters, notes and clips through the existing mapping
actions and thresholds. The Pinch Clutch **X/Y/Z**, the four opt-in detectors,
the Victory rotation and the learned poses remain mappable. The finger-count,
the individual-landmark and the whole-frame colour readings remain internal
diagnostics. A missing or invalid PALM/FACE sample reports the loss and
follows the Safe loss policy of its target.
A missing hand preserves an active learned pose as **LAST KNOWN**. An
unconfirmed candidate expires after `unknownGraceMs` (140 ms by default), so a
long absence requires a fresh full hold before its first ON. The axes and the
built-in detectors report the loss immediately. G1–G15 report the loss only
after that grace interval, and their mappings then apply Safe loss.
The gear icon of the VID tab offers three policies for the learned G1–G15 note
gates: **Hold indefinitely**, **Hold with timeout**, and **Release on loss**.
A new project uses a **10 s** timeout, which you can edit from 0.1–30 s in
0.1 s steps. The mode of each project is inherited until you choose one
explicitly. The Safe loss of a target can release sooner, and its hold cannot
exceed the chosen VID timeout. The continuous controls, the built-ins, the
clips, the toggles and the timed pulses keep their behavior. Only a fresh
accepted pose renews the validity: the hand presence or the last-known
activeName alone cannot restore the output. A qualified return before the
expiry sustains the existing note without another Note-On. After the expiry,
the normal pose confirmation is required to start again.
The incomplete landmarks count as an absence. An explicit inference error
releases the active pose and remains visible. The saved examples stay intact,
and the TEST stays musically silent. A launched clip and its armed
continuation keep playing.
Camera OFF, Panic, unbinding and disconnection retire the held and the
scheduled notes.
The host watchdog advances without new inference frames. The timeout is
measured from the last qualified host receipt, and the recognition grace
consumes that window. The Release mode waits only for that grace, and the
indefinite mode has no global deadline. The badge distinguishes the current
tracking, the last-known hold or countdown, and the release. A stalled host or
Live cannot guarantee a real-time deadline, and it evaluates the original
deadline when it resumes.

### Learned static poses

Each learned slot stores one static hand shape. The initial bank contains three
slots.

1. Hold the desired hand shape and tap **CAPTURE POSE** three times, changing
   the finger curl or the palm angle slightly between the examples.
2. Keep the hand still during each short automatic capture.
3. Tap **TEST**, then show the pose again. The recognition tolerates the
   normal changes of screen position, hand distance, depth landmarks and a
   small wrist angle. It is hand-specific: learn the pose with the hand that
   will perform it, because the other hand is a mirrored shape and does not
   match.
4. Use **DELETE LAST** to replace only the newest example, or **CLR** to
   retrain the slot from scratch.

Each slot shows **0/6 through 6/6** and accepts up to **six takes per pose**.
The **TEST and the live recognition work from the third take**, and the
captures four through six are optional. Use them for legitimate finger-curl
or palm-angle variants, and capture each one steadily without mixing
different gestures. All the saved takes contribute to the recognition. A
three-take preference restores with the capacity for six and keeps its saved
examples. DELETE LAST and CLR remain deliberate actions.

During the TEST, “nearest: take N · X% of radius” identifies the closest
example. The percentage compares the second-neighbor distance of the class
with its entry radius, and it is not a probability. A lower value is closer,
and a value above 100% misses that entry gate. The ambiguity and the opposing
finger shapes can still reject an otherwise close pose. Use the
labeled-session benchmark to compare the correct entries, the false ON/min and
the entry latency p95 before you draw a conclusion about the extra takes.

The camera proportions are corrected for the learned poses, including the
rotation between the landscape and the portrait frames. A pose saved in the
version 8 format shows **RECAPTURE REQUIRED** and is not used for the
recognition. Capture those poses again: the old saves contain the descriptors
without the original frame dimensions, so they cannot be converted safely. The
direct axes and the built-in detectors keep their geometry.

Very different takes widen the tolerance of a pose. After three captures, an
isolated take may show an inline warning. **RETAKE** removes that exact take,
even when it was captured first. If the clear finger disagreements leave no
majority among three to six captures, the general warning says that the
captures disagree, and RETAKE then removes the latest capture as a review
starting point. **KEEP** retains every example and dismisses the current
warning, and another capture or a reload reviews the bank again. The warnings
are advisory, and they do not change the recognition thresholds, the ranking
or the hold and release timing. The camera behavior still needs a real-hand
acceptance.

The **Balanced** recognition preset is the normal performance setting.
**Precision** rejects more variation, and **Flexible** accepts more. The
**Performance** preset is for a live gesture-chord performance: it allows more
variation in a pose (such as the Rock sign), it rearms quickly, and it does
not trigger on an open hand or a fist. A learned slot is momentary (`0` or
`1`), persists across the page reloads, and rearms only after the pose is
released, through the FSM states `ready` → `candidate` → `held` → `releasing`.
Tap **TEST** to verify the pose recognition silently on the camera, without
firing MIDI notes. To audition the real musical triggers, bind the learned
gesture in MAP and perform it in front of the camera. The training TEST only
checks the recognition, and it remains MIDI-silent.
The recognition checks the strong finger-shape contradictions before it
accepts or holds a pose. Three takes require the agreement of all three. With
four to six takes, at least three clear examples and a strict majority of the
bank protect the finger identity, and an uncertain or opposing extra take
cannot disable that protection. A bank with three examples of each opposing
state recognizes neither state. Replace the conflicting takes deliberately.
The saved examples remain intact. Opening a fifth finger (index, middle, ring
or pinky) that was consistently curled in a four-finger pose releases it
after the release interval, and if the open hand is trained in another slot, it
can switch directly. The thumb has a separate identity gate: it can curl or
oppose across the palm while it stays straight. At least two clear takes and a
strict majority of the clear thumb states must agree, and an uncertain extra
view does not erase that identity. Opening a learned tucked thumb, or tucking
a learned open thumb, rejects the entry and releases HOLD.
The uncertain finger evidence cannot begin or complete a new trigger, and a
brief uncertainty alone does not retrigger a held pose. The TEST shows
FINGERS UNCLEAR or FINGER SHAPE DIFFERS. Adjust the angle or repair the
conflicting captures. A thumb hidden in an edge-on view is not a reliable
evidence. The small curls inside the same finger state keep the learned
tolerance. The v9 takes remain saved, including the conflicting banks, and
you repair those deliberately.
The joint bends also provide a local evidence for each finger, including the
thumb. A majority of at least two clear captures can tell a straight chain, a
partial bend and a deep curl apart, even when the fingertip projection
varies. The intermediate bends keep the learned tolerance. The collapsed
joints and an edge-on palm cannot supply reliable angles. This uses the saved
coordinates without changing the bank format or the hold and release times,
and it cannot recover a hidden finger when the camera landmarks describe a
different shape.
The camera-corrected version 9 saves with 42/47
coordinates load without a recapture, and the version 8 requires a recapture.
The TEST uses the same compatibility check as the live recognition.
The recapture warning survives the local saves, the camera restarts and the
project restores, until a successful new capture or an explicit CLR for that
pose.

---

## 13. Quick reference

### Per-control vertical range

Every vertical control in the app uses a **150 px** drag range from `0` to `1`.
The same physical scale on every control means that the same gesture produces
the same relative change everywhere.

### Mode summary

| Mode | Activation | Drag vertical | Drag horizontal |
| --- | --- | --- | --- |
| A | while touching | scales value 0..1 | no horizontal effect |
| B | touch latches | scales, zero = off | keeps latched |
| C | tap toggles | re-modulate value | no horizontal effect |
| D | burst on touch | peak (0.15..1) | no horizontal effect |

In `SYNC`, the mode D takes its length from the Deep Sync Settings instead of
the fixed 520 ms envelope, and it applies to the pads, the LFOs and the squares
alike. See [§ 2](#2-pad-modes-a--b--c--d).

### Control names (for mapping)

```
pad-1 .. pad-12
knob-1 .. knob-8
fader-1 .. fader-8
xy-1.x, xy-1.y, xy-2.x, xy-2.y
toggle-1 .. toggle-8    (LFOs)
sensor.motion.{ax,ay,az,gx,gy,gz}
sensor.orient.{alpha,beta,gamma}
sensor.audio.{rms,envelope,gate,attack}
sensor.audio.{transient,kick,snare,brightness,centroid,flux,flatness,
              spread,rolloff,low,mid,high}
sensor.vision.{x,y,z,fist,pinch,victory,rotateVal,open,
               pinch_x,pinch_y,pinch_z,gesture.1,gesture.2,gesture.3}
```

---

## 14. Gestures

- **Tap**: momentary press (mode A default).
- **Long press**: same as tap; it has no separate action.
- **Drag up**: increase value (depth, rate, count, etc).
- **Drag down**: decrease value. Reaching the bottom of the range
  sends `0`.
- **Drag horizontally on a Square**: change speed; vertically changes amplitude.
- **Drag horizontally on an LFO**: change modulation rate.

---

## 15. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Phone won't connect | See `docs/INSTALL.md`: check Wi-Fi, IP, certificate warning. |
| Sensor values stuck / wrong | Press **CALIBRATE** on a stable surface. |
| LFOs desynced from Live | Press **SYNC** to re-lock to Live's BPM. |
| MAP target list looks stale | Press **Refresh** in MAP mode after adding/removing Live devices. |
| Trigger Note cannot add device | Place `RC-Midi-Receiver.amxd` manually on the MIDI track and retry. |
| Unwanted attack detections | Reduce the Attacks **SENS** and check the selected input. Kick and Snare are heuristics, not a drum separation. |
| Audio response feels slow | Check RELEASE/SMOOTH, use SMOOTH OFF and a shorter WINDOW, and measure your full setup separately. |
| Touch response feels slow | Use a wired network or sit closer to the Wi-Fi access point. |
| Phone status indicators look odd | Refresh the phone browser; the session resets cleanly. |

For the deeper setup issues (certificates, network, installation) see
`docs/INSTALL.md` and `docs/FAQ.md`.

## Performance settings and learned-pose bank

Open the CFG with the header button, as described in
[§ 9.5](#95-config-mode-cfg). The drag travel offers Very short (60px),
Short (100px), Medium (150px) and Long (300px). The touch level offers Zero,
Low (25%), Medium (50%) and Maximum. The A/B/C response curves and the C
Remember last / Fixed stay individual.

In mode D, each toggle has its own **Burst length** and attack, independent of
the subdivision of the waveform, which is the period of each cycle. The length
can follow the shared setting, use a pinned musical value in SYNC, or use
milliseconds in FREE. The collapsed Burst length section shows the selected
duration. The Global mode D exposes the same settings. The pins persist in the
projects, the presets and the snapshots, and opening the CFG never triggers a
control.

The **+ ADD POSE**, beside the REC recognition selector, adds the numbered
identities up to G15, and it turns grey at the fifteen cards. The bank has a
dark scrollbar and compact cards. The capture, the recognition and the CLR
keep the normal action and summary footprint, and the visible take warnings or
the TEST diagnostics add only the space they need. The **CLR** removes the
examples and keeps the card. The small **×** below G1/G2/etc. removes that
card and its examples, cancels its capture and its test, and explicitly
releases its held output, including Hold indefinitely. The other IDs and the
destinations never shift. The mapping of the removed ID stays available in
MAP, and Add reuses the first free numbered ID with an empty pose and that
mapping. Clear its targets in MAP to discard the destination as well. Removing
every card and restoring a sparse bank are supported. The slots
`sensor.vision.gesture.1` through `.15` share the same qualification, MIDI and
tracking-loss rules. The classifier, the thumb checks and the capture and
recognition timing work as described in § 12. The physical camera acceptance
remains necessary.

## 16. REC

REC lists your Live tracks as native rows, in the order Live reports them.
Every row carries its own **ARM**, **SOLO** and **MUTE** buttons and a
horizontal fader for the native mixer level of that track. The fader moves the
own volume parameter of Live, and not the input gain. Drag it sideways, and
double-click restores the default value of that parameter in Live. The fader
has no permanent numeric readout. Its horizontal position shows the level,
and the keyboard and the screen reader report the normalized level in percent,
not in dB. An unknown or stale value disables the fader. The external mixer
changes appear on the next read, and a connection or a Set change cancels a
gesture. The STOP keeps the priority over the volume adjustment. The native
volume reads continue during the play, the REC and a running pre-roll,
independently of the unrelated transport-read timeouts.

The group tracks get their own row with a local expand control. Expanding
shows the members of the group in the phone only. The group structure of Live
is never changed, and RC Surface never creates a group. On a group row, the
**SOLO**, the **MUTE** and the fader act on the group itself, exactly like the
group track of Live, and they are not written to each member. The **ARM** is
the exception: arming a group row targets the armable descendants observed
inside that group, because Live exposes no single arm control for a group.

The **ARM ALL** arms every observed armable track at once. The **ARM MULTI**
(the default) keeps the other inputs armed, and the **ARM EXCLUSIVE** disarms
them when you press the ARM of a track. That choice is the rule of RC Surface
itself. The global arm preference of Live is never changed, and an
incompatible host arm result is reported instead of repeated.

The arming needs a fresh observation of a stopped transport through
AbletonOSC. Arming while the transport runs would start recording that track
in Live, so an unknown or a stale transport state blocks the request.

The **CLICK** turns the metronome of Live on and off, and it keeps working
during the setup, the pre-roll, the REC and the playback. The switch is
independent of the rest of the band, and it stays available whenever the
observed state is fresh and known. The current extension API does not expose
the metronome level, so there is no level control beside the **CLICK**. Adjust
the actual level in Live.

REC needs AbletonOSC for the transport and the recording state. The extension
API alone does not drive them. The native rows, the group expansion and the
waveform preview still need an acceptance on your Live setup.

REC is one global page with three **local** views:
**RECORD / ARRANGEMENT / CLIP**, with **RECORD** as the default. The three
destinations and the **CLICK** live in the header of the REC page, and one
fixed capture bar (**REC / STOP**) is shared by all three. Opening the page,
changing the view, choosing a scene or opening the CFG never arms a track and
never starts the playback or the recording. Changing the view is blocked while
a REC attempt is owned, and the STOP follows its owner. The track names, the
ARM MULTI/EXCLUSIVE and the SOLO/MUTE are shared.

The **RECORD** shows the shared capture bar, with the **REC** and the **STOP**,
together with the capture configuration (**PRE-ROLL** **OFF / 1 / 2 / 4**,
**OFF** by default; **PASSES** **1 / 2 / 3 / ∞**, one pass by default; **START**
and **END**), the native track rows and the compact marker list. On a
landscape phone only the track list scrolls vertically, and the bands above it
stay in place. This view reads no clips, no take lanes and no waveforms. That
data belongs to the **ARRANGEMENT**. The tracks and the markers that you
capture against are prepared in Live: RC Surface never creates a track and
never creates a marker.
The **ARRANGEMENT** is the Arrangement editor (the marker and clip timeline,
the native clips and the take focus), and the **CLIP** is the existing Session
recording view. The capture controls belong to the REC page and not to one
view, and only the **REC** uses the chosen start and end to open a capture.

The mode and the recording controls keep their positions when you change the
views. The RECORD and the ARRANGEMENT share the compact marker ruler, and the
tracks scroll below it.

### Arrangement

Create the Arrangement markers in Live first. RC Surface has no control that
creates a marker, and the markers that you prepared show up in the catalog.
Then open the **REC** with the playback stopped.

1. Arm your inputs on the REC track rows. Each row shows the observed
   **ARM / SOLO / MUTE** state, and the **ARM ALL** arms every armable track
   at once. The **ARM MULTI** is the default and keeps the other inputs
   armed. The **ARM EXCLUSIVE** disarms the other tracks only when you press
   the ARM of a track. Changing this mode or single-clicking a name does not
   change Live. A group cannot be armed as one object: arming a group row
   arms the armable descendants observed inside it. The global arm preference
   of Live is unchanged, and an incompatible host arm result is reported. The
   ARM confirms the armable input set without waiting for the Loop, the meter
   or the click. If the confirmation fails, the ARM states become unknown
   until a fresh read, and a write may already have been applied. The surface
   does not repeat it automatically.
2. Choose the start of the capture in the **START** row of the capture
   configuration: the fixed **Here** position, the position captured by **Use
   current cursor**, or a marker that you pick from the list. Each marker
   shows its **bar.beat** above its name.
   Picking a marker is a local selection. It never seeks the transport of
   Live, and it never starts the playback or the recording. Tapping the
   marker that is already the current start prepares the next tap to move the
   start. Tapping an earlier marker moves the start, and tapping a later
   marker chooses it as the end.
   Use **Zoom** and scroll to inspect the markers, the native Arrangement clips
   and the observed playback position. The markers and the clips share one
   timeline, so the zoom and the scroll move both together.
   A fine bar/beat grid sits behind the markers, with the bar numbers along
   the bottom. The beats appear as you zoom in, and the labels thin out when
   you zoom out. The list follows the timeline time, including the newly
   created early markers, with a stable equal-time order and the full names.
   A temporarily stale meter keeps its last confirmed display with a dotted
   indicator, and it cannot authorize a REC. The REC still checks the full
   set before it opens a capture.
3. The capture bar carries the **REC** and the **STOP**, and the configuration
   row carries the **PRE-ROLL** and the **PASSES**.
   The **PRE-ROLL** cycles **OFF / 1 / 2 / 4** bars, with the **OFF** as the
   default, and the **PASSES** cycles **1 / 2 / 3 / ∞**, where ∞ means
   unlimited passes until you press the **STOP**. The **PASSES** becomes
   available once the end is bounded, by a **Next marker** or by an explicit
   marker, and the default is one pass. A count that is not one of those
   values is normalized to **1**, and the page says so.
   The **END** row offers the **Next marker**, which is the first marker after
   the selected start, an explicit marker, or the **Until STOP** for an
   open-ended capture. A missing, ambiguous or invalid start or end, or a
   **Next marker** end with no following marker, blocks the REC and says why.
   It never falls back silently to an open-ended capture. Put the end after
   the wanted decay.
4. Press the **REC**. With the **PRE-ROLL OFF**, the capture opens directly at
   the selected start. The other choices play the preceding bars with the
   click before the native Punch In opens the capture at the selected start.
5. Press the **STOP** to stop the playback and the recording. Your armed
   tracks stay armed, which allows successive takes without re-arming.

REC records exactly the armed tracks shown in the rows. It is disabled with no
armed inputs, and it verifies the entire set again before recording. The ARM
changes are blocked during the recording or the pre-roll, and the SOLO/MUTE
stay available for the listening. A newly armed third-party track is never
adopted for the STOP cleanup.

Double-click a track name to edit it in place (keyboard: focus the name and
press Enter). Enter confirms and Escape cancels. Leaving the field does not
save. The polling preserves the draft and the focus. The names use 1–128
characters, trimmed and without control characters. Renaming changes only that
exact track name. An external rename, a replaced or reordered track, or a Set
change rejects a stale edit. Stop an owned REC or pre-roll attempt with the
surface STOP before renaming.

The marker strip is a reference for the capture range. Choosing a marker there
only changes what the **REC** will capture, and it never moves the transport
of Live or starts the playback or the recording. The take-lane clips are
inspected in the **TAKES** view of that track, which opens from the row of the
track or from the Arrangement clip that you chose. A moved or removed marker
has to be selected again.

A free recording, which is an **Until STOP** capture, turns the Arrangement
Loop off. A bounded recording confirms the region and the native Punch Out
before it starts. One pass leaves the Loop off. A finite repetition disables
the Loop on the last observed pass, and it confirms the STOP after the native
capture boundary. The pre-roll runs before the first pass only. These plans
run on the computer after the acceptance, and a phone reconnect never replays
a REC. Missing or ambiguous position evidence cannot confirm the completion.
The loss of the OSC link or of the Set retires the plan, and the recording may
continue, so check Live and use the STOP.
The STOP keeps the fixed start, the selected range, the count and the ARM for
another REC. While a capture is owned, the range is frozen: the markers that
are created afterwards do not change the range that is being recorded. Live
owns the take lanes, and the comping and the audio editing stay on the
computer. Configure the input monitoring there, and choose Monitor Auto/Off
for the Arrangement listening.

The pre-roll is a preference saved in this browser, and it is separate from
the native count-in of Live. It uses the currently observed time signature to
calculate the lead-in, and there has to be enough song time before the start.
It does not resolve the earlier time-signature changes of a meter map. The
REC confirms the stopped and record-off state, enables the native Punch In at
the start, and starts the playback from the lead-in position before it enables
the record mode. If the playback has already reached the start before that
confirmation, it aborts instead of starting a late capture.
The host monitors the lead-in after the command returns, so four bars are not
limited by the command timeout of the phone. At the first observed start
crossing, it restores the original click setting, unless you changed the
**CLICK** during the lead-in, and then your choice is kept. The STOP restores
only the click, the Punch In and the temporary Loop start that this attempt
still owns, and it keeps the armed inputs intact. The temporary start is
restored only while the Loop remains off. Use the STOP of this page to finish
the cleanup, even if you stopped the transport in Live. A change to a required
state cancels the lead-in, and the loss of the connection or of the session,
or a new Set, never replays the cleanup writes. Check the corresponding
settings in Live after such a loss.

To establish the playback start of Live, the pre-roll reuses a locator exactly
at the lead-in position, or it creates a temporary **RC pre-roll** locator
through the SDK. It jumps there natively and removes only the locator handle
that it created, confirming the removal and the original locators before the
arming or the playback. An existing locator is never renamed or removed. An
SDK failure or an unconfirmed cleanup blocks the playback and the recording,
and the STOP is sent immediately, even while the SDK work is pending. If the
host crashes, or if the session, the link or the Set changes during the brief
create and remove window, a temporary locator can remain. Check it in Live: a
reconnection never scans for or deletes the locators automatically.

The `count_in_duration` of Live is read-only in the supported API, and this
feature does not set it. The interaction with the native count-in and with
the **Enable Only While Recording** of the metronome still requires a
physical Live acceptance after the installation.

REC requires every input to stay armable and armed, with no armed track
outside the submitted set. It temporarily sets the Punch In ON for the
pre-roll, or OFF for a direct start, confirms it, and restores its original
observed value on the STOP or on a failure, and only while the change is
still owned. An observed external Punch In change relinquishes that
ownership. The Punch Out, the Arrangement Overdub, the Session Record and the
pending Back to Arrangement must be off in Live. An unknown or a stale
required state blocks the recording, and the background state reads do not
lock the controls of the page. The page reports the observed playback and
record mode, and they do not prove an audio capture. The earlier passages and
the take preservation remain the responsibility of Live: verify them in the
Set before you repeat, and save the Set in Live. REC does not delete the
clips, does not select the take lanes and does not invoke an undo.

The REC writes require the controller/admin permission and the current phone
connection. A lost connection never stops an ongoing recording, and it never
replays a write after a reconnect. If the phone or host link is unavailable,
stop the recording in Live.
The OSC and SDK flow has an offline regression coverage. The native Punch In
capture boundaries, the count-in and metronome preferences, the audio
monitoring, the take preservation and the mobile touch still require an
acceptance on your Live setup.

### Native Arrangement clips and waveform preview

The Arrangement clips are drawn on the same timeline as the markers, at the
intervals that Live actually reports. The clip names, the lane names and the
start and end positions come from Live, and never from a guess.

- **Bounded metadata:** the clip details are read per track, in pages of up to
  64 clips. The **Load** (or the **Refresh**) reads the track that you are
  looking at, the **More** asks for the next page, and the **Back** returns to
  the previous one. The page never scans the whole Set on every poll, so a
  large Set does not turn a refresh into a full sweep.
- **Catalog freshness:** the clip names, the intervals and the take catalog
  show the last explicit read, and nothing follows the clip edits in Live. If
  you rename, move or delete a clip in Live, use the **Refresh** (or the
  **Load**), or reload the page, and choose the clip again. The previous
  choice is not current any more. While one track is focused for the take
  inspection, the edits made in Live are not observed before that next read.
- **Waveform preview:** a waveform is an explicit action on a visible
  Arrangement audio clip, and only while the transport is stopped. The
  extension renders the selected interval before the effects into its own
  temporary storage, and it shows the peaks that come back. The preview does
  not read the original sample file. The visible interval is capped at 128
  beats, so a long clip needs a narrower range. Nothing is rendered in the
  background: there is no preview during the playback or the recording, and
  no poll starts one.
- **Limits and errors:** when a clip is longer than the cap, has no renderable
  audio, or the render fails, the clip keeps its native name and interval on
  the timeline. Only the waveform is missing.

### Take-lane clip notes

In the **ARRANGEMENT**, every track row has a **TAKES** action. It opens an
exclusive focus on that one track inside the same REC page, and it shows all
the native takes of that track. Tapping a native Arrangement clip does the
same, and the focus is restricted to the interval of that clip. The overview
keeps the take panel hidden until you open a focus. The other tracks are
hidden while you are there, the transport and the **CLICK** stay reachable,
and the **All tracks** brings the full list back. The take lanes keep their
native names, and the clips keep the intervals that Live reports, including
the intervals that overlap. The view never guesses a pass order, and it starts
with no take chosen.

- **Choosing a take:** tapping a take selects it visually and nothing else. It
  does not play, audition, move or rewrite anything.
- **Two ranges:** the **WHOLE CLIP** covers the full range of the source that
  you are looking at: the whole Arrangement clip that you opened, or, in the
  own view of the track, the whole interval of the take that you explicitly
  selected. The **PHRASE** covers the part of it that you are looking at. Both
  are inspection only. The **PHRASE** never edits or merges the audio, never
  punches in and never loops.
- **Marking takes:** tap the **GOOD** or the **REVIEW** to prefix `[RC:GOOD] `
  or `[RC:REVIEW] ` into the name of the take clip that you explicitly chose,
  and the rest of the name is kept. Tap the **NO MARK** to remove a known
  prefix with an explicit, deliberate action. The mark is a name tag on that
  one clip, so after a refresh you choose the clip again.
- **Guarded writes:** writing a take note requires a freshly confirmed stopped
  transport, the record mode OFF, no active REC attempt, and the
  controller/admin permission. Before writing, RC Surface checks that the
  chosen track, lane, clip name and time span still match Live. A stale or
  changed track, lane or clip target, a session or Set change, or a
  non-stopped transport rejects the write, and it requires a re-reading before
  a new action. If the outcome of a write is unconfirmed or times out, verify
  the clip name directly in Live. Nothing is replayed or retried automatically.
- **Independent from the main lane:** any existing clip copy on the main
  Arrangement track lane stays independent. Adding a note is a name tag only.
  It does not promote a take to the main lane, does not comp, keep or compare
  the takes, does not extract the audio, and does not prove the quality of an
  audio capture.
- **No audition of a take:** the **LISTEN** button is unavailable here,
  because no available API plays the take lane that you selected. Listen, comp
  and promote in Live. The audio on the main Arrangement lane is not the take
  that you selected. The Arrangement waveform preview above is a separate
  thing: it draws the Arrangement clips, never a take lane, and it is not an
  audio playback.
- **Set persistence:** the native clip names persist across the sessions only
  when you manually save the Set in Live (**Save Set**). The save and reopen
  verification requires a human acceptance.

### Empty Session scene

1. Arm the inputs with the shared track rows. Open the **CLIP** view, then
   explicitly choose a scene row. Every armed track must have an empty slot
   in that same scene.
   The existing clips are displayed for reference, and selecting one does not
   launch it.
2. Open the **CFG** for **1 / 2 / 4 / 8 / 16 bars** (default 4) and for the
   native launch quantization: **Global / None / 1 bar / 1 beat** (default
   Global). These are page-local choices, and they are not saved project
   settings. Global follows Live, and the other choices override only this
   launch, without changing the global preference of Live.
3. Press the **REC**. The host rechecks the Set, the scene and slot
   identities, the emptiness, the input armability and monitoring, and the
   complete armed set, including the tracks outside the scrolled view. The
   length uses the current observed meter in Live beats. A playing or a queued
   clip on a target track blocks the attempt. The Arrangement recording and an
   active Session Record button also block it.
4. The **QUEUED / REC / PLAY / STOP** are observed states, and not
   elapsed-time estimates. A native fixed-length capture can finish into the
   clip playback. The **STOP** cancels the preparation and requests a stop
   only for the target tracks that are still owned. It keeps the ARM and the
   global transport unchanged. To stop the entire transport of Live, use its
   normal transport controls explicitly.

The grid shows up to eight scenes per window, with an internal dark scrolling
and the previous and next buttons. The scroll never changes the armed set.
The pre-roll, the Arrangement markers and Loop, and the Punch In are unused
in the CLIP. The ARM changes and the renaming are blocked while the attempt
is owned, and the SOLO/MUTE remain explicit actions.

The STOP respects the native quantization, and it may show the **Stop
pending**. Confirm it in Live, or press the STOP again. The polling releases
the attempt when a fresh native Clip Stop (`playing_slot_index=-2`,
`fired_slot_index=-1`) or the confirmed stopped clip flags establish the
completion, including an external stop. A queued stop (`fired_slot_index=-2`),
an unknown state or a transport pause alone never suffices. No reload and no
repeated stop write is required after a confirmed completion. The missing
observations, or an SDK clip identity that is still catching up, cannot
authorize a blind track stop. A fresh recording observation can bind the
created clip, and then an explicit STOP can finish it. An observed foreign
clip, a changed track, scene or slot, or a replaced clip relinquishes that
target without stopping it. The loss of the session, the link or the Set
retires the ownership, with no stop, fire or cleanup replay after a
reconnection. Stop it in Live if the link is unavailable.

When the Session has overridden the Arrangement playback, the **BACK TO ARR**
appears in the REC. After every Session track is freshly confirmed idle and
the recording is off, press it to return explicitly to the Arrangement. It
confirms the native return flag of Live, and it selects the **ARRANGEMENT**
view only on success. If the transport is already running, the Arrangement
continues at its current position. The control never pauses or plays, never
moves the playhead, never changes the arms, the Loop or the Punch In, and
never deletes the clips. The active, queued or unknown clips block it.
Opening the REC, changing the destination or stopping the clips never returns
automatically.

The multiple fires are sequential OSC requests, and not an atomic host
transaction. A partial failure attempts to stop only the emitted targets
whose identities and observed ownership stay confirmed. The surface never
deletes or overwrites an existing clip. The Session CLIP grid does not overdub
the existing clips, does not audition the audio, and does not select the
comps. The **TAKES** view refers to the Arrangement take-lane clip names,
independently of the Session recording target. The native audio and MIDI
recording, the duration, the quantization and the capture boundaries still
require an acceptance in your Live setup. The automated proof uses the
SDK/OSC mocks.

## AUT loops

The SYNC offers five bar buttons (1–5 bars). The FREE uses a slider for 1–30
seconds, in steps of one second. The defaults are 2 bars and 10 seconds, and a
saved loop of 10 or 20 seconds keeps its duration.

The **AUT**, beside the MAP and the CFG, selects the automation recording for
the XY1 or the XY2. While the AUT is on, both XY targets are highlighted and
keep 100% of their dimensions, without shrinking and without individual
toolbars. Open the configuration of an XY target with a long press (hold
without moving for 600ms) on a phone, or with a right click on the desktop. It
never starts a capture, a playback or a change of a loop. The
LOOP/REC/countdown status stays inside the XY.

To record, enable the AUT and tap the XY movement area. The selection mode
closes, so your next touches perform normally. Three red pulses count
3–2–1, a steady red border marks the capture, and the completed movement
loops immediately. A right click on the XY (on a phone: hold without moving
for 600ms) opens the configuration. The settings include the **SYNC / FREE**,
the **1–5 bars** or the **1–30 seconds in steps of one second**, the
Record/replace, the Play, the Stop and the Clear. Changing the SYNC/FREE, the
bar count or the seconds discards the recorded movement of that XY, so record
it again after you change the length. Choosing a menu action or dismissing
the menu resumes the normal performance. Opening the configuration emits no
control. The MAP, the AUT and the CFG stay visible in the header, and their
selections are exclusive. Leaving the AUT selection does not stop an existing
loop.

The SYNC uses the observed playback position, tempo and time signature of
Live, and it keeps the receipt time independently of the MAP rendering. The
count and the capture require Live playing and a fresh clock. The play and
pause commands wait for the confirmation of Live, and the unrelated tempo and
beat messages cannot confirm them. A stale position listener is recovered
independently of the other incoming OSC traffic. The captured data is aligned
to the song grid. During the playback, the seeks and the Live loop wraps
follow the current song position. The Live STOP pauses an enabled SYNC loop,
and the Play resumes at the real position. A stopped or stale clock, a seek,
a loop wrap or a meter change during the **capture** cancels that attempt and
keeps the previous completed buffer. For a capture that spans several bars,
leave the Arrangement Loop of Live off until the capture completes. A meter
change during the playback stops the loop. The FREE uses the elapsed seconds
and ignores the transport of Live.

The small white square in an XY marks the takeover target of the mapping. It
blinks while the takeover is pending, and the orange dot remains the current
XY position. With the reduced-motion preference of the system enabled, the
white indicator stays steady.

Hold and move an XY over a playing loop to override it. On the release, it
returns to the current phase of the loop, and it neither restarts the loop nor
overdubs it. The Physics can supply the captured movement, but the playback
owns both axes and overrides the inertial motion. The two XY buffers and
settings are independent, and only one capture or countdown runs at a time. A
failed replacement keeps the previous loop. The Clear asks for a confirmation.

The completed points and the settings persist in the projects, the presets,
the snapshots and the local storage. The playback, countdown and recording
state never persists. A reload, a reconnect, a replaced session, a role loss
or a hidden page stops the AUT, so use the Play explicitly afterwards. The
Stop follows the Safe loss policy of each mapping and releases the Trigger
Note gates. This feature loops the RC Surface XY control data, and it does
not write the native Arrangement automation lanes. The pads and the toggles
are not recorded by the AUT in this version. The bounded recorder targets 30
samples per second, with at most 1,024 coordinate pairs per XY. A capture
gap over 250ms aborts the attempt. The physical browser smoothness and the
Live output still need a device acceptance.
