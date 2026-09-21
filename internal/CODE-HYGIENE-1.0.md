# CODE HYGIENE 1.0 — clean audit of the working tree

Build `1.0.0`. An idempotent audit of what is live in `src/` and `static/` of
the r13 worktree (base `701e2ef`) plus the changes that landed in P00–P03.

This document is the artifact behind the P04 acceptance line: "removals
justified by negative consumer proof, useful current comments on sensitive
contracts, lint and TypeScript maintain the new guards without blanket
suppressions". It records what we kept, what we changed, what we measured,
and what we recorded as zero removals because nothing else was safe.

---

## 1. Baseline that was preserved from the 13/09 cleanup

These are absences, not additions. They were already gone in r13 and were
not reintroduced at any point. The list exists so a future cleanup pass
does not "rediscover" them and ask why they are missing.

- `tests/mock-server.mjs` — absent.
- `tests/sim-phone.mjs` — absent.
- `tests/test-commands.mjs` / `tests/test-admin-broadcast.mjs` — absent.
- `static/**/*.ts` UI server files — absent (resolved earlier).
- `static/phone-v3/vendor/mediapipe/.amxd.original` and other `.amxd.original`
  files — absent.
- "Follow" UDP backward-compatibility shims in the live panel — absent
  (UDP contract retired before r13).
- Tests that assert absence of any of the above items remain green and
  continue to anchor the cleanup.
- `tests/ui/test-server.mjs` is the active Playwright WebSocket server and
  is intentionally kept; it is the only `.mjs` server file in `tests/`.

The exclusion snippets inside `build.ts` that keep `audio-lab/`,
`native-audio-contract.*` and other experimental code out of the bundle are
a **distribution boundary**, not residue. They are listed in the inventory
under "deferred experiment" and must stay.

## 2. Inventory by category with consumer proof

| Category              | Item                                                                  | Consumer proof / disposition                                                                                                                  |
| --------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime ativo         | `static/phone-v3/**`, `static/shared/**`, `static/admin/**`, `static/panel/**` | HTML `script` tags in `docs/index.html` and the phone page. Removal would leave dangling imports.                                              |
| Runtime ativo         | `src/**`                                                              | Imported by tests, build entry (`build.ts`), and `src/server/ws.ts` etc. Removal requires a new entry point and live test coverage.            |
| Compatibilidade       | UDP contract and "Follow" references in docs/                        | Documented in `internal/RELEASE-BASELINE-1.0.md`; runtime code does not call the removed UDP path. Tests of absence remain green.                |
| Compatibilidade       | MIDI MIX 6+6 / Follow comments                                       | Kept as cross-references in `internal/RELEASE-BASELINE-1.0.md`; not runnable code.                                                              |
| Compatibilidade       | `pkijs` (BSD-3-Clause, dependency of `@peculiar/x509`)               | Distinctive-symbol scan confirms it is not in the built bundle; the third-party notice records the dependency without distributing the source.    |
| Testes                | `tests/*.test.mjs`, `scripts/*.test.mjs`                              | Node test runner, invoked by `npm run test:static` and `npm run test:src`. Each test has a reason to exist (regression guard, parity, contract). |
| Ferramenta mantida    | `scripts/stress/*`, `scripts/package-tester-kit.mjs`, `build.ts`      | Invoked by `npm test`, `npm run lint`, and `npm run build`. Listed under `package.json` `scripts`.                                              |
| Experimento adiado    | `audio-lab/`, `native-audio-contract.*`                               | Excluded from the bundle by `build.ts` distribution snippets. Kept as in-tree experiments; not built into `dist/`.                              |
| Resíduo               | `static/panel/qrcode.js` (vendored `qrcode-generator` MIT)            | Third-party file unmodified on purpose: the plan explicitly preserves legitimate credits. **Not** brought under the unused-vars guard.         |

Items deliberately **not** removed because no negative consumer proof
exists:

- `static/phone-v3/audio-lab*` and `native-audio-contract.*` distribution
  exclusions — the build path guards them; removing the snippets would
  change the bundle.
