#!/usr/bin/env python3
"""Build FEATURES.csv from the canonical RC Surface surface namespaces.

Each row records one discovered function/control/surface point. The
investigation fills the handler/payload/target/test columns as P02/P03/P04
probes the source. Entries marked `pending-investigation` are placeholders
the audit must close before declaring go/no-go.
"""
from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_CSV = ROOT / "internal" / "release-audit-2026-09-19" / "FEATURES.csv"
RELEASE_AUDIT_PREFIX = "internal/release-audit-2026-09-19/"

ROWS: list[dict[str, str]] = []

def add(feature_id: str, surface: str, entry_point: str, handler: str,
        payload: str, authorization: str, state_persistence: str,
        target: str, feedback: str, test: str, real_evidence: str,
        status: str, residual_risk: str) -> None:
    ROWS.append({
        "feature_id": feature_id,
        "surface": surface,
        "entry_point": entry_point,
        "handler": handler,
        "payload": handler,  # alias of handler for csv consumers; refined later
        "authorization": authorization,
        "state_persistence": state_persistence,
        "target": target,
        "feedback": feedback,
        "test": test,
        "real_evidence": real_evidence,
        "status": status,
        "residual_risk": residual_risk,
    })


# PERF tab — pads (12)
for i in range(1, 13):
    add(
        feature_id=f"pad-{i}",
        surface="phone PERF",
        entry_point=f"static/phone-v3/controls.js#pad-{i} (pending-investigation)",
        handler="mode-engine + control-stream (pending-investigation)",
        payload=f"control frame value 0..1 / pad-{i}",
        authorization="controller role token; mapped? bound via MAP",
        state_persistence="localStorage cfg override (CFG); last value",
        target="Live device parameter (continuous/discrete) OR MIDI note (Trigger Note)",
        feedback="pad fill, mode letter tag, haptics retired (no haptics UI)",
        test="tests/live-mappings-*; static/phone-v3/pointer-controls.test.mjs",
        real_evidence="pending P02/P03",
        status="pending-investigation",
        residual_risk="CFG override may shadow mapping; trigger note ordering with OFF",
    )

# PERF tab — knobs (8)
for i in range(1, 9):
    add(
        feature_id=f"knob-{i}",
        surface="phone PERF / MIX",
        entry_point=f"static/phone-v3/controls.js#knob-{i}",
        handler="mode-engine + control-stream (pending)",
        payload="continuous 0..1 / normalized to target range",
        authorization="controller role token",
        state_persistence="CFG override; last value",
        target="Live device parameter",
        feedback="knob dial position; mapping curve drawing",
        test="tests/live-mappings-*; static/phone-v3/controls.js tests",
        real_evidence="pending P02",
        status="pending-investigation",
        residual_risk="smooth/target-range interaction",
    )

# PERF tab — faders (8)
for i in range(1, 9):
    add(
        feature_id=f"fader-{i}",
        surface="phone PERF / MIX",
        entry_point=f"static/phone-v3/controls.js#fader-{i}",
        handler="mode-engine + control-stream (pending)",
        payload="continuous 0..1",
        authorization="controller role token",
        state_persistence="CFG override; last value",
        target="Live device parameter",
        feedback="fader thumb; mapping curve drawing",
        test="static/phone-v3/fader-range.test.mjs; fader-reset.test.mjs",
        real_evidence="pending P02",
        status="pending-investigation",
        residual_risk="reset target-aware (0.85 default, 0.5 when bound to pan)",
    )

# PERF tab — XY pads (2 pads x 2 axes)
for pad in (1, 2):
    for axis in ("x", "y"):
        add(
            feature_id=f"xy-{pad}.{axis}",
            surface=f"phone PERF (XY {pad})",
            entry_point=f"static/phone-v3/controls.js#xy-{pad}",
            handler="physics (XY2) or direct (XY1) (pending)",
            payload="continuous 0..1",
            authorization="controller role token",
            state_persistence="CFG override",
            target="Live device parameter (XY1=direct, XY2=physics)",
            feedback="XY position visual",
            test="static/phone-v3/xy-physics-stop.test.mjs",
            real_evidence="pending P02",
            status="pending-investigation",
            residual_risk="physics stop / pointer capture edge",
        )

