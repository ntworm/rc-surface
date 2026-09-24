# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

RC Surface is an Ableton Live 12.4.5+ Suite extension (Ableton Extensions SDK, beta) that turns a phone browser into a controller. The extension runs an HTTPS/WSS server on the LAN; the phone opens a URL from a QR code. No native app, no bundler on the client side. Licence: PolyForm Noncommercial 1.0.0. The maintainer writes in Brazilian Portuguese; every public doc ships in English and pt-BR.

## Commands

Set `ABLETON_RC_DEV_SYNC=0` before building or testing so a dev build never copies into an installed Live extension.

```bash
npm run check:vendor   # SDK/CLI tarballs must be in vendor/ (licensed, untracked; see vendor/README.md)
npm ci                 # fails without those tarballs
npm test               # test:static + test:src
npm run test:static    # node --test over static/**/*.test.mjs and scripts/*.test.mjs (no deps needed)
npm run test:src       # node --import tsx --test tests/*.test.mjs
npm run lint           # eslint src static tests docs scripts build.ts + tsc --noEmit
npm run build          # tsc --noEmit + esbuild -> dist/
npm run test:ui        # Playwright, tests/ui/*.spec.mjs against tests/ui/test-server.mjs on :9880
npm run ci             # the full local gate
npm run build:prod-ablx
```

Single test:

```bash
node --test static/phone-v3/stutter-mode.test.mjs
node --import tsx --test tests/modulator-policy-parity.test.mjs
npx playwright test tests/ui/lfo-bandwidth.spec.mjs
```

Node is pinned to 24.x (`engines`, `.nvmrc`). The static and `scripts/` tests run under plain `node --test` without `npm ci`, which is the quickest check in an environment without the vendor tarballs.

## Architecture

**Host (`src/`, TypeScript, bundled by `build.ts` with esbuild into `dist/extension.js`).** Runs inside Live's extension host, a strict VM where `global` is undefined — `src/runtime/global-polyfill.ts` must stay the first import of `src/extension.ts`. `extension.ts` is a bootstrap only: it wires modules in `activate()` and tears them down in `deactivate()`; do not put state machines or protocol handlers there.

- `src/server/` — HTTP(S) lifecycle (`state.ts`), static file routes (`http.ts`), WebSocket protocol (`ws.ts`), self-signed per-install certs with LAN IPs in the SAN (`cert.ts`), rotating controller/admin session tokens and same-origin checks (`session-auth.ts`), role-gated command dispatch (`command-dispatch.ts`), payload/rate/connection bounds (`ws-bounds.ts`), write scheduling and backpressure.
- `src/live/` — the mapping engine and command registry (`mappings.ts`, the largest module), curves, target scaling, host-side LFO/stutter modulators, the single-flight latest-value parameter actuator, optional AbletonOSC transport/clock (`osc-transport.ts`, UDP 11000/11001), MIDI receiver bridge, per-project config.

**Clients (`static/`, plain browser JS, no build step).** `build.ts` copies `static/` into `dist/static/` (skipping `*.test.mjs`) and adds MediaPipe Hands from `node_modules` so vision works without a CDN.

- `static/phone-v3/` — the phone surface (PERF, MIX, SNP, SNS, AUD, VID, MAP tabs; audio descriptors in an AudioWorklet; single-hand vision).
- `static/panel/` — the panel shown inside Live (QR, mapping editor). `static/admin/` — admin dashboard.
- `static/shared/` — `i18n.js` (runtime) + `i18n-catalog.js` (strings), audio descriptor catalog (IDs and scales of the twelve public descriptors).

**Landing page (`docs/`, served by GitHub Pages at https://ntworm.github.io/rc-surface/, `.nojekyll`).** A single hand-written `docs/index.html` ("operator sheet") with the font embedded as base64. Every translatable element carries `data-i18n` / `data-i18n-html` / `data-i18n-href` handles resolved from `docs/site-i18n.js`. `docs/i18n.js` must be a byte-identical copy of `static/shared/i18n.js`.

## Invariants enforced by tests

Documentation is under test. Editing `docs/*.md`, `docs/index.html` or `docs/site-i18n.js` can break `scripts/landing-runtime-contract.test.mjs`, `scripts/landing-cards.test.mjs`, `scripts/install-candidate-status.test.mjs`, `static/phone-v3/single-client-docs.test.mjs` and `tests/release-cleanup.test.mjs`. Among other things they require:

- every `docs/X.md` to have a `docs/X.pt-BR.md` at least two thirds its size;
- no run of lowercase English prose in the landing body outside an i18n handle;
- every number the landing states to match a constant in the code;
- specific section headings in the pt-BR guides (e.g. `## 9.5 Modo Config (CFG)`).

`scripts/check-product-name.mjs` fails if the retired product/artifact name reappears in active files.

## Translation policy (pt-BR)

Not a literal translation (see the headers of `static/shared/i18n-catalog.js` and `docs/site-i18n.js`). Terms Brazilian musicians say in English stay in English: pad, knob, fader, LFO, stutter, snapshot, clip, track, loop, preset, clutch, morph, gate, pitch, BPM, bind, trigger, bar, beat, plus product/protocol names. "Mapping" becomes mapear/mapeamento, but the `MAP` tab label stays. Tab names, axis labels and signal names printed on the surface (PERF, GX, RMS, ENV, GATE) are identical in both languages.

## Product rules

- Vision is single-hand by design. Do not add left/right or two-hand control names without an explicit request and a migration covered by tests.
- Control names (`pad-1..12`, `knob-1..8`, `fader-1..8`, `xy-1/2.{x,y}`, `toggle-1..4`, `button-1..4`, `sensor.*`) are public mapping IDs persisted in users' saved mappings; renaming one is a migration.
- Retired features (Follow Detected Note, tonal controls, Audio Lab, standalone MIX client) stay retired; regression tests that reject them protect the product.
- Adding or upgrading a dependency means updating `NOTICE` and `docs/THIRD-PARTY-NOTICES.md` in both languages.
- `docs/` is public; `internal/` holds maintainer records that describe their dated state.
