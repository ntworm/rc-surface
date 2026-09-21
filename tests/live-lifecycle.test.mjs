// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import test from "node:test";
import assert from "node:assert/strict";

// RED: testes de idempotência para os loops start/stop que vão ser criados
// nas Tasks 4 (live/state) e 6 (live/snapshots) e 7 (live/mappings smooth timer).

test("startLiveStateBroadcastLoop starts; calling twice does not duplicate", async () => {
  const mod = await import("../src/live/state.ts");
  const { startLiveStateBroadcastLoop, stopLiveStateBroadcastLoop,
          isLiveStateBroadcastLoopRunning } = mod;
  stopLiveStateBroadcastLoop();  // ensure clean state
  startLiveStateBroadcastLoop();
  startLiveStateBroadcastLoop();
  assert.equal(isLiveStateBroadcastLoopRunning(), true);
  stopLiveStateBroadcastLoop();
  assert.equal(isLiveStateBroadcastLoopRunning(), false);
});

test("stopSmoothTimer is idempotent and observable", async () => {
  const mod = await import("../src/live/mappings.ts");
  const { stopSmoothTimer, isSmoothTimerRunning } = mod;
  stopSmoothTimer();  // ensure clean state
  assert.equal(isSmoothTimerRunning(), false);
  stopSmoothTimer();  // double-stop should not throw
  assert.equal(isSmoothTimerRunning(), false);
});

test("continuous target actuator starts and stops idempotently with the extension lifecycle", async () => {
  const { continuousTargetActuator } = await import("../src/live/continuous-target-actuator.ts");
  continuousTargetActuator.stop();
  assert.equal(continuousTargetActuator.isRunning(), false);
  continuousTargetActuator.start();
  continuousTargetActuator.start();
  assert.equal(continuousTargetActuator.isRunning(), true);
  continuousTargetActuator.stop();
  continuousTargetActuator.stop();
  assert.equal(continuousTargetActuator.isRunning(), false);
});