# LFOs (L1..L4) and Stutters (S1..S4) — surfaces
for i in range(1, 5):
    add(
        feature_id=f"lfo-{i}",
        surface=f"phone PERF (L{i})",
        entry_point=f"static/phone-v3/controls.js#L{i}",
        handler="mode-engine + control-stream + transport-clock",
        payload="shape, subdivision, rate, depth, swing, ratchet",
        authorization="controller role token",
        state_persistence="CFG override; SYNC settings localStorage",
        target="Live device parameter (continuous)",
        feedback="modulation dial; SYNC modal preview",
        test="tests/lfo-*",
        real_evidence="pending P02/P03",
        status="pending-investigation",
        residual_risk="ceilings (sine 4Hz, triangle 3Hz, ramps 3Hz, square 12Hz) until teto_efetivo measured",
    )

for i in range(1, 5):
    add(
        feature_id=f"stutter-{i}",
        surface=f"phone PERF (S{i})",
        entry_point=f"static/phone-v3/controls.js#S{i}",
        handler="mode-engine + transport-clock + depth bar",
        payload="X=speed, Y=amplitude (depth)",
        authorization="controller role token",
        state_persistence="CFG override; last value",
        target="Live device parameter (continuous)",
        feedback="depth bar; speed Hz",
        test="static/phone-v3/stutter-mode.test.mjs; tests/stutter-depth-coalesce.test.mjs",
        real_evidence="pending P02",
        status="pending-investigation",
        residual_risk="FIXED/SYNC pin compatibility; OFF without replay of stale pulses",
    )

# Toggles (toggle-1..4) same family as LFO since L1..L4 surface name is used
# (already listed above).

# Buttons (button-1..4) same as S1..S4.

# Sensors — motion / orientation
for axis in ("x", "y", "z"):
    add(
        feature_id=f"sensor.motion.{axis}",
        surface="phone SNS",
        entry_point="static/phone-v3/sensor-capabilities.js",
        handler="permissions + capability + freshness gates (pending)",
        payload="continuous -1..1",
        authorization="controller role token; browser sensor permission",
        state_persistence="none (stream)",
        target="Live device parameter",
        feedback="MOTION readout",
        test="static/phone-v3/sensor-orientation.test.mjs",
        real_evidence="pending P02/P04",
        status="pending-investigation",
        residual_risk="permission denial / background suspension",
    )
for axis in ("alpha", "beta", "gamma"):
    add(
        feature_id=f"sensor.orient.{axis}",
        surface="phone SNS",
        entry_point="static/phone-v3/sensor-capabilities.js",
        handler="permissions + capability + freshness gates (pending)",
        payload="continuous -pi..pi / 0..2pi",
        authorization="controller role token",
        state_persistence="none",
        target="Live device parameter",
        feedback="ORIENTATION readout",
        test="static/phone-v3/sensor-orientation.test.mjs",
        real_evidence="pending P04",
        status="pending-investigation",
        residual_risk="device-orientation events disabled",
    )

# Audio descriptors
AUDIO_DESCRIPTORS = [
    "rms", "envelope", "gate", "attack", "transient", "kick", "snare",
    "brightness", "centroid", "rolloff", "flux", "flatness", "spread",
    "low", "mid", "high",
]
for d in AUDIO_DESCRIPTORS:
    add(
        feature_id=f"sensor.audio.{d}",
        surface="phone AUD",
        entry_point=f"static/phone-v3/audio-descriptors.js#sensor.audio.{d}",
        handler="AudioWorklet + descriptors + spectral (pending)",
        payload="continuous 0..1 (Hz labels display only for centroid/rolloff)",
        authorization="controller role token; mic permission",
        state_persistence="localStorage detector knobs (SENS, RELEASE, SMOOTH, WINDOW, GAIN)",
        target="Live device parameter",
        feedback=f"card meter; timeline graph (band) for {d}",
        test="static/phone-v3/audio-descriptor-stream.test.mjs; audio-spectral-descriptors.test.mjs; audio-timeline.test.mjs; live-audio-descriptor-dispatch.test.mjs",
        real_evidence="pending P04",
        status="pending-investigation",
        residual_risk="physical latency not measured; band RMS vs K-weighted (Low/Mid/High now K-weighted)",
    )

# Loudness (K-weighted momentary/short-term/integrated)
for kind in ("momentary", "short_term", "integrated"):
    add(
        feature_id=f"sensor.audio.loudness.{kind}",
        surface="phone AUD",
        entry_point="static/phone-v3/audio-processor.js (pending)",
        handler="K-weighting per ITU-R BS.1770-4 (pending)",
        payload="LUFS number",
        authorization="controller role token",
        state_persistence="none",
        target="display only (read-out)",
        feedback="loudness meter",
        test="static/phone-v3/audio-processor.test.mjs (pending verification)",
        real_evidence="pending P04",
        status="pending-investigation",
        residual_risk="label vs implementation (LU vs dB)",
    )

