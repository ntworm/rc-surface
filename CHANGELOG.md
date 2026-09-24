# Changelog

Ableton RC Surface uses a consolidated release history. The complete source
state is represented by the current release; obsolete preview packages and
intermediate release records are intentionally not published.

## [Unreleased]

### Added

- The landing page exists in Portuguese as its own URL,
  https://ntworm.github.io/rc-surface/pt-br.html, generated from the English
  page and `docs/site-i18n.js` by `npm run build:site` and readable without
  JavaScript. Both pages carry a searchable title and description, canonical
  and hreflang links, Open Graph tags and JSON-LD; `docs/sitemap.xml`,
  `docs/llms.txt` and `docs/llms-full.txt` describe the site to search engines
  and AI assistants.
- An IndexNow workflow asks Bing and the other IndexNow engines to recrawl the
  landing after a Pages build that changes it. The Google Search Console
  verification file is published in `docs/`.
- `README.pt-BR.md` (also shipped in the tester kit) and `CITATION.cff`.

### Changed

- The Portuguese text of the docs, the landing page and the phone reads the
  way Brazilian musicians talk, keeps their English jargon in English, and
  names the labels the Portuguese interface actually shows.
- `i18n.js` honours `<html data-default-locale>`, so a page published in one
  language opens in it; the phone and the panel are unaffected.

### Fixed

- Seven labels on the Portuguese landing page rendered in English.
- The VID pose status lines, the pose toasts and the MAP In/Out readout stayed
  in English in a Portuguese session.
- Two Receiver messages fell back to Portuguese text instead of English.

## [1.0.0] — 2026-09-21

### Release preparation — 2026-09-21

- The Ableton Extensions SDK and CLI tarballs are no longer tracked in the
  repository (`vendor/*.tgz` ignored). `vendor/manifest.json` records their
  names, sizes and SHA256; `npm run check:vendor` verifies local copies before
  `npm ci`, and hosted CI stages them from a private vendor repository. The
  built `.ablx` is unchanged: the SDK was already tree-shaken into the host
  bundle. See the README inside `vendor/`.
- Owner acceptance fixes from the 2026-09-19 rehearsal are included
  (CFG/MAP slider theme, LFO shape ceiling UX, stutter depth recall, vector
  RAF coalescing, single-controller docs, drift diagnostics, range progress
  fill).
- TRN beat flash and play state survive Live's AbletonOSC restart. Live
  builds the AbletonOSC control surface before the document loads and again
  after it; listeners registered with the first instance died with it while
  the second still answered probes, so the link looked alive and RC Surface
  never re-registered (owner bench 2026-09-21: no beat flash, stale play
  state). A quiet link now re-registers its listeners every 10 s and the
  liveness probe also asks `is_playing`. Replies to RC Surface's own polls
  no longer count as proof that the listeners are alive; only unsolicited
  pushes do, otherwise a selected device kept the link looking busy.
- RC-Midi-Receiver v2.2 arms **SDK Notes** by itself once the device has
  finished loading (after discarding any restored packet), so a pad mapped to
  a trigger note plays without clicking the device first. Device Off/On
  disarms and re-arms; Panic still disarms until clicked. Audio Sender input
  stays an explicit opt-in.
- Repository renamed from `ntworm/ableton-rc-surface` to `ntworm/rc-surface`
  and the npm package name follows; GitHub redirects the old repository URL,
  the landing page now lives at https://ntworm.github.io/rc-surface/. The data
  folder name, the `ableton-rc:*` browser storage keys, the log prefix, the
  certificate common name and the project file format id are unchanged.
- The Live context-menu entry reads "RC Surface: Panel" instead of
  "RC Surface: RC Surface: Panel" (Live prefixes the extension name itself).
- The Live selection is no longer polled twice a second. AbletonOSC raises
  inside Live and logs a traceback every time `selected_device` is asked
  while no device is selected, which had grown the owner's
  `abletonosc.log` to 3.28 GB. MAP mode's "use selected" button and the TRN
  overlay ask for the selection when they open; a flowing link sends nothing.
- CFG shape override now reaches Live while the LFO is running. The bridge
  from the CFG store to the host modulator never fired in the real page:
  `control-config.js` loaded after `controls.js`, and the subscriber expected
  `(name, patch)` while the store emits one event object. Found on the
  owner's bench on 2026-09-21; load order fixed, subscriber fixed, and the
  bridge is now tested in the page's own script order.
