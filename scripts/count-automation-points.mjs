// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// count-automation-points — count the automation points a Live set stored.
//
// A Live set (.als) is gzip-compressed XML. The script reads the envelope of
// one device parameter and counts the points Live actually wrote: the count
// is made on the saved file, not on the screen.
//
//   node scripts/count-automation-points.mjs <set.als> --device-class StereoGain --param Gain
//   node scripts/count-automation-points.mjs <set.als> --pointee 22207 --window 34.66:54.66 --json out.json
//
// Envelope times are Live's musical beats. A window is given in beats and
// selects the events whose time is in [from, to); --bpm turns beats into
// seconds for the per-second breakdown and the per-second rates. The script
// never writes to the set: the only file it can write is the --json path.

import { gunzipSync } from "node:zlib";
import { readFileSync, realpathSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { argv } from "node:process";

const HELP = `count-automation-points — count the automation points a Live set stored

Usage:
  node scripts/count-automation-points.mjs <set.als> [options]

Selection (one of):
  --device-class <class>   class of the device that owns the parameter
  --param <name>           parameter tag that holds the AutomationTarget
  --pointee <id>           envelope PointeeId, selected directly

Options:
  --window <from:to>       window in beats, repeatable (e.g. 34.66:54.66)
  --bpm <n>                set tempo in BPM (default 120)
  --json <path>            write the report as JSON to <path>
  --help, -h               print this help`;

// Every bad input raises this: the CLI turns it into a message and exit 2.
class UsageError extends Error {}

// One setter per option keeps parseArgs below the complexity ceiling.
const FLAGS = new Map([
  ["--device-class", (args, value) => { args.deviceClass = value; }],
  ["--param", (args, value) => { args.param = value; }],
  ["--pointee", (args, value) => { args.pointee = Number(value); }],
  ["--window", (args, value) => { args.windows.push(parseWindow(value)); }],
  ["--bpm", (args, value) => { args.bpm = Number(value); }],
  ["--json", (args, value) => { args.json = value; }],
]);

/** Parse one "from:to" window, in beats. */
export function parseWindow(text) {
  const parts = String(text ?? "").split(":");
  if (parts.length !== 2) throw new UsageError(`--window expects from:to in beats, got: ${text}`);
  const from = Number(parts[0]);
  const to = Number(parts[1]);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw new UsageError(`--window expects numeric beats, got: ${text}`);
  }
  if (to <= from) throw new UsageError(`--window end must be after the start, got: ${text}`);
  return { from, to };
}

/** Parse the command line. */
export function parseArgs(argvList) {
  const args = {
    file: null, deviceClass: null, param: null, pointee: null,
    windows: [], bpm: 120, json: null, help: false,
  };
  for (let i = 0; i < argvList.length; i += 1) {
    const token = argvList[i];
    const setter = FLAGS.get(token);
    if (setter) {
      setter(args, argvList[++i]);
      continue;
    }
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token.startsWith("-")) throw new UsageError(`unknown option: ${token}`);
    if (args.file === null) {
      args.file = token;
      continue;
    }
    throw new UsageError(`unexpected argument: ${token}`);
  }
  return args;
}

