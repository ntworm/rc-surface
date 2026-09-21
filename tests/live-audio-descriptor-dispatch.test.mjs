// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from "node:test";
import assert from "node:assert/strict";
import { applyMapping, controlMappings, handleClientDisconnect, lastMappedInputAt,
  lastMappedValues, safeInputRegistry } from "../src/live/mappings.ts";
import { continuousTargetActuator } from "../src/live/continuous-target-actuator.ts";
import { globalWriteScheduler } from "../src/server/write-scheduler.ts";
import { clearExtensionContext, setExtensionContext } from "../src/context.ts";

async function drainMicrotasks() {
  for (let turn = 0; turn < 30; turn += 1) await Promise.resolve();
}

function fixture() {
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const writes = [[], []];
  const concurrent = [0, 0];
  const maxConcurrent = [0, 0];
  const parameters = writes.map((log, index) => ({
    name: "Parameter", min: 0, max: 1, isQuantized: false,
    getValue: async () => 0.75,
    setValue: async (value) => {
      concurrent[index] += 1;
      maxConcurrent[index] = Math.max(maxConcurrent[index], concurrent[index]);
      log.push(value);
      if (index === 0 && log.length === 1) await blocked;
      concurrent[index] -= 1;
    },
  }));
  setExtensionContext({ application: { song: {
    tempo: 120, tracks: [{ devices: [{ parameters }] }], returnTracks: [], mainTrack: { devices: [] },
  } } });
  return { writes, maxConcurrent, release };
}

function cleanup() {
  continuousTargetActuator.stop();
  globalWriteScheduler.clear();
  controlMappings.clear();
  lastMappedInputAt.clear();
  lastMappedValues.clear();
  safeInputRegistry.clear();
  clearExtensionContext();
}

const target = (paramIndex = 0) => ({
  type: "device_param", trackIndex: 0, deviceIndex: 0, paramIndex,
});

test("slow audio pulses coalesce by physical target and disconnect supersedes the tail", async () => {
  for (const control of ["sensor.audio.transient", "sensor.audio.kick", "sensor.audio.snare"]) {
    const f = fixture();
    controlMappings.set(control, [target()]);
    controlMappings.set("button-1", [target(1)]);
    let first;
    try {
      first = applyMapping("audio-slow", control, 1);
      await drainMicrotasks();
      for (const value of [0.8, 0.6, 0.4, 0.4]) {
        lastMappedInputAt.set("audio-slow::" + control, Date.now() - 33);
        await applyMapping("audio-slow", control, value);
      }
      const button = applyMapping("other-client", "button-1", 0.25);
      await drainMicrotasks();
      assert.deepEqual(f.writes[1], [0.25], control + " must not starve independent discrete targets");
      await button;
      await handleClientDisconnect("audio-slow");
      assert.deepEqual(f.writes[0], [1]);
      f.release(); await first; await drainMicrotasks();
      assert.deepEqual(f.writes[0], [1, 0], control + " must discard obsolete envelope frames");
      assert.equal(f.maxConcurrent[0], 1);
    } finally {
      f.release(); await first; await drainMicrotasks(); cleanup();
    }
  }
});

for (const descriptor of ['brightness', 'centroid', 'flux', 'flatness', 'spread', 'rolloff', 'low', 'mid', 'high']) {
test(descriptor + " batch plus snapshot stays single-flight across clients and applies only the newest value", async () => {
  const f = fixture();
  controlMappings.set("sensor.audio." + descriptor, [{ ...target(), takeoverMode: "jump" }]);
  let first;
  try {
    first = applyMapping("audio-a", "sensor.audio." + descriptor, 0.2);
    await drainMicrotasks();
    for (const [client, value] of [["audio-a", 0.2], ["audio-a", 0.8], ["audio-b", 0.6]]) {
      lastMappedInputAt.set(client + "::sensor.audio." + descriptor, Date.now());
      await applyMapping(client, "sensor.audio." + descriptor, value);
    }
    assert.equal(f.maxConcurrent[0], 1, "the snapshot must not open a second writer");
    assert.deepEqual(f.writes[0], [0.2]);
    f.release(); await first; await drainMicrotasks();
    assert.deepEqual(f.writes[0], [0.2, 0.6]);
  } finally {
    f.release(); await first; await drainMicrotasks(); cleanup();
  }
});
}