- Learned VID gestures stay hand-specific: a pose learned with one hand is
  not matched by the other hand. The bilateral canonicalization tried on
  2026-09-20 was withdrawn after the owner's acceptance on 2026-09-21; learn
  the gesture with the hand you will perform it with.

### Renamed to RC Surface — 2026-09-16

- Product renamed from "Ableton RC Surface" to "RC Surface" across manifest,
  UI, docs, landing, kit, artifact names, and SPDX headers, per Ableton's
  Branding and Trademark Guidelines (the SDK licence makes them binding).
- Data folder moves from `worm.ableton-rc-surface` to `worm.rc-surface`
  (derived from manifest `name`). The kit ships a migrator script
  (`Migrate-RC-Surface-Data.cmd` / `.ps1` for Windows,
  `Migrate RC Surface Data.command` for macOS) that copies the old data
  into the new folder without moving or overwriting. The panel shows a one-line
  notice when no mappings file is found, pointing users to the migrator.
- GitHub repo slug and package.json `name` stay `ableton-rc-surface` for now
  (separate decision). Local storage keys `ableton-rc:*` and log prefix
  `[ableton-rc-surface]` stay so existing phone state is preserved.

### rc-surface-modulator-quality – 2026-09-17

- Per-shape LFO ceilings (sine 4 Hz, triangle 3 Hz, ramps 3 Hz, square
  12 Hz) are now measured against the write-ceiling rule
  `maxHz(shape) = floor(teto_efetivo / minPointsPerCycle(shape))` documented
  in the write-ceiling bench task. The values above are the **fallback**
  table for `teto_efetivo ≈ 50 escritas/s` because the live bench (task
  `rc-surface-write-ceiling-2026-09-16`) is still pending its physical
  run. When the live measurement lands, regenerate the table and update
  the source files (`src/live/transport-clock.ts:11`,
  `static/phone-v3/controls.js:17`) plus the frozen contract test
  (`tests/contracts-freeze.test.mjs`).
- LFO rate grid now offers slower subdivisions up to **8 beats**
  (`32, 16, 8, 4, 3, 8/3, 2, ...` in `LFO_SUBDIVISIONS`), exposed in the
  browser as `[8] [4] [2]` buttons before the existing `4` entry. Persisted
  `lfoSubdivisionPinned`/`lfoSubdivision` already accept any positive
  value, so nothing migrates; snapshots keep their normalized rate 0..1.
- MIX fader is now **1 finger pixel = 1 thumb pixel**. The `makeFader`
  helper measures the live `.fader-track` height on every gesture start
  (`Math.max(24, track.getBoundingClientRect().height)`) instead of using
  a fixed 150 px range, so a 150 px drag = +0.5 on a 300 px track, +1.0 on
  a 150 px track and +0.10 on a 600 px track. Fallback 150 px is kept for
  headless test environments without layout.
- Stutter S1–S4 now show a **depth bar** inside the momentary gate. The
  bar follows the vertical drag live (intent, not latched state) and
  resets to 0% on release. Color matches the active pad mode
  (`.button.on.mode-a` blue, `-b` orange, `-c` green, `-d` red). Snapshots
  that restore `state.depth` through `controlSetters[name.depth]` repaint
  the bar so the saved depth is visible immediately.

### rc-surface-docs-site — 2026-09-17

- README.md adds a "1.0 Highlights" section covering Config Mode (CFG),
  the LFO waveform preview in the SYNC modal, desktop keyboard control
  and K-weighted loudness; the existing eight-knobs / eight-faders,
  MIX 8+8, MAP and Stage copy stays.
- docs/index.html now ships a "New in 1.0" card (`lp.highlights.*`)
  with four cells: Config Mode, LFO waveform preview, Desktop keyboard
  control, K-weighted loudness. Same prose in English and pt-BR
  through docs/site-i18n.js.
- docs/USER-GUIDE.md and docs/USER-GUIDE.pt-BR.md receive a new
  "## 9.5 Config Mode (CFG)" / "## 9.5 Modo Config (CFG)"
  chapter with structural parity; chapters 10..15 are renumbered to
  10..15 in both languages to keep the sequence contiguous.
- scripts/landing-runtime-contract.test.mjs gains a contract test
  that asserts every lp.highlights.* key has both en and pt-BR copy,
  the four feature cells are wired into docs/index.html and the CFG
  chapter is present in both USER-GUIDE files.

### Unreleased candidate corrections – 2026-09-08

