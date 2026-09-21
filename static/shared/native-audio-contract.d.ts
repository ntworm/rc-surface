// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Side-effect IIFE at runtime. These are types, not additional JS exports.
export type Descriptor = 'transient' | 'kick' | 'snare' | 'brightness' | 'centroid' |
  'rolloff' | 'flux' | 'flatness' | 'spread' | 'low' | 'mid' | 'high';
export type Values = Record<Descriptor, number>;
export type TrackRef = { kind: 'track' | 'return' | 'master'; index: number };
export type SourceBinding = { bindingId: string; instanceId: string; deviceId: string;
  track: TrackRef; deviceIndex: number; catalogGeneration: number };
export type SourceSelection = { kind: 'browser' } | { kind: 'track'; track: TrackRef;
  deviceIndex?: number; bindingId?: string };
export type SourceList = { tracks: Array<{ track: TrackRef; name: string;
  devices: Array<{ deviceIndex: number; compatible: boolean; bindingId?: string; code?: string }> }>;
  bindings: SourceBinding[] };
export type TargetRef = { track: TrackRef; deviceIndex: number | null;
  kind: 'device-param' | 'volume' | 'pan' | 'send'; parameterIndex: number;
  catalogGeneration: number; fingerprint: string };
export type TargetCapability = { target: TargetRef;
  modulationKind: 'bipolar' | 'unipolar' | 'unknown'; remoteSupported: boolean };
export type Slot = { slot: number; descriptor: Descriptor; target: TargetRef;
  mode: 'modulate' | 'remote'; amount: number; min: number; max: number; enabled: boolean };
export type Settings = { sensitivity: number; releaseMs: number; curve: number; window: 1 | 2 | 4;
  toneMs: number; textureMs: number; bandsMs: number; attacksGain: number;
  toneGain: number; textureGain: number; bandsGain: number; releaseBeats: number;
  toneBeats: number; textureBeats: number; bandsBeats: number; syncMode: 'free' | 'sync' };
export type DeviceSnapshot = { instanceId: string; deviceId: string; revision: number;
  enabled: boolean; settings: Settings; slots: Slot[]; bpm: number;
  tempoAvailable: boolean; profile: 'native-fast-v1'; needsRelink: boolean };
export type Frame = { version: 1; hostEpoch: string; instanceId: string; seq: number;
  captureSample: number; sampleRate: number; signalVectorSize: number; fftSize: number;
  hopSize: number; configRevision: number; enabled: boolean; dspRunning: boolean;
  spectralReady: boolean; values: Values; amplitude: { rms: number; envelope: number };
  peaks: { transient: number; kick: number; snare: number } };
export type ConfigChange = { kind: 'settings'; patch: Partial<Settings> } |
  { kind: 'enabled'; enabled: boolean } | { kind: 'prepare-slot'; slot: Slot } |
  { kind: 'commit-slot'; preparedId: string } | { kind: 'remove-slot'; slot: number };
export type DeviceCommand = { version: 1; commandId: string; hostEpoch: string;
  instanceId: string; expectedRevision: number; change: ConfigChange };
export type DeviceAck = { commandId: string; ok: boolean; code: string;
  snapshot: DeviceSnapshot; preparedId?: string };
export type Exchange = { version: 1; hostEpoch: string; instanceId: string;
  pairNonce?: number; frame?: Frame; snapshot?: DeviceSnapshot; ack?: DeviceAck };
export type ExchangeReply = { version: 1; hostEpoch: string; acceptedSeq: number | null;
  telemetryHz: 1 | 30; command?: DeviceCommand };
export type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
export interface NativeAudioContractAPI {
  readonly VERSION: 1;
  readonly DESCRIPTORS: readonly Descriptor[];
  validateFrame(input: unknown): Immutable<Frame>;
  validateExchange(input: unknown): Immutable<Exchange>;
  validateChange(input: unknown): Immutable<ConfigChange>;
}
declare global {
  const NativeAudioContract: NativeAudioContractAPI;
}
