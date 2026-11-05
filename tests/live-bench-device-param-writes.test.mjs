// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from "node:test";
import assert from "node:assert/strict";

import { clearExtensionContext, setExtensionContext } from "../src/context.ts";
import { commands } from "../src/live/mappings.ts";

/**
 * A fake DeviceParameter whose setValue resolves after a configurable delay.
 * Records every applied value so tests can assert on the staircase or sine
 * pattern that the bench produced. It also counts the writes in flight, which
 * is how the parallel cap is proven.
 */
function makeParam({ min = 0, max = 1, isQuantized = false, delayMs = 15 } = {}) {
  let value = min + (max - min) / 2;
  const writes = [];
  const state = { pending: 0, maxPending: 0 };
  const getValue = async () => value;
  const setValue = async (next) => {
    writes.push(next);
    state.pending += 1;
    if (state.pending > state.maxPending) state.maxPending = state.pending;
    try {
      if (delayMs > 0) await new Promise((done) => setTimeout(done, delayMs));
      value = next;
    } finally {
      state.pending -= 1;
    }
  };
  return {
    min,
    max,
    isQuantized,
    name: "Fake Param",
    getValue,
    setValue,
    writes,
    state,
  };
}

function installContext(param) {
  setExtensionContext({
    application: {
      song: {
        tempo: 120,
        tracks: [
          {
            devices: [
              { parameters: [param] },
            ],
          },
        ],
      },
    },
  });
}

/**
 * Measures how long a bare setTimeout(delayMs) actually takes on this host
 * right now. `npm test` runs one process per file in parallel, and under CPU
 * contention Windows stretches a 15 ms timer to 24-29 ms. The single-mode
 * meanMs assertion below is calibrated against this measurement so the test
 * rejects a slow handler without rejecting a slow host.
 */
async function measureHostTimerMs(delayMs = 15, samples = 20) {
  const started = performance.now();
  for (let i = 0; i < samples; i += 1) {
    await new Promise((done) => setTimeout(done, delayMs));
  }
  return (performance.now() - started) / samples;
}

/**
 * Lets the promise microtask queue drain. The mocked clock only advances
 * timers, but every `await` in the handler resumes in a microtask.
 */
async function flushMicrotasks(count) {
  for (let i = 0; i < count; i += 1) {
    await Promise.resolve();
  }
}

/**
 * Drives the mocked clock forward until the bench promise settles.
 *
 * `mock.timers.tick()` is synchronous, so every step is followed by a few
 * microtask flushes: the handler resumes only after the awaited `setValue`
 * promise settles, and that is a promise continuation, not a timer. The pump
 * is bounded, so a handler that never settles fails instead of hanging.
 */
async function pumpUntilSettled(mock, promise, { steps = 2000, flushes = 8 } = {}) {
  const state = { settled: false, value: undefined, error: undefined };
  promise.then(
    (value) => {
      state.settled = true;
      state.value = value;
    },
    (error) => {
      state.settled = true;
      state.error = error;
    },
  );
  for (let step = 0; step < steps && !state.settled; step += 1) {
    mock.tick(1);
    await flushMicrotasks(flushes);
  }
  await flushMicrotasks(flushes);
  assert.ok(state.settled, "bench handler did not settle within the bounded pump");
  if (state.error) throw state.error;
  return state.value;
}

/** Runs the real bench handler against the mocked clock and drains it. */
async function runBenchOnVirtualClock(mock, options) {
  const promise = commands.benchDeviceParamWrites.handler({
    trackIndex: 0,
    deviceIndex: 0,
    paramIndex: 0,
    seconds: 1,
    ...options,
  });
  return pumpUntilSettled(mock, promise);
}

test("benchDeviceParamWrites rejects missing or out-of-range seconds", async () => {
  const param = makeParam({ delayMs: 0 });
  installContext(param);
  try {
    await assert.rejects(
      commands.benchDeviceParamWrites.handler({ trackIndex: 0, deviceIndex: 0, paramIndex: 0 }),
      /seconds must be an integer in 1\.\.30/,
    );
    await assert.rejects(
      commands.benchDeviceParamWrites.handler({ trackIndex: 0, deviceIndex: 0, paramIndex: 0, seconds: 31 }),
      /seconds must be an integer in 1\.\.30/,
    );
    await assert.rejects(
      commands.benchDeviceParamWrites.handler({ trackIndex: 0, deviceIndex: 0, paramIndex: 0, seconds: 0 }),
      /seconds must be an integer in 1\.\.30/,
    );
    await assert.rejects(
      commands.benchDeviceParamWrites.handler({ trackIndex: 0, deviceIndex: 0, paramIndex: 0, seconds: 1.5 }),
      /seconds must be an integer in 1\.\.30/,
    );
  } finally {
    clearExtensionContext();
  }
});