- 2026-09-16 audio bands loudness: Low/Mid/High on the AUD tab are now K-weighted
  loudness (ITU-R BS.1770-4) mapped logarithmically from −50 LU to −5 LU,
  with a 400 ms momentaneous integrator on the K-weighted power. Flatness is
  mapped in dB (Wiener entropy): tonal → 0 (−60 dB), noise-like → 1 (0 dB).
  The bands GAIN knob acts as a ±dB offset on the loudness scale (±18 dB at
  the dial extremes). `sensor.audio.rms`, `sensor.audio.gate`, the attack
  detectors and the Max devices stay unchanged. Catalog hints, i18n EN/PT
  and the user guide document the new semantics.

- 2026-09-13 contextual CALIBRATE: independent SNS/AUD/VID session states,
  real sample collection/progress, cancel/reset and source invalidation.
  SNS requires a stable neutral posture; AUD adjusts RMS/envelope control gain
  from five seconds of playing sound; VID verifies light/tracking and enables
  only supported, confirmed automatic camera modes. No hand neutral, gesture
  changes, Live audio changes or latency compensation. Old persisted sensor
  offsets no longer silently restore into a new posture/session.

- 2026-09-12 r12 Stutter regression fix: restore gate-driven flashing at all
  allowed rates; no forced steady view above 5 Hz or replay of missed frames.
  Horizontal drag releases a fixed subdivision and rebases all four controls
  before Auto; vertical-only drag preserves it. Auto distributes reachable
  SYNC speeds; FREE spans 1–15 Hz without a capped dead zone (legacy ratchet
  raises the minimum). Settings disable unsupported divisions by BPM/swing/
  ratchet and disclose old requested → effective pins. Stored normalized rates
  can recall different speeds. Compact rate-only UI and LFO policy unchanged.

- 2026-09-12 experimental r11: per-shape LFO ceilings (sine 5 Hz, triangle
  8 Hz, ramps 6 Hz, square 15 Hz), applied in FREE/SYNC, paused fallback and
  snapshot morphs. Shape/ceiling remain in settings; rate/shape-cap changes
  retain oscillator phase. Shape changes can still change the instantaneous
  value. Saved normalized rates may play faster/differently. LFO/Stutter show
  only Hz in FREE or musical note duration in SYNC. Owner rejected extra
  AMP/status labels and depth markers; removed them and the extra shape shortcut.
  The initial steady high-rate Stutter view is superseded by r12 above. Its SYNC path honors the 15 Hz
  ratchet/swing-aware ceiling, so old fast settings can slow by octaves.
  No new Max device. New bandwidth candidates still require physical Live tests.

- 2026-09-12 r10 candidate: L1–L4 remain browser controls with continuous
  0.1–4 Hz FREE rates and Shift+horizontal drag for fine desktop adjustment.
  SYNC adds triplet/dotted divisions, giving ten Auto speeds at 120 BPM within
  the same 4 Hz ceiling. Running rate/subdivision changes preserve phase;
  Play/resume/seek can realign it to the beat. Auto presets can select different
  divisions from the expanded table. Replace the ABLX and reload the page;
  no AMXD change or target-automation lock. The native Max LFO r9 experiment
  was canceled and its source/build/test files removed; local artifacts remain
  as historical recovery. Active LFOs display effective Hz. Canceling and
  recreating the same target now retains its in-flight SDK lock, preventing
  overlapping writes while keeping only the newest pending value.
  Live waveform fidelity and latency remain unmeasured.
- 2026-09-10 r8 candidate: LFO bandwidth is capped at 4 Hz for editable automation.
  FREE maps the full gesture to 0.1–4 Hz; SYNC Auto filters rhythmic subdivisions,
  and faster pinned values slow by octaves. Host, preview, paused fallback and
  snapshot morphs share this policy. Deep Sync shows the effective division/rate.
  Old normalized rates are retained but may play more slowly. No stutter,
  SDK writer, smoothing, native Max or target-automation ownership change.
  This is a conservative product limit, not measured end-to-end performance.
  Selecting Auto now clears a previous host pin explicitly; malformed snapshot
  rates are clamped consistently on the browser and host.

- 2026-09-10 r7 candidate: active LFO preview continues while transport is stopped
  and re-locks to beat position on Play/seek. Internal clock ignores the playhead.
  Host fallback now honors pinned LFO subdivisions. Stutter remains unchanged
  following owner acceptance. High-rate fidelity and SYNC/FREE transitions remain
  unapproved; no new frequency ceiling or native Max motor was introduced.

