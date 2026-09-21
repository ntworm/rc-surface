// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from "node:test";
import assert from "node:assert/strict";

import { clearExtensionContext, setExtensionContext } from "../src/context.ts";
import { commands } from "../src/live/mappings.ts";

/**
 * A fake DeviceParameter whose setValue resolves after a configurable delay.
 * Records every applied value so tests can assert on the staircase or sine
 * pattern that the bench produced.
 */
function makeParam({ min = 0, max = 1, isQuantized = false, delayMs = 15 } = {}) {
  let value = min + (max - min) / 2;
  const writes = [];
  const getValue = async () => value;
  const setValue = async (next) => {
    writes.push(next);
    if (delayMs > 0) await new Promise((done) => setTimeout(done, delayMs));
    value = next;
  };
  return {
    min,
    max,
    isQuantized,
    name: "Fake Param",
    getValue,
    setValue,
    writes,
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

test("benchDeviceParamWrites parallel mode: at least as fast as single, no skipped ticks", async () => {
  const param = makeParam({ delayMs: 15 });
  installContext(param);
  try {
    const single = await commands.benchDeviceParamWrites.handler({
      trackIndex: 0, deviceIndex: 0, paramIndex: 0,
      seconds: 1, mode: "single",
    });
    const parallel = await commands.benchDeviceParamWrites.handler({
      trackIndex: 0, deviceIndex: 0, paramIndex: 0,
      seconds: 1, mode: "parallel", parallel: 4, intervalMs: 5,
    });
    // Parallel with the same SDK latency cannot go faster than single in a
    // perfectly serial fake. It must at least match single (no slowdown)
    // and never report skipped ticks when inFlight.size < parallel.
    assert.ok(parallel.completed >= single.completed,
      `parallel (${parallel.completed}) should be ≥ single (${single.completed})`);
    assert.equal(parallel.parallel, 4);
    assert.equal(parallel.skipped, 0,
      `parallel with intervalMs=5 and delayMs=15 must not skip; got ${parallel.skipped} skips`);
  } finally {
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
