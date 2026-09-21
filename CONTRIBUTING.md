# Contributing to RC Surface

Thanks for considering contributing. This project is released under the
PolyForm Noncommercial 1.0.0 license and welcomes issues, bug reports, and
feature requests. New contributions are accepted only by direct invitation
from the maintainer; please open an issue to discuss any changes before
sending a pull request, and do not assume unsolicited PRs will be merged.

## Getting started

Requires **Node.js >=24.16.0 <25** (see `package.json`; `.nvmrc` and
`.node-version` pin the development baseline).

Before any test/build command, set `ABLETON_RC_DEV_SYNC=0` to prevent the
development build from copying files into an installed Live extension:

```powershell
$env:ABLETON_RC_DEV_SYNC = '0'
```

On macOS/Linux: `export ABLETON_RC_DEV_SYNC=0`.

```bash
git clone <this-repo>
cd ableton-rc-surface
npm ci
npm test           # test:static + test:src
npm run build      # tsc check + esbuild bundle to dist/
npm run ci         # test + lint + typecheck + production build + UI tests
```

## Code structure

The extension source lives in `src/` and is modular. `src/extension.ts`
is a thin bootstrap that wires the modules below; it contains no inline
state machines, shadow copies, or protocol handlers.

```text
src/
  extension.ts        bootstrap: activate() + deactivate()
  context.ts          SDK context access
  runtime/safety.ts   uncaught exception safety hooks
  ui/panel.ts         Ableton panel and mapping dialogs
  util/               helpers and CPU sampling
  server/state.ts     HTTP/HTTPS lifecycle
  server/cert.ts      self-signed TLS certificates
  server/http.ts      static files and health/test routes
  server/ws.ts        WebSocket clients, typed messages, command dispatch
  server/client-id.ts client id generation
  live/state.ts       playhead and live-state broadcast loop
  live/mappings.ts    commands, mapping engine, curves, presets
```

Static clients are plain browser JavaScript with no build step:

```text
static/
  phone-v3/  phone performance client with built-in MIX tab
  panel/     Ableton panel UI
  admin/     admin dashboard
```

There is no standalone MIX client, no standalone MIX protocol, and no Mix
QR in the current architecture. The MIX tab is integrated into the phone
client.

## Tests

`npm test` runs two suites:

```bash
npm run test:static   # static/{admin,panel,phone-v3,shared}/*.test.mjs plus scripts/*.test.mjs
npm run test:src      # tests/*.test.mjs with tsx
```

The full local gate includes lint, TypeScript, the production build and
Playwright UI tests on desktop and mobile layouts:

```bash
npm run ci
```

| Area | Test ownership |
| --- | --- |
| Browser controls, LFO/Stutter, snapshots and mapping editor | `static/phone-v3/*.test.mjs` |
| Panel/admin and shared catalogs | `static/{panel,admin,shared}/*.test.mjs` |
| Host modulation, parameter delivery, MIDI and saved mappings | `tests/live-*.test.mjs`, `tests/lfo-*.test.mjs`, `tests/host-modulator-*.test.mjs`, `tests/project-config.test.mjs` |
| Network authentication, authorization, queues and lifecycle | `tests/server-*.test.mjs` |
| Device/build/package contracts | `scripts/*.test.mjs`, `tests/release-*.test.mjs` |
| UI integration and responsive layouts | `tests/ui/*.spec.mjs` with `tests/ui/test-server.mjs` |

During a focused edit, run the relevant file first, for example:

```bash
node --test static/phone-v3/stutter-mode.test.mjs
node --import tsx --test tests/modulator-policy-parity.test.mjs
npx playwright test tests/ui/lfo-bandwidth.spec.mjs
```

The reported total counts test cases (including parameterized inputs and two
UI projects), not separate test files. Tests are excluded from production
packages. Keep regression tests that reject retired controls or unsafe legacy
payloads: they protect the current product. Remove a test only when its subject
is genuinely retired or its coverage is demonstrably redundant.

Local gates do not certify physical Live timing, real device behavior or
macOS acceptance. See `internal/TESTER-GUIDE.md` for manual acceptance;
experimental audio benchmark evidence is maintained separately.

Use `npm run build:prod-ablx` to generate the versioned `.ablx` and `npm run
package:tester` to generate the tester kit.

## Before submitting a PR

1. Run the full release gate locally.
2. Add or update tests for behavior changes.
3. Keep commits focused: one logical change per commit.
4. Do not commit build artifacts (`dist/`, `.ablx`, `release-kits/`) unless a maintainer explicitly asks.
5. Keep public docs aligned with behavior when changing install flow, controls, network behavior, or compatibility.
6. When adding or upgrading a dependency, update `NOTICE` and `docs/THIRD-PARTY-NOTICES.md` in both English and Portuguese, and keep the internal distribution review current, so the packaged-component matrix and notices stay true. The Ableton Extensions SDK/CLI tarballs in `vendor/` are licensed only for use inside the application: they are untracked (`vendor/*.tgz` in `.gitignore`), verified by `npm run check:vendor` against `vendor/manifest.json`, and must never be added to releases, commits or public artifacts. Hosted CI stages them from a private repository (see the README inside `vendor/`).

## Style guide

- TypeScript for `src/`, plain JavaScript for `static/`.
- 2-space indentation, LF line endings.
- Avoid `any` except at Ableton SDK boundaries that are untyped.
- Prefer existing helpers and local patterns over new abstractions.

## Reporting bugs

Please include:

- Ableton Live version and edition
- OS
- Phone model and browser
- Extension version
- Steps to reproduce
- Expected and actual behavior
- Ableton Extensions log output
- Browser console output if the phone UI is involved

## Feature requests

Open an issue with the `enhancement` label once the repository is public.
Describe the use case, not just the proposed implementation.

## Trademarks

Ableton and Live are trademarks of Ableton AG. RC Surface is an independent
project, not affiliated with, endorsed by, or sponsored by Ableton AG.
