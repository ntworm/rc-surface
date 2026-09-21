# RC Surface — User Guide

Everything a performer needs to operate the phone controller during setup,
soundcheck, and live performance. Read this once before playing a set.

> **Scope**: the phone client (`/phone-v3/`) is the main surface. The
> Ableton panel and admin dashboard are covered separately in
> `docs/CUSTOMIZATION.md`.
> RC Surface 1.0 supports one controller at a time: control your performance from the phone or desktop, never both simultaneously.

---

### Realtime control in the current candidate

MAP no longer slows parameter control: XY, MIX and sensor values use a separate
control stream, with the first frame sent immediately and subsequent traffic
coalesced at an 8 ms minimum spacing. This is a dispatch limit, not a promised
end-to-end latency. Newer continuous positions replace unsent ones; pad edges
retain order. Use **Smooth = 0** for no added mapping ramp. Explicit Smooth,
musical envelopes and safe-loss behavior still apply. Main/Master targets now
expand as **Main → device → parameter**, like other tracks; Tempo stays direct.

Reload the phone page after updating the extension. Old hosts remain compatible
through the legacy snapshot path but do not gain the new realtime behavior.
Physical latency in Live still needs the pending recorded benchmark.

## 1. Phone layout at a glance

The phone UI is a single page with six tabs. Switch with the buttons on
the top strip:

| Tab    | What it does                                                 |
| ------ | ------------------------------------------------------------ |
| PERF   | Performance: pads, XY, LFOs, Stutters, UTIL shortcuts       |
| MIX    | Eight knobs and eight faders for mixer control                   |
| SNP    | Snapshots: 8 capture slots, morph between them               |
| SNS    | Sensors: live readouts for motion and orientation            |
| AUD    | Microphone and audio-analysis inputs                         |
| VID    | Camera, hand tracking, and learned static poses             |