# Vision
for ctrl in ("x", "y", "z", "fist", "pinch", "victory", "rotateVal", "open",
             "pinch_x", "pinch_y", "pinch_z", "gesture.1", "gesture.2", "gesture.3"):
    add(
        feature_id=f"sensor.vision.{ctrl}",
        surface="phone VID",
        entry_point="static/phone-v3/vision-processor.js (pending)",
        handler="MediaPipe Hands single-hand + static pose learner",
        payload="continuous 0..1 (gestures: 0/1)",
        authorization="controller role token; camera permission",
        state_persistence="learned static poses (per slot)",
        target="Live device parameter",
        feedback="VID pose card; map strip",
        test="static/phone-v3/vision-mapping.test.mjs; static-pose-gesture.test.mjs; static-pose-ui.test.mjs",
        real_evidence="pending P04",
        status="pending-investigation",
        residual_risk="two-hand detected — must be discarded; pinch clutch release debounce",
    )

# Map/Mapping subsystems
add(
    feature_id="map.mode.enter_exit",
    surface="phone MAP",
    entry_point="static/phone-v3/mapping-mode.js",
    handler="mappings.js + mapping-input-contract.js (pending)",
    payload="enter/exit; selected control id",
    authorization="controller role token",
    state_persistence="none",
    target="n/a",
    feedback="MAP highlight; capture overlay",
    test="static/phone-v3/mapping-mode.test.mjs",
    real_evidence="pending P02",
    status="pending-investigation",
    residual_risk="exit while pad held — capture/gate release",
)
add(
    feature_id="map.bind_continuous",
    surface="phone MAP",
    entry_point="static/phone-v3/mapping-mode.js#bind",
    handler="command-dispatch (server) + live/mappings.ts (host) (pending)",
    payload="control_id, target (track/device/param), curve, range, smooth",
    authorization="controller role token",
    state_persistence="presets.json; ProjectConfig",
    target="Live device parameter",
    feedback="mapping card; curve editor preview",
    test="tests/live-mappings-curve.test.mjs; target-range.test.mjs; pickup.test.mjs; takeover.test.mjs; smooth-timer.test.mjs; safe-loss.test.mjs; mappings-targets.test.mjs",
    real_evidence="pending P02/P03",
    status="pending-investigation",
    residual_risk="pickup/takeover/smooth race; safe-loss",
)
add(
    feature_id="map.bind_trigger_note",
    surface="phone MAP",
    entry_point="static/phone-v3/mapping-mode.js#trigger-note",
    handler="src/live/midi-receiver.ts + Receiver v2 AMXD (pending)",
    payload="control_id, midi_track, pitch, octave, velocity",
    authorization="controller role token",
    state_persistence="presets",
    target="MIDI track via RC-Midi-Receiver.amxd v2 (SDK, no UDP)",
    feedback="Trigger Note card; arm indicator",
    test="tests/live-midi-trigger.test.mjs; live-midi-receiver.test.mjs; scripts/midi-receiver-arming.test.mjs",
    real_evidence="pending P02/P03",
    status="pending-investigation",
    residual_risk="old UDP Receiver left loaded → unsafe; ordering ON/OFF under SDK slow",
)
add(
    feature_id="map.tap_to_midi_v2",
    surface="phone MAP",
    entry_point="static/phone-v3/mapping-mode.js#trigger-note",
    handler="SDK path (single-write, ordered)",
    payload="pitch/octave/velocity",
    authorization="controller role token",
    state_persistence="presets",
    target="selected MIDI track via SDK parameter",
    feedback="trigger card",
    test="tests/live-midi-trigger.test.mjs",
    real_evidence="pending P03",
    status="pending-investigation",
    residual_risk="duplicate Receivers, OFF during held note, disarm on reload",
)
add(
    feature_id="map.clear_all",
    surface="phone MAP / panel",
    entry_point="static/phone-v3/mapping-mode.js#clear-all",
    handler="command-dispatch (clearAllMappings)",
    payload="n/a",
    authorization="controller or admin",
    state_persistence="presets persisted after clear",
    target="Live state (mappings)",
    feedback="status update",
    test="tests/live-mappings-clear.test.mjs",
    real_evidence="pending P03",
    status="pending-investigation",
    residual_risk="in-flight writes replay after clear; explicit OFF for held notes",
)
add(
    feature_id="map.preset.save_load_delete",
    surface="phone MAP / panel",
    entry_point="static/phone-v3/mapping-mode.js (presets)",
    handler="project-config.ts (pending)",
    payload="preset blob; selected name",
    authorization="controller role token",
    state_persistence="presets.json (atomic write)",
    target="n/a",
    feedback="preset list",
    test="tests/project-config.test.mjs; project-config-storage.test.mjs; live-preset-storage.test.mjs; release-cleanup.test.mjs",
    real_evidence="pending P03",
    status="pending-investigation",
    residual_risk="atomic write failure leaves previous file intact (good); concurrent edits",
)

