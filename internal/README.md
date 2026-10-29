# RC Surface — Maintainer Docs

This folder contains maintainer references, validation records and tester
guidance. Public documentation lives in `docs/`; historical records here
describe their dated state, not necessarily the current product.

## Current preview — 2.0.1 (2026-10-29)

The [2.0.1 pre-release](https://github.com/ntworm/rc-surface/releases/tag/v2.0.1)
contains offline panel recovery and LAN/QR address fixes. Existing 2.0 data
remains compatible and the companion Max devices are unchanged. Automated CI
and package integrity are checked before publication; native Live/macOS panel,
recording/playback and hardware acceptance remain pending. The stable Latest
release and default landing remain on 2.0.0 until that acceptance and promotion.

## Historical 2.0.0 candidate (2026-10-15)

Source candidate `e930ebe` (package SHA-256 prefix `523b7d93`) was installed by
Gabriel, who reported everything working without an observed error or bug.
This is the reported-use acceptance, not a new exhaustive platform, latency,
audio-capture or companion-device test matrix. The release was unpublished at
that checkpoint; [v2.0.0](https://github.com/ntworm/rc-surface/releases/tag/v2.0.0)
was subsequently published on 2026-10-16 (-03).
Use the current 2.0 notes and the top of the candidate checklist; record the
final package commit/hash and fresh verification with that delivery. The
1.0 gate records below and elsewhere remain historical evidence.

The current kit carries public EN/PT guides and 2.0 release notes. Historical
rename migrators and research/audit archives remain repository references;
they are not the upgrade path to isolated `surface-v2` data/schema 2.

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
- [historical reference](https://github.com/ntworm/rc-surface/blob/main/internal/PESQUISA_CELULAR_GESTUAL.md) - evidence and roadmap for expressive gestural control.
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
- `toggle-1` through `toggle-8` (T1–T8; Square is a waveform)
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
