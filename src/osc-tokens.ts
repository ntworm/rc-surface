// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
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

// ── incoming response addresses ────────────────────────────────────────────

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
  | typeof RESPONSE[keyof typeof RESPONSE];