# CFG
add(
    feature_id="cfg.per_control_override",
    surface="phone CFG / desktop panel",
    entry_point="static/phone-v3/config-mode.js",
    handler="control-config.js (pending)",
    payload="control_id, mode/shape/subdivision/physics overrides",
    authorization="controller role token",
    state_persistence="localStorage ableton-rc:control_config",
    target="phone rendering only (does not affect host bounds)",
    feedback="CFG badges; clear-all popover",
    test="static/phone-v3/config-mode.test.mjs; control-config.test.mjs",
    real_evidence="pending P02",
    status="pending-investigation",
    residual_risk="badges may mis-state on PERF/MIX if CFG off; pointer capture / popover content",
)
add(
    feature_id="cfg.clear_all",
    surface="phone CFG",
    entry_point="static/phone-v3/config-mode.js#clear-all",
    handler="popover long-press (pending)",
    payload="n/a",
    authorization="controller role token",
    state_persistence="localStorage cleared",
    target="phone rendering",
    feedback="popover confirmation",
    test="static/phone-v3/config-mode.test.mjs",
    real_evidence="pending P02",
    status="pending-investigation",
    residual_risk="accidental global clear; right-click vs long-press parity",
)

# SYNC / TRN / STAGE
add(
    feature_id="sync.global",
    surface="phone PERF / settings modal",
    entry_point="static/phone-v3/transport.js + modules/sync.js (pending)",
    handler="src/live/osc-transport.ts; clock source = AbletonOSC / SDK BPM sim / FREE",
    payload="source, subdivisions, swing, phase, shapes",
    authorization="controller role token",
    state_persistence="localStorage",
    target="Live tempo; LFO/Stutter timing",
    feedback="SYNCED/SDK/FREE status",
    test="tests/osc-transport.test.mjs; osc-transport-polling.test.mjs; transport-clock.test.mjs; stage-mode-fullscreen.test.mjs",
    real_evidence="pending P03",
    status="pending-investigation",
    residual_risk="OSC unavailable; clock source stale; SYNC↔FREE transition fidelity",
)
add(
    feature_id="transport.lite_trn",
    surface="phone TRN overlay",
    entry_point="static/phone-v3/modules/transport.js (pending)",
    handler="src/live/osc-transport.ts via cmd/jump_to_*",
    payload="play, stop, prev/next cue, locator jumps",
    authorization="controller role token",
    state_persistence="none",
    target="Live transport",
    feedback="playhead flash; TRN button rhythm flash",
    test="static/phone-v3/transport.test.mjs",
    real_evidence="pending P03",
    status="pending-investigation",
    residual_risk="OSC unavailable (AbletonOSC missing)",
)
add(
    feature_id="stage.mode_fullscreen",
    surface="phone PERF",
    entry_point="static/phone-v3/stage-mode-controller.js (pending)",
    handler="fullscreen + visibilitychange (pending)",
    payload="enter/exit fullscreen",
    authorization="n/a",
    state_persistence="none",
    target="n/a",
    feedback="fullscreen UI; return to background warning",
    test="tests/stage-mode-fullscreen.test.mjs",
    real_evidence="pending P03",
    status="pending-investigation",
    residual_risk="auto-suspend; multi-window",
)

