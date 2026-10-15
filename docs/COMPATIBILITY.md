# Compatibility — RC Surface

Build `2.0.0` in local preparation. Product requirements and evidence; 1.0 records are not new 2.0 gates.

## Live

- Ableton Live 12.4.5+ Suite (Beta) with Extensions SDK `1.0.0-beta.0` (installed from `vendor/ableton-extensions-sdk-1.0.0-beta.0.tgz`, obtained from Ableton; the tarball is not part of this repository — see `vendor/README.md`).
- Two-track pattern: one track hosts `RC-Midi-Receiver.amxd` (Receiver v2); the audio source track hosts `RC-Audio-Sender.amxd` (the standalone Max audio helper). Sender input must be enabled on the Receiver v2 that should play.
- See `docs/INSTALL.md` for the end-to-end setup walk-through.

## Browser (operator surface)

- Desktop Chrome (current stable) — operator console + advanced admin pages.
- Mobile Chrome Landscape — operator console at phone resolutions (Pixel 5 emulation and equivalent viewport sizes).
- The Playwright matrix (`tests/ui/*.spec.mjs`) covers both projects.

## Node + tooling

- Node `24.16.x` (declared range: `>=24.16.0 <25`). See `engines.node` in `package.json`.
- npm 11.x for build and test commands.
- Playwright `1.62.0` ships with Chromium `151.0.7922.34` (Playwright build `chromium-1234`) for headless tests.

## Network + ports

- WebSocket only; no UDP MIDI. The Receiver v2 sends local Max messages inside the device; no UDP broadcast.
- Test ports are set per worktree (see `tests/ui/test-server.mjs` and `playwright.config.mjs`).

## Third-party packages

- `docs/THIRD-PARTY-NOTICES.md` (English) and `docs/THIRD-PARTY-NOTICES.pt-BR.md` (Portuguese) list the components actually packaged in the ABLX payload and in the host bundle, with license notices.
- [historical 1.0 distribution review](https://github.com/ntworm/rc-surface/blob/main/internal/DISTRIBUTION-REVIEW-1.0.md) records the dependency matrix and the explicit conclusion that no third-party relicensing is required for the 1.0 candidate.

## Current evidence and limits

The installed candidate was reported working without an observed error or bug. This is a report of use, not an exhaustive scenario/platform certification. Real latency, audio capture and take preservation must be checked in the user's setup.

Automated regressions use mocks and isolated browsers; they are not hardware evidence. Final preparation must record the package commit/hash, current gates and EN/PT visual review. Version remains 2.0.0; this document does not declare publication. Historical 1.0 records and “Receiver v2” describe other cycles, not product-version 2.0 acceptance.

1.x data does not migrate: 2.0 mappings/presets/projects use `surface-v2` and schema 2. This separation does not guarantee take preservation in an existing Set.

## See also

- `docs/INSTALL.md`, `docs/INSTALL.pt-BR.md` — installation walkthrough.
- `docs/THIRD-PARTY-NOTICES.md`, `docs/THIRD-PARTY-NOTICES.pt-BR.md` — third-party notices.
- `internal/TESTER-GUIDE.md` — current guidance with separately labeled historical evidence.
- [historical 1.0 distribution review](https://github.com/ntworm/rc-surface/blob/main/internal/DISTRIBUTION-REVIEW-1.0.md) — dependency matrix and distribution conclusion.
- [1.0 gate archive](https://github.com/ntworm/rc-surface/blob/main/internal/RELEASE-GATES-1.0.json) — historical evidence only.
