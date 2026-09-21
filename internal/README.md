# RC Surface — Maintainer Docs

This folder contains maintainer references, validation records and tester
guidance. Public documentation lives in `docs/`; historical records here
describe their dated state, not necessarily the current product.

## Canonical Docs

Read these first:

- `docs/USER-GUIDE.md` - how to operate the phone controller (every mode, gesture, mobile MAP workflow, and surface).
- `CONTRIBUTING.md` - source tree, tests, and contribution gates.
- `docs/INSTALL.md` - install, phone connection, certificates, troubleshooting.
- `docs/FAQ.md` - user-facing answers.
- `docs/CUSTOMIZATION.md` - how to change controls, sensors, mappings, UI.
- `internal/THEME_CONTRACT.md` - binding visual language, palette, typography, geometry, and documented exceptions.
- `internal/TESTER-GUIDE.md` - manual release and compatibility smoke-test checklist.
- `docs/AUDIO-AUDIT.md` / `docs/AUDIO-AUDIT.pt-BR.md` - owner-operated browser audio checks; not proof of latency or Native Track acceptance.
- `docs/PRIVACY.md` - data flow and third-party runtime notes.
- `docs/SECURITY.md` - threat model and certificate policy.
- `internal/PESQUISA_CELULAR_GESTUAL.md` - evidence and roadmap for expressive gestural control.
- `CHANGELOG.md` - consolidated release notes.

Do not casually rewrite canonical docs. Update them only when behavior, workflow, or architecture changes.

## Current Architecture Snapshot

- Backend entry: `src/extension.ts`, thin bootstrap only.
- Backend owners: `src/server/`, `src/live/`, `src/util/`, `src/ui/`, `src/runtime/`, `src/context.ts`.
- Phone app: `static/phone-v3/`, plain browser JS, no bundler.
- Mobile mapping: `static/phone-v3/mapping-mode.js`, using the same
  backend commands as the panel/admin mapping tools.
- Panel app: `static/panel/`, plain browser JS, no bundler.
- Admin app: `static/admin/`, plain browser JS.
- Tests: browser/build contracts, host services and Playwright UI; see
  [CONTRIBUTING.md](../CONTRIBUTING.md#tests) for suite ownership and commands.

## Current Runtime Sensor Names

Canonical control namespaces:

- `pad-1` through `pad-12`
- `knob-1` through `knob-8`
- `fader-1` through `fader-8`
- `xy-1.x`, `xy-1.y`, `xy-2.x`, `xy-2.y`
- `toggle-1` through `toggle-4`
- `button-1` through `button-4`
- `sensor.motion.*`
- `sensor.orient.*`
- `sensor.audio.rms`
- `sensor.audio.envelope`
- `sensor.audio.attack`
- `sensor.audio.transient`
- `sensor.audio.kick`
- `sensor.audio.snare`
- `sensor.audio.brightness`
- `sensor.audio.centroid`
- `sensor.audio.rolloff`
- `sensor.audio.flux`
- `sensor.audio.flatness`
- `sensor.audio.spread`
- `sensor.audio.low`
- `sensor.audio.mid`
- `sensor.audio.high`
- `sensor.audio.gate`
- `sensor.vision.*`

The four amplitude controls and twelve descriptors above are finite 0..1
mapping sources. Hz labels for spectral descriptors are display-only; their
IDs and scales belong to `static/shared/audio-descriptor-catalog.js`.
Kick and snare are spectral attack heuristics, not classification.
Follow Detected Note, tonal audio controls and Audio Lab were removed;
unsupported saved mapping modes are filtered, not kept dormant.
The independent Max Audio Sender does not feed browser descriptors.
The supported mappable subset and its normalized ranges are documented in
[USER-GUIDE.md](../docs/USER-GUIDE.md#mapping-editor-fields).

Vision is single-hand by design. Do not reintroduce left/right or two-hand control names unless the user explicitly asks for a new feature and tests cover the migration.