# Snapshots
add(
    feature_id="snapshot.capture_recall_clear_morph",
    surface="phone SNP",
    entry_point="static/phone-v3/modules/snapshots.js (pending)",
    handler="src/live/mappings.ts (snapshot vs cfg) (pending)",
    payload="slot id; morph time (ms or beats)",
    authorization="controller role token",
    state_persistence="localStorage; presets (see map.preset.save_load_delete)",
    target="Live device parameters (mode A/B/C/D + bound controls)",
    feedback="SLOT/PRONTO indicator; morph time",
    test="static/phone-v3/snapshots.test.mjs; snapshot-controls.test.mjs; release-cleanup.test.mjs",
    real_evidence="pending P02",
    status="pending-investigation",
    residual_risk="what snapshot actually saves: controls only? + CFG? mappings? — depends on source",
)

# CALIBRATE per domain
for dom in ("sns", "aud", "vid"):
    add(
        feature_id=f"calibrate.{dom}",
        surface=f"phone {dom.upper()}",
        entry_point="static/phone-v3/calibration.js + modules/calibration.js",
        handler="calibration session (independent per dom)",
        payload="ok/cancel; reset; per-domain progress",
        authorization="controller role token",
        state_persistence="calibration state per domain",
        target="phone rendering (sensor gain etc.)",
        feedback="instruction + progress",
        test="static/phone-v3/calibration.test.mjs",
        real_evidence="pending P04",
        status="pending-investigation",
        residual_risk="no fake success without fresh readings; cancel/reset boundaries",
    )

# Backend subsystems
add(
    feature_id="server.ws.hello",
    surface="panel/admin/phone",
    entry_point="src/server/ws.ts (sendHello)",
    handler="hello payload; controlStreamVersion=1",
    payload="tempo, signature, scale, playhead, values, bipolarControls, projectConfig",
    authorization="token (rotating)",
    state_persistence="session cookie",
    target="phone rendering bootstrap",
    feedback="connection status",
    test="tests/server-hello-token-status.test.mjs; server-ws-security.test.mjs; server-shared-surface.test.mjs",
    real_evidence="pending P03",
    status="pending-investigation",
    residual_risk="unknown keys on snapshot, control and set-display-name messages ignored (good)",
)
add(
    feature_id="server.control_frame",
    surface="phone→server",
    entry_point="src/server/ws-bounds.ts",
    handler="boundControlFrame choke point (RATE_BURST=600, RATE_SUSTAINED_PER_SEC=300)",
    payload="control values",
    authorization="controller role token",
    state_persistence="none",
    target="host write-scheduler",
    feedback="rate-limit notice",
    test="tests/server-control-frame.test.mjs; server-rate-limit-notice.test.mjs; server-rate-limit-headroom.test.mjs; server-write-scheduler.test.mjs",
    real_evidence="pending P03",
    status="pending-investigation",
    residual_risk="burst overflow; sustained overrun",
)
add(
    feature_id="server.backpressure",
    surface="admin/phone",
    entry_point="src/server/backpressure.ts",
    handler="sendWithBackpressure",
    payload="telemetry/critical frames",
    authorization="any role",
    state_persistence="none",
    target="WebSocket",
    feedback="backpressure headroom + disconnect 4008",
    test="tests/server-state-backpressure.test.mjs; live-state-backpressure.test.mjs; server-ws-stress.test.mjs",
    real_evidence="pending P03",
    status="pending-investigation",
    residual_risk="3 MiB disconnect; reconnect restores state",
)
add(
    feature_id="server.session_rotate",
    surface="panel/admin/phone",
    entry_point="src/server/session-auth.ts (pending)",
    handler="rotating tokens; QR URL grants controller role",
    payload="token in URL",
    authorization="token + role",
    state_persistence="session cookie",
    target="connection",
    feedback="SESSION EXPIRED — RESCAN QR",
    test="tests/server-session-replaced.test.mjs; server-session-cookie.test.mjs; server-token-staleness.test.mjs",
    real_evidence="pending P03",
    status="pending-investigation",
    residual_risk="old tab reconnect drops to read-only",
)
add(
    feature_id="live.write_scheduler_single_flight",
    surface="host",
    entry_point="src/server/write-scheduler.ts",
    handler="single-flight per lane; bound backlog",
    payload="device writes",
    authorization="admin or controller (depends on command)",
    state_persistence="in-memory",
    target="Live device parameter",
    feedback="actuator stats",
    test="tests/server-write-scheduler.test.mjs; server-write-scheduler-reentrancy.test.mjs",
    real_evidence="pending P03",
    status="pending-investigation",
    residual_risk="re-entrancy / ordering under SDK slow",
)
add(
    feature_id="live.continuous_target_actuator",
    surface="host",
    entry_point="src/live/continuous-target-actuator.ts",
    handler="single-flight, latest-value",
    payload="target value",
    authorization="controller",
    state_persistence="none",
    target="Live device parameter",
    feedback="actuator stats",
    test="tests/live-continuous-target-actuator.test.mjs; live-continuous-target-actuator-stats.test.mjs",
    real_evidence="pending P03",
    status="pending-investigation",
    residual_risk="cancel between promise and setValue completion",
)
add(
    feature_id="live.host_modulators",
    surface="host",
    entry_point="src/live/host-modulators.ts",
    handler="shape engine",
    payload="phase, value",
    authorization="controller",
    state_persistence="SYNC settings + CFG",
    target="Live device parameter",
    feedback="phase continuity",
    test="tests/live-host-modulators.test.mjs; host-modulator-phase-continuity.test.mjs; live-host-modulator-write-suppression.test.mjs",
    real_evidence="pending P03",
    status="pending-investigation",
    residual_risk="phase resets on shape change",
)
add(
    feature_id="live.transport_clock",
    surface="host",
    entry_point="src/live/transport-clock.ts",
    handler="getLfoSubdivision/getLfoMaxHz/getStutterTiming",
    payload="rate, bpm, pin",
    authorization="controller",
    state_persistence="none",
    target="LFO/Stutter timing values",
    feedback="effective rate readout",
    test="tests/transport-clock.test.mjs; modulator-policy-parity.test.mjs",
    real_evidence="pending P03",
    status="pending-investigation",
    residual_risk="drift between phone and host (parity test guards)",
)
add(
    feature_id="live.osc_transport",
    surface="host",
    entry_point="src/live/osc-transport.ts",
    handler="OSC registry-driven",
    payload="OSC addresses (LISTEN/GET/CMD/RESPONSE)",
    authorization="controller (via server)",
    state_persistence="in-memory",
    target="AbletonOSC port 11000/11001",
    feedback="status SYNCED/SDK/FREE",
    test="tests/osc-transport.test.mjs; osc-transport-polling.test.mjs; osc-transport-polyfill.test.mjs",
    real_evidence="pending P03",
    status="pending-investigation",
    residual_risk="OSC unavailable; registry drift caught by freeze test",
)
add(
    feature_id="live.mappings",
    surface="host",
    entry_point="src/live/mappings.ts",
    handler="curves, range, presets, setDeviceParam, benchDeviceParamWrites",
    payload="command dispatch",
    authorization="controller or admin (per command)",
    state_persistence="ProjectConfig + presets",
    target="Live device parameter",
    feedback="actuator stats; control frame echo",
    test="tests/live-mappings-* (large suite)",
    real_evidence="pending P03",
    status="pending-investigation",
    residual_risk="race between clearAll and in-flight write",
)

