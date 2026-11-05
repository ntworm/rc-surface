// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./modules/recording-range-selection.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(source, context);
const range = context.RcRecordingRange;

// Values built inside the vm realm are compared through a JSON round trip.
const plain = (value) => JSON.parse(JSON.stringify(value));
const assertState = (actual, expected) => assert.deepStrictEqual(plain(actual), expected);

const A = Object.freeze({ name: "A", time: 10 });
const B = Object.freeze({ name: "B", time: 20 });
const C = Object.freeze({ name: "C", time: 30 });
const CATALOG = Object.freeze([A, B, C]);
const withinHostRange = (time) => typeof time === "number" && time >= 0 && time <= 10000000;

const tap = (state, value, markers) =>
  range.updateSelection(state, { type: "tap", value: value }, markers || CATALOG);
const start = (value, markers) =>
  range.updateSelection(range.emptySelection(), { type: "start", value: value }, markers || CATALOG);
const endAt = (state, mode, value) =>
  range.updateSelection(state, { type: "end", mode: mode, value: value }, CATALOG);

test("exposes a frozen global with the three public helpers", () => {
  assert.ok(range);
  assert.equal(Object.isFrozen(range), true);
  assert.deepEqual(Object.keys(range).sort(), ["emptySelection", "resolveSelection", "updateSelection"]);
});

test("emptySelection returns the empty schema", () => {
  assertState(range.emptySelection(), { start: null, endMode: "stop", end: null, editingStart: false });
});

test("tap grammar: the first tap becomes the start", () => {
  const state = tap(range.emptySelection(), A);
  assertState(state, { start: { name: "A", time: 10 }, endMode: "stop", end: null, editingStart: false });
  const resolved = range.resolveSelection(state, CATALOG);
  assert.equal(resolved.valid, true);
  assert.equal(resolved.reason, null);
});

test("tap grammar: a later marker becomes an explicit end", () => {
  const state = tap(tap(range.emptySelection(), A), B);
  assertState(state, {
    start: { name: "A", time: 10 },
    endMode: "marker",
    end: { name: "B", time: 20 },
    editingStart: false
  });
  const resolved = range.resolveSelection(state, CATALOG);
  assert.equal(resolved.valid, true);
  assertState(resolved.end, { name: "B", time: 20 });
});

test("tap grammar: tapping the current start arms start editing", () => {
  const state = tap(tap(range.emptySelection(), A), A);
  assert.equal(state.editingStart, true);
  assertState(state.start, { name: "A", time: 10 });
});

test("tap grammar: an earlier marker becomes the new start", () => {
  const state = tap(tap(range.emptySelection(), B), A);
  assertState(state.start, { name: "A", time: 10 });
  assert.equal(state.endMode, "stop");
  assert.equal(state.end, null);
});

test("tap grammar: a same-time marker with another name is ignored", () => {
  const twin = { name: "Z", time: 10 };
  const catalog = [A, twin, B];
  const before = tap(range.emptySelection(), A, catalog);
  const after = tap(before, twin, catalog);
  assertState(after, plain(before));
  assert.equal(after.editingStart, false);
  assert.equal(after.end, null);
});

test("tap grammar: a marker that is not in the catalog is ignored", () => {
  const state = tap(range.emptySelection(), { name: "X", time: 99 });
  assertState(state, plain(range.emptySelection()));
});

test("tap grammar: an ambiguous duplicate marker is ignored", () => {
  const state = tap(range.emptySelection(), A, [A, { name: "A", time: 10 }, B]);
  assertState(state, plain(range.emptySelection()));
});

test("editing the start past the old end stays invalid instead of recording freely", () => {
  let state = tap(tap(range.emptySelection(), A), B);
  state = tap(state, A);
  assert.equal(state.editingStart, true);
  state = tap(state, C);
  assertState(state.start, { name: "C", time: 30 });
  assert.equal(state.editingStart, false);
  assert.equal(state.endMode, "marker");
  const resolved = range.resolveSelection(state, CATALOG);
  assert.equal(resolved.valid, false);
  assert.equal(resolved.reason, "END_ORDER");
});

test("auto-next resolves the earliest later marker", () => {
  const state = endAt(start(A), "next");
  const resolved = range.resolveSelection(state, CATALOG);
  assert.equal(resolved.valid, true);
  assert.equal(resolved.endMode, "next");
  assertState(resolved.end, { name: "B", time: 20 });
});

test("auto-next follows a new start", () => {
  const state = range.updateSelection(endAt(start(A), "next"), { type: "start", value: B }, CATALOG);
  assertState(range.resolveSelection(state, CATALOG).end, { name: "C", time: 30 });
});

