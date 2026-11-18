// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// Tests for count-automation-points: the script reads a gzip-compressed Live
// set, picks one automation envelope and counts the points it holds.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, symlinkSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs, parseWindow, scanSet, selectEnvelope, summarize } from "./count-automation-points.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "count-automation-points.mjs");
const POINTE = 22207;

// A small Live set shaped like a real one: the device is an element named
// after its class (<StereoGain>), one parameter (Gain) and one envelope with
// six points, one of them before the start of the timeline.
const ALS = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton><LiveSet><Tracks><Track>
  <DeviceChain><Devices><StereoGain Id="0">
    <Gain><LomId Value="0" /><AutomationTarget Id="${POINTE}"><LockEnvelope Value="0" /></AutomationTarget></Gain>
  </StereoGain></Devices></DeviceChain>
  <AutomationEnvelopes>
    <AutomationEnvelope Id="1">
      <EnvelopeTarget><PointeeId Value="${POINTE}"/></EnvelopeTarget>
      <FloatEvent Time="-1" Value="0.1"/>
      <FloatEvent Time="0" Value="0.2"/>
      <FloatEvent Time="0.5" Value="0.3"/>
      <FloatEvent Time="0.5" Value="0.4"/>
      <FloatEvent Time="1" Value="0.5"/>
      <FloatEvent Time="2" Value="0.6"/>
    </AutomationEnvelope>
  </AutomationEnvelopes>