test("benchDeviceParamWrites rejects quantized parameters", async () => {
  const param = makeParam({ delayMs: 0, isQuantized: true });
  installContext(param);
  try {
    await assert.rejects(
      commands.benchDeviceParamWrites.handler({
        trackIndex: 0, deviceIndex: 0, paramIndex: 0, seconds: 1, mode: "single",
      }),
      /quantized/,
    );
  } finally {
    clearExtensionContext();
  }
});

test("benchDeviceParamWrites single mode: each setValue completes with the natural SDK latency", async (t) => {
  const param = makeParam({ delayMs: 15 });
  installContext(param);
  try {
    const hostMs = await measureHostTimerMs();
    const result = await commands.benchDeviceParamWrites.handler({
      trackIndex: 0, deviceIndex: 0, paramIndex: 0,
      seconds: 1, mode: "single", pattern: "stairs",
    });
    // Single mode without sleep: every write awaits its predecessor.
    // 1 second with ~15 ms per setValue → ~65 completions.
    // Lower bound relaxed to 20: o piso existe para pegar um sleep acidental
    // no handler (sleep(50) dá cerca de 16 completions) e não para medir o
    // timer do host sob carga concorrente. Upper bound 75 stays tight so a
    // regression in the handler is still caught.
    assert.ok(result.completed >= 20 && result.completed <= 75,
      `expected ~65 completions, got ${result.completed}`);
    assert.equal(result.started, result.completed);
    assert.equal(result.failed, 0);
    assert.equal(result.mode, "single");
    assert.equal(result.pattern, "stairs");
    // meanMs should be near the fake SDK latency (15 ms). Upper bound calibrated
    // against measured bare timer latency: Windows timer jitter under parallel
    // test load inflates setTimeout(15) to 24-29 ms. A quiet host keeps the
    // baseline ceiling at 28 ms, expanding only when hostMs proves the host is slow.
    const meanCeiling = Math.max(28, hostMs + 10);
    assert.ok(result.meanMs >= 14 && result.meanMs <= meanCeiling,
      `expected meanMs 14..${meanCeiling.toFixed(2)} (hostMs ${hostMs.toFixed(2)}), got ${result.meanMs}`);
    t.diagnostic(`single mode: hostMs=${hostMs.toFixed(2)} meanMs=${result.meanMs.toFixed(2)} ceiling=${meanCeiling.toFixed(2)} completed=${result.completed}`);
    // The staircase cycles through 4 distinct levels (0.2..0.8 of range).
    // Every write must differ from its predecessor so the Live automation
    // recorder registers each one as a new point.
    for (let i = 1; i < param.writes.length; i += 1) {
      assert.notEqual(param.writes[i], param.writes[i - 1],
        `stairs[${i}] must differ from previous`);
    }
    // Initial value restored at the end.
    const restored = await param.getValue();
    assert.ok(restored >= 0 && restored <= 1);
  } finally {
    clearExtensionContext();
  }
});

test("benchDeviceParamWrites parallel mode: beats single on a virtual clock without skipping ticks", async (t) => {
  // The handler measures its one second window with Date.now() and paces the
  // parallel writes with setInterval, so mocking setTimeout, setInterval and
  // Date makes the comparison deterministic. performance.now() stays real,
  // therefore no real-latency field is asserted here.
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1_000_000 });
  const singleParam = makeParam({ delayMs: 15 });
  const parallelParam = makeParam({ delayMs: 15 });
  try {
    installContext(singleParam);
    const single = await runBenchOnVirtualClock(t.mock.timers, { mode: "single" });
    clearExtensionContext();

    installContext(parallelParam);
    const original = await parallelParam.getValue();
    const parallel = await runBenchOnVirtualClock(t.mock.timers, {
      mode: "parallel", parallel: 4, intervalMs: 5,
    });

    // Parallel mode overlaps four writes at a time, so it must beat the
    // serial single mode on the very same virtual timeline.
    assert.ok(parallel.completed > single.completed,
      `parallel (${parallel.completed}) must beat single (${single.completed}) on the virtual clock`);
    assert.equal(single.mode, "single");
    assert.equal(single.failed, 0);
    assert.equal(single.started, single.completed + single.failed);
    assert.equal(singleParam.state.pending, 0, "the single run must have drained every write");
    assert.equal(parallel.mode, "parallel");
    assert.equal(parallel.parallel, 4);
    assert.equal(parallel.failed, 0);
    assert.equal(parallel.started, parallel.completed + parallel.failed);
    // intervalMs=5 with delayMs=15 keeps the bench below the cap of four,
    // so no tick may be skipped.
    assert.equal(parallel.skipped, 0,
      `parallel with intervalMs=5 and delayMs=15 must not skip; got ${parallel.skipped} skips`);
    // The cap of four is proven by the fake device: never more than four
    // writes in flight, and more than one so the mode really overlapped.
    assert.ok(parallelParam.state.maxPending <= 4,
      `cap of 4 exceeded: max ${parallelParam.state.maxPending} writes in flight`);
    assert.ok(parallelParam.state.maxPending > 1,
      `parallel mode must overlap writes; max ${parallelParam.state.maxPending} in flight`);
    assert.equal(parallelParam.state.pending, 0, "every write must have drained before the handler returned");
    // The last applied write restores the original value of the parameter.
    assert.equal(parallelParam.writes.at(-1), original,
      "the last applied write must restore the original value");
    assert.equal(await parallelParam.getValue(), original,
      "the parameter must end on its original value");
  } finally {
    t.mock.timers.reset();
    clearExtensionContext();
  }
});