test("auto-next follows an inserted marker and ignores the catalog order", () => {
  const state = endAt(start(A), "next");
  const inserted = [A, { name: "M", time: 15 }, B, C];
  const reordered = [C, { name: "M", time: 15 }, B, A];
  assertState(range.resolveSelection(state, inserted).end, { name: "M", time: 15 });
  assertState(range.resolveSelection(state, reordered).end, { name: "M", time: 15 });
});

test("an explicit end tap leaves the next mode", () => {
  const state = tap(endAt(start(A), "next"), C);
  assert.equal(state.endMode, "marker");
  assertState(state.end, { name: "C", time: 30 });
  const resolved = range.resolveSelection(state, CATALOG);
  assert.equal(resolved.valid, true);
  assertState(resolved.end, { name: "C", time: 30 });
});

test("next is ambiguous when two markers share the earliest later time", () => {
  const catalog = [A, { name: "P", time: 20 }, { name: "Q", time: 20 }, C];
  const resolved = range.resolveSelection(endAt(start(A, catalog), "next"), catalog);
  assert.equal(resolved.valid, false);
  assert.equal(resolved.reason, "END_AMBIGUOUS");
  assert.equal(resolved.end, null);
});

test("next without a later marker is invalid and never falls back to stop", () => {
  const resolved = range.resolveSelection(endAt(start(C), "next"), CATALOG);
  assert.equal(resolved.valid, false);
  assert.equal(resolved.reason, "NO_NEXT");
  assert.equal(resolved.end, null);
  assert.equal(resolved.endMode, "next");
});

test("a removed or renamed marker is reported missing", () => {
  const state = endAt(start(A), "marker", B);
  const removedStart = range.resolveSelection(start(A), [B, C]);
  assert.equal(removedStart.reason, "START_MISSING");
  const renamedStart = range.resolveSelection(start(A), [{ name: "A2", time: 10 }, B, C]);
  assert.equal(renamedStart.reason, "START_MISSING");
  const removedEnd = range.resolveSelection(state, [A, C]);
  assert.equal(removedEnd.reason, "END_MISSING");
});

test("exact duplicate markers make the start and the end ambiguous", () => {
  const startCatalog = [A, { name: "A", time: 10 }, B];
  const endCatalog = [A, B, { name: "B", time: 20 }];
  const startResult = range.resolveSelection(start(A, startCatalog), startCatalog);
  assert.equal(startResult.reason, "START_AMBIGUOUS");
  const endState = endAt(start(A, endCatalog), "marker", B);
  assert.equal(range.resolveSelection(endState, endCatalog).reason, "END_AMBIGUOUS");
});

test("an explicit end before the start is out of order", () => {
  const state = endAt(start(B), "marker", A);
  const resolved = range.resolveSelection(state, CATALOG);
  assert.equal(resolved.valid, false);
  assert.equal(resolved.reason, "END_ORDER");
});

test("a cursor start only needs a valid time", () => {
  const state = start({ source: "cursor", time: 15 });
  assertState(state.start, { source: "cursor", time: 15 });
  const resolved = range.resolveSelection(state, CATALOG);
  assert.equal(resolved.valid, true);
  assert.equal(resolved.end, null);
  assert.deepEqual(Object.keys(plain(resolved.start)), ["source", "time"]);
});

test("a cursor start does not arm start editing on a same-time marker", () => {
  const state = tap(start({ source: "cursor", time: 10 }), A);
  assert.equal(state.editingStart, false);
  assertState(state.start, { source: "cursor", time: 10 });
  assert.equal(state.end, null);
});

test("invalid actions keep the selection unchanged", () => {
  const state = { start: { name: "A", time: 10 }, endMode: "marker", end: { name: "B", time: 20 }, editingStart: false };
  const cases = [
    { type: "nope" },
    { type: "start", value: { name: 7, time: 10 } },
    { type: "start", value: { name: "A", time: -1 } },
    { type: "start", value: { name: "A", time: 10000001 } },
    { type: "start", value: { name: "A", time: 10, extra: 1 } },
    { type: "end", mode: "marker", value: null },
    { type: "end", mode: "marker", value: { name: "B" } },
    { type: "end", mode: "until" },
    { type: "tap", value: { source: "cursor", time: 10 } }
  ];
  for (const action of cases) {
    assertState(range.updateSelection(state, action, CATALOG), plain(state), JSON.stringify(action));
  }
});