# Audio worklet / descriptors / streaming
add(
    feature_id="audio.descriptor_worklet",
    surface="phone AUD",
    entry_point="static/phone-v3/audio-descriptor-worklet.js",
    handler="AudioWorklet processor",
    payload="PCM frames",
    authorization="controller role token",
    state_persistence="n/a",
    target="descriptors stream",
    feedback="internal",
    test="static/phone-v3/audio-descriptor-worklet.test.mjs",
    real_evidence="pending P04",
    status="pending-investigation",
    residual_risk="suspended context; sample rate mismatch",
)
add(
    feature_id="audio.descriptor_stream",
    surface="phone AUD",
    entry_point="static/phone-v3/audio-descriptor-stream.js",
    handler="stream emit to server",
    payload="12 descriptors + loudness",
    authorization="controller role token",
    state_persistence="localStorage detector knobs",
    target="host live dispatch",
    feedback="card meter; graph",
    test="static/phone-v3/audio-descriptor-stream.test.mjs",
    real_evidence="pending P04",
    status="pending-investigation",
    residual_risk="descriptor path emits before permission; sustained vs burst",
)
add(
    feature_id="audio.input_selector",
    surface="phone AUD",
    entry_point="static/phone-v3/audio-input-selector.js",
    handler="device list + permission",
    payload="deviceId",
    authorization="controller role token",
    state_persistence="localStorage (no auto-capture)",
    target="getUserMedia",
    feedback="device list; error feedback",
    test="static/phone-v3/audio-input-selector.test.mjs",
    real_evidence="pending P04",
    status="pending-investigation",
    residual_risk="silent microphone fallback forbidden",
)
add(
    feature_id="audio.workspace_timeline",
    surface="phone AUD",
    entry_point="static/phone-v3/audio-workspace.js; audio-timeline.js",
    handler="graph rendering + groups",
    payload="history",
    authorization="controller role token",
    state_persistence="group config",
    target="display",
    feedback="groups; graph",
    test="static/phone-v3/audio-timeline.test.mjs; layout.test.mjs",
    real_evidence="pending P04",
    status="pending-investigation",
    residual_risk="12 detector cards readable; scroll on short screens",
)
add(
    feature_id="audio.smoothing_groups",
    surface="phone AUD",
    entry_point="static/phone-v3/audio-smoothing.js; audio-analysis-controls.js",
    handler="group-specific smoothing (Attacks/Smooth/RELEASE/SMOOTH)",
    payload="ms or 1/x beats",
    authorization="controller role token",
    state_persistence="localStorage",
    target="audio flow",
    feedback="group readout",
    test="static/phone-v3/audio-smoothing.test.mjs; audio-analysis-controls.test.mjs",
    real_evidence="pending P04",
    status="pending-investigation",
    residual_risk="SMOOTH=0 immediate vs SMOOTH>0 smoothing interaction",
)