- 2026-09-09 r6 candidate: stutter uses X=rate and Y=amplitude; amplitude setters
  and snapshot morphs now carry depth, retaining compatibility with older snapshots.
  Analog stutter shares the latest-value SDK lane with LFO/XY; OFF discards unsent
  pulse history and bypasses smoothing. Explicit event mappings stay ordered.
- FREE modulator rate changes preserve phase instead of applying the new rate
  retroactively. FREE LFO rate morphs integrate frequency across delayed ticks;
  clock-stop fallback advances from the last synced phase. High-rate LFO fidelity
  in real Live automation is still unapproved; no new frequency cap was introduced.

- 2026-09-09: Main/Master target picker now shares the collapsed track/device
  hierarchy and search behavior. Control frames no longer wait for MAP's 500 ms
  visual snapshot cadence. Negotiated 8 ms shared batches retain pad edge order,
  bound backlog, suppress remote echoes and preserve legacy host compatibility.
- Continuous controls/LFOs use one latest-value SDK writer per physical target,
  with no implicit ramp at Smooth 0. Independent discrete target queues no longer
  block behind a slow SDK target; explicit smoothing and MIDI ordering remain.
  Physical end-to-end latency is not yet measured.

- Receiver v2.1.1 trial: align the short parameter name exposed by Live with
  the SDK contract, fixing false "old Receiver" detection. Artifact-derived
  discovery/filtering/note tests now cover short and long names; no host change.
- Receiver v2.1 manual-SDK trial: expose the command to Live's API and block
  restored commands until SDK Notes is enabled manually. OFF/Panic/deactivation
  disarm; the previous value is cleared before enabling. Same one-write-per-note
  SDK transport, no new network path. Do not automate/map the internal packet;
  manual workflow and save/reopen acceptance remain pending.
- Song Tempo profiles use global signatures; old track-scoped signatures and
  unsigned legacy profiles relink without discarding valid mappings.
- Receiver v2 removes UDP entirely. Trigger Note targets the selected device
  through a versioned SDK parameter, with ordered ON/OFF and captured releases.
  Old/ambiguous Receivers are rejected instead of broadcasting notes.
- Standalone Audio Sender uses opt-in internal Max messaging; replace both
  devices and all old Set instances. New transport/latency acceptance in Live
  remains pending; old field results do not certify v2.
- Installation EN/PT distinguishes a local candidate from a public release.

### Added

- MIX 8 knobs + 8 faders, flat arcs and keyboard control, preserving IDs 1–6.
- Browser audio-input selection, remembered locally, explicit device failure
  and unplug feedback without silent microphone fallback.
- Preset saves/deletes serialized with mapping changes; staged writes preserve
  the previous file on I/O failure. Deletion reports actual storage errors.
- Removed retired YIN/chroma/BPM work; amplitude attacks remain
  available for unpitched onsets. Session recovery messages use EN/PT-BR.
- Musical labels use quarter-note beats for stored snapshot/burst durations;
  AUD uses whole-note fractions to1/128 with straight/triplet/dotted choices.

- AUD now exposes twelve normalized, mappable built-in audio descriptors:
  transient, kick, snare, brightness, centroid, rolloff95, flux, flatness,
  spread, low, mid and high. Kick/snare are attack-weighted
  spectral heuristics, not instrument classifiers. Their fast control path
  does not wait for gate/pitch decisions or the general 30 Hz snapshot.
- Audio descriptors use continuous, short-window capture where AudioWorklet
  is available, with a labelled compatibility fallback. Bounded message and
  parameter-write paths discard superseded values instead of replaying stale
  attacks; physical microphone-to-Live latency still needs setup-specific testing.
- Removed Follow Detected Note, retired tonal DSP/controls, velocity editor and
  Audio Lab at the owner's request after unreliable musical results.
  Old unsupported mapping modes are discarded, never converted to continuous control.

- Pad mode D exposes its envelope in Deep Sync Settings. Under `SYNC` the
  burst takes its length from a subdivision grid, 4 quarter-note beats down to 1/16 beat, with
  the attack set as a percentage of that length so a short burst is not all
  attack. `FREE` keeps the fixed 520 ms envelope it always had.
- Snapshot transitions can follow Live's tempo. A Free/Sync pair above the
  transition slider switches it between seconds and a musical length, using
  the LFO subdivisions extended with 8 and 16 quarter-note beats.

### Fixed

- Overlapping server starts share one initialization. Stop and deactivation
  invalidate delayed startup/storage callbacks and close owned listeners
  before a replacement starts.