test("benchDeviceParamWrites parallel mode: skips ticks once the cap is reached", async (t) => {
  // A cap of two with 50 ms writes and a 5 ms interval cannot keep up: the
  // bench must report the skipped ticks instead of running three writes at once.
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1_000_000 });
  const param = makeParam({ delayMs: 50 });
  try {
    installContext(param);
    const original = await param.getValue();
    const result = await runBenchOnVirtualClock(t.mock.timers, {
      mode: "parallel", parallel: 2, intervalMs: 5,
    });
    assert.equal(result.mode, "parallel");
    assert.equal(result.parallel, 2);
    assert.ok(result.skipped > 0,
      `a cap of 2 with delayMs=50 and intervalMs=5 must skip ticks; got ${result.skipped}`);
    assert.equal(result.failed, 0);
    assert.equal(result.started, result.completed + result.failed);
    assert.ok(param.state.maxPending <= 2,
      `cap of 2 exceeded: max ${param.state.maxPending} writes in flight`);
    assert.equal(param.state.pending, 0, "every write must have drained before the handler returned");
    assert.equal(param.writes.at(-1), original,
      "the last applied write must restore the original value");
    assert.equal(await param.getValue(), original,
      "the parameter must end on its original value");
  } finally {
    t.mock.timers.reset();
    clearExtensionContext();
  }
});

test("benchDeviceParamWrites refuses a second concurrent call", async () => {
  const param = makeParam({ delayMs: 20 });
  installContext(param);
  try {
    // Kick off the first bench without awaiting it, then immediately try a
    // second call. The second must reject because benchInFlight is true.
    const first = commands.benchDeviceParamWrites.handler({
      trackIndex: 0, deviceIndex: 0, paramIndex: 0,
      seconds: 1, mode: "single",
    });
    await assert.rejects(
      commands.benchDeviceParamWrites.handler({
        trackIndex: 0, deviceIndex: 0, paramIndex: 0,
        seconds: 1, mode: "single",
      }),
      /bench already running/,
    );
    await first;
  } finally {
    clearExtensionContext();
  }
});

test("benchDeviceParamWrites rejects invalid mode, pattern, parallel, intervalMs and hz", async () => {
  const param = makeParam({ delayMs: 0 });
  installContext(param);
  try {
    await assert.rejects(
      commands.benchDeviceParamWrites.handler({
        trackIndex: 0, deviceIndex: 0, paramIndex: 0,
        seconds: 1, mode: "turbo",
      }),
      /mode must be 'single' or 'parallel'/,
    );
    await assert.rejects(
      commands.benchDeviceParamWrites.handler({
        trackIndex: 0, deviceIndex: 0, paramIndex: 0,
        seconds: 1, pattern: "saw",
      }),
      /pattern must be 'stairs' or 'sine'/,
    );
    await assert.rejects(
      commands.benchDeviceParamWrites.handler({
        trackIndex: 0, deviceIndex: 0, paramIndex: 0,
        seconds: 1, mode: "parallel", parallel: 3,
      }),
      /parallel must be 2, 4 or 8/,
    );
    // intervalMs is only meaningful in parallel mode; pass parallel=4 so the
    // intervalMs guard is the next thing the handler checks.
    await assert.rejects(
      commands.benchDeviceParamWrites.handler({
        trackIndex: 0, deviceIndex: 0, paramIndex: 0,
        seconds: 1, mode: "parallel", parallel: 4, intervalMs: -1,
      }),
      /intervalMs must be a positive number/,
    );
    await assert.rejects(
      commands.benchDeviceParamWrites.handler({
        trackIndex: 0, deviceIndex: 0, paramIndex: 0,
        seconds: 1, pattern: "sine", hz: 0,
      }),
      /hz must be a positive number/,
    );
  } finally {
    clearExtensionContext();
  }
});

test("benchDeviceParamWrites returns param metadata in the result", async () => {
  const param = makeParam({ delayMs: 0 });
  installContext(param);
  try {
    const result = await commands.benchDeviceParamWrites.handler({
      trackIndex: 0, deviceIndex: 0, paramIndex: 0,
      seconds: 1, mode: "single",
    });
    assert.equal(result.param.name, "Fake Param");
    assert.equal(result.param.min, 0);
    assert.equal(result.param.max, 1);
  } finally {
    clearExtensionContext();
  }
});
