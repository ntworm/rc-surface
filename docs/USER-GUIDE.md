# RC Surface — User Guide

Everything a performer needs to operate the phone controller during setup,
soundcheck, and live performance. Read this once before playing a set.

> **Scope**: the phone client (`/phone-v3/`) is the main surface. The
> Ableton panel and admin dashboard are covered separately in
> `docs/CUSTOMIZATION.md`.
> RC Surface 2.0 supports one controller at a time: control your performance from the phone or desktop, never both simultaneously.

---

### Realtime control in the current candidate

MAP no longer slows parameter control: XY, MIX and sensor values use a separate
control stream, with the first frame sent immediately and subsequent traffic
coalesced at an 8 ms minimum spacing. This is a dispatch limit, not a promised
end-to-end latency. Newer continuous positions replace unsent ones; pad edges
retain order. Use **Smooth = 0** for no added mapping ramp. Explicit Smooth,
musical envelopes and safe-loss behavior still apply. Main/Master targets now
expand as **Main → device → parameter**, like other tracks; Tempo stays direct.

Reload the phone page after updating the extension. The legacy snapshot wire fallback is not a migration of 1.x projects or settings.
Version 2.0 uses isolated `surface-v2` host storage and schema 2.
Physical latency in Live still needs the pending recorded benchmark.

## 1. Phone layout at a glance

The phone UI is a single page with seven tabs. Switch with the buttons on
the top strip:

| Tab    | What it does                                                 |
| ------ | ------------------------------------------------------------ |
| PERF   | Performance: pads, XY, LFOs, Squares, UTIL shortcuts       |
| MIX    | Eight knobs and eight faders for mixer control                   |
| SNP    | Snapshots: 8 capture slots, morph between them               |
| SNS    | Sensors: live readouts for motion and orientation            |
| AUD    | Microphone and audio-analysis inputs                         |
| VID    | Camera, hand tracking, and learned static poses             |
| REC    | Arrangement markers/Loop/pre-roll or empty Session CLIP recording |