test("an invalid or unknown end mode never widens the range to stop", () => {
  const state = { start: { name: "A", time: 10 }, endMode: "marker", end: { name: "B", time: 20 }, editingStart: false };
  const next = range.updateSelection(state, { type: "end", mode: "marker", value: { name: null, time: 20 } }, CATALOG);
  assert.equal(next.endMode, "marker");
  assertState(next, plain(state));
  const unknown = range.resolveSelection({ start: { name: "A", time: 10 }, endMode: "until", end: null }, CATALOG);
  assert.equal(unknown.valid, false);
  assert.equal(unknown.reason, "END_MISSING");
});

test("the start action keeps the end mode and the end", () => {
  const state = range.updateSelection(endAt(start(A), "marker", B), { type: "start", value: A }, CATALOG);
  assert.equal(state.endMode, "marker");
  assertState(state.end, { name: "B", time: 20 });
});

test("refresh keeps the selection by identity", () => {
  const state = tap(tap(range.emptySelection(), A), B);
  assertState(range.updateSelection(state, { type: "refresh" }, CATALOG), plain(state));
});

test("reordering the catalog cannot retarget an explicit end", () => {
  const state = endAt(start(A), "marker", B);
  const resolved = range.resolveSelection(state, [C, B, A]);
  assert.equal(resolved.valid, true);
  assertState(resolved.end, { name: "B", time: 20 });
});

test("frozen inputs are never mutated and references are copied", () => {
  const state = Object.freeze({
    start: Object.freeze({ name: "A", time: 10 }),
    endMode: "next",
    end: null,
    editingStart: false
  });
  const action = Object.freeze({ type: "tap", value: Object.freeze({ name: "B", time: 20 }) });
  const before = JSON.stringify({ state: state, action: action, catalog: CATALOG });
  const next = range.updateSelection(state, action, CATALOG);
  const resolved = range.resolveSelection(next, CATALOG);
  assert.equal(JSON.stringify({ state: state, action: action, catalog: CATALOG }), before);
  assert.notEqual(next, state);
  assert.notEqual(resolved.start, state.start);
  assertState(next.start, { name: "A", time: 10 });
  assertState(resolved.end, { name: "B", time: 20 });
});

test("a valid resolution exposes exactly the host start and end keys", () => {
  const resolved = range.resolveSelection(tap(tap(range.emptySelection(), A), B), CATALOG);
  assert.equal(resolved.valid, true);
  assert.deepEqual(Object.keys(plain(resolved)), ["start", "end", "endMode", "editingStart", "valid", "reason"]);
  assert.deepEqual(Object.keys(plain(resolved.start)), ["name", "time"]);
  assert.deepEqual(Object.keys(plain(resolved.end)), ["name", "time"]);
});

test("an empty marker name is a valid start and end", () => {
  const catalog = [{ name: "", time: 10 }, { name: "", time: 20 }];
  const state = endAt(start(catalog[0]), "marker", catalog[1]);
  const resolved = range.resolveSelection(state, catalog);
  assert.equal(resolved.valid, true);
  assertState(resolved.start, { name: "", time: 10 });
  assertState(resolved.end, { name: "", time: 20 });
});

test("tapping an empty-named marker arms the start", () => {
  const empty = { name: "", time: 10 };
  const state = tap(range.emptySelection(), empty, [empty, B]);
  assertState(state.start, { name: "", time: 10 });
  assert.equal(state.endMode, "stop");
  assert.equal(state.end, null);
});

test("auto-next skips catalog entries outside the host time range", () => {
  const catalog = [A, { name: "neg", time: -1 }, { name: "big", time: 10000001 }, B];
  const noisy = catalog.concat([{ name: "nan", time: NaN }, { name: "inf", time: Infinity }]);
  const resolved = range.resolveSelection(endAt(start(A, catalog), "next"), noisy);
  assert.equal(resolved.valid, true);
  assertState(resolved.end, { name: "B", time: 20 });
  assert.equal(withinHostRange(resolved.start.time), true);
  assert.equal(withinHostRange(resolved.end.time), true);
});

test("auto-next has no next when only unusable entries follow the start", () => {
  const catalog = [A, { name: "big", time: 10000001 }, { name: "nan", time: NaN }, { name: "inf", time: Infinity }];
  const resolved = range.resolveSelection(endAt(start(A, catalog), "next"), catalog);
  assert.equal(resolved.valid, false);
  assert.equal(resolved.reason, "NO_NEXT");
  assert.equal(resolved.end, null);
  assert.equal(resolved.endMode, "next");
});