# Vision
add(
    feature_id="vision.camera_lifecycle",
    surface="phone VID",
    entry_point="static/phone-v3/camera-lifecycle.js",
    handler="permission; start/stop; resume",
    payload="start/stop",
    authorization="controller role token",
    state_persistence="n/a",
    target="MediaPipe Hands runtime",
    feedback="camera preview; permission state",
    test="static/phone-v3/camera-lifecycle.test.mjs",
    real_evidence="pending P04",
    status="pending-investigation",
    residual_risk="permission denial; orphan stream on page hide",
)
add(
    feature_id="vision.static_pose_learner",
    surface="phone VID",
    entry_point="static/phone-v3/vision-control-state.js (pending)",
    handler="capture/learned pose match (G1/G2/G3)",
    payload="pose vector",
    authorization="controller role token",
    state_persistence="per slot",
    target="gesture.1/2/3 controls",
    feedback="pose card",
    test="static/phone-v3/static-pose-gesture.test.mjs; static-pose-ui.test.mjs; vision-mapping.test.mjs",
    real_evidence="pending P04",
    status="pending-investigation",
    residual_risk="repositioning not confused with new pose; debounce",
)
add(
    feature_id="vision.pinch_clutch",
    surface="phone VID",
    entry_point="static/phone-v3/vision-control-state.js (pending)",
    handler="pinch_x/y/z",
    payload="continuous 0..1",
    authorization="controller role token",
    state_persistence="cfg",
    target="Live device parameter",
    feedback="clutch indicator",
    test="static/phone-v3/vision-mapping.test.mjs",
    real_evidence="pending P04",
    status="pending-investigation",
    residual_risk="release debounce vs held value",
)

# Max devices
add(
    feature_id="max.midi_receiver_v2",
    surface="Live Set",
    entry_point="static/RC-Midi-Receiver.amxd (binary)",
    handler="Max for Live device (built by scripts/build-midi-receiver.js)",
    payload="SDK parameter RC_MIDI_PACKET_V2 (Float 0..4194303)",
    authorization="phone Trigger Note",
    state_persistence="device state in Set",
    target="MIDI track (instrument input)",
    feedback="ON/OFF; v2 label SDK / LOCAL MAX — NO UDP",
    test="tests/live-midi-receiver.test.mjs; scripts/midi-receiver-arming.test.mjs; midi-receiver-device.test.mjs",
    real_evidence="pending P04",
    status="pending-investigation",
    residual_risk="old UDP Receiver still loaded in Set",
)
add(
    feature_id="max.audio_sender_v2",
    surface="Live Set",
    entry_point="static/RC-Audio-Sender.amxd (binary)",
    handler="Max for Live device (built by scripts/build-audio-sender.js)",
    payload="internal Max message bus to RC-Midi-Receiver v2",
    authorization="MIDI track enables Audio Sender input (OFF at load)",
    state_persistence="device state in Set",
    target="MIDI track via Receiver v2",
    feedback="Audio Sender ON indicator",
    test="scripts/audio-sender-device.test.mjs; tests/live-midi-receiver.test.mjs",
    real_evidence="pending P04",
    status="pending-investigation",
    residual_risk="max error if old version loaded; latency not measured",
)
add(
    feature_id="max.audio_descriptors_device",
    surface="Live Set",
    entry_point="static/RC-Audio-Descriptors.amxd (likely outside tracked — to verify)",
    handler="Max for Live device (built by scripts/build-audio-descriptors.mjs)",
    payload="native audio path",
    authorization="n/a",
    state_persistence="device state",
    target="Live audio track",
    feedback="Native Track indicators",
    test="scripts/audio-descriptors-device.test.mjs",
    real_evidence="pending P04",
    status="pending-investigation",
    residual_risk="Native Track still pending owner deferred",
)