The top strip also holds the **MAP / AUT / CFG** header modes near the BPM display plus
**SYNC**, **STAGE**, and contextual **CALIBRATE** on SNS/AUD/VID. See
[§ 7 Top-bar controls](#7-top-bar-controls) and
[§ 8 MAP mode](#8-map-mode---mobile-mapping).

**⚙ follows the current tab:** PERF opens Deep Sync, VID opens recognition and
tracking-loss settings, AUD reuses input/analysis controls, and SNS shows sensor
capabilities plus explicit enable/calibrate actions. MIX/SNP have no header gear.
Opening settings never starts a camera, microphone or sensor permission request.
CONF/REC quick controls and contextual CALIBRATE remain available.

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
The mode is shared: pick once, every control plays by the same rule.

### Mode A — Momentary (default)

- Touch sends a non-zero value; release sends zero.
- Drag **vertically** to scale the value from `0` (release point) to `1`
  (150 px above the touch start). This is the same range used by
  knobs, faders, LFOs, and Squares.
- Best for: drum hits, one-shot samples, momentary effects on a button
  press.

### Mode B — Hold

- Touch latches the control **on**; release without any drag sends it
  back off. Any movement (vertical or horizontal) keeps it held until
  you deliberately drag the value back to zero.
- For Squares specifically (see [§ 4](#4-square-pulse)): a tap
  turns the square off; release with amplitude below `0.02` also turns
  it off. Horizontal speed changes keep it running while amplitude is nonzero.
- Best for: latched LFOs that keep modulating after release, sustained
  square sweeps, pads that you want to keep ringing.

### Mode C — Toggle

- Tap turns the control on; tap again turns it off.
- A small vertical drag while on lets you re-modulate the value
  without toggling off — drag is ignored by the toggle state.
- When turned on by tap, the value reverts to the last value you used
  in this mode. If you never set a value, it defaults to `1`.
- Best for: pads that should stay pressed (sustain pedal behavior),
  LFOs that need to keep their setting between toggles.

### Mode D — Burst

- Touch fires a one-shot envelope peaking at `1`.
- Drag **vertically while holding** modulates the peak between `0.15`
  and `1`.
- Best for: laser stabs, ghost notes, percussion that needs a tail,
  drum-roll risers.

**The whole page bursts, not just the pads.** Mode D is a shape, and every
control it applies to follows it: a pad's value rises and falls, and an LFO or
Square opens its depth over the attack and closes it over the release. In
`FREE` the envelope is a fixed 520 ms with a 70 ms attack, the same on all of
them. Switch the header to `SYNC` and the length comes from Live's tempo
instead, chosen in **Deep Sync Settings → Burst Config (Pad Mode D)**:

| Control | What it does |
| --- | --- |
| Length (Subdivision) | One bar down to 1/16. At 120 BPM, `1 beat` is 500 ms. |
| Attack | Drag the peak along the drawn envelope. The shape is what you are setting, so it is the shape you drag. On a phone, press and hold the peak for about 0.6 s first; scrolling across the short envelope never edits it. |

Under the drawing the panel prints what the current setting actually resolves
to — the subdivision, the tempo it is being multiplied by, the clock source
behind that tempo, and the resulting milliseconds. That line is the one to read
when a length is not behaving: a stale tempo, a different clock source and
`FREE` overriding the grid all look identical until it names which one it is.
While `SYNC` is off the length grid dims, because nothing it offers reaches the
burst.

A burst is a one-shot, so being off the grid is audible immediately —
this is the setting that puts a stab on the beat rather than near it.
The section applies only while `SYNC` is on; `FREE` ignores both controls
and keeps the fixed envelope. If Live has not reported a tempo yet, the
length falls back to 120 BPM rather than going silent.

---

## 3. Eight toggles (T1–T8)

All eight slots (`toggle-1`..`toggle-8`) share the same component and start in
**Global** for waveform, mode and timing. CFG offers **Sine, Triangle, Ramp Up,
Ramp Down and Square**. Any combination is possible. There is one centred
TOGGLES heading, with T1–T4 above T5–T8. Each slot shows a short waveform label
and its effective A/B/C/D mode.

The active mode colours match the pads: A blue, B amber, C green, D pink.
Waveforms do not introduce a second colour system. Drag horizontally for speed
and vertically for depth; those values are deliberately absent from CFG.
A stops on release, B retains a dragged setting, C toggles, and D runs one burst.
The existing burst length/attack and snapshots remain available.

CFG is compact: waveform, mode, timing and a subdivision selector in SYNC.
Only rhythms supported at the current BPM and waveform are offered; Square
also accounts for ratchet and swing. Unsupported old pins display their effective
limited rhythm. FREE hides the subdivision row. Expand **Advanced** for phase
and Square's swing/ratchet. The menu body scrolls within the viewport.

Global inheritance survives project/preset/snapshot capture and recall.
Global does not mean a saved explicit A or Sine. A per-slot selection remains
local to that slot; restoring shared defaults removes its overrides.

Generator ceilings remain conservative: sine 4 Hz, triangle/ramps 3 Hz,
Square pulse 15 Hz including ratchet. These are software limits, not measured
physical fidelity guarantees for Live.

## 4. Square pulse

Square now alternates between **0 and the chosen depth**: at 50% depth it
alternates 0%/50%, rather than the former centred Square's 25%/75%.
It includes the former Stutter's swing and ratchet (1–4), so Stutter is no
longer a separate waveform or control. The pulse does not sample or repeat audio;
its musical effect depends on the mapped destination. Any of T1–T8 can use it.

The local pulse indicator follows the actual gate, with a thin value rail.
It is a preview, not confirmation of Live delivery; a display may miss fast pulses.
Changing to/from Square safely stops the old algorithm before the next touch.

2.0.0 uses performance payload schema 2 and fresh browser performance keys.
Overrides and snapshots created by the first 2.0.0 candidate are not imported;
that avoids restoring the forced mode A and the retired Stutter waveform.
Existing files remain untouched; configure this candidate afresh.

## 5. PERF UTIL shortcuts

The PERF tab has a compact `UTIL` block for actions you need during a
set without leaving the performance surface.

- **CAP** arms snapshot capture from the PERF page.
- **1-4** recall snapshot slots 1 through 4.
- **CAP + 1-4** saves the current performance state into that slot.
- **OFF** cancels active snapshot morphing, turns off pads, LFOs, and
  Squares, and returns XY pads to center. It does not reset MIX
  knobs, faders, sensors, audio, vision, or transport.

---

## 6. XY panels

XY1 and XY2 have identical controls. Open CFG on either pad and select Static
or Physics. Static stays where you release it. Physics coasts and rebounds;
friction (0.002–0.05), bounce (0–0.95) and speed (0.1–4×) are independent
for each pad. Both start Static; any combination is possible. Speed scales
free motion, while friction controls decay. Switching to Static stops residual
motion immediately. CFG inspection emits no control value.

Each axis maps separately as `xy-1.x/y` or `xy-2.x/y`. Position setters and OFF
stop motion; OFF centers both. Configuration is stored with the new performance
profile, presets and snapshots. `xy-N.friction`, `.bounce` and `.speed` are also
local numeric setters; Live destination mappings remain the X/Y axes.

---

## 7. Top-bar controls

Three buttons on the top strip of every page.

### SYNC

Toggles the BPM clock between **SYNC** (locked to Live) and **FREE**
(internal).

- **SYNC** (cyan): LFO and Square rates are quantized to Live's BPM,
  the pad mode D burst takes its length from the grid (see
  [§ 2](#2-pad-modes-a--b--c--d)), and a snapshot transition set to Sync
  does the same (see [§ 10](#10-snp-tab--snapshots-and-morph)).
  The header shows the current BPM (`120.0 BPM` etc).
- **FREE** (amber): the phone runs its own clock. Use this when Live
  isn't running, or when you want internal tempo regardless of Live.

Pressing SYNC restores the session BPM as reported by the last Live
broadcast.

### CALIBRATE

CALIBRATE is contextual: it appears only on **SNS**, **AUD** and **VID**.
Each page starts **Not calibrated** and keeps its own state during this browser
session. Switching pages cancels an unfinished collection, not a completed
calibration on another page. Reloading resets all three.

- **SNS:** hold the phone still in the desired neutral posture, then press
  CALIBRATE. One second of stable, fresh readings sets the neutral orientation.
  Rotating the screen invalidates this reference. This does not zero acceleration.
- **AUD:** enable the chosen input and keep a representative passage playing at
  its normal level for five seconds. Calibration adjusts only the **RMS/envelope
  control response**, using a bounded gain (0.25–8x), not Live audio volume, EQ,
  detector gains, thresholds, RELEASE or SMOOTH. It is not noise removal. Silence
  is not a valid calibration passage. Stopping/changing the input resets it.
- **VID:** enable the camera, stay in the performance frame and raise the hand
  you will use. Over four seconds the app checks image brightness, overexposure
  and continuity of actual hand detections. It enables continuous exposure/focus
  only if the camera advertises support and reports the change. Otherwise it
  says that the camera was checked without changing settings. Poor lighting or
  missing hands require a retry, not a fake success. Hand coordinates, neutral
  position, learned gestures and MediaPipe confidence are never modified.

The compact strip explains what to do and shows collection progress. **CANCEL**
stops collection; **RESET** restores the page's default response and any camera
settings changed by calibration. A failed/canceled camera attempt rolls back its
changes. Recalibrating replaces the previous calibration on that page. No button
opens microphone/camera permissions automatically. This is not latency calibration.

### STAGE

Toggles **Stage Mode**:

- Hides the top bar, tabs, and labels (everything except the
  performance controls themselves).
- Requests browser fullscreen so the phone UI fills the screen and
  nothing else can steal focus mid-set.
- Press again — or exit fullscreen by any system gesture — to leave
  Stage Mode.

Use Stage Mode when performing: it removes the chrome and gives you
the largest possible surface for the controls.

> **Known limitation — 2026-07-12:** enabling the audio sensor or camera
> while Stage Mode is fullscreen can make Chrome exit fullscreen. On the
> tested Samsung S25F, fullscreen may not become available again until the
> controller tab is closed and reopened. Enable audio/camera before entering
> Stage Mode when possible. When fullscreen ends this way, Stage Mode now ends
> with it instead of leaving an **EXIT** button on a page that is no longer
> fullscreen.

### Contextual header and TRN settings

The header shows only what acts on the current tab: **AUT** on PERF (XY 1/XY 2
loops), **CFG** on PERF and MIX, and **MAP** on every tab except REC. Leaving a
tab turns off a mode it does not support; an open MAP closes when you enter REC,
without changing mappings. The original tabs/transport composition stays in place; common controls
keep the same position between tabs. **STAGE/EXIT** and status remain visible,
including in Stage Mode and narrow landscape screens.

**TRN** opens Transport Lite. **CLICK** and **GLOBAL QUANTIZATION** stay visible
in its main control row, before **REFRESH**, without a settings button:
**GLOBAL QUANTIZATION** shows the value Live confirmed and changes the Set's
`clip_trigger_quantization` (a clip with its own quantization keeps it), and
**METRONOME** turns Live's click on or off. It is the same metronome as REC
**CLICK**; a change made in TRN, REC or Live appears in both within about a
second. Viewers can read but not write, nothing is replayed after a reconnect,
and a missing AbletonOSC link shows the value as unknown. The metronome's sound,
rhythm and count-in are not exposed to extensions: set them in Live, or use REC
**PRE-ROLL** for a count-off.

---

## 8. MAP mode - mobile mapping

Tap **MAP** near the BPM display to enter mapping mode from the phone.
This does not open a separate mobile page in the browser; it overlays a
mapping workflow on top of the real controller so you can pick the
control you are already using.

### Selecting a control

While MAP mode is active, mappable controls on the visible performance
page become selectable with a blue MAP outline/label. This includes:

- PERF controls: pads, XY pads, LFOs, Squares.
- MIX controls: knobs and faders.
- Sensor controls from the fallback list in the MAP panel.

Tap a highlighted control to select it. For XY pads, the editor exposes
the axes separately:

- `xy-1.x` / `xy-2.x` - horizontal axis.
- `xy-1.y` / `xy-2.y` - vertical axis.

### Bind to parameter

Use **Bind** when you want a phone control to move an Ableton parameter.
The target picker is hierarchical:

- **Song / Main / Master**: song tempo and main/master track targets.
- **Tracks**: normal Live tracks, mixer targets, devices, and parameters.
- **Return Tracks**: return-track mixer targets, devices, and parameters.

Open a track, then a device, then choose the parameter. Search filters
the tree while keeping the track/device context visible, so you can tell
which parameter belongs to which track.

### Trigger note to MIDI track

Use **Trigger Note** when a phone control should send a MIDI note instead
of continuously moving a parameter.

1. Select a pad, LFO, Square, XY axis, knob, or fader in MAP mode.
2. Tap **Trigger Note**.
3. Pick a MIDI track.
4. The extension checks for `RC-Midi-Receiver.amxd` on that track. If it
   already exists, it reuses it. Otherwise, place the bundled device from the
   release/User Library on that MIDI track in Live and try again. Live's
   Extensions SDK cannot insert Max for Live devices automatically.
5. Choose the note with the **Pitch** and **Octave** controls and set
   **Velocity**.

**Receiver v2.2:** **SDK Notes** arms itself once the device has finished
loading, after discarding any packet value the Set restored, so a fresh
pad press plays without any click. Disabling the device turns it OFF and
re-enabling arms it again; **Panic** turns it OFF and it stays OFF until you
click it. Turn SDK Notes OFF before recalling a preset on an already loaded
device. Audio Sender input is a separate opt-in. Do not automate or MIDI-map
`RC MIDI Packet v2`: the API requires an automatable parameter, and while SDK
Notes is ON such automation can play notes.

This candidate also passes upstream MIDI byte-for-byte through **midiin →
midiout**, separately from SDK/Audio Sender gates and their Panic/flush path.
Keyboard channels, Note-Off, velocity and controllers keep their original bytes.
Replace the already loaded Receiver instance with the candidate
`RC-Midi-Receiver.amxd`; updating the extension does not replace devices in a Set.
Check the keyboard and generated notes in Live before performing.

Multiple controls can trigger notes on the same MIDI track. Different
notes are treated as different trigger targets.

### Trigger Note mode (`trigger_note`)

When mapping a control to play notes on a MIDI track equipped with an `RcReceiver v2` device, set the target mode to `trigger_note`. The editor displays a dedicated contextual interface tailored for musical chord and note triggering:

- **Destination Track & Switch:** Displays the target MIDI track name and an indicator badge for the `RcReceiver v2` device. Tap **Change** to reassign the target track while preserving your existing note, velocity, and timing configurations.
- **Pitch and Octave:** Pick the note pitch (C through B) and octave (-2 through 8). The editor calculates the standard MIDI note number (C-2 = 0, C2 = 48, G8 = 127). Pitches above G8 (MIDI 128+) are rejected.
- **Velocity:** Adjust the outgoing MIDI velocity (1 to 127, default 100).
- **Timing:**
  - `immediate` (Now): Fires the note immediately upon gesture recognition.
  - `beat` (Next Beat): Quantizes Note-On to the next quarter-note beat based on fresh OSC transport position.
  - `bar` (Bar): Quantizes Note-On to the next bar boundary.
- **Gate:**
  - `pulse` (Short): Plays for a chosen duration. New synchronized notes default to **1/4 bar**; choose 1/16, 1/8, 1/4, 1/2, 1, 2, or 4 bars, or switch to free milliseconds (20–2000 ms). Existing millisecond mappings retain their saved duration.
  - `hold` (While Held): Sustains the note until the triggering control or gesture is released.
  - *Constraint:* `hold` is incompatible with quantized timing (`beat` or `bar`). Selecting quantized timing automatically switches the gate to `pulse`.
- **Editor layout:** Destination appears once, followed by Note (pitch, octave, MIDI number and fixed velocity) and Trigger (when to fire and how long to play). Selecting Next Beat or Bar from Now opens Musical, 1/4 bar automatically, including after While Held. Choose ms explicitly for free duration; old millisecond presets are unchanged when opened.
- **Musical duration:** Available with Short in Now, Next Beat and Bar. Tap a fraction directly; there is no duration dropdown or estimated-ms readout. Now starts immediately and uses the connected Live BPM/meter for its release timer, even while playback is stopped. Unknown or disconnected musical metadata blocks the note with feedback; ms remains available. While Held uses real gesture release instead of a fixed duration.
- **Advanced:** Collapsed by default; contains trigger threshold and the actual signal-loss behavior. Bind and Trigger Note are selected at entry, without a second mapping-mode selector here. Presets stay collapsed; Bind, Trigger Note, Unbind Target, Clear Control and Clear All Mappings sit directly below the control title and stay accessible while scrolling. Multiple mappings form one labelled block, with Bind/Trigger Note type and destination on each selectable row. Only meaningful note feedback is displayed.
- **Bind:** Direct Continuous/Toggle and Linear/Exp/Log/S buttons precede a full-width interactive graph. Output min/max, Drive, Compression and Smoothing are the primary faders. The three graph points follow the effective output after Drive and Compression; output min/max remain the limits used to scale that response. Dragging a point accounts for these settings, and a saturated or flat response keeps values bounded. Input range, target scale, takeover, safe loss, idle and neutral values are under Advanced. Small fader thumbs retain a larger interaction area and double-click reset. On a phone, the three graph points edit only after you press and hold one for about 0.6 s: it gets a ring, then drag and lift. A quick tap, a scroll or a touch on the background never changes a value; cancelling (system gesture, leaving the panel, changing tab or losing the connection) restores the value the point had when it was selected. A mouse still drags at once and double-click still resets.
- **Safe Lifecycle & Cancellation:** Pending Next Beat/Bar notes are cancelled on transport stop, meter change, seek, loop jump, stale transport clock (>1000 ms), unbinding, or disconnection. A sounding Next Beat/Bar note is released on transport stop, clock loss, unbinding, or disconnection; after a seek, loop jump, or meter change it ends on its own Note-Off. Now notes are not tied to the transport: Short ends on its own Note-Off and While Held when the control or gesture releases; unbinding or disconnection releases them early. Triggers executing >20 ms late are discarded as missed. Scheduling operates per track lane with latest-wins policy (capped at 64 active lanes).
  A retrigger on the same track retires the previous voice and OFF timer before the replacement ON, so the new note receives its full duration.

### Launch Clip (`clip_launch`)

Use **Launch Clip** when a control — typically a learned pose G1, G2 or G3 —
should ask Live for a Session clip that is already in your Set. Everything is
set up from MAP: no loopMIDI, no auxiliary track and no Ctrl+M mapping.
Launch Clip needs AbletonOSC (see [INSTALL](INSTALL.md)); the Extensions SDK
lists tracks and clips but cannot launch them.

1. Select the control in MAP mode and tap **Launch Clip**.
2. Pick a track. Only regular tracks that hold clips are listed, with their
   real names; group tracks are not offered, because launching a group slot
   fires a whole row.
3. Pick a clip (slot number and real clip name).

After creating, renaming or deleting tracks/clips in Live, tap **Refresh**
in the picker header. Bind, Trigger Note and both Launch Clip pickers have
this button; the current filter and chosen track stay selected when available.
If saving fails, the Launch Clip picker stays open and shows the error so
you can retry.

**Choice** — one per mapping:

- **Launch clip** (default): each activation asks for that clip. Holding the
  pose does not repeat it, releasing lets the clip keep playing, and another
  pose chooses another clip directly, without a neutral pose in between. If
  Live already has that clip waiting or playing, nothing is sent.
- **Advance list**: 2 to 8 clips of the same track. Each new activation asks
  for the clip after the one Live is playing and wraps at the end. Only one
  advance per quantized entry: while the requested clip is still waiting in
  Live, further activations do not move the list again.
- **Stop track**: Live's track stop, quantized by Live. It also cancels a
  launch that is still waiting on that track.

**Quantization** is always Live's: the clip's own launch quantization, or the
song setting when the clip says Global. The effective value is displayed
separately from **Set global quantization**. Choose a global value and tap
**Apply** to change the entire Set, including other clips using Global.
A clip with its own quantization keeps that setting. None is allowed for the
Set, but continuation rules still require a usable quantum.

The editor waits for Live to confirm the requested value (up to two seconds),
keeps the observed value visible while waiting, and reports disconnection or
failure. It never retries or reapplies the value after reconnecting, opening
an editor or loading a mapping/preset. Save the Set in Live to persist it.

**State** comes only from what Live reports back: Ready, Sent — waiting for
Live, Waiting in Live (next boundary), Playing, Stop waiting in Live, Track
stopped, No confirmation from Live, AbletonOSC disconnected, Destination
missing, More than one match, and a blocked state when Live and AbletonOSC
list the tracks differently. Sending a message is never shown as playback.
**Test** runs one activation with the same rules as the gesture.

Confirmed hand absence releases the learned pose and rearms its edge, while
the clip and RC continuation keep playing. Reacquisition needs a new stable
entry. Phone disconnection/reconnection never resends anything. Small oscillations are filtered by the pose
recognizer and, on top of that, a request Live has already received is not
repeated.

Changing your mind before the boundary (for example G2 and then G1 while Base
plays): the API has no "cancel launch", so asking for Base again replaces the
waiting clip and, as documented for Live's API, restarts Base at the
boundary.

**After it starts** — only in Launch clip mode, separate from the choice:

- **Let Live decide** (default): the clip loops, or its native Follow Action
  in Live takes over.
- **RC: go to clip** after N passes (1 to 8), for example Virada → Base after
  one pass.
- **RC: stop track** after N passes.

These are RC Surface rules. They do not read or change the Follow Actions in
Live, which no available API exposes. If the clip also has a native Follow
Action, both act: use one or the other.

How a rule counts: with start marker S, loop start A, loop end E and end
marker F, the first pass lasts `E − S` and every later pass `E − A`, so N
passes last `T = (E − S) + (N − 1)(E − A)`. A clip without loop plays once
(`T = F − S`, N must be 1). The rule waits until Live confirms the clip is
playing, follows the clip position Live reports, and hands the next request to
Live inside the last quantum before `T`; Live still does the quantization. The
editor predicts the result: the return lands at the end of pass N, or the
clip plays some beats more (looped clip), or there are some beats of silence
(clip without loop).

A rule is refused when Live's quantization is None, the quantum is too short
at the current tempo (under 250 ms of window), the clip has Legato on or a
launch mode other than Trigger, the clip is unwarped audio, or a clip without
loop is given more than one pass. A rule is cancelled — and never resent —
when another clip is chosen on the track (from RC Surface or in Live), the
track or the transport stops, the mapping is removed or changed, the
AbletonOSC link drops, or the position updates cannot prove how many passes
were played (it does not guess). A phone disconnect does not cancel an armed
rule. If the window is missed while the rule is still valid, the next request
is sent once and marked **Late return**.

Changing the global quantization, either here or in Live, cancels every
unsent RC continuation once the change is observed. During a pending RC
write, returns and new rules are suspended; failure or timeout cancels the
suspended rules. For a new rule, stop or choose another clip, then activate
again to obtain a new launch. A return already sent
to Live remains under Live's control; RC Surface cannot undo that queued
request. Receiving the same global value again does not cancel a rule.

The precision of the return is a hypothesis still being validated in
Live 12, not a guarantee. When the exact timing matters more than the
gesture, configure the Follow Action in Live and choose Let Live decide.

**Destinations** are kept by track and clip name plus Live's identity for the
open session. Reordering tracks or scenes keeps the same clip. A renamed,
deleted or duplicated clip is not launched: the editor asks you to choose it
again. An empty slot is never fired. Mappings, presets, export and import
keep Launch Clip targets and re-point them by name when a set is reopened.

API limits, in short: the Extensions SDK cannot launch clips; Live offers no
call to cancel a queued launch (only a stop or another launch); launching a
clip that is playing restarts it; AbletonOSC addresses tracks and clips by
index and does not report errors back, so RC Surface checks the destination
before each request and only trusts Live's own state reports.

### Mapping editor fields

Each mapped target can be adjusted from the phone:

| Field | Meaning |
| ----- | ------- |
| Mode | `continuous`, `toggle`, or `trigger_note`. In `trigger_note` mode, continuous sliders (curve, in/out ranges, drive, comp, smooth) are hidden, but their values are preserved if you switch back. |
| Curve | `linear`, `exponential`, `logarithmic`, or `s-curve`. |
| Target scale | `Auto` keeps mixer/tempo linear and uses geometric travel for recognized wide positive frequency ranges; explicit `Linear` or `Geometric` overrides Auto when the target supports it. |
| In Min / In Max | The input range read from the phone control. |
| Out Min / Out Max | The output range sent to the Live target. |
| Drive | Pushes the response curve up or down. |
| Comp | Compresses or expands the middle of the response curve. |
| Smooth | Adds smoothing to reduce abrupt value jumps. |
| Threshold | Threshold for non-continuous modes. |
| MIDI Note | Pitch and octave for fixed trigger-note mappings (C-2 to G8). |
| Velocity | MIDI velocity for fixed trigger-note mappings (1 to 127). |
| Timing | Note scheduling quantization (`immediate`, `beat`, `bar`). |
| Gate | Note duration behavior (`pulse` with configurable duration, or `hold`). |

The curve canvas shows the current response shape and a moving dot for
the selected control's live input/output in continuous mode.
Phone inputs enter the mapping engine in one normalized `0..1` domain.
Centroid, Spread and Rolloff show Hz on AUD but map in that same `0..1`
domain. Detected pitch, note and audio BPM are not provided.
The target scale then converts that common
domain into the real Live parameter range and clamps it at the final write.

### Presets, refresh, and unbind

The MAP panel can save, load, and delete local mapping presets. Presets
are stored in Ableton extension storage on the host computer.

Use **Refresh** if Live tracks/devices changed while MAP mode was open.
Use **Unbind Target** to remove one target from the selected control, or
**Clear All** to remove every mapping from that control.

Removing or replacing a binding cancels its unsent parameter commands. A
command already sent to Live may still finish; this is not an undo operation.
Held trigger notes are released when their binding is removed. Failed saves
keep the previous mapping active, so resolve the error before assuming it is gone.

When you leave MAP mode, the phone returns to the previous performance
page and normal touch behavior resumes.

---

## 9. MIX tab — Knobs and Faders

The MIX tab has eight knobs (`knob-1`..`knob-8`) and eight faders
(`fader-1`..`fader-8`).

The two panels share the available width and height equally, including in
STAGE. Flat arc knobs use a four-by-two grid; drag range stays unchanged.
IDs 1–6 and old profiles remain compatible; 7–8 are additional controls.
Use Tab and arrow keys (Shift for larger steps), Home/End for bounds. Knob
reset returns to 50%; fader reset is described below.

### Knobs

- **Drag vertically** to set the value (`0..1`).
- 150 px drag range (same as everything else).

### Faders

- **Drag vertically** to set the value (`0..1`).
- **Double-click or double-tap** restores the initial position: 85% for normal
  mappings, 50% for bipolar parameters such as pan. These are normalized
  surface positions; the mapped parameter's range determines its actual dB.
- Visual: a thumb on a track, with the track filled from the bottom up to the
  current value. A fader bound to a bipolar parameter such as pan fills from
  the centre instead, because for pan the middle is rest, not half travel.
- 150 px drag range.

The MIX tab is where most people wire Live's volume, pan, sends, EQ,
and macro controls. Tap **MAP**, then tap a knob or fader to bind it
directly from the phone.

---

## 9.5 Config Mode (CFG)

Tap CFG, then a control (or right-click on desktop). All eight LFO slots expose
the same waveform/mode/timing controls; Square adds swing and ratchet. Both XY
panels expose Static/Physics; friction, bounce and speed appear only in Physics.
Switching to Static preserves those settings for later use. Pads retain A/B/C/D,
knobs gesture range and faders reset value. Reset removes that control's override;
long-press CFG lists overrides and offers Clear all. Escape or tap outside closes.

Waveform, mode and timing use direct buttons, without dropdowns; picking one keeps
the editor open. In SYNC, expand Subdivision to choose Global, Auto or a note
value plus Straight/Dotted/Triplet. Only combinations supported by the effective
waveform, BPM, swing and ratchet are offered, including when the waveform inherits
Global. FREE hides this section. Advanced stays collapsed until opened. Toggle
values animate across the full width in the A/B/C/D mode colour.

Each pad now exposes settings for its effective mode, including Global inheritance:

- A: touch level, drag travel (40–400 px) and Linear/Fine/Fast response; release stays zero.
- B: drag travel/response and Keep value or Reset to zero on a tap without drag. Cancelled touches do not reset the latch.
- C: drag travel/response and Remember last or Fixed On level. A tap still switches off to zero.
- D: Global/SYNC/FREE timing, musical length or 40–10000 ms, attack ratio and peak. Effective duration/attack are shown; the existing minimum transmitted burst is one 30 Hz frame. Settings apply on the next gesture.

Fine gives small movements more precision; Fast reaches larger changes sooner.
These levels control the mapped signal, not MIDI note velocity. MIDI trigger threshold
and velocity remain in MAP. Changing a pad mode safely releases its old state.
Per-pad settings save with the performance profile and snapshots. Second right-click
on the same control closes CFG; right-click elsewhere switches the editor.
Live waveform changes, including Square, keep a toggle active without another tap;
a mode-D burst keeps its original end time. Visual fill uses transforms and avoids
rewriting unchanged labels/trails; actual device smoothness needs physical testing.

Browser overrides use `ableton-rc:v3:control_config`. Modulator/XY settings also
round-trip through the host performance preference in new project profiles and
named presets. Saved performance configurations preserve Global inheritance; loading never
turns a shared mode into a per-slot override. Snapshot capture
includes the current settings and scalar values.
They do not save the Live Set itself. Knob/fader overrides still stay on the phone. Previous performance keys and formats are not loaded.

## 10. SNP tab — Snapshots and morph

The SNP tab captures the **state of all performance controls** at a
moment in time and lets you interpolate between captured snapshots.

### Slots

Eight slots, numbered `1`..`8`. Empty slots show `Empty`; filled
slots show their slot number.

### Capture

1. Set the controls (pads, XY, LFOs, Squares, knobs, faders) to a
   state you want to remember.
2. Press **CAPTURE** (red record button).
3. Tap an empty slot. The slot now stores the current state.

### Clear

**Clear Slots** wipes all eight slots.

### Morph time

The slider at the right of the controls sets how long a recall takes.
The **Free / Sync** pair above it decides what the slider means:

- **Free** — the slider is seconds, `0.1 s` to `5.0 s`, default `1.0 s`.
  The transition ignores Live's tempo.
- **Sync** — the slider picks a musical length instead, and the readout
  shows it as `4 beats` or `1/4 beat` rather than a number of seconds:

  | | | | | | | | | |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | 16 beats | 8 beats | 4 beats | 2 beats | 1 beat | 1/2 beat | 1/4 beat | 1/8 beat | 1/16 beat |

  The length is read from Live's tempo when the transition starts, so
  changing the tempo moves every later transition without touching the
  slider. At 120 BPM, `4 beats` is 2 seconds. Beats here are quarter notes, independent of meter.

These straight subdivisions also appear in the square grid; LFOs have their own
expanded rhythmic grid within the selected shape ceiling. Snapshot transitions additionally
offer 8 and 16 quarter-note beats for slower gestures. If Live has not reported a tempo yet, the
length falls back to 120 BPM rather than stalling.

### Morph modes

- **Grid (1-8)** — tap any slot to morph from the current state to
  the slot's state over the morph time. Tap another slot to morph
  again. Transition Time (configured via the Free / Sync controls) applies
  only to Grid mode.
- **Vector XY (1-4)** — a 2D vector pad appears for direct interpolation
  without Transition Time. The pad has four corners, each tied to a snapshot.
  Drag the dot inside the pad to blend the four snapshots continuously and
  instantly; the Transition Time block (Free/Sync slider) is disabled in Vector mode.
  Useful for live continuous exploration between four macro configurations.

Mapped Live parameters follow the morph while the transition is running.
For example, if an LFO, Square, knob, or fader is mapped to Live, the
mapped value should move through the transition instead of waiting until
the morph ends.

---

## 11. SNS tab — Sensors

Live readouts of the phone sensors. No controls here — these are
the values being broadcast to Live so you can verify they work and
map them elsewhere.

### Sensor status

Each panel header shows the current sensor state, honest per API:

- `ready` — real finite readings are arriving and can be mapped.
- `waiting` / `no-readings` — the page is waiting for the first
  reading. A desktop browser with no sensor hardware stays here; this
  is silence, never a permission denial.
- `lost` — a previously working sensor stopped delivering for more
  than two seconds. Stale values are discarded and no longer mapped.
- `denied` — the browser permission was explicitly refused.
- `error` — the permission call itself failed; retry with the button.

Motion and orientation are tracked independently: one denied API does
not affect the other. A permission prompt only appears on browsers
that require one (iOS-style gesture permission).

### MOTION

Six axes from the accelerometer and gyroscope:

- `GX`, `GY`, `GZ` — gyroscope angular velocity (rad/s)
- `AX`, `AY`, `AZ` — linear acceleration (m/s²)

The values reach the live mappings as:

- `sensor.motion.ax`, `sensor.motion.ay`, `sensor.motion.az`
- `sensor.motion.gx`, `sensor.motion.gy`, `sensor.motion.gz`

### ORIENTATION

Three angles from the device orientation sensor:

- `YAW` (alpha) — compass heading
- `PITCH` (beta) — tilt forward / back
- `ROLL` (gamma) — tilt left / right

The values reach the mappings under `sensor.orient.*`. Yaw is shown
with a compass-style orbit; pitch and roll with level-style orbits.

SNS calibration starts only with fresh finite readings on all three
orientation axes. On a desktop without motion hardware, CALIBRATE
shows a neutral "No motion readings on this device" notice instead of
a permission error.

### LOCAL VIEW

Two switches: visibility toggles for the MOTION and ORIENTATION
panels in this tab. They only affect what's shown here — they do
**not** mute the sensor broadcast.

---

## 12. AUD and VID tabs — Audio and Vision

Inputs from the phone's microphone and camera. These require the
browser to ask permission the first time you enable them.

On larger desktop windows, AUD uses larger dials and fields distributed through
the audio detector workspace. Analysis needles follow the value arc around the dial center.
VID prioritizes camera width, with its controls at the top and a proportional
preview beside three stacked pose cards with bounded action buttons. Short landscape screens retain the
compact phone arrangement, in both normal and STAGE modes.

### Audio input

Toggle **Audio input** to grant microphone access. On a computer the browser
also lets you choose which input to use, so a loopback or interface channel can
feed the analysis instead of a room microphone.

Capture requests echo cancellation, noise suppression and automatic gain off,
so voice processing does not intentionally reshape the dynamics or spectrum.
The actual browser, driver and selected input can still resample or process
audio; this is not a guarantee of bit-perfect capture. Use the grouped detector
controls below, not the retired pitch/clarity controls.

Once enabled:

- `sensor.audio.rms` — input RMS amplitude, `0..1`, not perceived loudness
- `sensor.audio.envelope` — short-term amplitude envelope
- `sensor.audio.gate` — `1` while input RMS exceeds its internal threshold (with hysteresis)
- `sensor.audio.attack` — peak strength after an onset, `0..1`; no note recognition


### Selecting the browser audio input

AUD starts with **Browser default**. The selector lists inputs this browser
permits (microphone, interface or loopback/virtual cable); enable capture to
grant permission and reveal available labels. Selection is saved only in this
browser. Changing an enabled input releases old values and restarts capture.
An unplugged or denied explicit input displays an error and never falls back
silently to another microphone. Select an available input and enable again.
Reload never auto-enables capture. This is not Ableton Track mode: native
analysis/control remains experimental and is not included in the release UI.
No audio is uploaded; only numeric descriptors/control values are sent.

The AUDIO card shows a live 2.5-second timeline: cyan is raw RMS and green
is the envelope. The bar shows the smoothed/scaled RMS control value.
All twelve descriptors below are public mapping sources. Follow Detected Note,
its tonal analysis, old controls and diagnostic lab have been removed after
unreliable musical results. Unsupported stored mapping modes are discarded
on load; supported bindings are preserved. Live tempo/SYNC remains available.

### Built-in audio detectors

Twelve cards expose normalized `0..1` mapping sources:

- `sensor.audio.transient` — how much of the whole frame is new energy.
- `sensor.audio.kick` — a rise that happened in 35–100 Hz.
- `sensor.audio.snare` — a rise that happened in 1.5–8 kHz.
- `sensor.audio.brightness` — dark-to-bright spectral centroid, logarithmically normalized.

- `sensor.audio.centroid` — magnitude-weighted spectral center; readout in Hz, mapping = Hz / 20000.
- `sensor.audio.flux` — spectral shape change (half L1 distance of normalized magnitudes); gain changes alone do not increase it.
- `sensor.audio.flatness` — power geometric/arithmetic mean: tonal toward 0, noise-like toward 1.
- `sensor.audio.spread` — magnitude-weighted spectral standard deviation; readout in Hz, mapping = Hz / 10000.
- `sensor.audio.rolloff` — frequency containing 95% of spectral power; readout in Hz, mapping = Hz / 20000.
- `sensor.audio.low`, `sensor.audio.mid`, `sensor.audio.high` — K-weighted loudness in 20–250, 250–2000, and 2000–20000 Hz bands, mapped to `0..1` from −50 LU to −5 LU relative to the digital full scale of the input. Each band applies the ITU-R BS.1770-4 K-weighting per bin (high-shelf + RLB high-pass) and a 400 ms momentaneous integrator on the K-weighted power. `sensor.audio.flatness` uses Wiener entropy in dB: tonal → 0 (−60 dB), noise-like → 1 (0 dB).

The eight new measures use bin centers from 20 Hz to min(20 kHz, Nyquist), excluding DC. Bands are disjoint; boundary bins belong to the higher band. Digital silence resets all eight to zero; flux also resets on restart. Brightness preserves the existing logarithmic, power-weighted centroid over 100–12000 Hz, so it is related to, but not identical to, the new magnitude centroid.

**Colour and identification:** each group owns a hue — Attacks red, Tone amber, Texture violet, Bands cyan — used by its heading and knobs. Its three descriptors use light, medium and dark shades, matched across the card swatch, legend and continuous curve. All twelve marks exceed 3:1 contrast against the graph background. A shade identifies a descriptor, not its strength. Distinction within a group depends on the names and legend toggles, not colour alone: hide other curves when an overlap or colour-vision difference makes a reading ambiguous. The dashed Amplitude gate threshold remains a reference line, not a descriptor.

**Detector controls:** knobs use the same radial body and rectangular pointer as MIX, with their group's accent for focus and dragging. Drag vertically, use the focused range's arrow keys, or double-click to restore the default. In All, the strip wraps by content on desktop; on short screens swipe it horizontally to reach every knob and WINDOW. The graph takes the remaining height, without a reserved row for retired controls.

**Layout and graph:** all twelve cards are on screen at once, grouped as Attacks, Tone, Texture and Bands. One control above the graph chooses what the 2.5-second history draws: Amplitude, one group, or All, which draws every descriptor together. Tap a colored legend name to hide or show that curve. The normalized graph scales to the loudest curve currently shown and prints the ceiling it used, for example `0–0.28`, so a quiet descriptor is readable without pretending it is loud. The curve scrolls at screen rate whatever WINDOW is set to: between two analysis frames the last reading is held out to the right edge, for at most 120 ms, so a wide window looks continuous without inventing values it never measured. Hz cards still map in 0..1; the graph never mixes Hz and amplitude on one axis. On a short phone screen the card column scrolls instead of hiding a group.

**Timbre window:** the eight new descriptors use a Hann window twice the attack size, overlapping by 50%. At 48 kHz this is 1024 samples (21.3 ms of signal), updated every 512 samples. Values stay zero during the first complete-window warmup. Attack delivery does not wait an extra window. Buffers are reused; there is no smoothing queue or timer per descriptor. Bands have window-energy normalization and no automatic gain.

**How an attack is decided.** Transient measures the frame's rising energy
against the energy that frame has been carrying for the last ~300 ms, through a
soft knee, so a loud hit does not simply pin at `1.000` and dynamics survive.
Kick and Snare then ask a second question: how much of that new energy landed
in their band compared with the share that band normally holds. A band that
merely carries its usual share of the change does not fire. Band content is
read from a Hann-windowed spectrum of the same length as the attack window,
because a loud low tone's leakage would otherwise fake an attack in an empty
band, and a band sitting more than 30 dB below the frame is treated as masked.

Kick and Snare are still spectral heuristics, not source separation: anything that adds
energy in their band will move them. Frequency resolution is the honest limit —
at the narrow window a snare body near 200 Hz also moves Kick, because 46–94 Hz
bins cannot tell them apart. Widen WINDOW and they separate.

For reactive modulation, enter MAP, select a detector card and bind a synth parameter. Start with a small output range and Smooth at zero. **Continuous capture** uses an AudioWorklet independent of display refresh: contiguous windows of the size WINDOW selects, 1024 samples at 44.1/48 kHz by default. Pulses have an immediate attack and the release you set. A default window is about 21 ms at 48 kHz, not a measured microphone-to-Live latency. Browser scheduling, network and Live writes also contribute; verify timing with your real input and synth.

**Compatibility capture** means the worklet was unavailable or failed. Analysis continues through a short analyser sampled at display refresh; it may miss very short attacks between frames. Do not treat this fallback as equally reactive. The mapping path keeps only the latest pending parameter value if Live is slow; it cannot guarantee sample-accurate alignment or preserve every attack through a stalled browser/network/host.

### The detector knobs

The flat arc knobs below the graph are arranged in four labelled groups.
All shows four Attacks knobs and two each for Tone, Texture and Bands; a
single-family graph shows only its controls. WINDOW has a separate toolbar.
Short screens scroll whole groups horizontally. Vertical drag, keyboard
arrows and double-click reset work without restarting the microphone.

With **SYNC**, RELEASE and SMOOTH select `1/128` through `1/1` notes at Live's
BPM, with straight, triplet (**T**, ×2/3) and dotted (**D**, ×1.5) choices,
ordered by duration. At 120 BPM, straight `1/128` is 15.625 ms and `1/128 T`
is 10.4167 ms; at 240 BPM the latter is 5.2083 ms. Only the label rounds to
whole milliseconds; processing retains fractional times below 10 ms.
`1/1` is a whole note (one bar in 4/4), not a time-signature-dependent bar.
SMOOTH also offers **OFF** for immediate response. The label shows the division
and effective milliseconds; tempo changes update both processing and labels
without interrupting a drag. RELEASE is an exponential decay time constant,
not a hard note length; SMOOTH is a one-pole time constant, not quantization
to the next beat. Longer smoothing deliberately makes modulation less immediate.

**FREE** restores the independently saved millisecond values below. Existing
nonzero timings acquire the nearest offered note on migration; zero smoothing
stays OFF. Existing valid saved subdivisions are preserved; a fresh 45 ms
RELEASE chooses its nearest subdivision (1/64 D at 120 BPM). Audio does not estimate BPM; the clock comes from Live in SYNC.

Bands are **K-weighted loudness (ITU-R BS.1770-4)** with a 400 ms momentary integrator, mapped logarithmically to `0..1` (0 = −50 LU, 1 = −5 LU, relative to the digital full scale of the input — not SPL). The K-weighting pre-filter and RLB high-pass are applied per bin, so a clearly audible high band that carries little RMS energy is no longer pinned near zero. Flatness is mapped in dB (Wiener entropy): tonal → 0 (−60 dB), noise-like → 1 (0 dB). The bands knob adds a ±dB offset on the same scale (gain `×2` → +6 dB, gain `×0.5` → −6 dB) before clamping; it does not multiply the unit value.

| Knob | Group | What it decides |
| --- | --- | --- |
| SENS | Attacks | How big a band-relative rise already reads as half scale (`0..1`, default `0.65`). Higher catches softer playing and more of the room. |
| RELEASE | Attacks | Pulse decay time constant (FREE: `10..500 ms`, default `45`). SYNC uses note divisions. Short keeps fast hits separate; long makes a pad-like envelope. |
| CURVE | Attacks | The response exponent (`0.3..3`, default `1`). Below 1 lifts moderate hits; above 1 makes the pulse behave more like a gate. Neither end of the range moves. |
| SMOOTH | Tone, Texture, Bands | A one-pole time constant (FREE: `0..200 ms`, default `0`; SYNC: OFF or note divisions). It calms a jittery curve without moving where it settles. |
| GAIN | every group | The group's output level, `×0.25..×8` around unity. For the Attacks, Tone and Texture groups the gain is multiplicative on the unit value. For the Bands group it is a dB offset on the K-weighted loudness scale: `×2` adds +6 dB, `×0.5` subtracts 6 dB, `×1` is unity. Centroid, Rolloff and Spread are excluded from gain entirely: they are printed in Hz, and scaling them would print a frequency the signal does not have. |
| WINDOW | all | The analysis size: `x1`, `x2` (default) or `x4`, that is 512, 1024 or 2048 samples at 44.1/48 kHz. Narrow reacts sooner; wide resolves low frequencies, which is what separates a kick from a snare body. |

`x1` is not offered below 512 samples: 256 would send more than the 120
messages per second the control path accepts.

SENS and RELEASE are shared by Transient, Kick and Snare on purpose — they are
one instrument's response, and a per-detector version of every knob would be a
wall of controls for a surface you play with your hands.

### Attack level

`sensor.audio.attack` measures the peak over 35 ms after an onset,
normalized to 0–1 over 40 dB below the largest peak of the session.
It does not recognize notes or generate MIDI velocity. The first nonzero peak
sets the reference; stopping/restarting capture resets it.
For more immediate modulation use Transient/Kick/Snare, without this peak window.

### Listening to a track instead of a microphone

The extension cannot hear a Live track. The Extensions SDK exposes track names,
devices and parameters, and one offline arrangement render — no meter, no
buffer, no stream — so nothing running inside the extension can listen to
audio. Only a device inside Live's audio path can.

The standalone `RC-Audio-Sender.amxd` converts track audio to MIDI; it does
not feed the AUD descriptor graph. Put Sender v2 on the audio track and
Receiver v2 on the MIDI destination. Enable **Audio Sender input** only on
intended Receivers (OFF at load). They use Max's internal bus, with no UDP.
Multiple enabled Receivers intentionally receive the same Sender notes.
Phone Trigger Note instead addresses the selected Receiver through the SDK.
Replace old devices in your Set; see the
[v2 migration](./SECURITY.md#bundled-max-devices--v2-migration).

The device uses Max's `fzero~` frequency estimate and a periodic peak-amplitude
gate with a `0.015` minimum level. Unlike the phone detector, `fzero~` does not
report a clarity score, so the Max path has no clarity-floor control. The
generated device rejects rounded MIDI estimates outside `21..108` and requires
a changed pitch to remain stable for `70 ms` before sending it.

> **v2 field acceptance is pending.** Earlier F3/stereo tests used the UDP
> devices. Verify loading, note routing/OFF and measured latency before use.
> Source tests do not establish these field results.

### VID performance console

Open **VID** with the phone in landscape. The camera preview fills the left
side at the full screen height. Everything you touch sits in the column on the
right: the camera commands (**Camera**, **CONF**, **REC**), a scrollable bank of up to fifteen
learned-pose cards, the built-in detectors and the direct signal readouts. On a
tablet or desktop the commands sit above the preview and the readouts run
along the bottom. Tap **Camera** to grant access. The vision system
is **single-hand** by design: it tracks one hand in front of the phone.

If camera access fails, the error stays inside the preview. Fix the reported
permission or camera-busy condition and tap **Camera** again; a page reload
is not required.

Camera hand tracking loads the MediaPipe Hands runtime/model files bundled
with the extension. It works on a fully offline local network after the
extension is installed.

On a phone or tablet the preview is the live camera image, without the hand
drawn over it, and hand tracking runs in a background worker where the browser
supports it (a Web Worker with `OffscreenCanvas`), so inference no longer holds
up the rest of the interface while the camera is on. On a computer with a mouse
the preview shows the analysed frame with the tracked hand drawn on top, and
tracking runs on the page. The Live panel's **MediaPipe Latency** reads
`worker` or `main thread` next to the time; a browser without worker support,
or a worker that fails, tracks on the page.

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
instead of snapping back. These clutch axes are always live and do not require
the Pinch detector to be switched on.

For a relaxed pinch, face the palm toward the camera, bring the thumb and index
tips close together and keep the other three fingers partly extended. The tips
do not need to overlap, and the index need not curl into a tight circle. The
gap allowance scales with the visible palm; opening the fingers releases the
clutch. Back-facing hands, fists and a straight pointing index do not gain this
extra tolerance. Actual recognition still depends on camera tracking.

The lower **MAP** strip offers **X/Y/Z**, **PALM** (apparent palm size) and
**FACE** (palm facing versus back of hand, not face tracking). PALM keeps its
raw 0–1 readout; FACE shows a signed −1–1 readout and maps to 0–1. They can
drive parameters, notes and clips through the existing mapping actions and
thresholds. Pinch Clutch **X/Y/Z**, the four opt-in detectors, Victory rotation
and learned poses remain mappable. Finger-count, individual-landmark and
whole-frame colour readings remain internal diagnostics. Missing or invalid
PALM/FACE samples report loss and follow each target's Safe loss policy.
Missing hands preserve an active learned pose as **LAST KNOWN**. An unconfirmed
candidate expires after `unknownGraceMs` (140 ms by default), so a long absence
requires a fresh full hold before its first ON. Axes and built-in detectors
report loss immediately. G1–G15 report loss only after that grace interval;
their mappings then apply Safe loss. VID → ⚙ offers three policies for learned
G1–G15 note gates: **Hold indefinitely**, **Hold with timeout**, and **Release on
loss**. New projects use a **10 s** timeout; edit it from 0.1–30 s in 0.1 s steps.
Existing projects keep inherited behavior until you explicitly choose a mode.
Per-target Safe loss can release sooner; its hold cannot exceed the chosen VID
timeout. Continuous controls, built-ins, clips, toggles and timed pulses keep
their existing behavior. Only a fresh accepted pose renews validity: hand
presence or last-known activeName alone cannot restore output. A qualified return
before expiry sustains the existing note without another Note-On; after expiry,
normal pose confirmation is required to start again.
Incomplete landmarks count as absence. An explicit inference error releases
the active pose and remains visible. Saved examples stay intact; TEST stays
musically silent. A launched clip and its armed continuation keep playing.
Camera OFF, Panic, unbinding and disconnection retire held and scheduled notes.
The host watchdog advances without new inference frames. Timeout is measured
from the last qualified host receipt; recognition grace consumes that window.
Release mode waits only for that grace; indefinite mode has no global deadline.
The badge distinguishes current tracking, last-known hold/countdown and release.
Camera OFF and disconnect always stop owned notes. A stalled host/Live cannot
guarantee a real-time deadline; it evaluates the original deadline upon resuming.
Reload the client after installing this candidate so new tracking metadata is used.

### Learned static poses

Each learned slot stores one static hand shape; the initial bank contains three slots:

1. Hold the desired hand shape and tap **CAPTURE POSE** three times, changing
   finger curl or palm angle slightly between examples.
2. Keep the hand still during each short automatic capture.
3. Tap **TEST**, then show the pose again. Recognition tolerates normal
   changes in screen position, hand distance, depth landmarks, and a small
   wrist angle. It is hand-specific: learn the pose with the hand you will
   perform it with, because the other hand is a mirrored shape and does not
   match.
4. Use **DELETE LAST** to replace only the newest example, or **CLR**
   to retrain the slot from scratch.

Each slot shows **0/6 through 6/6** and accepts up to **six takes per pose**.
**TEST and live recognition work from the third take**; captures four through
six are optional. Use them for legitimate finger-curl or palm-angle variants,
capturing each steadily without mixing different gestures. All saved takes
contribute to recognition. Older three-take preferences restore with capacity
for six and keep their saved examples. DELETE LAST and CLR remain deliberate
actions.

During TEST, “nearest: take N · X% of radius” identifies the closest example.
The percentage compares the class's second-neighbor distance with its entry
radius, not a probability: lower is closer; above 100% misses that entry gate.
Ambiguity and opposing finger shapes can still reject an otherwise close pose.
Use the labeled-session benchmark to compare correct entries, false ON/min
and entry latency p95 before drawing conclusions about extra takes.

Camera proportions are corrected for learned poses, including rotation between landscape and portrait frames. After this update, version 8 pose saves show **RECAPTURE REQUIRED**. Capture those poses again: old saves contain descriptors without the original frame dimensions, so they cannot be converted safely. Direct axes and built-in detectors keep their existing geometry.

Very different takes widen a pose’s tolerance. After three captures, an isolated take may show an inline warning. **RETAKE** removes that exact take, even when it was captured first. If clear finger disagreements leave no majority among three to six captures, the general warning says the captures disagree; RETAKE then removes the latest capture as a review starting point. **KEEP** retains every example and dismisses the current warning; another capture or a reload reviews the bank again. Warnings are advisory and do not change recognition thresholds, ranking or hold/release timing. Camera behavior still needs real-hand acceptance.

The **Balanced** recognition preset is the normal performance setting.
**Precision** rejects more variation; **Flexible** accepts more. The **Performance**
preset is specifically tuned for live gesture-chord performance, permitting the
natural variation of expressive poses (such as the Rock sign) while enabling fast
physical rearming without false triggering on open hand or fist. A learned slot
is momentary (`0` or `1`), persists across page reloads, and rearms only after
the pose is released (transitioning through FSM states `ready` → `candidate` → `held` → `releasing`).
Tap **TEST** to verify pose recognition silently on camera without firing MIDI notes.
To audition actual musical triggers, bind the learned gesture in MAP and perform it in front of the camera. The training TEST only checks recognition and remains MIDI-silent.
Recognition checks strong finger-shape contradictions before accepting or
holding a pose. Three takes require agreement across all three; with four to
six takes, at least three clear examples and a strict majority of the bank
protect finger identity. An uncertain or opposing extra take cannot disable
that protection. A bank with three examples of each opposing state recognizes
neither state; deliberately replace the conflicting takes. Saved examples
remain intact. Opening a fifth finger
(index, middle, ring or pinky) that was consistently curled in a four-finger
pose releases it after the release interval; if the open hand is trained in
another slot, it can switch directly. The thumb has a separate identity gate:
it can curl or oppose across the palm while staying straight. At least two
clear takes and a strict majority of clear thumb states must agree; an
uncertain extra view does not erase that identity. Opening a learned tucked
thumb, or tucking a learned open thumb, rejects entry and releases HOLD.
Uncertain finger evidence cannot begin or complete a new trigger; brief
uncertainty alone does not retrigger a held pose. TEST shows FINGERS UNCLEAR
or FINGER SHAPE DIFFERS. Adjust the angle or repair conflicting captures;
a thumb hidden in an edge-on view is not reliable evidence. Small curls
within the same finger state retain learned tolerance. Existing v9 takes
remain saved, including conflicting banks; repair those deliberately.
Joint bends also provide local evidence for each finger, including the thumb:
a majority of at least two clear captures can distinguish a straight chain,
a partial bend and a deep curl even when the fingertip projection varies.
Intermediate bends retain learned tolerance. Collapsed joints and an edge-on
palm cannot supply reliable angles. This uses the saved coordinates without
changing the bank format or hold/release times; it cannot recover a hidden
finger when the camera landmarks describe a different shape.
Missing-hand frames preserve an active pose; unconfirmed candidates expire after grace. Camera-corrected version 9 saves with 42/47 coordinates load without recapture; version 8 requires recapture. TEST uses the same compatibility check as live recognition.
The recapture warning survives local saves, camera restarts and project restores until a successful new capture or an explicit CLR for that pose.
Poses saved by the retired spatial format show **RECAPTURE REQUIRED** instead of being treated as usable.

---

## 13. Quick reference

### Per-control vertical range

Every vertical control in the app uses a **150 px** drag range from
`0` to `1`. This is intentional: mixing all the controls at the same
physical scale keeps your muscle memory honest across the surface.

### Mode summary

| Mode | Activation       | Drag vertical          | Drag horizontal      |
| ---- | ---------------- | ---------------------- | -------------------- |
| A    | while touching   | scales value 0..1      | no horizontal effect |
| B    | touch latches    | scales, zero = off     | keeps latched        |
| C    | tap toggles      | re-modulate value      | no horizontal effect |
| D    | burst on touch   | peak (0.15..1)         | no horizontal effect |

In `SYNC`, mode D takes its length from Deep Sync Settings rather than the
fixed 520 ms envelope, and it applies to pads, LFOs and squares alike — see
[§ 2](#2-pad-modes-a--b--c--d).

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

## 14. Common gestures cheat sheet

- **Tap** — momentary press (mode A default).
- **Long press** — same as tap; it has no separate action.
- **Drag up** — increase value (depth, rate, count, etc).
- **Drag down** — decrease value. Reaching the bottom of the range
  sends `0`.
- **Drag horizontally on a Square** — change speed; vertically changes amplitude.
- **Drag horizontally on an LFO** — change modulation rate.

---

## 15. Troubleshooting

| Symptom                          | Fix                                                                 |
| -------------------------------- | ------------------------------------------------------------------- |
| Phone won't connect              | See `docs/INSTALL.md` — check Wi-Fi, IP, certificate warning.       |
| Sensor values stuck / wrong      | Press **CALIBRATE** on a stable surface.                            |
| LFOs desynced from Live          | Press **SYNC** to re-lock to Live's BPM.                            |
| MAP target list looks stale      | Press **Refresh** in MAP mode after adding/removing Live devices.    |
| Trigger Note cannot add device   | Place `RC-Midi-Receiver.amxd` manually on the MIDI track and retry. |
| Unwanted attack detections | Reduce Attacks **SENS** and check the selected input; Kick/Snare are heuristics, not drum separation. |
| Audio response feels slow | Check RELEASE/SMOOTH, use SMOOTH OFF and a shorter WINDOW; measure your full setup separately. |
| Touch response feels slow        | Use a wired network or sit closer to the Wi-Fi access point.        |
| Phone status indicators look odd | Refresh the phone browser; session resets cleanly.                  |

For deeper setup issues (certificates, network, installation) see
`docs/INSTALL.md` and `docs/FAQ.md`.


## Performance 2.0: individual settings and learned-pose bank

Right-click the same control again to close its CFG. Right-click another control to switch directly to its settings. Drag travel offers Very short (60px), Short (100px), Medium (150px) and Long (300px); Touch level offers Zero, Low (25%), Medium (50%) and Maximum. A/B/C response curves and C Remember last / Fixed remain individual. These values control the mapped output level, not MIDI note velocity.

In mode D, each toggle has its own **Burst length** and attack, independent of the waveform's subdivision (the period of each cycle). Length may follow the shared setting, use a pinned musical value in SYNC, or milliseconds in FREE. The collapsed Burst length section shows the selected duration. Global mode D exposes the same settings. Pins persist in projects, presets and snapshots; opening CFG never triggers a control.

VID starts with three learned poses. **+ ADD POSE**, beside the REC recognition selector, adds numbered identities up to G15 and turns grey at fifteen cards. The bank has a dark scrollbar and compact cards: capture, recognition and CLR retain the normal action/summary footprint; visible take warnings or TEST diagnostics add only the space they need. **CLR** removes examples while retaining the card. The small **×** below G1/G2/etc. removes that card and its examples, cancels its capture/test, and explicitly releases its held output, including Hold indefinitely. Other IDs and destinations never shift. The removed ID's mapping remains available in MAP; Add reuses the first free numbered ID with an empty pose and that existing mapping. Clear its targets in MAP if you also want to discard the destination. Removing every card and restoring a sparse bank are supported. Each pose still needs three examples and accepts up to six. Slots `sensor.vision.gesture.1` through `.15` share the same qualification, MIDI and tracking-loss rules. The classifier, thumb checks and capture/recognition timing have not been retuned. Physical camera acceptance remains necessary.

## 16. REC: Arrangement / CLIP

Each track's volume knob controls its native mixer level, not input gain. Drag
vertically or use arrow keys; double-click restores Live's parameter default.
The surrounding arc shows normalized level without a numeric label; keyboard
and screen-reader feedback remain in percent, not dB. Unknown or stale values disable the
control. External mixer changes appear on the next read; connection or Set
changes cancel a gesture. STOP keeps priority over volume adjustment. Native
volume reads continue during play, REC and a running pre-roll, independently
of unrelated transport-read timeouts. ARM/disarm require stopped transport;
arming during recording would start recording that track in Live.

Select **ARRANGEMENT / CLIP** inside REC. Opening the page, changing destination,
choosing a scene or opening CFG never arms a track or starts playback/recording.
Destination changes are blocked while a REC attempt is owned. STOP follows its
owner. Track names, ARM MULTI/EXCLUSIVE and SOLO/MUTE are shared.

### Arrangement

Create the Arrangement markers in Live first, then open **REC** with playback
stopped:

1. Use the track cards below the timeline to arm your inputs. Each card shows
   the observed **ARM / SOLO / MUTE** state. **ARM MULTI** is the default and
   keeps other inputs armed; **ARM EXCLUSIVE** disarms other tracks only when
   you press a track's ARM. Changing this mode or single-clicking a name does not
   change Live. Groups have SOLO/MUTE but cannot be armed. Live's global arm
   preference is unchanged; an incompatible host arm result is reported.
   ARM confirms the armable input set without waiting for Loop, meter or click.
   If confirmation fails, ARM states become unknown until a fresh read; a write
   may already have applied. The surface does not repeat it automatically.
2. Start at the fixed **Here** position, use **Use current cursor** to capture a
   new start, or choose a start marker. No marker is required for free recording.
   Each marker shows its **bar.beat** above its name.
   Use **Zoom** and scroll to inspect the markers and observed playback position.
   The list follows timeline time, including newly created early markers, with
   stable equal-time order and full names. A temporarily stale meter keeps its
   last confirmed display with a dotted indicator; it cannot authorize REC.
   Marker jumps check stopped/record-off transport and selected identity/monitor
   without waiting for unrelated mixer states. REC still checks the full set.
3. Leave **END = Until STOP** for free recording. Choosing an end marker after
   the start reveals **PASSES**: 1–10 total passes or ∞ until STOP. A new bounded
   selection starts at one pass. An invalid/missing end blocks REC without
   silently switching to free recording. Put the end after the wanted decay.
4. Choose **PRE-ROLL OFF / 1 / 2 / 4** bars, then press **REC**. OFF is the
   default and starts directly at the marker. Other choices play the preceding
   bars with click before native Punch In opens capture at the selected marker.
5. Press **STOP** to stop playback and recording. Your armed tracks remain armed,
   allowing successive takes without re-arming.

REC records exactly the armed tracks shown in the cards. It is disabled with
no armed inputs and verifies the entire set again before recording. ARM changes
are blocked during recording or pre-roll; SOLO/MUTE remain available for
listening. A newly armed third-party track is never adopted for STOP cleanup.

Double-click a track name to edit it in place (keyboard: focus the name and
press Enter). Enter confirms; Escape cancels. Leaving the field does not save.
Polling preserves the draft and focus. Names use 1–128 characters, trimmed,
without control characters. Renaming changes only that exact track's name;
an external rename, replaced/reordered track or Set change rejects a stale edit.
Stop an owned REC/pre-roll attempt with the surface STOP before renaming.

To listen, click a marker in the strip or choose the start marker, then use
**Play in the header**. Selecting a marker uses Live's native marker jump, so
Play starts from that marker. Selection positions the stopped transport without
starting playback or recording. The strip is a marker and position reference,
without audio waveforms or take-lane selection. A moved or removed marker must
be selected again.

Free recording turns Arrangement Loop off. Bounded recording confirms the
region and native Punch Out before starting. One pass leaves Loop off; finite
repetition disables Loop on the last observed pass and confirms STOP after the
native capture boundary. Pre-roll runs before the first pass only. These plans
run on the computer after acceptance; a phone reconnect never replays REC.
Missing/ambiguous position evidence cannot confirm completion. OSC link or Set
loss retires the plan; recording may continue, so check Live and use STOP.
STOP retains the fixed start, selected range, count and ARM for another REC.
Live owns take lanes; selection and comping stay on the computer. Configure
input monitoring there; choose Monitor Auto/Off for Arrangement listening.

Pre-roll is a preference saved in this browser, separate from Live's native
count-in. It uses the currently observed time signature to calculate the lead-in;
there must be enough song time before the marker. It does not resolve earlier
time-signature changes from a meter map. REC confirms stopped/record-off state,
enables native Punch In at the marker and starts playback from the lead-in
position before enabling record mode. If playback has already reached the
marker before that confirmation, it aborts instead of starting a late capture.
The host monitors the lead-in after the command returns, so four bars are not
limited by the phone's command timeout. At the first observed marker crossing,
it restores the original click setting. STOP restores only click, Punch In and
the temporary Loop start still owned by this attempt, keeping armed inputs intact;
the temporary start is restored only while Loop remains off. Use this page's
STOP to finish cleanup even if you stopped transport in Live. Changes to required
state cancel the lead-in; connection/session loss or a new Set never replays
cleanup writes. Check the corresponding settings in Live after such a loss.

To establish Live's playback start, pre-roll reuses a locator exactly at the
lead-in position or creates a temporary **RC pre-roll** locator through the SDK.
It jumps there natively and removes only the locator handle it created,
confirming removal and the original locators before arming or playback.
An existing locator is never renamed or removed. SDK failure or unconfirmed
cleanup blocks playback and recording; STOP is sent immediately even while
SDK work is pending. If the host crashes or the session/link/Set changes during
the brief create/remove window, a temporary locator can remain. Check it in
Live: reconnection never scans for or deletes locators automatically.

Live's `count_in_duration` is read-only in the supported API; this feature does
not set it. Interaction with native count-in and **Enable Only While Recording**
for the metronome still requires physical Live acceptance after installation.

REC requires every input to remain armable and armed, with no armed track
outside the submitted set. It temporarily sets Punch In ON for pre-roll or
OFF for a direct start, confirms it, and restores its original observed value
on STOP or failure only while the change is still owned. An observed external
Punch In change relinquishes that ownership. Punch Out, Arrangement Overdub,
Session Record and Back to Arrangement pending must be off in Live. Unknown or stale
required state blocks recording; background state reads do not lock the page's
controls. The page reports observed playback and record mode, which do not
prove audio capture. Earlier passages and take preservation remain Live's
responsibility: verify them in the Set before repeating, and save the Set in
Live. REC does not delete clips, select take lanes or invoke undo.

REC writes require controller/admin permission and the current phone connection.
Lost connections never stop an ongoing recording or replay a write after
reconnect. If the phone/host link is unavailable, stop recording in Live.
The OSC and SDK flow has offline regression coverage; native Punch In capture
boundaries, count-in/metronome preferences, audio monitoring, take preservation
and mobile touch still require acceptance on your Live setup.


### CLIP: record an empty Session scene

1. Arm the inputs with the shared cards. Select **CLIP**, then explicitly choose
   a scene row. Every armed track must have an empty slot in that same scene.
   Existing clips are displayed for reference; selecting one does not launch it.
2. Open **CFG** for **1 / 2 / 4 / 8 / 16 bars** (default 4) and native launch
   quantization: **Global / None / 1 bar / 1 beat** (default Global). These are
   page-local choices, not saved project settings. Global follows Live; the other
   choices override only this launch, without changing Live's global preference.
3. Press **REC**. The host rechecks the Set, scene/slot identities, emptiness,
   input armability/monitoring and the complete armed set, including tracks outside
   the scrolled view. Length uses the current observed meter in Live beats.
   A playing or queued clip on a target track blocks the attempt. Arrangement
   recording and an active Session Record button also block it.
4. **QUEUED / REC / PLAY / STOP** are observed states, not elapsed-time estimates.
   Native fixed-length capture can finish into clip playback. **STOP** cancels
   preparation and requests stop only for still-owned target tracks. It keeps
   ARM and global transport unchanged. To stop the entire Live transport, use
   its normal transport controls explicitly.

The grid shows up to eight scenes per window, with internal dark scrolling and
previous/next buttons. Scroll never changes the armed set. Pre-roll, Arrangement
markers/Loop and Punch In are hidden and unused in CLIP. ARM changes and renaming
are blocked while the attempt is owned; SOLO/MUTE remain explicit actions.

STOP respects native quantization and may show **Stop pending**; confirm in Live
or press STOP again. Polling releases the attempt when fresh native Clip Stop
(`playing_slot_index=-2`, `fired_slot_index=-1`) or confirmed stopped clip flags
establish completion, including an external stop. A queued stop
(`fired_slot_index=-2`), unknown state or transport pause alone never suffices.
No reload or repeated stop write is required after confirmed completion.
Missing observations or an SDK clip identity still catching
up cannot authorize a blind track stop. A fresh recording observation can bind
the created clip; then an explicit STOP can finish. An observed foreign clip,
changed track/scene/slot or replaced clip relinquishes that target without stopping
it. Loss of session/link/Set retires ownership with no stop, fire or cleanup replay
after reconnection. Stop in Live if the link is unavailable.

When Session has overridden Arrangement playback, **BACK TO ARR** appears in REC.
After every Session track is freshly confirmed idle and recording is off, press
it to return explicitly to Arrangement. It confirms Live's native return flag and
selects ARRANGEMENT only on success. If transport is already running, Arrangement
continues at its current position; the control never pauses/plays, moves the
playhead, changes arms/Loop/Punch In or deletes clips. Active/queued/unknown clips
block it. Opening REC, changing destination or stopping clips never returns
automatically.

Multiple fires are sequential OSC requests, not an atomic host transaction.
A partial failure attempts to stop only emitted targets whose identities and
observed ownership remain confirmed. The surface never deletes or overwrites
an existing clip. This first CLIP mode has no overdub of existing clips, take-lane
browser, audition or comp selection. Native audio/MIDI recording, duration,
quantization and capture boundaries still require acceptance in your Live setup;
the automated proof uses SDK/OSC mocks.

## AUT: XY gesture loops

SYNC offers five bar buttons (1–5 bars). FREE uses a slider for 1–30 seconds
in steps of one second. Defaults remain 2 bars and 10 seconds; saved 10 or 20 second
loops keep their duration.

**AUT** beside MAP/CFG selects automation recording for XY1 or XY2. While AUT is on, both XY targets are highlighted and retain 100% of their dimensions without shrinking or individual toolbars. To open configuration for an XY target, perform a long press (hold without moving for 600ms) on mobile, or right-click on desktop. It never starts capture, playback or changes a loop. The LOOP/REC/countdown status stays inside the XY.

To record, enable AUT and tap the XY movement area: the selection mode closes so your next touches can perform normally. Three red pulses count 3–2–1, a steady red border marks capture, and the completed movement immediately loops. Right-click the XY (phone: hold without moving for 600ms) opens configuration. Settings include **SYNC / FREE**, **1–5 bars** or **1–30 seconds in steps of one second**, Record/replace, Play, Stop and Clear. Choosing a menu action or dismissing the menu resumes normal performance. Opening configuration emits no control. MAP, AUT and CFG stay visible in the header. Their selections are exclusive; leaving AUT selection does not stop an existing loop.

SYNC uses Live's observed playback position, tempo and time signature, with receipt time retained independently of MAP rendering. Count/capture require Live playing and a fresh clock. Play/pause commands wait for Live confirmation; unrelated tempo/beat messages cannot confirm them. A stale position listener is recovered independently of other incoming OSC traffic. Captured data is aligned to the song grid. During playback, seeks and Live loop wraps follow the current song position; Live STOP pauses an enabled SYNC loop, and Play resumes at the real position. A stopped/stale clock, seek, loop wrap or meter change during **capture** cancels that attempt and retains the previous completed buffer. For a capture spanning multiple bars, leave Live's Arrangement Loop off until capture completes. A meter change during playback stops the loop. FREE uses elapsed seconds and ignores the Live transport.

The small white square in an XY marks the mapping's takeover target. It
blinks while takeover is pending; the orange dot remains the current XY
position. With the system's reduced-motion preference enabled, the white
indicator stays steady.

Hold and move an XY over a playing loop to override it. On release, it returns to the loop's current phase; it does not restart the loop or overdub it. Physics can supply the captured movement, but playback owns both axes and overrides inertial motion. Both XY buffers/settings are independent; only one capture/countdown runs at a time. A failed replacement keeps the previous loop. Clear asks for confirmation.

Completed points and settings persist in projects, presets, snapshots and local storage. Playback/countdown/recording state never persists: reload, reconnect, a replaced session, role loss or a hidden page stops AUT; use Play explicitly afterward. Stop follows each mapping's Safe loss policy and releases Trigger Note gates. This feature loops RC Surface XY control data; it does not write native Arrangement automation lanes. Pads/toggles are not recorded by AUT in this version. The bounded recorder targets 30 samples/second with at most 1,024 coordinate pairs per XY. A capture gap over 250ms aborts the attempt. Physical browser smoothness and Live output still need device acceptance.