The top strip also holds the **MAP** button near the BPM display plus
**SYNC**, **STAGE**, and contextual **CALIBRATE** on SNS/AUD/VID. See
[§ 7 Top-bar controls](#7-top-bar-controls) and
[§ 8 MAP mode](#8-map-mode---mobile-mapping).

---

## 2. Pad modes (A / B / C / D)

The pad mode selector sits in the middle column of the PERF tab:

```
┌───┬───┬───┬───┐
│ A │ B │ C │ D │
└───┴───┴───┴───┘
```

The selected mode applies to **all 12 pads** (`pad-1`..`pad-12`),
**all 4 LFOs** (`toggle-1`..`toggle-4`, now labeled `L1`..`L4`), and
**all 4 Stutters** (`button-1`..`button-4`, labeled `S1`..`S4`).
The mode is shared: pick once, every control plays by the same rule.

### Mode A — Momentary (default)

- Touch sends a non-zero value; release sends zero.
- Drag **vertically** to scale the value from `0` (release point) to `1`
  (150 px above the touch start). This is the same range used by
  knobs, faders, LFOs, and Stutters.
- Best for: drum hits, one-shot samples, momentary effects on a button
  press.

### Mode B — Hold

- Touch latches the control **on**; release without any drag sends it
  back off. Any movement (vertical or horizontal) keeps it held until
  you deliberately drag the value back to zero.
- For Stutters specifically (see [§ 4](#4-stutters-s1-s4)): a tap
  turns the stutter off; release with amplitude below `0.02` also turns
  it off. Horizontal speed changes keep it running while amplitude is nonzero.
- Best for: latched LFOs that keep modulating after release, sustained
  stutter sweeps, pads that you want to keep ringing.

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
Stutter opens its depth over the attack and closes it over the release. In
`FREE` the envelope is a fixed 520 ms with a 70 ms attack, the same on all of
them. Switch the header to `SYNC` and the length comes from Live's tempo
instead, chosen in **Deep Sync Settings → Burst Config (Pad Mode D)**:

| Control | What it does |
| --- | --- |
| Length (Subdivision) | One bar down to 1/16. At 120 BPM, `1 beat` is 500 ms. |
| Attack | Drag the peak along the drawn envelope. The shape is what you are setting, so it is the shape you drag. |

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

## 3. LFOs (L1 / L2 / L3 / L4)

The four LFOs live on the right column of the PERF tab, under the
header `LFOS`. Each LFO is a continuous low-frequency oscillator that
emits normalized values around `0.5`, from `0.5 - depth/2` to `0.5 + depth/2`.
FREE offers continuous rate from **0.1 Hz to the selected shape ceiling**.
Measured fallback ceilings: **sine 4 Hz; triangle 3 Hz; ramp up/down 3 Hz;
square 12 Hz**. These are interim fallback limits based on the ~50 writes/s
write ceiling rule; definitive ceilings and Live fidelity remain blocked by
physical bench testing (A1 / write-ceiling P04).
Open **⚙ next to SYNC → LFO Config → Shape**.
The shape only sets the bandwidth limit; it does not automatically pick a rate.
Global shape applies to all LFOs by default, but **per-control CFG overrides global shape**: open **CFG** in the header and tap the LFO (L1–L4), or right-click it on desktop, to set a shape that takes precedence over the global LFO CONFIG for that instance (see 9.5). Changing shape
keeps oscillator phase but can change the instantaneous value.

Rate changes preserve running phase in FREE and SYNC, including subdivision
changes; FREE snapshot rate morphs integrate the frequency ramp. SYNC Auto uses
straight, triplet (T) and dotted (D) divisions within the selected ceiling at the
current BPM. At 120 BPM (2 beats/sec):
- 1/8 note requests 4 Hz. Under sine (4 Hz) or square (12 Hz), 1/8 is allowed.
- Under triangle or ramp (3 Hz ceiling), 1/8 exceeds 3 Hz, so 1/8 and faster
  subdivisions (1/16, 1/32, 1/64) are disabled in the rate grid and blocked
  from mouse, touch, and keyboard selection.
- An existing selection above the ceiling is preserved as the user's intent,
  and the readout explicitly discloses requested versus effective rate
  (e.g., `1/8 → 1/4`). The runtime clamps emission to the shape ceiling without
  silently altering the saved subdivision.
Deep Sync shows requested/effective divisions; Auto releases the previous pin.
The browser uses the existing extension and mappings, with **no extra Max device**.

Compatibility: normalized saved rates stay unchanged, so old FREE snapshots
can play faster and SYNC Auto can select a different division after a shape/range
change. Pinned choices are retained but capped at playback. Depth and targets
are unchanged. Stutter SYNC now also enforces its effective ceiling; old fast
pins/ratchets or swing combinations can play slower. Test on a copy of the Set.

With SYNC selected, an active LFO keeps moving when Live stops, then re-locks to
the song position on Play/resume/seek. After rate gestures, phase depends on the
sequence of those gestures until the next alignment. Stop is not LFO OFF. An internal clock ignores
the transport position. A pinned Deep Sync subdivision is also used during
the stopped-clock fallback, with the same shape ceiling. Switching SYNC/FREE is not
guaranteed to preserve frequency or make a seamless phase transition.

### Controls on each LFO

- **Vertical drag** → sets **depth** (modulation amount, `0..1`).
  Starts at `0.5`. Drag range is 150 px.
- **Horizontal drag** → sets **rate** (modulation speed). FREE is continuous;
  SYNC selects rhythmic divisions. On desktop, hold **Shift** while dragging for
  fine adjustment at one quarter of the normal rate sensitivity.
- The LFO keeps emitting its phase continuously while the button is
  **active**. The way it goes active and inactive follows the
  selected pad mode (A/B/C/D) — see [§ 2](#2-pad-modes-a--b--c--d).
- Visual feedback: the bar inside the LFO lights up when the LFO is
  active. A glow on the bottom edge reflects the current depth; a
  glow on the right edge reflects the current rate. While active, the control
  displays only its rate: Hz in FREE; musical note duration in SYNC. For example,
  1/4 = one beat per cycle, 1/8 = half a beat; T = triplet, D = dotted.
  The settings rate buttons use these same note units (stored beat values are unchanged).

### Typical use

- Map an LFO to a filter cutoff, a delay feedback, or a wavetable
  position. Tap **MAP** on the phone or use the panel mapping editor
  to wire any Live parameter to a `toggle-N` control.

---

## 4. Stutters (S1 / S2 / S3 / S4)

The four Stutters sit next to the LFOs in PERF. They generate a gate for the
mapped parameter, alternating between zero and **depth**. They do not record
or repeat audio by themselves; the audible result depends on the target.

### Two axes, one button

- **Vertical drag up** → increases **depth** (amplitude, `0..1`, initially `0.5`).
- **Horizontal drag right** → increases **rate** (`0..1`, initially `0.1`).
  FREE derives frequency from this value; SYNC selects rhythmic subdivisions.
- These axes now match the LFO. Legacy `count`/ratchet settings remain readable
  and restorable but are not controlled by horizontal drag.
- Drag range on both axes is 150 px.
- The button follows the selected pad mode (A/B/C/D) for activation,
  with one important exception — see below.

### Mode B behaviour for Stutters

In mode B:

- **Tap (no movement)** → stutter turns off.
- **Release with amplitude below `0.02`** → stutter turns off.
- **Drag speed while amplitude remains above that threshold** → stutter
  stays running, even at the slowest rate.

Snapshots include amplitude; older snapshots without it keep the current value.

### Compact rate feedback

S1–S4 show only the rate below their identifier: **Hz in FREE**, **musical note
duration in SYNC**. 1/4 = one beat per cycle; 1/8 = half a beat; T = triplet,
D = dotted. The division includes the effective ratchet and ceiling. With swing,
it describes the average rhythm; the alternating intervals are intentionally unequal.
No AMP %, stripes, depth marker or status labels on the control itself.
Amplitude is still controlled vertically; only its extra display was removed.

FREE spans 1–15 Hz continuously (legacy ratchet raises the minimum), without a
capped dead zone at the end of the gesture. SYNC Auto spreads only reachable
divisions over the gesture. The settings disable base divisions that exceed
15 Hz at the current BPM, swing and highest saved ratchet among S1–S4.
At 120 BPM without swing/ratchet, 1/16 is 8 Hz; 1/128 would be 64 Hz and is
unavailable. Old over-limit pins still slow by octaves, with requested → effective
division shown in settings. Horizontal drag releases the shared pin and returns
to Auto; vertical-only drag keeps the chosen division. Existing normalized rates
may therefore recall a different speed than r11.

Brightness follows the actual local gate at every rate. There is no fixed view
above 5 Hz and no slower substitute animation. A slow display can miss pulses;
missed pulses are never replayed. Readouts describe the generator, not automation
delivered to Live. The shortest intended swing/ratchet half-pulse is at least
1/30 s; average frequency can be lower than 15 Hz.

Continuous target writes keep only the newest unsent value. OFF replaces queued
pulses with zero, bypassing smoothing; an SDK write already in flight cannot
be cancelled. Explicit toggle and MIDI-event mappings retain their event order.

---

## 5. PERF UTIL shortcuts

The PERF tab has a compact `UTIL` block for actions you need during a
set without leaving the performance surface.

- **CAP** arms snapshot capture from the PERF page.
- **1-4** recall snapshot slots 1 through 4.
- **CAP + 1-4** saves the current performance state into that slot.
- **OFF** cancels active snapshot morphing, turns off pads, LFOs, and
  Stutters, and returns XY pads to center. It does not reset MIX
  knobs, faders, sensors, audio, vision, or transport.

---

## 6. XY pads

Two pads in the middle column of the PERF tab.

### XY 1 — direct control

Touch anywhere on the pad. The dot snaps to your finger position.
Values:

- `xy-1.x` — horizontal position, `0..1` (left → right)
- `xy-1.y` — vertical position, `0..1` (top → bottom)

Use for crossfades, stereo field, dual-parameter control.

### XY 2 — physics joystick

The dot has momentum. Flick it and it slides. Pull it back with
spring force when you release near the edge.

- `xy-2.x` and `xy-2.y` follow the same axes as XY 1.
- Tuning lives in the panel (physics constants). Best for expressive
  performance with gesture character.

---

## 7. Top-bar controls

Three buttons on the top strip of every page.

### SYNC

Toggles the BPM clock between **SYNC** (locked to Live) and **FREE**
(internal).

- **SYNC** (cyan): LFO and Stutter rates are quantized to Live's BPM,
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
> Stage Mode when possible.

---

## 8. MAP mode - mobile mapping

Tap **MAP** near the BPM display to enter mapping mode from the phone.
This does not open a separate mobile page in the browser; it overlays a
mapping workflow on top of the real controller so you can pick the
control you are already using.

### Selecting a control

While MAP mode is active, mappable controls on the visible performance
page become selectable with a blue MAP outline/label. This includes:

- PERF controls: pads, XY pads, LFOs, Stutters.
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

1. Select a pad, LFO, Stutter, XY axis, knob, or fader in MAP mode.
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

Multiple controls can trigger notes on the same MIDI track. Different
notes are treated as different trigger targets.


### Mapping editor fields

Each mapped target can be adjusted from the phone:

| Field | Meaning |
| ----- | ------- |
| Mode | `continuous`, `toggle`, or `trigger_note`. |
| Curve | `linear`, `exponential`, `logarithmic`, or `s-curve`. |
| Target scale | `Auto` keeps mixer/tempo linear and uses geometric travel for recognized wide positive frequency ranges; explicit `Linear` or `Geometric` overrides Auto when the target supports it. |
| In Min / In Max | The input range read from the phone control. |
| Out Min / Out Max | The output range sent to the Live target. |
| Drive | Pushes the response curve up or down. |
| Comp | Compresses or expands the middle of the response curve. |
| Smooth | Adds smoothing to reduce abrupt value jumps. |
| Threshold | Threshold for non-continuous modes. |
| MIDI Note | Pitch and octave for fixed trigger-note mappings. |
| Velocity | MIDI velocity for fixed trigger-note mappings. |

The curve canvas shows the current response shape and a moving dot for
the selected control's live input/output. Use it to verify that the
range, curve, drive, and compression settings match what you expect.
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

Config Mode lets each pad, knob, fader, toggle, stutter and XY pad keep
its own mode, shape, subdivision, swing and physics overrides. The CFG
button lives in the phone header, right next to **MAP**. Open it once
to change how a single control behaves; close it to go back to normal
play. Settings persist per control in the phone browser, not in Live.

### What you can change per control

- **Pads** — choose mode A (momentary), B (hold), C (toggle) or D
  (burst). Override the pad's global mode without leaving the page.
- **Knobs** — pick the gesture range (how far the drag travels in
  pixels before the value sweeps from 0 to 1). Wide range is better
  for small phone screens; narrow range gives finer control on the
  desktop mapping panel.
- **Faders** — choose a reset value. When you tap the fader with a
  single finger the value jumps back to the reset value instead of
  zero. Useful for pans, sends and macro controls where you want a
  known starting point.
- **LFO (toggle 1 to 4)** — pick the waveform (sine, triangle, ramp up,
  ramp down, square). The SYNC modal still shows the live preview; the
  shape chosen here overrides the global shape for that toggle.
- **Stutter (button 1 to 4)** — pick subdivision (1/1 to 1/32), swing
  (0 to 50 percent) and phase offset (0 to 360 degrees). The actual
  rate is still capped by the LFO bandwidth rules (32-beat subdivision,
  per-shape ceiling).
- **XY pads** — for `xy-1`, leave the defaults. For `xy-2`, choose
  friction and bounce; the pad behaves like a small physics joystick
  that springs back after release.

### How to open CFG

1. Tap **CFG** in the phone header. The body of the page gains a
   `config-mode` class; every control now shows a small badge
   summarising its current override (mode letter, waveform glyph,
   subdivision fraction).
2. Tap or right-click (desktop) any control to open its per-instance
   menu. The menu lists only the keys that apply to that control.
3. Use the **Map to …** action to bind that control's value to a Live
   parameter without leaving the phone. CFG closes MAP first if MAP
   was already open.
4. Tap **CFG** again, press **Esc**, or tap outside any open menu to
   close. Stage mode also closes CFG so the performer can keep the
   stage clean.

### Clearing overrides

- **Single control** — open the per-instance menu and tap **Reset to
  default**. The override is removed; the control returns to its
  global default.
- **All controls** — long-press the **CFG** button (about half a
  second). A popover lists every control with an override. Tap
  **Clear all control config** to confirm. The popover uses the same
  in-page menu surface, not a browser alert.

### Where the data lives

Overrides are stored in `localStorage` under the key
`ableton-rc:control_config`. Clearing the phone browser data wipes
the overrides; clearing the site data through the Live host does not.
There is no Live Set round-trip: the overrides stay on the phone and
follow that phone, not the Set.

## 10. SNP tab — Snapshots and morph

The SNP tab captures the **state of all performance controls** at a
moment in time and lets you interpolate between captured snapshots.

### Slots

Eight slots, numbered `1`..`8`. Empty slots show `Empty`; filled
slots show their slot number.

### Capture

1. Set the controls (pads, XY, LFOs, Stutters, knobs, faders) to a
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

These straight subdivisions also appear in the stutter grid; LFOs have their own
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
For example, if an LFO, Stutter, knob, or fader is mapped to Live, the
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

Bands are **K-weighted loudness (ITU-R BS.1770-4)** with a 400 ms momentaneous integrator, mapped logarithmically to `0..1` (0 = −50 LU, 1 = −5 LU, relative to the digital full scale of the input — not SPL). The K-weighting pre-filter and RLB high-pass are applied per bin, so a clearly audible high band that carries little RMS energy is no longer pinned near zero. Flatness is mapped in dB (Wiener entropy): tonal → 0 (−60 dB), noise-like → 1 (0 dB). The bands knob adds a ±dB offset on the same scale (gain `×2` → +6 dB, gain `×0.5` → −6 dB) before clamping; it does not multiply the unit value.

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

Open **VID** with the phone in landscape. The camera preview stays on the
left, the three learned-pose cards stay side by side, and the direct signal
strip stays at the bottom. Tap **Camera** to grant access. The vision system
is **single-hand** by design: it tracks one hand in front of the phone.

If camera access fails, the error stays inside the preview. Fix the reported
permission or camera-busy condition and tap **Camera** again; a page reload
is not required.

Camera hand tracking loads the MediaPipe Hands runtime/model files bundled
with the extension. It works on a fully offline local network after the
extension is installed.

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

Only intentional performance signals are mappable: direct **X/Y/Z**, the
Pinch Clutch **X/Y/Z**, the four opt-in detectors, Victory rotation, and the
three learned pose slots. **PALM** and **FACE** remain local camera
diagnostics in the preview. Finger-count, individual-landmark, and whole-frame
colour readings are internal diagnostics and are not mapping channels.
When the hand or camera disappears, every exposed vision channel reports
signal loss through the same catalog; each mapping's Safe loss policy then
decides whether the Live target holds, centres, parks, or releases.

### Learned static poses

Each of the three learned slots stores one static hand shape:

1. Hold the desired hand shape and tap **CAPTURE POSE** three times, changing
   position or distance slightly between examples.
2. Keep the hand still during each short automatic capture.
3. Tap **TEST**, then show the pose again. Recognition tolerates normal
   changes in screen position, hand distance, depth landmarks, and a small
   wrist angle. It is hand-specific: learn the pose with the hand you will
   perform it with, because the other hand is a mirrored shape and does not
   match.
4. Use **REMOVE LAST** to replace only the newest example, or **CLEAR ALL**
   to retrain the slot from scratch.

The **Balanced** recognition preset is the normal performance setting.
**Precision** rejects more variation; **Flexible** accepts more. A learned
slot is momentary (`0` or `1`), persists across page reloads, and rearms only
after the pose is released. Poses saved by the retired spatial format show
**RECAPTURE REQUIRED** instead of being treated as usable.

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
fixed 520 ms envelope, and it applies to pads, LFOs and stutters alike — see
[§ 2](#2-pad-modes-a--b--c--d).

### Control names (for mapping)

```
pad-1 .. pad-12
knob-1 .. knob-8
fader-1 .. fader-8
xy-1.x, xy-1.y, xy-2.x, xy-2.y
toggle-1 .. toggle-4    (LFOs)
button-1 .. button-4    (Stutters)
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
- **Drag horizontally on a Stutter** — change speed; vertically changes amplitude.
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
