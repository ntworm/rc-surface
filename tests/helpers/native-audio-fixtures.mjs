// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Deliberately independent of the production decoder/catalogue.
export const ids = Object.freeze({
  instance: '11111111-1111-4111-8111-111111111111',
  device: '22222222-2222-4222-8222-222222222222',
  epoch: '33333333-3333-4333-8333-333333333333',
  binding: '44444444-4444-4444-8444-444444444444',
  command: '55555555-5555-4555-8555-555555555555',
});
export function makeFrame(patch = {}) {
  return {
    version: 1, hostEpoch: ids.epoch, instanceId: ids.instance, seq: 1,
    captureSample: 1024, sampleRate: 48000, signalVectorSize: 64,
    fftSize: 2048, hopSize: 1024, configRevision: 1, enabled: true,
    dspRunning: true, spectralReady: true,
    values: { transient: 0, kick: 0, snare: 0, brightness: 0, centroid: 0,
      rolloff: 0, flux: 0, flatness: 0, spread: 0, low: 0, mid: 0, high: 0 },
    amplitude: { rms: 0, envelope: 0 }, peaks: { transient: 0, kick: 0, snare: 0 }, ...patch,
  };
}
export function makeSnapshot(patch = {}) {
  return {
    instanceId: ids.instance, deviceId: ids.device, revision: 1, enabled: false,
    settings: { sensitivity: .65, releaseMs: 45, curve: 1, window: 2,
      toneMs: 0, textureMs: 0, bandsMs: 0, attacksGain: 1, toneGain: 1,
      textureGain: 1, bandsGain: 1, releaseBeats: .125,
      toneBeats: 0, textureBeats: 0, bandsBeats: 0, syncMode: 'free' },
    slots: [], bpm: 120, tempoAvailable: true, profile: 'native-fast-v1', needsRelink: false, ...patch,
  };
}
export function makeBinding(patch = {}) {
  return { bindingId: ids.binding, instanceId: ids.instance, deviceId: ids.device,
    track: { kind: 'track', index: 0 }, deviceIndex: 0, catalogGeneration: 1, ...patch };
}
export function makeSlot(patch = {}) {
  return { slot: 0, descriptor: 'transient',
    target: { track: { kind: 'track', index: 0 }, deviceIndex: 1,
      kind: 'device-param', parameterIndex: 0, catalogGeneration: 1, fingerprint: 'a'.repeat(64) },
    mode: 'remote', amount: 1, min: 0, max: 1, enabled: false, ...patch };
}
export function makeExchange(patch = {}) {
  return { version: 1, hostEpoch: ids.epoch, instanceId: ids.instance,
    frame: makeFrame(), ...patch };
}
