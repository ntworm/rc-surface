// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
export const MIDI_PACKET_PARAMETER = "RC MIDI Packet v2";
export const MIDI_PACKET_MAX = 4194303;

interface PacketParameter {
  name: string;
  min: number;
  max: number;
  isQuantized: boolean;
  setValue(value: number): Promise<void>;
}
interface ReceiverDevice { name: string; parameters: PacketParameter[] }
type ReceiverCheck = { device: ReceiverDevice; parameter: PacketParameter; reason?: never }
  | { device?: never; parameter?: never; reason: "receiver_missing" | "receiver_upgrade_required" | "receiver_ambiguous" };

/** A versioned parameter, not a name or track index alone, proves capability. */
export function findMidiReceiver(track: { devices: ReceiverDevice[] } | undefined): ReceiverCheck {
  const devices = track?.devices ?? [];
  const named = devices.filter(device => /^RC-Midi-Receiver(?:\.amxd)?$/.test(device.name));
  const matches = devices.flatMap(device => (device.parameters ?? []).filter(parameter =>
    parameter.name === MIDI_PACKET_PARAMETER && parameter.min === 0
    && parameter.max === MIDI_PACKET_MAX && parameter.isQuantized === false
    && typeof parameter.setValue === "function").map(parameter => ({ device, parameter })));
  if (matches.length > 1 || (matches.length === 1 && named.some(device => device !== matches[0]?.device))) {
    return { reason: "receiver_ambiguous" };
  }
  return matches[0] ?? { reason: named.length ? "receiver_upgrade_required" : "receiver_missing" };
}

// SDK objects are registry-cached per handle/session. A weak key never retargets
// a pending OFF when tracks move, and does not retain deleted Set objects.
const queues = new WeakMap<PacketParameter, { tail: Promise<unknown>; pending: number; sequence: number }>();
function writePacket(parameter: PacketParameter, note: number, velocity: number,
  allowed: () => boolean): Promise<boolean> {
  let queue = queues.get(parameter);
  if (!queue) {
    queue = { tail: Promise.resolve(), pending: 0, sequence: 0 };
    queues.set(parameter, queue);
  }
  // Reserve release capability: reject new ONs under pressure, never an OFF.
  if (velocity > 0 && queue.pending >= 64) return Promise.resolve(false);
  queue.pending++;
  const state = queue;
  const result = state.tail.then(async () => {
    if (!allowed()) return false;
    state.sequence = state.sequence % 255 + 1;
    // <2^22: exact integer in Max's single precision normalized parameter path.
    // Sequence makes repeated equal notes distinct; zero is startup/no command.
    await parameter.setValue(state.sequence * 16384 + note * 128 + velocity);
    return true;
  });
  state.tail = result.catch(() => {}).finally(() => { state.pending--; });
  return result;
}

export interface HeldMidiNote { started: Promise<boolean>; release(): Promise<void> }
export function pressReceiverNote(track: { devices: ReceiverDevice[] } | undefined,
  note: number, velocity: number, isCurrent: () => boolean): HeldMidiNote {
  const receiver = findMidiReceiver(track);
  if (receiver.reason) throw new Error(receiver.reason);
  const pitch = Math.max(0, Math.min(127, Math.round(note)));
  const strength = Math.max(1, Math.min(127, Math.round(velocity)));
  if (!Number.isFinite(pitch) || !Number.isFinite(strength)) throw new Error("Invalid MIDI note");
  let released = false;
  let sent = false;
  let releasing: Promise<void> | undefined;
  const started = writePacket(receiver.parameter, pitch, strength, () => !released && isCurrent())
    .then(didSend => { sent = didSend; return didSend; });
  return {
    started,
    release() {
      released = true;
      // Reserve OFF now, before later gestures. The queue waits for the ON's
      // acknowledgement; a cancelled unsent ON needs no corresponding OFF.
      releasing ??= writePacket(receiver.parameter, pitch, 0, () => sent).then(() => {});
      return releasing;
    },
  };
}

const NOTE_OFFSETS: Record<string, number> = {
  "C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5,
  "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11
};

export function noteNameToMidiNumber(name: string | number | undefined | null): number {
  if (name === undefined || name === null) return 60; // Default C3
  if (typeof name === "number") {
    return Math.max(0, Math.min(127, Math.round(name)));
  }
  const cleaned = name.trim().toUpperCase();
  if (/^\d+$/.test(cleaned)) {
    return Math.max(0, Math.min(127, parseInt(cleaned, 10)));
  }
  const match = cleaned.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return 60;
  const pitch = match[1];
  const octaveStr = match[2];
  if (!pitch || !octaveStr) return 60;
  const octave = parseInt(octaveStr, 10);
  const offset = NOTE_OFFSETS[pitch] ?? 0;
  return Math.max(0, Math.min(127, (octave + 2) * 12 + offset));
}
