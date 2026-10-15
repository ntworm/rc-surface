// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0

/**
 * osc-tokens.ts — Canonical registry of OSC addresses the host sends.
 *
 * Every OSC address Surface emits lives here as a typed constant. The
 * server imports these directly; tests/contracts-freeze.test.mjs asserts
 * that the addresses sent by osc-transport.ts match this registry exactly,
 * so a typo in either place trips the test instead of producing a silent
 * no-op against Live.
 *
 * The phone side does not talk OSC directly — it talks WebSocket and the
 * server translates. The host-side address space is therefore the single
 * source of truth for the OSC contract.
 */

// ── listener registrations (push from Live) ──────────────────────────────────

export const LISTEN = {
  isPlaying:           "/live/song/start_listen/is_playing",
  tempo:               "/live/song/start_listen/tempo",
  metronome:           "/live/song/start_listen/metronome",
  signatureNumerator:  "/live/song/start_listen/signature_numerator",
  signatureDenominator:"/live/song/start_listen/signature_denominator",
  currentSongTime:     "/live/song/start_listen/current_song_time",
  beat:                "/live/song/start_listen/beat",
  selectedTrack:       "/live/view/start_listen/selected_track",
} as const;

// ── poll/heartbeat getters ──────────────────────────────────────────────────

export const GET = {
  cuePoints:           "/live/song/get/cue_points",
  selectedDevice:      "/live/view/get/selected_device",
  tempo:               "/live/song/get/tempo",
  isPlaying:           "/live/song/get/is_playing",
  metronome:           "/live/song/get/metronome",
  selectedTrack:       "/live/view/get/selected_track",
  currentSongTime:     "/live/song/get/current_song_time",
} as const;

// ── transport commands ──────────────────────────────────────────────────────

export const CMD = {
  startPlaying:        "/live/song/start_playing",
  stopPlaying:         "/live/song/stop_playing",
  jumpToPrevCue:       "/live/song/jump_to_prev_cue",
  jumpToNextCue:       "/live/song/jump_to_next_cue",
  cuePointJump:        "/live/song/cue_point/jump",
} as const;

// Arrangement REC transport only. These do not select/arm tracks or prove
// audio capture: record_mode may include count-in, punch or an unarmed Set.
export const REC = {
  listenRecordMode: "/live/song/start_listen/record_mode",
  getRecordMode:    "/live/song/get/record_mode",
  setRecordMode:    "/live/song/set/record_mode",
  setSongTime:      "/live/song/set/current_song_time",
  setMetronome:     "/live/song/set/metronome",
} as const;

// Explicit marker-region recording. Song loop is the global Arrangement loop.
export const REC_LOOP = {
  getStart: '/live/song/get/loop_start',
  getLength: '/live/song/get/loop_length',
  setStart: '/live/song/set/loop_start',
  setLength: '/live/song/set/loop_length',
  setEnabled: '/live/song/set/loop',
} as const;

// Native punch-in owns the recording boundary during explicit REC pre-roll.
export const REC_PREROLL = {
  setPunchIn: '/live/song/set/punch_in',
} as const;

// Read-only Arrangement preflight. Unsupported/missing reports stay unknown.
export const REC_PREFLIGHT = {
  loop: "/live/song/get/loop",
  punchIn: "/live/song/get/punch_in",
  punchOut: "/live/song/get/punch_out",
  overdub: "/live/song/get/arrangement_overdub",
  backToArranger: "/live/song/get/back_to_arranger",
  sessionRecord: "/live/song/get/session_record",
  trackArm: "/live/track/get/arm",
  trackCanArm: "/live/track/get/can_be_armed",
  trackMonitor: "/live/track/get/current_monitoring_state",
  signatureNumerator: "/live/song/get/signature_numerator",
  signatureDenominator: "/live/song/get/signature_denominator",
} as const;

// ── Launch Clip ────────────────────────────────────────────────────────────
//
// AbletonOSC addresses clips and tracks by index. Launch Clip only fires,
// stops and observes. D11 permits only an explicit Song global quantization
// write; no clip/track setters or per-launch override. Launches carry no
// extra argument, which leaves their effective quantization to Live.

export const CLIP = {
  fireSlot:                 "/live/clip_slot/fire",
  stopTrack:                "/live/track/stop_all_clips",
  listenFiredSlot:          "/live/track/start_listen/fired_slot_index",
  unlistenFiredSlot:        "/live/track/stop_listen/fired_slot_index",
  listenPlayingSlot:        "/live/track/start_listen/playing_slot_index",
  unlistenPlayingSlot:      "/live/track/stop_listen/playing_slot_index",
  listenPlayingPosition:    "/live/clip/start_listen/playing_position",
  unlistenPlayingPosition:  "/live/clip/stop_listen/playing_position",
  getLaunchQuantization:    "/live/clip/get/launch_quantization",
  getLaunchMode:            "/live/clip/get/launch_mode",
  getLegato:                "/live/clip/get/legato",
  listenGlobalQuantization: "/live/song/start_listen/clip_trigger_quantization",
  getGlobalQuantization:    "/live/song/get/clip_trigger_quantization",
  // D11: the only Launch Clip property setter, explicit GLOBAL Set action.
  setGlobalQuantization:    "/live/song/set/clip_trigger_quantization",
  getTrackNames:            "/live/song/get/track_names",
} as const;

// ── incoming response addresses ────────────────────────────────────────────

export const CLIP_RESPONSE = {
  firedSlot:           "/live/track/get/fired_slot_index",
  playingSlot:         "/live/track/get/playing_slot_index",
  playingPosition:     "/live/clip/get/playing_position",
  launchQuantization:  "/live/clip/get/launch_quantization",
  launchMode:          "/live/clip/get/launch_mode",
  legato:              "/live/clip/get/legato",
  globalQuantization:  "/live/song/get/clip_trigger_quantization",
  trackNames:          "/live/song/get/track_names",
} as const;

export const RESPONSE = {
  tempo:               "/live/song/get/tempo",
  isPlaying:           "/live/song/get/is_playing",
  currentSongTime:     "/live/song/get/current_song_time",
  metronome:           "/live/song/get/metronome",
  signatureNumerator:  "/live/song/get/signature_numerator",
  signatureDenominator:"/live/song/get/signature_denominator",
  beat:                "/live/song/get/beat",
  cuePoints:           "/live/song/get/cue_points",
  selectedTrack:       "/live/view/get/selected_track",
  selectedDevice:      "/live/view/get/selected_device",
} as const;

export const LISTENER_QUIET_MS = 1_500;

export type OscAddress =
  | typeof LISTEN[keyof typeof LISTEN]
  | typeof GET[keyof typeof GET]
  | typeof CMD[keyof typeof CMD]
  | typeof CLIP[keyof typeof CLIP]
  | typeof CLIP_RESPONSE[keyof typeof CLIP_RESPONSE]
  | typeof RESPONSE[keyof typeof RESPONSE];