- Removing or replacing mappings invalidates unsent writes, including a
  discrete queue blocked by a slow Live call. Clear All and teardown release
  held trigger notes. Commands already sent to Live are not undone.
- AUD analysis needles rotate around the actual dial center at every size,
  matching the value arc. Desktop VID gives more width to the camera, aligns
  its controls at the top and keeps all four native-detector labels readable.
- MIX double-click and double-tap reset faders to their initial 85% position,
  or 50% for bipolar/pan mappings. SNP transition sliders use surface styling
  in both Free and Sync, retaining keyboard control and existing timing.
- VID capture-pose and delete-last labels wrap onto two lines inside G1/G2/G3,
  including PT-BR, without enlarging the cards.
- Phone pinch recognition accepts nearby fingertips and a gentler index bend
  with a positive palm-facing pose and three partly extended supporting fingers.
  Contact tolerance scales with the visible palm; clutch motion and release
  behavior remain unchanged. Pose-drop tolerance only preserves an engaged
  clutch, so one valid frame followed by rejected poses cannot start it.
- Desktop AUD/VID use readable controls and proportional camera framing instead
  of stretching phone-sized fields and pose buttons through tall panels. MIX
  gives knobs and faders equal full-height panels with responsive knob sizes.
  Fader thumbs remain aligned with their fill after hidden-tab initialization,
  resizing and STAGE changes.
- AUD replaces the retired Follow panel and Decisions counters with twelve
  readable detector cards beside the signal workspace. Audio capture lifecycle
  guards release stale values on stop, suspended input, or capture loss.
- Pinch Clutch reanchors after a brief release so a quick re-pinch does not
  jump to an old hand position or drift while stationary during release debounce.
- The snapshots page shipped three controls bound to nothing: Clear Slots, the
  transition-time slider and the morph-mode toggle. The transition always ran
  at 1.0 s and the vector morph pad — finished, drawing and blending four
  states — was unreachable because nothing ever revealed its section.
- The XY 2 puck no longer sticks in a corner. Free flight treated it as
  stopped below 0.01 while each wall branch used 0.1, so a corner, which fires
  the x and y branches in the same frame, killed both velocities at once. All
  six checks now share one threshold.

- Local 1.0.0 Browser release candidate; public release and hardware acceptance
  are separate steps. Native Track remains experimental and owner-deferred.
- Phone MAP now binds controls without leaving the live surface, with a
  hierarchical Song/Main/Track/Return/Device/Parameter picker, per-axis XY
  selection, presets, inline ranges and curves, and fixed Trigger Note.
- Audio analysis has a live 2.5-second signal/descriptor timeline and grouped
  flat-arc controls; retired tonal settings are not offered in the active UI.
- Target Scale supports Auto, Linear, and Geometric conversion. Auto keeps
  mixer/tempo conservative and gives wide positive frequency/cutoff parameters
  musically useful travel; explicit overrides are preserved when valid.
- A single-flight continuous-target actuator serializes Live SDK writes and
  dezippers timed sensor frames without blocking newer destinations.

### Improved

- Every public mapping source uses finite normalized 0..1 values; descriptor Hz readouts are display-only.
- Mapping feedback applies the exact inverse of the selected target scale, so
  pickup/reconciliation and the moving curve dot agree with Live.
- VID now exposes only intentional performance inputs: direct X/Y/Z, four
  opt-in detectors, Victory rotation, Pinch Clutch X/Y/Z, and three numbered
  learned-pose slots. Palm/face/finger/colour detail remains diagnostic.
- The operator landing sheet now covers all six tabs plus MAP, includes the
  live AUD graph and analysis dials, and reconciles its control inventory with
  the shipping phone/panel behavior.

### Fixed

- All active mapping families clamp and quantize at the real Live boundary.
- Learned-pose templates keep the real numbered wire IDs (`gesture.1..3`)
  instead of creating dead slug-based admin entries that the phone never emits.
- Hand loss, camera stop, and the absent-hand cadence use the same complete
  vision loss contract, including clutch and learned-pose channels; Safe loss
  remains the owner of continuous target release.
- Live track/device/parameter names are inserted into the panel mapping picker
  as text, closing an HTML-injection path from user-controlled Live names.
- Mapping picker expansion keys include track kind, preventing Track 1 and
  Return 1 from opening or conflicting as the same branch.
- Camera startup/retry, pose-drop tolerance, clutch gating, pointer pressure,
  transport icon synchronization, mobile microphone release, and narrow VID
  layout regressions are corrected.
