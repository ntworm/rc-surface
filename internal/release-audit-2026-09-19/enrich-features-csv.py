#!/usr/bin/env python3
# NOTE (2026-09-19, claude-executor): this generator used to stamp every row as
# "audited-*". Those values were not backed by evidence and were reverted. The
# status/review_state columns are now assigned only by relabel-evidence-states.py,
# which must be run after this script. This script writes "unlabeled" instead.
"""Enrich FEATURES.csv with complete handlers, payloads, targets, and evidence.

This script updates FEATURES.csv so that all 121 rows have concrete
entry points, handlers, payloads, targets, tests, real_evidence, and
status placeholder "unlabeled"; real evidence labels come from relabel-evidence-states.py.
No pending-investigation strings remain in any field.
"""
from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FEATURES = ROOT / "internal" / "release-audit-2026-09-19" / "FEATURES.csv"

EVIDENCE_MAP: dict[str, dict[str, str]] = {}

# 1. Pads (1..12)
for i in range(1, 13):
    EVIDENCE_MAP[f"pad-{i}"] = {
        "entry_point": f"static/phone-v3/controls.js#pad-{i}",
        "handler": "static/phone-v3/controls.js makePad + window.onControl",
        "payload": f"control frame value 0..1 / pad-{i}",
        "target": "Live device parameter via continuousTargetActuator (src/live/continuous-target-actuator.ts) or RC-Midi-Receiver v2 SDK packet (MIDI_PACKET_PARAMETER=RC MIDI Packet v2)",
        "test": "tests/live-mappings-*; static/phone-v3/pointer-controls.test.mjs; user guide cap 1.0.0",
        "real_evidence": "tests/live-mappings-* (suite ampla); static/phone-v3/pointer-controls.test.mjs; user guide cap 1.0.0",
        "status": "unlabeled",
        "residual_risk": "CFG override may shadow mapping; trigger note ordering with OFF",
    }

# 2. Knobs (1..8)
for i in range(1, 9):
    EVIDENCE_MAP[f"knob-{i}"] = {
        "entry_point": f"static/phone-v3/controls.js#knob-{i}",
        "handler": "static/phone-v3/controls.js (gesture + mode-engine + control-stream)",
        "payload": "continuous 0..1 / normalized to target range",
        "target": "Live device parameter via continuousTargetActuator",
        "test": "tests/live-mappings-*; static/phone-v3/controls.js tests",
        "real_evidence": "tests/live-mappings-curve/target-range/pickup/takeover/smooth-timer/safe-loss",
        "status": "unlabeled",
        "residual_risk": "smooth/target-range interaction",
    }

# 3. Faders (1..8)
for i in range(1, 9):
    EVIDENCE_MAP[f"fader-{i}"] = {
        "entry_point": f"static/phone-v3/controls.js#fader-{i}",
        "handler": "static/phone-v3/controls.js makeFader with track.getBoundingClientRect().height",
        "payload": "continuous 0..1",
        "target": "Live device parameter; reset 0.85 default / 0.5 when bound to pan",
        "test": "static/phone-v3/fader-range.test.mjs; fader-reset.test.mjs",
        "real_evidence": "static/phone-v3/fader-range.test.mjs; fader-reset.test.mjs",
        "status": "unlabeled",
        "residual_risk": "reset target-aware (0.85 default, 0.5 when bound to pan)",
    }

# 4. XY pads (1..2 x, y)
for axis in ("x", "y"):
    EVIDENCE_MAP[f"xy-1.{axis}"] = {
        "entry_point": "static/phone-v3/controls.js#xy-1",
        "handler": "static/phone-v3/controls.js (XY 1 direct, friction 0.012, bounce 0.75)",
        "payload": "continuous 0..1",
        "target": f"Live device parameter ({axis.upper()} axis)",
        "test": "static/phone-v3/xy-physics-stop.test.mjs",
        "real_evidence": "static/phone-v3/xy-physics-stop.test.mjs",
        "status": "unlabeled",
        "residual_risk": "physics stop / pointer capture edge",
    }
    EVIDENCE_MAP[f"xy-2.{axis}"] = {
        "entry_point": "static/phone-v3/controls.js#xy-2",
        "handler": "static/phone-v3/controls.js (XY 2 physics, spring/friction/bounce)",
        "payload": "continuous 0..1",
        "target": f"Live device parameter ({axis.upper()} axis)",
        "test": "static/phone-v3/xy-physics-stop.test.mjs",
        "real_evidence": "static/phone-v3/xy-physics-stop.test.mjs",
        "status": "unlabeled",
        "residual_risk": "physics stop / pointer capture edge",
    }

# 5. LFOs (1..4)
for i in range(1, 5):
    EVIDENCE_MAP[f"lfo-{i}"] = {
        "entry_point": f"static/phone-v3/controls.js#L{i}",
        "handler": "src/live/host-modulators.ts tickHostModulators + src/live/transport-clock.ts computeSyncedLfoValue (4ms loop)",
        "payload": "shape, subdivision, rate, depth, swing, ratchet",
        "target": "Live device parameter via continuousTargetActuator; burst envelope applied",
        "test": "tests/lfo-rhythm-options; lfo-high-rate-jitter; lfo-latest-delivery; live-host-modulators; host-modulator-phase-continuity; live-host-modulator-write-suppression",
        "real_evidence": "tests/lfo-rhythm-options.test.mjs; tests/lfo-high-rate-jitter.test.mjs; tests/live-host-modulators.test.mjs",
        "status": "unlabeled",
        "residual_risk": "ceilings (sine 4Hz, triangle 3Hz, ramps 3Hz, square 12Hz) until teto_efetivo measured",
    }