</Track></Tracks></LiveSet></Ableton>`;

/** Write the fixture set in a temp dir and run the body against it. */
function withSet(run) {
  const dir = mkdtempSync(join(tmpdir(), "count-automation-points-"));
  const als = join(dir, "set.als");
  writeFileSync(als, gzipSync(Buffer.from(ALS, "utf8")));
  try {
    run({ dir, als });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The envelope of the fixture set, selected by parameter name. */
function fixtureEnvelope() {
  const args = parseArgs(["set.als", "--param", "Gain", "--device-class", "StereoGain"]);
  return selectEnvelope(scanSet(ALS), args).envelope;
}

test("parseArgs reads the file, the selection and the windows", () => {
  const args = parseArgs([
    "set.als", "--device-class", "StereoGain", "--param", "Gain",
    "--window", "34.66:54.66", "--window", "54.66:74.66",
    "--bpm", "128", "--json", "report.json",
  ]);
  assert.equal(args.file, "set.als");
  assert.equal(args.deviceClass, "StereoGain");
  assert.equal(args.param, "Gain");
  assert.equal(args.pointee, null);
  assert.deepEqual(args.windows, [{ from: 34.66, to: 54.66 }, { from: 54.66, to: 74.66 }]);
  assert.equal(args.bpm, 128);
  assert.equal(args.json, "report.json");
  assert.equal(parseArgs(["set.als"]).bpm, 120);
  assert.equal(parseArgs(["set.als", "--pointee", "22207"]).pointee, POINTE);
  assert.equal(parseArgs(["--help"]).help, true);
});

test("parseArgs and parseWindow reject bad input", () => {
  assert.throws(() => parseArgs(["set.als", "--nope"]), /unknown option/);
  assert.throws(() => parseArgs(["a.als", "b.als"]), /unexpected argument/);
  assert.deepEqual(parseWindow("34.66:54.66"), { from: 34.66, to: 54.66 });
  assert.throws(() => parseWindow("1"), /--window expects from:to/);
  assert.throws(() => parseWindow("54.66:34.66"), /end must be after the start/);
  assert.throws(() => summarize(fixtureEnvelope(), [], 0), /--bpm expects a positive tempo/);
});

test("scanSet finds the parameter target and the envelope of the set", () => {
  const set = scanSet(ALS);
  assert.equal(set.targets.length, 1);
  assert.equal(set.targets[0].id, String(POINTE));
  assert.equal(set.targets[0].param, "Gain");
  assert.ok(set.targets[0].deviceClass.includes("stereogain"), "the enclosing device element names the class");
  assert.equal(set.envelopes.length, 1);
  assert.equal(set.envelopes[0].pointee, POINTE);
  assert.equal(set.envelopes[0].events.length, 6);
});

test("selectEnvelope finds the envelope by parameter and by pointee", () => {
  const set = scanSet(ALS);
  const byParam = selectEnvelope(set, parseArgs(["set.als", "--param", "Gain"]));
  assert.equal(byParam.envelope.pointee, POINTE);
  assert.equal(byParam.selection.mode, "param");
  const byPointee = selectEnvelope(set, parseArgs(["set.als", "--pointee", String(POINTE)]));
  assert.equal(byPointee.envelope.pointee, POINTE);
  assert.equal(byPointee.selection.mode, "pointee");
});

test("summarize ignores the negative point and counts the distinct times", () => {
  const report = summarize(fixtureEnvelope(), [], 120);
  assert.equal(report.total.events, 5);
  assert.equal(report.total.distinctTimes, 4);
  assert.equal(report.total.firstTime, 0);
  assert.equal(report.total.lastTime, 2);
  assert.equal(report.total.lastSecond, 1);
});

test("summarize splits the points per window and per second", () => {
  const windows = [parseWindow("0:2"), parseWindow("2:4")];
  const report = summarize(fixtureEnvelope(), windows, 120);
  assert.equal(report.windows[0].events, 4);
  assert.equal(report.windows[0].distinctTimes, 3);
  assert.equal(report.windows[0].durationSeconds, 1);
  assert.equal(report.windows[0].pointsPerSecond, 3);
  assert.equal(report.windows[0].distinctPerEvent, 0.75);
  assert.equal(report.windows[1].events, 1);
  assert.deepEqual(report.perSecond.map((b) => b.events), [4, 1]);
  assert.deepEqual(report.perSecond.map((b) => b.distinctTimes), [3, 1]);
});

test("the CLI counts the points of the set and writes the JSON report", () => {
  withSet(({ dir, als }) => {
    const jsonPath = join(dir, "report.json");
    const out = execFileSync(process.execPath, [
      SCRIPT, als, "--device-class", "StereoGain", "--param", "Gain",
      "--window", "0:2", "--bpm", "120", "--json", jsonPath,
    ], { encoding: "utf8" });
    assert.match(out, /events: 4/);
    assert.match(out, /distinct times: 3/);
    assert.match(out, /points\/s: 3\.00/);
    const report = JSON.parse(readFileSync(jsonPath, "utf8"));
    assert.equal(report.total.events, 5);
    assert.equal(report.total.distinctTimes, 4);
    assert.equal(report.windows[0].events, 4);
    assert.equal(report.selection.pointee, POINTE);
  });
});

test("the CLI writes no file when no --json path is given", () => {
  withSet(({ dir, als }) => {
    const before = readdirSync(dir);
    execFileSync(process.execPath, [SCRIPT, als, "--pointee", String(POINTE)], { encoding: "utf8" });
    assert.deepEqual(readdirSync(dir), before);
  });
});

test("the CLI exits 2 when the parameter or the envelope is missing", () => {
  withSet(({ als }) => {
    const missing = spawnSync(process.execPath, [SCRIPT, als, "--param", "Missing"], { encoding: "utf8" });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /no parameter Missing with an AutomationTarget/);
    const noEnvelope = spawnSync(process.execPath, [SCRIPT, als, "--pointee", "999"], { encoding: "utf8" });
    assert.equal(noEnvelope.status, 2);
    assert.match(noEnvelope.stderr, /no automation envelope with PointeeId 999/);
  });
});

test("the CLI runs as the main module from a path whose URL is encoded", () => {
  withSet(({ dir, als }) => {
    const spaced = join(dir, "dir with space");
    mkdirSync(spaced);
    const copy = join(spaced, "count-automation-points.mjs");
    copyFileSync(SCRIPT, copy);
    const out = execFileSync(process.execPath, [copy, als, "--pointee", String(POINTE)], { encoding: "utf8" });
    assert.match(out, /events: 5/);
  });
});

test("the CLI runs as the main module when invoked through a linked folder", () => {
  withSet(({ dir, als }) => {
    const real = join(dir, "real");
    mkdirSync(real);
    copyFileSync(SCRIPT, join(real, "count-automation-points.mjs"));
    const linked = join(dir, "linked");
    symlinkSync(real, linked, process.platform === "win32" ? "junction" : "dir");
    const out = execFileSync(process.execPath, [
      join(linked, "count-automation-points.mjs"), als, "--pointee", String(POINTE),
    ], { encoding: "utf8" });
    assert.match(out, /events: 5/);
  });
});