- The Audio Sender is an actual Max Audio Effect with visible controls and
  transparent stereo pass-through. The MIDI bridge preserves raw note bytes;
  the Sender rejects out-of-range estimates and waits 70 ms for pitch stability.
  Two stable-F3 note-on/note-off pairs were confirmed in Live without F#3/A-1
  transients.

### Security and release hygiene

- Diagnostic copy reports omit page query strings/fragments. Request and
  forwarded page-URL logs redact credential values even when parameter names
  are percent-encoded.
- The Max Receiver's UDP input is documented accurately as unauthenticated
  and network-listening. Windows firewall instructions and an OS-specific
  network-isolation acceptance gate replace the incorrect loopback-only claim.
- Tester kits include all six PT-BR operator guides and stop on missing
  required documentation, checksum inputs, or broken relative documentation links.
- CI and draft-release workflows now default to read-only repository access,
  grant write access only to the draft-release job, and pin every third-party
  Action to an immutable commit. Playwright system dependencies are installed
  only on Linux while Windows and macOS install the browser alone.
- Every actual server start now rotates controller and admin credentials, so a
  stopped session's QR URL, cookie, or still-open page cannot retain write
  access when Live reuses the same extension module.
- Command authorization now covers every registered command explicitly;
  read-only locale discovery is available to viewers as intended instead of
  falling through to the admin-only configuration default.
- Shared surface values and per-client history now enforce the existing
  2,048-signal bound, evicting the oldest signal instead of allowing a faulty
  authenticated controller to grow server memory without limit. History keys
  also treat JavaScript prototype names as data instead of executable object
  structure.
- Plain HTTP is loopback-only; LAN phone traffic requires HTTPS/WSS. Server
  URLs consistently separate the local admin surface from the LAN controller.
- WebSocket payloads/connections are bounded and reaped with heartbeat checks;
  browser log request bodies are size/time limited.
- Production builds fail on static-copy errors, remove stale source maps, and
  reject stale `.ablx` contents instead of silently packaging old output.
- Release metadata, operator sheet, tester guide, social card, and production
  package are aligned on `1.0.0`. The older local-only `v0.7.0` marker remains
  untouched and is not part of this release.

## [0.7.0] — 2026-08-27

### Added

- MIX 8 knobs + 8 faders, flat arcs and keyboard control, preserving IDs 1–6.
- Browser audio-input selection, remembered locally, explicit device failure
  and unplug feedback without silent microphone fallback.
- Preset saves/deletes serialized with mapping changes; staged writes preserve
  the previous file on I/O failure. Deletion reports actual storage errors.
- Removed retired YIN/chroma/BPM work; amplitude attacks remain
  available for unpitched onsets. Session recovery messages use EN/PT-BR.
- Musical labels use quarter-note beats for stored snapshot/burst durations;
  AUD uses whole-note fractions to1/128 with straight/triplet/dotted choices.

- Departure Mono is bundled and served offline as the interface typeface.
- An operator-sheet visual identity now covers the rebuilt project page and
  social card, with one amber accent, a carbon palette and zero-radius controls.
- The phone, panel and admin surfaces now share that visual system.
- Pinch Clutch adds three always-live X/Y/Z axes that hold their values between
  pinches and continue from the last position.
- `internal/THEME_CONTRACT.md` is the binding visual contract, indexed from the
  documentation README and protected by a regression test.

### Improved

- Finger extension is measured from each fingertip to its own MCP, while thumb
  state follows opposition instead of treating the thumb like another finger.
- Each learned gesture derives a widen-only tolerance from its own three takes.
- Static-pose recognition combines 42 normalized landmark coordinates with
  five articulation values in a 47-dimension hybrid descriptor.
- The phone Vision readout deck was rebuilt for continuous controls, detector
  state, learned poses and ambient colour without clipped values.
- The social-card generator reads the release from `package.json` and keeps its
  build-only Departure Mono source outside the distributable.

### Fixed

- Pinch Clutch no longer re-engages by itself after the tracked hand is lost.
- The clutch readout no longer freezes at `HELD`, and the AMBIENT card now
  renders its numeric values and colour swatch.
- Panel clutch tiles now receive live paint, while mapping chips and the knob
  block no longer override the theme with inline styling.

### Release hygiene

- Removed unreachable CSS and JavaScript from the panel and phone surfaces.
- Corrected false claims in the privacy policy, README, install guide,
  customization guide and user guide.
- Removed an orphaned screenshot script that exposed a local filesystem path.
- The distributable is `Ableton-RC-Surface-0.7.0.ablx`.
