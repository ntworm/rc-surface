# Compatibility — RC Surface

Build `1.0.0`. Compatibility envelope for the 1.0 candidate. Physical (hardware) compatibility is tracked separately under gate `physical-hardware` (P09) and `internal/TESTER-GUIDE.md`.

## Live

- Ableton Live 12+ with Extensions SDK `1.0.0-beta.0` (installed from `vendor/ableton-extensions-sdk-1.0.0-beta.0.tgz`, obtained from Ableton; the tarball is not part of this repository — see `vendor/README.md`).
- Two-track pattern: one track hosts `RC-Midi-Receiver.amxd` (Receiver v2); the audio source track hosts `RC-Audio-Sender.amxd` (the standalone Max audio helper). Sender input must be enabled on the Receiver v2 that should play.
- See `docs/INSTALL.md` for the end-to-end setup walk-through.

## Browser (operator surface)

- Desktop Chrome (current stable) — operator console + advanced admin pages.
- Mobile Chrome Landscape — operator console at phone resolutions (Pixel 5 emulation and equivalent viewport sizes).
- The Playwright matrix (`tests/ui/*.spec.mjs`) covers both projects.

## Node + tooling

- Node `v24.19.0` (declared range: `>=24.16.0 <25`). See `engines.node` in `package.json`.
- npm 11.x for build and test commands.
- Playwright `1.62.0` ships with Chromium `151.0.7922.34` (Playwright build `chromium-1234`) for headless tests.

## Network + ports

- WebSocket only; no UDP MIDI. The Receiver v2 sends local Max messages inside the device; no UDP broadcast.
- Default ports are owned by the worktree (see `tests/ui/test-server.ts` and `playwright.config.mjs`).

## Third-party packages

- `docs/THIRD-PARTY-NOTICES.md` (English) and `docs/THIRD-PARTY-NOTICES.pt-BR.md` (Portuguese) list the components actually packaged in the ABLX payload and in the host bundle, with license notices.
- `internal/DISTRIBUTION-REVIEW-1.0.md` records the dependency matrix and the explicit conclusion that no third-party relicensing is required for the 1.0 candidate.

## Field-tested (v2 acceptance) vs unmeasured

Field-tested scenarios (v2 acceptance, recorded in `internal/TESTER-GUIDE.md`):

- Local-only install via slice A+B (and opt-in R).
- Two-track routing with the standalone `RC-Audio-Sender` and `RC-Midi-Receiver` pair.
- WebSocket-only transport inside Live.
- Synthetic Playwright envelope for the operator console and admin pages.

Unmeasured at this delivery (gates remain `pending`/`blocked` by contract):

- Physical hardware round-trip latency on the responsible party's machine (gate `physical-hardware`).
- Public distribution via the SDK route (gate `distribution-publication`).

## See also

- `docs/INSTALL.md`, `docs/INSTALL.pt-BR.md` — installation walkthrough.
- `docs/THIRD-PARTY-NOTICES.md`, `docs/THIRD-PARTY-NOTICES.pt-BR.md` — third-party notices.
- `internal/TESTER-GUIDE.md` — field-tested v2 acceptance scenarios.
- `internal/DISTRIBUTION-REVIEW-1.0.md` — dependency matrix and distribution conclusion.
- `internal/RELEASE-GATES-1.0.json` — current gate document.