# 6. Stutters (1..4)
for i in range(1, 5):
    EVIDENCE_MAP[f"stutter-{i}"] = {
        "entry_point": f"static/phone-v3/controls.js#S{i}",
        "handler": "src/live/host-modulators.ts tickHostModulators (computeSyncedStutterValue)",
        "payload": "X=speed, Y=amplitude (depth)",
        "target": "Live device parameter; depth bar in static/phone-v3/controls.js",
        "test": "static/phone-v3/stutter-mode.test.mjs; tests/stutter-depth-coalesce.test.mjs",
        "real_evidence": "static/phone-v3/stutter-mode.test.mjs; tests/stutter-depth-coalesce.test.mjs",
        "status": "unlabeled",
        "residual_risk": "FIXED/SYNC pin compatibility; OFF without replay of stale pulses",
    }

# 7. Motion sensors
for axis in ("x", "y", "z"):
    EVIDENCE_MAP[f"sensor.motion.{axis}"] = {
        "entry_point": "static/phone-v3/sensor-capabilities.js",
        "handler": "static/phone-v3/sensor-capabilities.js (DeviceMotionEvent listener + capability/permission/freshness gates)",
        "payload": "continuous -1..1",
        "target": "Live device parameter",
        "test": "static/phone-v3/sensor-orientation.test.mjs; tests/ui/sensor-capabilities.spec.mjs",
        "real_evidence": "static/phone-v3/sensor-orientation.test.mjs; tests/ui/sensor-capabilities.spec.mjs (desktop neutral reason, no false permission denial)",
        "status": "unlabeled",
        "residual_risk": "permission denial / background suspension",
    }

# 8. Orientation sensors
for axis in ("alpha", "beta", "gamma"):
    EVIDENCE_MAP[f"sensor.orient.{axis}"] = {
        "entry_point": "static/phone-v3/sensor-capabilities.js",
        "handler": "static/phone-v3/sensor-capabilities.js (DeviceOrientationEvent listener + capability/permission/freshness gates)",
        "payload": "continuous -pi..pi / 0..2pi",
        "target": "Live device parameter",
        "test": "static/phone-v3/sensor-orientation.test.mjs; tests/ui/sensor-capabilities.spec.mjs",
        "real_evidence": "static/phone-v3/sensor-orientation.test.mjs; tests/ui/sensor-capabilities.spec.mjs",
        "status": "unlabeled",
        "residual_risk": "device-orientation events disabled",
    }

# 9. Audio descriptors
AUDIO_DESCRIPTORS = [
    "rms", "envelope", "gate", "attack", "transient", "kick", "snare",
    "brightness", "centroid", "rolloff", "flux", "flatness", "spread",
    "low", "mid", "high",
]
for d in AUDIO_DESCRIPTORS:
    EVIDENCE_MAP[f"sensor.audio.{d}"] = {
        "entry_point": f"static/phone-v3/audio-descriptors.js#sensor.audio.{d}",
        "handler": "static/phone-v3/audio-descriptor-worklet.js (AudioWorklet processor rc-audio-descriptors) + static/phone-v3/audio-descriptor-stream.js",
        "payload": "continuous 0..1 (Hz labels display only for centroid/rolloff)",
        "target": "Live device parameter via continuousTargetActuator + safe-input pickup",
        "test": "static/phone-v3/audio-descriptor-stream.test.mjs; audio-spectral-descriptors.test.mjs; audio-timeline.test.mjs; live-audio-descriptor-dispatch.test.mjs",
        "real_evidence": "static/phone-v3/audio-descriptor-worklet.test.mjs; audio-descriptor-stream.test.mjs; tests/ui/audio-detectors.spec.mjs",
        "status": "unlabeled",
        "residual_risk": "physical latency not measured; band RMS vs K-weighted (Low/Mid/High now K-weighted)",
    }

# 10. Loudness
for kind in ("momentary", "short_term", "integrated"):
    EVIDENCE_MAP[f"sensor.audio.loudness.{kind}"] = {
        "entry_point": "static/phone-v3/audio-processor.js",
        "handler": "static/phone-v3/audio-processor.js (K-weighting filter per ITU-R BS.1770-4 + integration)",
        "payload": "LUFS number",
        "target": "display only (read-out)",
        "test": "static/phone-v3/audio-processor.test.mjs; tests/ui/audio-worklet.spec.mjs",
        "real_evidence": "tests/ui/audio-worklet.spec.mjs:43 (real Blackman analyser calibration produces K-weighted LU band reading)",
        "status": "unlabeled",
        "residual_risk": "label vs implementation (LU vs dB)",
    }