// A tag with quoted attributes only: enough for the Live set XML.
const TAG_RE = /<(\/?)([A-Za-z_][A-Za-z0-9_.:-]*)((?:\s+[A-Za-z_][A-Za-z0-9_.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g;

/** Read one attribute of a tag; null when the tag has no such attribute. */
function attribute(attrs, name) {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  if (!match) return null;
  return match[1] ?? match[2] ?? null;
}

/** Scan the XML of a Live set: the parameters with a target, the envelopes. */
export function scanSet(xml) {
  const state = { stack: [], targets: [], envelopes: [], envelope: null };
  const re = new RegExp(TAG_RE.source, "g");
  let match;
  while ((match = re.exec(xml)) !== null) {
    const [, slash, name, attrs, selfClose] = match;
    if (slash === "/") closeTag(state, name);
    else openTag(state, name, attrs ?? "", selfClose === "/");
  }
  return { targets: state.targets, envelopes: state.envelopes };
}

function openTag(state, name, attrs, selfClosing) {
  if (name === "AutomationEnvelope") {
    state.envelope = { pointee: null, events: [] };
  } else if (name === "AutomationTarget") {
    state.targets.push(describeTarget(state, attrs));
  } else if (name === "PointeeId" && state.envelope) {
    state.envelope.pointee = Number(attribute(attrs, "Value"));
  } else if (name === "FloatEvent" && state.envelope) {
    const time = Number(attribute(attrs, "Time"));
    state.envelope.events.push({ time, value: Number(attribute(attrs, "Value")) });
  }
  if (!selfClosing) state.stack.push({ name, className: attribute(attrs, "Class") });
}

function closeTag(state, name) {
  if (name === "AutomationEnvelope" && state.envelope) {
    state.envelopes.push(state.envelope);
    state.envelope = null;
  }
  state.stack.pop();
}

// A parameter is the tag that holds the AutomationTarget (Gain, Volume, ...).
function describeTarget(state, attrs) {
  const parent = state.stack.length ? state.stack[state.stack.length - 1] : null;
  return {
    id: attribute(attrs, "Id"),
    param: parent ? parent.name : null,
    deviceClass: deviceClassOf(state.stack),
  };
}

// The devices that enclose the parameter. In a Live set a device is an
// element named after its class (<StereoGain>, <Eq8>, ...); some sets also
// carry a Class attribute. Both forms are kept, innermost first.
function deviceClassOf(stack) {
  const names = [];
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    names.push(stack[i].name.toLowerCase());
    if (stack[i].className) names.push(stack[i].className.toLowerCase());
  }
  return names;
}

/** Pick the envelope to count: by PointeeId, or by parameter and class. */
export function selectEnvelope(set, args) {
  const byPointee = args.pointee !== null;
  const pointee = byPointee ? args.pointee : pointeeOfParam(set, args);
  const envelope = set.envelopes.find((c) => c.pointee === pointee);
  if (!envelope) {
    const what = byPointee
      ? `no automation envelope with PointeeId ${pointee} in the set`
      : `no automation envelope for parameter ${args.param} (PointeeId ${pointee})`;
    throw new UsageError(what);
  }
  const mode = byPointee ? "pointee" : "param";
  return { envelope, selection: { mode, param: args.param, deviceClass: args.deviceClass, pointee } };
}

/** The AutomationTarget id of the parameter named on the command line. */
function pointeeOfParam(set, args) {
  if (!args.param) {
    throw new UsageError("select the envelope with --pointee <id> or --param <name>");
  }
  const target = set.targets.find((c) => matchesSelection(c, args));
  if (!target) {
    const scope = args.deviceClass ? ` in device class ${args.deviceClass}` : "";
    throw new UsageError(`no parameter ${args.param}${scope} with an AutomationTarget in the set`);
  }
  return Number(target.id);
}

function matchesSelection(target, args) {
  const sameParam = String(target.param ?? "").toLowerCase() === args.param.toLowerCase();
  if (!args.deviceClass) return sameParam;
  return sameParam && target.deviceClass.includes(args.deviceClass.toLowerCase());
}

/** Count the points of one envelope: in total, per window and per second. */
export function summarize(envelope, windows, bpm) {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new UsageError("--bpm expects a positive tempo");
  }
  const secondsPerBeat = 60 / bpm;
  const times = envelope.events
    .map((event) => event.time)
    .filter((time) => Number.isFinite(time) && time >= 0);
  return {
    total: totalOf(times, secondsPerBeat),
    windows: windows.map((window) => windowOf(times, window, secondsPerBeat)),
    perSecond: perSecondOf(times, secondsPerBeat),
  };
}

function totalOf(times, secondsPerBeat) {
  let first = Infinity;
  let last = -Infinity;
  for (const time of times) {
    if (time < first) first = time;
    if (time > last) last = time;
  }
  if (!times.length) {
    first = 0;
    last = 0;
  }
  return {
    events: times.length,
    distinctTimes: new Set(times).size,
    firstTime: first,
    lastTime: last,
    firstSecond: round(first * secondsPerBeat, 3),
    lastSecond: round(last * secondsPerBeat, 3),
    durationSeconds: round((last - first) * secondsPerBeat, 3),
  };
}

// A window is half open: an event belongs to it when from <= time < to.
function windowOf(times, window, secondsPerBeat) {
  const inside = times.filter((time) => time >= window.from && time < window.to);
  const distinctTimes = new Set(inside).size;
  const duration = (window.to - window.from) * secondsPerBeat;
  return {
    from: window.from,
    to: window.to,
    fromSeconds: round(window.from * secondsPerBeat, 3),
    toSeconds: round(window.to * secondsPerBeat, 3),
    durationSeconds: round(duration, 3),
    events: inside.length,
    distinctTimes,
    eventsPerSecond: round(inside.length / duration, 2),
    pointsPerSecond: round(distinctTimes / duration, 2),
    distinctPerEvent: inside.length ? round(distinctTimes / inside.length, 3) : 0,
  };
}

function perSecondOf(times, secondsPerBeat) {
  const buckets = new Map();
  for (const time of times) {
    const second = Math.floor(time * secondsPerBeat);
    const bucket = buckets.get(second) ?? { second, events: 0, times: new Set() };
    bucket.events += 1;
    bucket.times.add(time);
    buckets.set(second, bucket);
  }
  return [...buckets.values()]
    .sort((a, b) => a.second - b.second)
    .map((bucket) => ({ second: bucket.second, events: bucket.events, distinctTimes: bucket.times.size }));
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Render the report as text. */
export function formatReport(report) {
  const { selection, total } = report;
  const scope = selection.deviceClass ? ` (device class ${selection.deviceClass})` : "";
  const label = selection.mode === "pointee"
    ? `pointee ${selection.pointee}`
    : `parameter ${selection.param}${scope}`;
  return [
    `pointee: ${selection.pointee}`,
    `selection: ${label}`,
    `bpm: ${report.bpm}`,
    "",
    "total",
    `  events: ${total.events}`,
    `  distinct times: ${total.distinctTimes}`,
    `  span: ${total.firstSecond.toFixed(3)} s .. ${total.lastSecond.toFixed(3)} s`,
    "",
    "windows",
    ...report.windows.map(formatWindow),
    "",
    "per second",
    "  second  events  distinct",
    ...report.perSecond.map((bucket) => [
      String(bucket.second).padStart(6),
      String(bucket.events).padStart(6),
      String(bucket.distinctTimes).padStart(8),
    ].join("  ")),
  ].join("\n");
}

function formatWindow(window) {
  const span = `${window.fromSeconds.toFixed(3)} s .. ${window.toSeconds.toFixed(3)} s`;
  return [
    `  ${window.from}..${window.to} beats (${span})`,
    `    events: ${window.events}`,
    `    distinct times: ${window.distinctTimes}`,
    `    events/s: ${window.eventsPerSecond.toFixed(2)}`,
    `    points/s: ${window.pointsPerSecond.toFixed(2)}`,
    `    distinct per event: ${window.distinctPerEvent.toFixed(3)}`,
  ].join("\n");
}

/** Count the points of the set selected by the parsed arguments. */
export function countFromArgs(args) {
  const set = scanSet(readSet(args.file));
  const { envelope, selection } = selectEnvelope(set, args);
  const summary = summarize(envelope, args.windows, args.bpm);
  return { file: args.file, bpm: args.bpm, selection, ...summary };
}

function readSet(filePath) {
  if (!filePath) throw new UsageError("missing the Live set path (see --help)");
  try {
    return gunzipSync(readFileSync(filePath)).toString("utf8");
  } catch (err) {
    throw new UsageError(`cannot read ${filePath} as a gzip-compressed Live set: ${err.message}`);
  }
}

function fail(err, code) {
  console.error(`count-automation-points: ${err.message}`);
  process.exitCode = code;
}

function main() {
  let args;
  try {
    args = parseArgs(argv.slice(2));
  } catch (err) {
    fail(err, 2);
    return;
  }
  if (args.help) {
    console.error(HELP);
    return;
  }
  try {
    const report = countFromArgs(args);
    console.log(formatReport(report));
    if (args.json) {
      mkdirSync(dirname(args.json), { recursive: true });
      writeFileSync(args.json, JSON.stringify(report, null, 2));
    }
  } catch (err) {
    fail(err, err instanceof UsageError ? 2 : 1);
  }
}

// Both sides go through realpath: on macOS the temp folder is a symlink and
// the module URL already points at the real path.
const isMain = process.argv[1] !== undefined
  && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]));
if (isMain) main();