# Distribution / packaging
add(
    feature_id="dist.build_prod_ablx",
    surface="CI/local",
    entry_point="build.ts + extensions-cli",
    handler="tree-shaken SDK; manifest entry dist/extension.js",
    payload="versioned .ablx",
    authorization="maintainer",
    state_persistence="artifact",
    target="release-kits/RC-Surface-<v>.ablx",
    feedback="build logs",
    test="tests/release-*.test.mjs; scripts/*-package*.test.mjs",
    real_evidence="pending P06",
    status="pending-investigation",
    residual_risk="SDK tarball leak into .ablx; manifest drift",
)
add(
    feature_id="dist.verify_release",
    surface="CI/local",
    entry_point="scripts/verify-release.mjs",
    handler="CI + package + gates",
    payload="verification report",
    authorization="maintainer",
    state_persistence="test-results/release-verify.json",
    target="release pipeline",
    feedback="exit code 0",
    test="tests/verify-release.test.mjs; scripts/verify-release-package.test.mjs; check-release-gates.test.mjs; install-candidate-status.test.mjs",
    real_evidence="pending P06",
    status="pending-investigation",
    residual_risk="publish gate accepts pending/blocked only on local stage",
)
add(
    feature_id="dist.package_tester_kit",
    surface="maintainer",
    entry_point="scripts/package-tester-kit.mjs",
    handler="kit assembly (slice A+B; R opt-in via ABLETON_RC_DEV_SYNC)",
    payload="release-kits/RC-Surface-<v>-test/",
    authorization="maintainer",
    state_persistence="local AppData when ABLETON_RC_DEV_SYNC set",
    target="tester installation",
    feedback="kit files",
    test="scripts/package-tester-kit.test.mjs; scripts/test-port-assignments.test.mjs",
    real_evidence="pending P06",
    status="pending-investigation",
    residual_risk="ABLETON_RC_DEV_SYNC=0 in automated runs",
)
add(
    feature_id="dist.migrate_data",
    surface="tester",
    entry_point="scripts/migrate-data.mjs (kit also has Windows/macOS wrappers)",
    handler="copy worm.ableton-rc-surface → worm.rc-surface (no overwrite)",
    payload="kit data copy",
    authorization="tester",
    state_persistence="disk",
    target="Live data folder",
    feedback="kit logs",
    test="scripts/migrate-data.test.mjs; migration-wrappers.test.mjs",
    real_evidence="pending P06",
    status="pending-investigation",
    residual_risk="source missing (fresh install) → clean exit 0",
)

# Bench
add(
    feature_id="bench.live_write_rate",
    surface="physical bench (admin)",
    entry_point="scripts/bench-live-write-rate.mjs",
    handler="benchDeviceParamWrites (admin only)",
    payload="track, device, param, seconds, pattern (single/parallel/stairs/sine)",
    authorization="admin token",
    state_persistence="JSON test-results",
    target="Live device parameter",
    feedback="started/completed/failed/skipped/mean/p50/p95/maxMs/ratePerSecond",
    test="tests/live-bench-device-param-writes.test.mjs; scripts/bench-live-write-rate.test.mjs",
    real_evidence="pending P05",
    status="pending-investigation",
    residual_risk="P04 (physical Live + Automation Arm) pending — operator",
)
add(
    feature_id="bench.ws_compression",
    surface="local",
    entry_point="scripts/bench-ws-compression.mjs",
    handler="ws traffic compression probe",
    payload="n/a",
    authorization="local",
    state_persistence="JSON",
    target="n/a",
    feedback="compression ratio",
    test="(none seen — investigate)",
    real_evidence="pending P05",
    status="pending-investigation",
    residual_risk="not exercised",
)


def main() -> int:
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(ROWS[0].keys()))
        writer.writeheader()
        writer.writerows(ROWS)
    print(f"OK: wrote {len(ROWS)} rows to {OUT_CSV.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