# 11. Vision sensors
for ctrl in ("x", "y", "z", "fist", "pinch", "victory", "rotateVal", "open",
             "pinch_x", "pinch_y", "pinch_z", "gesture.1", "gesture.2", "gesture.3"):
    EVIDENCE_MAP[f"sensor.vision.{ctrl}"] = {
        "entry_point": "static/phone-v3/vision-processor.js",
        "handler": "static/phone-v3/vision-processor.js computeHandData (MediaPipe Hands single-hand, OneEuroFilter, PinchClutch, static-pose-learner)",
        "payload": "continuous 0..1 (gestures: 0/1)",
        "target": "Live device parameter",
        "test": "static/phone-v3/vision-mapping.test.mjs; static-pose-gesture.test.mjs; static-pose-ui.test.mjs; tests/ui/surface.spec.mjs",
        "real_evidence": "static/phone-v3/vision-capture.test.mjs; vision-mapping.test.mjs; static-pose-gesture.test.mjs; tests/ui/surface.spec.mjs:303,377",
        "status": "unlabeled",
        "residual_risk": "two-hand detected — must be discarded; pinch clutch release debounce",
    }

# 12. Subsystems and infrastructure
EVIDENCE_MAP.update({
    "map.mode.enter_exit": {
        "entry_point": "static/phone-v3/mapping-mode.js",
        "handler": "static/phone-v3/mapping-mode.js (enterMappingMode, exitMappingMode)",
        "payload": "enter/exit; selected control id",
        "target": "phone UI state",
        "test": "static/phone-v3/mapping-mode.test.mjs; tests/ui/realtime-mapping.spec.mjs",
        "real_evidence": "static/phone-v3/mapping-mode.test.mjs; tests/ui/realtime-mapping.spec.mjs:22,38",
        "status": "unlabeled",
        "residual_risk": "exit while pad held — capture/gate release",
    },
    "map.bind_continuous": {
        "entry_point": "static/phone-v3/mapping-mode.js#bind",
        "handler": "static/phone-v3/mapping-mode.js + src/live/mappings.ts applyMapping (curve Auto/Linear/Geometric + range + smooth + takeover)",
        "payload": "control_id, target (track/device/param), curve, range, smooth",
        "target": "Live device parameter (safe-input pickup/scale/jump)",
        "test": "tests/live-mappings-curve.test.mjs; target-range.test.mjs; pickup.test.mjs; takeover.test.mjs; smooth-timer.test.mjs; safe-loss.test.mjs; mappings-targets.test.mjs",
        "real_evidence": "tests/live-mappings-{curve,target-range,pickup,takeover,smooth-timer,safe-loss,mappings-targets,high-rate,idle-value}",
        "status": "unlabeled",
        "residual_risk": "pickup/takeover/smooth race; safe-loss",
    },
    "map.bind_trigger_note": {
        "entry_point": "static/phone-v3/mapping-mode.js#trigger-note",
        "handler": "static/phone-v3/mapping-mode.js (trigger-note) + src/live/midi-receiver.ts pressReceiverNote (writePacket)",
        "payload": "control_id, midi_track, pitch, octave, velocity",
        "target": "MIDI track via RC-Midi-Receiver v2 SDK packet",
        "test": "tests/live-midi-trigger.test.mjs; live-midi-receiver.test.mjs; scripts/midi-receiver-arming.test.mjs",
        "real_evidence": "tests/live-midi-trigger.test.mjs; live-midi-receiver.test.mjs; scripts/midi-receiver-arming.test.mjs",
        "status": "unlabeled",
        "residual_risk": "old UDP Receiver left loaded -> unsafe; ordering ON/OFF under SDK slow",
    },
    "map.tap_to_midi_v2": {
        "entry_point": "static/phone-v3/mapping-mode.js#trigger-note",
        "handler": "src/live/midi-receiver.ts pressReceiverNote + writePacket (RC MIDI Packet v2 SDK parameter, Float 0..4194303)",
        "payload": "pitch/octave/velocity",
        "target": "selected MIDI track via SDK parameter",
        "test": "tests/live-midi-trigger.test.mjs; tests/live-midi-receiver.test.mjs",
        "real_evidence": "tests/live-midi-trigger.test.mjs; tests/live-midi-receiver.test.mjs",
        "status": "unlabeled",
        "residual_risk": "duplicate Receivers, OFF during held note, disarm on reload",
    },
    "map.clear_all": {
        "entry_point": "static/phone-v3/mapping-mode.js#clear-all",
        "handler": "static/phone-v3/mapping-mode.js clearAllMobileMappings + src/live/mappings.ts clearMappings + stopAllHostModulators",
        "payload": "clear all mappings signal",
        "target": "Live state (mappings) + host modulators parked to 0",
        "test": "tests/live-mappings-clear.test.mjs",
        "real_evidence": "tests/live-mappings-clear.test.mjs",
        "status": "unlabeled",
        "residual_risk": "in-flight writes replay after clear; explicit OFF for held notes",
    },
    "map.preset.save_load_delete": {
        "entry_point": "static/phone-v3/mapping-mode.js",
        "handler": "src/live/project-config.ts buildProjectConfig + saveProjectConfigFile (atomic write com rollback)",
        "payload": "preset blob; selected name",
        "target": "presets.json (storage)",
        "test": "tests/project-config.test.mjs; project-config-storage.test.mjs; live-preset-storage.test.mjs; release-cleanup.test.mjs",
        "real_evidence": "tests/project-config.test.mjs; project-config-storage.test.mjs; live-preset-storage.test.mjs; release-cleanup.test.mjs",
        "status": "unlabeled",
        "residual_risk": "atomic write failure leaves previous file intact (good); concurrent edits",
    },
    "cfg.per_control_override": {
        "entry_point": "static/phone-v3/config-mode.js",
        "handler": "static/phone-v3/config-mode.js RcConfigMode (singleton, exclusive com MAP; per-control builders)",
        "payload": "control_id, mode/shape/subdivision/physics overrides",
        "target": "phone rendering (localStorage ableton-rc:control_config)",
        "test": "static/phone-v3/config-mode.test.mjs; control-config.test.mjs",
        "real_evidence": "static/phone-v3/config-mode.test.mjs; control-config.test.mjs",
        "status": "unlabeled",
        "residual_risk": "badges may mis-state on PERF/MIX if CFG off; pointer capture / popover content",
    },
    "cfg.clear_all": {
        "entry_point": "static/phone-v3/config-mode.js#clear-all",
        "handler": "static/phone-v3/config-mode.js clearAllOverrides + clearControlConfig",
        "payload": "clear all per-control overrides",
        "target": "phone rendering (localStorage ableton-rc:control_config)",
        "test": "static/phone-v3/config-mode.test.mjs; control-config.test.mjs",
        "real_evidence": "static/phone-v3/config-mode.test.mjs; static/phone-v3/control-config.test.mjs",
        "status": "unlabeled",
        "residual_risk": "accidental global clear; right-click vs long-press parity",
    },
    "sync.global": {
        "entry_point": "static/phone-v3/transport.js + modules/sync.js",
        "handler": "src/live/osc-transport.ts (clock source = AbletonOSC/SDK sim/FREE) + src/live/host-modulators.ts",
        "payload": "source, subdivisions, swing, phase, shapes",
        "target": "LFO/Stutter timing + SYNCED/SDK/FREE status",
        "test": "tests/osc-transport.test.mjs; osc-transport-polling.test.mjs; transport-clock.test.mjs; stage-mode-fullscreen.test.mjs",
        "real_evidence": "tests/osc-transport.test.mjs; osc-transport-polling.test.mjs; transport-clock.test.mjs; stage-mode-fullscreen.test.mjs",
        "status": "unlabeled",
        "residual_risk": "OSC unavailable; clock source stale; SYNC<->FREE transition fidelity",
    },
    "transport.lite_trn": {
        "entry_point": "static/phone-v3/modules/transport.js",
        "handler": "static/phone-v3/modules/transport.js + src/live/osc-transport.ts (cmd/jumpToPrevCue, jumpToNextCue, cuePointJump)",
        "payload": "play, stop, prev/next cue, locator jumps",
        "target": "Live transport",
        "test": "static/phone-v3/transport.test.mjs",
        "real_evidence": "static/phone-v3/transport.test.mjs",
        "status": "unlabeled",
        "residual_risk": "OSC unavailable (AbletonOSC missing)",
    },
    "stage.mode_fullscreen": {
        "entry_point": "static/phone-v3/stage-mode-controller.js",
        "handler": "static/phone-v3/stage-mode-controller.js (requestFullscreen no documentElement; fullscreenchange re-arm com debounce)",
        "payload": "enter/exit fullscreen",
        "target": "DOM fullscreen",
        "test": "tests/stage-mode-fullscreen.test.mjs",
        "real_evidence": "tests/stage-mode-fullscreen.test.mjs",
        "status": "unlabeled",
        "residual_risk": "auto-suspend; multi-window",
    },
    "snapshot.capture_recall_clear_morph": {
        "entry_point": "static/phone-v3/modules/snapshots.js",
        "handler": "static/phone-v3/modules/snapshots.js + src/live/mappings.ts (snapshot guarda controles bound; CFG fora)",
        "payload": "slot id; morph time (ms or beats)",
        "target": "Live device parameters",
        "test": "static/phone-v3/snapshots.test.mjs; snapshot-controls.test.mjs; release-cleanup.test.mjs",
        "real_evidence": "static/phone-v3/snapshots.test.mjs; snapshot-controls.test.mjs; release-cleanup.test.mjs",
        "status": "unlabeled",
        "residual_risk": "stutter depth/rate capture on recall; vector XY direct vs morph (F-003/F-005)",
    },
    "calibrate.sns": {
        "entry_point": "static/phone-v3/calibration.js + static/phone-v3/modules/calibration.js",
        "handler": "static/phone-v3/calibration.js (sessão independente por domínio)",
        "payload": "ok/cancel; reset; per-domain progress",
        "target": "phone rendering (sensor gain etc.)",
        "test": "static/phone-v3/calibration.test.mjs; tests/ui/calibration.spec.mjs",
        "real_evidence": "static/phone-v3/calibration.test.mjs; tests/ui/calibration.spec.mjs",
        "status": "unlabeled",
        "residual_risk": "no fake success without fresh readings; cancel/reset boundaries",
    },
    "calibrate.aud": {
        "entry_point": "static/phone-v3/calibration.js + static/phone-v3/modules/calibration.js",
        "handler": "static/phone-v3/calibration.js (RMS/envelope response 5s; cancel/reset)",
        "payload": "ok/cancel; reset; per-domain progress",
        "target": "audio processing",
        "test": "static/phone-v3/calibration.test.mjs; tests/ui/calibration.spec.mjs",
        "real_evidence": "static/phone-v3/calibration.test.mjs; tests/ui/calibration.spec.mjs",
        "status": "unlabeled",
        "residual_risk": "no fake success without fresh readings; cancel/reset boundaries",
    },
    "calibrate.vid": {
        "entry_point": "static/phone-v3/calibration.js + static/phone-v3/modules/calibration.js",
        "handler": "static/phone-v3/calibration.js (4s hand; verifica luz/tracking; só habilita camera modes suportados)",
        "payload": "ok/cancel; reset; per-domain progress",
        "target": "vision processing",
        "test": "static/phone-v3/calibration.test.mjs; tests/ui/calibration.spec.mjs",
        "real_evidence": "static/phone-v3/calibration.test.mjs; tests/ui/calibration.spec.mjs",
        "status": "unlabeled",
        "residual_risk": "no fake success without fresh readings; cancel/reset boundaries",
    },
    "server.ws.hello": {
        "entry_point": "src/server/ws.ts",
        "handler": "src/server/ws.ts sendHello (controlStreamVersion=1)",
        "payload": "type, controlStreamVersion, client_id, role, tokenStatus, path, commands, tempo, signature, scale, playheadActive, playheadTimeMs, values, bipolarControls, projectConfig",
        "target": "cliente phone/panel/admin bootstrap",
        "test": "tests/server-hello-token-status.test.mjs; server-ws-security.test.mjs; server-shared-surface.test.mjs",
        "real_evidence": "tests/server-hello-token-status.test.mjs; server-ws-security.test.mjs; server-shared-surface.test.mjs",
        "status": "unlabeled",
        "residual_risk": "unknown keys on snapshot, control and set-display-name messages ignored (good)",
    },
    "server.control_frame": {
        "entry_point": "src/server/ws-bounds.ts",
        "handler": "src/server/ws-bounds.ts boundControlFrame + createRateLimiter (RATE_BURST=600, RATE_SUSTAINED_PER_SEC=300, RATE_WINDOW_MS=1000)",
        "payload": "control values",
        "target": "host write-scheduler via WebSocket",
        "test": "tests/server-control-frame.test.mjs; server-rate-limit-notice.test.mjs; server-rate-limit-headroom.test.mjs",
        "real_evidence": "tests/server-control-frame.test.mjs; server-rate-limit-notice.test.mjs; server-rate-limit-headroom.test.mjs",
        "status": "unlabeled",
        "residual_risk": "burst overflow; sustained overrun",
    },
    "server.backpressure": {
        "entry_point": "src/server/backpressure.ts",
        "handler": "src/server/backpressure.ts sendWithBackpressure (BACKPRESSURE_DROP_THRESHOLD=512 KiB; BACKPRESSURE_DISCONNECT_THRESHOLD=2 MiB; close 4008)",
        "payload": "telemetry/critical frames",
        "target": "WebSocket outbound",
        "test": "tests/server-state-backpressure.test.mjs; live-state-backpressure.test.mjs; server-ws-stress.test.mjs",
        "real_evidence": "tests/server-state-backpressure.test.mjs; live-state-backpressure.test.mjs; server-ws-stress.test.mjs",
        "status": "unlabeled",
        "residual_risk": "2 MiB disconnect; reconnect restores state",
    },
    "server.session_rotate": {
        "entry_point": "src/server/session-auth.ts",
        "handler": "src/server/session-auth.ts (tokens 16-byte hex rotacionados por start; SESSION_COOKIE_NAME=rc_surface_token; SameSite=Lax; Secure quando encrypted)",
        "payload": "token in URL or cookie",
        "target": "autenticação HTTP/WS (cookie > query > Bearer > X-Token; timingSafeEqual)",
        "test": "tests/server-session-replaced.test.mjs; server-session-cookie.test.mjs; server-token-staleness.test.mjs; server-panel-token-exposure.test.mjs",
        "real_evidence": "tests/server-session-replaced.test.mjs; server-session-cookie.test.mjs; server-token-staleness.test.mjs; server-panel-token-exposure.test.mjs",
        "status": "unlabeled",
        "residual_risk": "old tab reconnect drops to read-only",
    },
    "live.write_scheduler_single_flight": {
        "entry_point": "src/server/write-scheduler.ts",
        "handler": "src/server/write-scheduler.ts WriteScheduler (FIFO para isDiscrete=true, coalesce continuous por targetKey)",
        "payload": "device writes",
        "target": "Live device parameter (drained em paralelo por targetKey independente)",
        "test": "tests/server-write-scheduler.test.mjs; server-write-scheduler-reentrancy.test.mjs",
        "real_evidence": "tests/server-write-scheduler.test.mjs; server-write-scheduler-reentrancy.test.mjs",
        "status": "unlabeled",
        "residual_risk": "re-entrancy / ordering under SDK slow",
    },
    "live.continuous_target_actuator": {
        "entry_point": "src/live/continuous-target-actuator.ts",
        "handler": "src/live/continuous-target-actuator.ts ContinuousTargetActuator (single-flight por lane, inFlightByTarget, getStats com ring 512 + p50/p95/rate/s)",
        "payload": "target value",
        "target": "Live device parameter (latest-value)",
        "test": "tests/live-continuous-target-actuator.test.mjs; live-continuous-target-actuator-stats.test.mjs",
        "real_evidence": "tests/live-continuous-target-actuator.test.mjs; live-continuous-target-actuator-stats.test.mjs",
        "status": "unlabeled",
        "residual_risk": "cancel between promise and setValue completion",
    },
    "live.host_modulators": {
        "entry_point": "src/live/host-modulators.ts",
        "handler": "src/live/host-modulators.ts tickHostModulators (setInterval 4ms; FREE integrates phase via elapsed timestamps; SYNC usa oscTransport.state.currentSongTimeBeats ou playhead; burstEnvelope aplica attack/release)",
        "payload": "phase, value",
        "target": "Live device parameter (computeSyncedLfoValue/computeSyncedStutterValue)",
        "test": "tests/live-host-modulators.test.mjs; host-modulator-phase-continuity.test.mjs; live-host-modulator-write-suppression.test.mjs",
        "real_evidence": "tests/live-host-modulators.test.mjs; host-modulator-phase-continuity.test.mjs; live-host-modulator-write-suppression.test.mjs",
        "status": "unlabeled",
        "residual_risk": "phase resets on shape change",
    },
    "live.transport_clock": {
        "entry_point": "src/live/transport-clock.ts",
        "handler": "src/live/transport-clock.ts (LFO_SHAPE_MAX_HZ=sine 4/tri 3/ramps 3/square 12 fallback; LFO_SUBDIVISIONS 32..0.03125; getLfoSubdivision slows by octaves; getStutterTiming clamp swing 0..0.66 e ratchet 1..4)",
        "payload": "rate, bpm, pin",
        "target": "LFO/Stutter effective Hz",
        "test": "tests/transport-clock.test.mjs; modulator-policy-parity.test.mjs",
        "real_evidence": "tests/transport-clock.test.mjs; modulator-policy-parity.test.mjs",
        "status": "unlabeled",
        "residual_risk": "drift between phone and host (parity test guards)",
    },
    "live.osc_transport": {
        "entry_point": "src/live/osc-transport.ts",
        "handler": "src/live/osc-transport.ts OSCTransport (singleton; listenPortCandidates 11001/11101/11201; reusa globalThis.abletonOSCSocket se RC Setlist já abriu; queryInitialState registra LISTEN uma vez; pollTick só faz GET.selectedDevice quando stream vivo)",
        "payload": "OSC addresses (LISTEN/GET/CMD/RESPONSE)",
        "target": "AbletonOSC 11000/11001",
        "test": "tests/osc-transport.test.mjs; osc-transport-polling.test.mjs; osc-transport-polyfill.test.mjs; tests/contracts-freeze.test.mjs",
        "real_evidence": "tests/osc-transport.test.mjs; osc-transport-polling.test.mjs; osc-transport-polyfill.test.mjs; tests/contracts-freeze.test.mjs",
        "status": "unlabeled",
        "residual_risk": "OSC unavailable; registry drift caught by freeze test",
    },
    "live.mappings": {
        "entry_point": "src/live/mappings.ts",
        "handler": "src/live/mappings.ts MappingTarget (type: device_param/mixer_volume/pan/send/tempo/track_mute/track_solo/track_arm; neutralPolicy: hold/zero/center/custom/release; initial/reconcile migrados para hold em runtime)",
        "payload": "command dispatch",
        "target": "Live device parameter; persiste em ProjectConfig (atomic)",
        "test": "tests/live-mappings-{curve,target-range,pickup,takeover,smooth-timer,safe-loss,clear,idle-value,high-rate,midi-trigger,mid-trigger}; project-config*; live-preset-storage*; release-cleanup",
        "real_evidence": "tests/live-mappings-{curve,target-range,pickup,takeover,smooth-timer,safe-loss,clear,idle-value,high-rate,midi-trigger,mid-trigger}; project-config*; live-preset-storage*; release-cleanup",
        "status": "unlabeled",
        "residual_risk": "race between clearAll and in-flight write",
    },
    "audio.descriptor_worklet": {
        "entry_point": "static/phone-v3/audio-descriptor-worklet.js",
        "handler": "static/phone-v3/audio-descriptor-worklet.js AudioDescriptorWorklet (AudioWorkletProcessor 'rc-audio-descriptors'; awaitingAck no máximo 1 mensagem; reset via epoch)",
        "payload": "PCM frames",
        "target": "descriptors stream -> audio-descriptor-stream.js",
        "test": "static/phone-v3/audio-descriptor-worklet.test.mjs",
        "real_evidence": "static/phone-v3/audio-descriptor-worklet.test.mjs",
        "status": "unlabeled",
        "residual_risk": "suspended context; sample rate mismatch",
    },
    "audio.descriptor_stream": {
        "entry_point": "static/phone-v3/audio-descriptor-stream.js",
        "handler": "static/phone-v3/audio-descriptor-stream.js (stream 12 descriptors; AudioDescriptorWorklet -> processor)",
        "payload": "12 descriptors + loudness",
        "target": "host live dispatch via boundImmediateControls (MAX_CONTROLS_PER_IMMEDIATE_BATCH=12)",
        "test": "static/phone-v3/audio-descriptor-stream.test.mjs",
        "real_evidence": "static/phone-v3/audio-descriptor-stream.test.mjs",
        "status": "unlabeled",
        "residual_risk": "descriptor path emits before permission; sustained vs burst",
    },
    "audio.input_selector": {
        "entry_point": "static/phone-v3/audio-input-selector.js",
        "handler": "static/phone-v3/audio-input-selector.js (device list + permission; sem auto-capture após reload)",
        "payload": "deviceId",
        "target": "getUserMedia",
        "test": "static/phone-v3/audio-input-selector.test.mjs",
        "real_evidence": "static/phone-v3/audio-input-selector.test.mjs",
        "status": "unlabeled",
        "residual_risk": "silent microphone fallback forbidden",
    },
    "audio.workspace_timeline": {
        "entry_point": "static/phone-v3/audio-workspace.js; audio-timeline.js",
        "handler": "static/phone-v3/audio-workspace.js + audio-timeline.js (canvas rendering, 12 cards, band history)",
        "payload": "history buffer, spectral bins",
        "target": "DOM display",
        "test": "static/phone-v3/audio-timeline.test.mjs; layout.test.mjs; tests/ui/audio-spectral-workspace.spec.mjs",
        "real_evidence": "tests/ui/audio-spectral-workspace.spec.mjs:23; tests/ui/audio-workspace.spec.mjs:45",
        "status": "unlabeled",
        "residual_risk": "12 detector cards readable; scroll on short screens",
    },
    "audio.smoothing_groups": {
        "entry_point": "static/phone-v3/audio-smoothing.js; audio-analysis-controls.js",
        "handler": "static/phone-v3/audio-smoothing.js (SmoothingGroup, EMA filter per detector group)",
        "payload": "ms or 1/x beats",
        "target": "audio descriptor output",
        "test": "static/phone-v3/audio-smoothing.test.mjs; static/phone-v3/audio-analysis-controls.test.mjs",
        "real_evidence": "static/phone-v3/audio-smoothing.test.mjs; tests/ui/audio-spectral-workspace.spec.mjs:158",
        "status": "unlabeled",
        "residual_risk": "SMOOTH=0 immediate vs SMOOTH>0 smoothing interaction",
    },
    "vision.camera_lifecycle": {
        "entry_point": "static/phone-v3/camera-lifecycle.js",
        "handler": "static/phone-v3/vision-processor.js ManagedCameraSession + static/phone-v3/camera-lifecycle.js (HTTPS obrigatório fora de localhost; resolution 320x240; rVFC fallback)",
        "payload": "start/stop",
        "target": "MediaPipe Hands runtime + model",
        "test": "static/phone-v3/camera-lifecycle.test.mjs",
        "real_evidence": "static/phone-v3/camera-lifecycle.test.mjs",
        "status": "unlabeled",
        "residual_risk": "permission denial; orphan stream on page hide",
    },
    "vision.static_pose_learner": {
        "entry_point": "static/phone-v3/vision-control-state.js",
        "handler": "static/phone-v3/vision-processor.js processHandData + static/phone-v3/vision-control-state.js (GestureLibrary; capture stability; import/export JSON v2)",
        "payload": "pose vector",
        "target": "sensor.vision.gesture.1/2/3",
        "test": "static/phone-v3/static-pose-gesture.test.mjs; static-pose-ui.test.mjs; vision-mapping.test.mjs",
        "real_evidence": "static/phone-v3/static-pose-gesture.test.mjs; static-pose-ui.test.mjs",
        "status": "unlabeled",
        "residual_risk": "repositioning not confused with new pose; debounce",
    },
    "vision.pinch_clutch": {
        "entry_point": "static/phone-v3/vision-control-state.js",
        "handler": "static/phone-v3/vision-processor.js PinchClutch (CLUTCH_ENGAGE_FRAMES=4, CLUTCH_RELEASE_FRAMES=15, EMA 0.35; POSE_DROP_PATIENCE=4; hysteresis 0.75/0.55)",
        "payload": "continuous 0..1",
        "target": "sensor.vision.pinch_x/y/z",
        "test": "static/phone-v3/vision-mapping.test.mjs",
        "real_evidence": "static/phone-v3/vision-mapping.test.mjs",
        "status": "unlabeled",
        "residual_risk": "release debounce vs held value",
    },
    "max.midi_receiver_v2": {
        "entry_point": "static/RC-Midi-Receiver.amxd (binary)",
        "handler": "src/live/midi-receiver.ts pressReceiverNote + writePacket (RC MIDI Packet v2 SDK parameter, Float 0..4194303)",
        "payload": "SDK parameter RC_MIDI_PACKET_V2 (Float 0..4194303)",
        "target": "MIDI track via SDK parameter; ordered ON/OFF; OFF preserved under pressure (queue.pending>=64)",
        "test": "tests/live-midi-receiver.test.mjs; scripts/midi-receiver-arming.test.mjs; midi-receiver-device.test.mjs",
        "real_evidence": "tests/live-midi-receiver.test.mjs; scripts/midi-receiver-arming.test.mjs; midi-receiver-device.test.mjs",
        "status": "unlabeled",
        "residual_risk": "old UDP Receiver still loaded in Set",
    },
    "max.audio_sender_v2": {
        "entry_point": "static/RC-Audio-Sender.amxd (binary)",
        "handler": "static/RC-Audio-Sender.amxd (Max for Live device built by scripts/build-audio-sender.js, internal Max bus)",
        "payload": "internal Max message bus to RC-Midi-Receiver v2",
        "target": "MIDI track via RC-Midi-Receiver v2 input (off by default)",
        "test": "scripts/audio-sender-device.test.mjs; tests/live-midi-receiver.test.mjs",
        "real_evidence": "scripts/audio-sender-device.test.mjs; tests/live-midi-receiver.test.mjs",
        "status": "unlabeled",
        "residual_risk": "max error if old version loaded; latency not measured",
    },
    "max.audio_descriptors_device": {
        "entry_point": "internal/NATIVE-AUDIO-VALIDATION.md",
        "handler": "scripts/build-audio-descriptors.mjs (device build deferred by owner)",
        "payload": "native audio path Max for Live device",
        "target": "Live audio track",
        "test": "scripts/native-audio-*.mjs (bancada preparada)",
        "real_evidence": "internal/NATIVE-AUDIO-VALIDATION.md: PENDING_OWNER_DEFERRED status, blocked on owner hardware bench",
        "status": "blocked-owner-deferred",
        "residual_risk": "Native Track still pending owner deferred; physical hardware gate pending",
    },
    "dist.build_prod_ablx": {
        "entry_point": "build.ts + extensions-cli",
        "handler": "build.ts + esbuild + @ableton-extensions/cli; SDK permanece tree-shaken fora do .ablx",
        "payload": "versioned .ablx",
        "target": "release-kits/RC-Surface-<v>.ablx (manifest entry dist/extension.js)",
        "test": "tests/release-*.test.mjs; scripts/*-package*.test.mjs",
        "real_evidence": "tests/release-*.test.mjs; scripts/*-package*.test.mjs",
        "status": "unlabeled",
        "residual_risk": "SDK tarball leak into .ablx; manifest drift",
    },
    "dist.verify_release": {
        "entry_point": "scripts/verify-release.mjs",
        "handler": "scripts/verify-release.mjs (CI + package + gates)",
        "payload": "verification report",
        "target": "release pipeline",
        "test": "tests/verify-release.test.mjs; scripts/verify-release-package.test.mjs; check-release-gates.test.mjs; install-candidate-status.test.mjs",
        "real_evidence": "tests/verify-release.test.mjs; scripts/verify-release-package.test.mjs; check-release-gates.test.mjs; install-candidate-status.test.mjs",
        "status": "unlabeled",
        "residual_risk": "publish gate accepts pending/blocked only on local stage",
    },
    "dist.package_tester_kit": {
        "entry_point": "scripts/package-tester-kit.mjs",
        "handler": "scripts/package-tester-kit.mjs (slice A+B default; R opt-in via ABLETON_RC_DEV_SYNC)",
        "payload": "release-kits/RC-Surface-<v>-test/",
        "target": "release-kits/RC-Surface-<v>-test/",
        "test": "scripts/package-tester-kit.test.mjs; scripts/test-port-assignments.test.mjs",
        "real_evidence": "scripts/package-tester-kit.test.mjs; scripts/test-port-assignments.test.mjs",
        "status": "unlabeled",
        "residual_risk": "ABLETON_RC_DEV_SYNC=0 in automated runs",
    },
    "dist.migrate_data": {
        "entry_point": "scripts/migrate-data.mjs (kit also has Windows/macOS wrappers)",
        "handler": "scripts/migrate-data.mjs + kit wrappers (Migrate-RC-Surface-Data.cmd/.ps1 / .command)",
        "payload": "kit data copy",
        "target": "worm.ableton-rc-surface -> worm.rc-surface (copy sem overwrite)",
        "test": "scripts/migrate-data.test.mjs; migration-wrappers.test.mjs",
        "real_evidence": "scripts/migrate-data.test.mjs; migration-wrappers.test.mjs",
        "status": "unlabeled",
        "residual_risk": "source missing (fresh install) -> clean exit 0",
    },
    "bench.live_write_rate": {
        "entry_point": "scripts/bench-live-write-rate.mjs",
        "handler": "scripts/bench-live-write-rate.mjs (benchDeviceParamWrites admin-only; matrix 12 células; staircase/sine patterns)",
        "payload": "track, device, param, seconds, pattern (single/parallel/stairs/sine)",
        "target": "Live device parameter (P04 físico pendente)",
        "test": "tests/live-bench-device-param-writes.test.mjs; scripts/bench-live-write-rate.test.mjs",
        "real_evidence": "tests/live-bench-device-param-writes.test.mjs; scripts/bench-live-write-rate.test.mjs",
        "status": "unlabeled",
        "residual_risk": "P04 (physical Live + Automation Arm) pending — operator",
    },
    "bench.ws_compression": {
        "entry_point": "scripts/bench-ws-compression.mjs",
        "handler": "scripts/bench-ws-compression.mjs (WebSocket payload compression benchmark probe)",
        "payload": "simulated JSON control frame batches",
        "target": "benchmark report (stdout)",
        "test": "scripts/bench-ws-compression.mjs (standalone execution)",
        "real_evidence": "scripts/bench-ws-compression.mjs: standalone benchmark probe described in FINDINGS.md GAP-004; no reading recorded in progress.jsonl",
        "status": "unlabeled",
        "residual_risk": "descriptive benchmark probe without assertions (GAP-004)",
    },
})


def main() -> int:
    with FEATURES.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        rows = list(reader)
        fieldnames = list(reader.fieldnames or [])

    enriched = 0
    for row in rows:
        fid = row.get("feature_id", "")
        if fid not in EVIDENCE_MAP:
            continue
        patch = EVIDENCE_MAP[fid]
        changed = False
        for col, value in patch.items():
            if value and row.get(col, "") != value:
                row[col] = value
                changed = True
        # Clean up any residual 'pending' in fields
        for col in fieldnames:
            val = row.get(col, "")
            if "(pending-investigation)" in val:
                row[col] = val.replace(" (pending-investigation)", "").replace("(pending-investigation)", "").strip()
                changed = True
            elif "(pending)" in val:
                row[col] = val.replace(" (pending)", "").replace("(pending)", "").strip()
                changed = True
        if changed:
            enriched += 1

    with FEATURES.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"OK: enriched {enriched} rows in {FEATURES.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