- Any `static/**/*.js` file that declares globals consumed via `window.x`
  string-dispatch from a sibling `script` tag (the old "no import does not
  prove the script is dead" warning in the plan).
- `static/phone-v3/app.js` and `static/phone-v3/controls.js` keep the
  `no-unused-vars` rule **off** in `eslint.config.js`. They are the source
  of the sibling globals; flipping the rule on there would require an
  exhaustive consumer inventory first.

## 3. Removals with negative consumer proof

| File                                              | What was removed                                              | Proof it was dead                                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `static/phone-v3/modules/session.js`              | two `catch (e) {}` + `catch (err) { /* ignore parse errors */ }` | The binding was never referenced inside the catch block; negative proof from reading the lines. `catch {}` preserves behaviour.                                                  |
| `static/phone-v3/modules/snapshots.js`           | four `catch (e) {}`                                          | As above; same negative proof.                                                                                                                                                  |
| `static/phone-v3/vision-processor.js`             | three `catch (e) { ... }` + one `s.onerror = (e) => ...`     | The `e` was never read; `s.onerror` only needs a function that rejects, so the param can be dropped.                                                                            |
| `static/phone-v3/controls.js`                    | seven `catch (err/e) {}`                                       | Same negative proof; one comment about detached faders was preserved alongside the catch.                                                                                      |
| `static/phone-v3/app.js`                         | three `catch (err) {}` (two in the new motion/orientation attach, one in applyRemoteControlValues) | Would emit `state.sensors.motion = 'unavailable'` etc. on the catch path; binding unused. Negative proof.                                                                       |
| `static/panel/app.js`                            | `catch (e) {}`, `onCustomMessage: (msg) => {}`, `forEach((key, index) =>` last arg  | Empty catch and stub callback had provably unused bindings. `index` was not referenced in the body of the arrow.                                                              |
| `static/admin/app.js`                            | two unused destructured `t` (`([t, v], i)` / `([t, rawV, smoothV], j)`) and a `catch (err) { /* ignore */ }` | ESLint flagged exactly those bindings as `assigned but never used`; negative proof. The destructure pattern was reduced to `([, v], i)` and `([, rawV, smoothV], j)`.           |
| `static/admin/mappings-core.js`                  | `catch (err) {}`                                              | Same negative proof.                                                                                                                                                            |
| `scripts/landing-runtime-contract.test.mjs`       | `const audio = read('static/phone-v3/audio-analysis-controls.js')` | Binding was never read. The line was deleted along with the unused read.                                                                                                       |
| `scripts/stress/admin-observer.mjs`              | `let lastClientUpdate = null;` and the lone assignment `lastClientUpdate = msg;` | `lastClientUpdate` was assigned twice and read nowhere. Negative proof from ESLint no-unused-vars + grep.                                                                       |
| `scripts/stress/fake-phone-headless.mjs`         | `let connected = false;` and `connected = true;`; `catch (e) { ... }` in the message parser | `connected` was a write-only local. The catch binding was unused.                                                                                                              |

Net: 24 lines of provably-dead catch bindings + 3 unused script locals +
3 orphan assignments = **30 lines removed across 11 files**.

## 4. Comment normalization

Plan P04 acceptance: "remove session narration, RED/task stubs, ADR
references without an accessible document, and comments that contradict
the code".

| File                                  | Change                                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/server/backpressure.ts`          | File-header "ADR-004" tag removed; expanded into a two-line description of the identity model.                  |
| `src/server/write-scheduler.ts`       | "(Task 3.3 / ADR-004)" replaced with a description of the coalescing contract and the test that exercises it. |
| `src/server/ws-bounds.ts`             | Header "ADR-004" tag removed; kept the rationale that the bounds are the shared source of truth.               |
| `src/server/ws.ts`                    | Three inline "ADR-004" references rewritten to reference `ws-bounds.ts` directly (the actual module that owns the policy). |
| `tests/catalog-modules.test.mjs`      | Header "(Task 3.4)" → "Catalog modules: export shape and coverage..."                                          |
| `tests/e2e-suite-integration.test.mjs`| Header "(Task 6.3 / ADR-004)" → "End-to-end suite integration..."                                              |
| `tests/server-origin-ports.test.mjs`  | Header "(Task 3.1 / P1.2)" → "Same-origin port matching rejection."                                            |
| `tests/server-transport-dispatch.test.mjs` | Header "(Task 3.1 / Blocker C)" → "Classification and authorization of the six transport commands."         |
| `tests/server-write-scheduler.test.mjs` | Header "Task 3.3" → "Write scheduler: coalescing continuous controls per targetKey with strict FIFO execution for discrete events." |
| `tests/server-ws-security.test.mjs`   | Header "(Task 3.1)" → "Security authorization and capability-token test suite."                                |
| `tests/server-ws-stress.test.mjs`     | Header "(Task 3.2 / ADR-004)" → "WebSocket bounds, rate-limiting and backpressure stress tests."               |
| `tests/server-ws-helpers.test.mjs`    | Test title and assertion message "per ADR-004" dropped (line 25 and 27).                                       |

That is 12 files normalized, 16+ comment locations rewritten. No header or
test contract changed; the substance was already in the surrounding code.

## 5. ESLint configuration

`eslint.config.js` changes:

1. **Node tooling now linted.** Added a flat-config block keyed on
   `["scripts/**/*.mjs", "build.ts"]` with `parser: tsParser`,
   `sourceType: "module"`, `globals: { ...globals.node, NodeJS: "readonly" }`,
   `no-undef: "error"`, `no-unused-vars: ["warn", { argsIgnorePattern: "^_",
   varsIgnorePattern: "^_" }]`. Before the change, `lint` never visited
   `scripts/`, and `build.ts` was not linted at all.
2. **Encapsulated browser modules.** Added a block for the truly
   encapsulated IIFE-style files
   (`static/phone-v3/modules/**/*.js`, `calibration.js`,
   `sensor-capabilities.js`, `control-stream.js`, `safe-input-layer.js`,
   `mapping-input-contract.js`, `phone-identity.js`, `mode-engine.js`,
   `vision-control-state.js`, `audio-*.js`, `camera-lifecycle.js`,
   `vision-processor.js`, `static/shared/*.js`) with
   `no-unused-vars: ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]`.
   These files each expose a single `window.*` API and have no
   sibling-global consumers; an unused local is real dead code.
3. **`app.js` / `controls.js` inventory.** `no-unused-vars` remains
   `off` for them. They are the producers of the sibling globals
   (`sendWS`, `selectedControl`, `lfoStates`, `stutterStates`, etc.) that
   other `<script>` tags consume via `window.x`. Disabling the rule here
   matches the plan: prepare an inventory instead of deleting.
4. **`qrcode.js`** stays under the browser block, not the encapsulated
   one. It is the MIT `qrcode-generator` library vendored verbatim; the
   plan says preserve legitimate credits, so it is excluded from the
   unused-vars guard.
5. **No Max JS in this tree.** The AMXD devices ship as binary zips
   (see `companionDevices` in `scripts/package-tester-kit.mjs`). The
   plan's "do not treat Max JS as modern ECMAScript without
   compatibility" note has nothing to act on; recorded here so a future
   audit does not look for it.

## 6. TypeScript strictness

`tsconfig.json`: added `noUnusedLocals: true` and `noUnusedParameters: true`.
`strict` and `noUncheckedIndexedAccess` remain on. `tsc --noEmit` returns
zero errors; the audit baseline at `13/09` already passed with these flags.

`src/live/state.ts`: removed the now-dead `import { WebSocket } from "ws"`
introduced during P03 (the only consumer was the explicit `readyState ===
WebSocket.OPEN` check that the shared `sendWithBackpressure` helper now
covers).

## 7. Measurements

| Metric                                       | Before P04     | After P04     | Delta   |
| -------------------------------------------- | -------------- | ------------- | ------- |
| ESLint `no-unused-vars` warnings in `static/` | 35             | 7             | **-28** |
| tsconfig `noUnusedLocals` / `noUnusedParameters` | off        | on (0 errors) | -       |
| Host tests                                   | 470/470        | 470/470       | 0       |
| Static tests                                 | 746/746        | 746/746       | 0       |
| Landing contract tests                       | 27/27          | 27/27         | 0       |
| `npm run lint`                               | pass           | pass          | 0       |
| `dist/extension.js`                          | 1,169,676 B    | 1,169,676 B   | 0       |

The seven remaining warnings are intentional and justified:

- `static/panel/qrcode.js` × 4 — vendored MIT library, excluded from the
  guard on purpose.
- `static/phone-v3/mode-engine.js` × 1 — `function calculatePadRangePx(_height)`
  where `_height` is the underscore-prefixed signature-parity placeholder.
- `static/panel/mappings.js` × 2 — callback params named `_` for "intentionally
  unused" (group handlers iterate over keys and ignore the index/value).

No `scripts/` lint warnings remain after the script cleanups.

The bundle size is identical before and after P04: P04 introduced zero
runtime changes to `src/`. The only changes to `src/` are comment-level
(ADR tags) and the one now-unused `WebSocket` import that came out of P03
but was already declared `noUnusedLocals`-clean before.

## 8. Rhythmic policy contract

The plan's "consolidate the rhythmic policy explanation in a contracts
document with host/browser parity tests" requirement is fulfilled by the
new `docs/CONTRACTS.md` (and its `docs/CONTRACTS.pt-BR.md` sibling for the
landing-runtime-contract translation parity check). Section "Rhythmic
policy (LFO and Stutter)" documents:

- the shape ceilings (`LFO_SHAPE_MAX_HZ`: sine 5, triangle 8, ramp_up 6,
  ramp_down 6, square 15);
- the sync-speed division logic;
- the Stutter Auto reachable set at 120 BPM (2, 4, 8, 8);
- the Stutter FREE no-dead-zone contract.

It explicitly names `tests/modulator-policy-parity.test.mjs` as the parity
test and points to the host/browser source files on each side. No shared
library was extracted; the tables and function names are kept where the
phone and the host already read them.

## 9. Zero removals

The plan says "record zero removals when nothing else is safe". This audit
found:

- one dead unused import in `src/live/state.ts` — removed (already
  declared in the P03 fix);
- 24 provably-dead catch bindings across 10 static files — removed;
- 3 provably-dead locals in `scripts/test` tools — removed;
- no orphan `script` tags, no orphan JS module exports, no orphan
  `window.*` declarations, no retired AMXD files, no empty directories
  to delete.

Everything else either has live consumers (HTML `script` tags, `import`
edges, `window.*` string dispatch, persistence keys, build paths) or is
part of a protected absence from the 13/09 cleanup or the build-time
distribution boundary. Per the plan's guidance, we do not chase a
percentage: the next pass starts from the same baseline and should not
have to.
