# RC Surface — local Browser release candidate

Owner approved autonomous, SOLO implementation on 2026-09-07. Final delivery:
the generated ABLX and a concise checklist of changed behavior. This is not
authorization to install into Live, operate apps, push, tag or publish.

## Boundaries and recovery

Worktree: `audio-descriptors-v1`, branch `feat/audio-descriptors-v1`, base
`6142b21`. Preserve existing F01/F02 code/tests and native deferral documents.
Reference: `internal/RELEASE-READINESS-2026-09-07.pt-BR.md` (19 fronts).
Native Track F15 remains **PENDING_OWNER_DEFERRED**: Gate A has no measured
capture; no experimental native integration or low-latency guarantee.
Hardware, Safari, firewall and public-release acceptance cannot be inferred
from local tests. Record remaining manual checks rather than mark them passed.
All build/test commands: `ABLETON_RC_DEV_SYNC=0`.

## Execution checkpoints

- [x] F01/F02: lifecycle and retired-write ownership, fresh prior CI passed.
- [x] F03/F16: test zero retired YIN/chroma/BPM work during normal capture;
  quarantine its code, retain compatibility and active amplitude/attack.
  Files: `static/phone-v3/audio-processor.js`, its tests and app integration.
- [x] F13: preserve MIX1..6, add knobs/faders7..8 and use flat arc knobs;
  update mapping catalog, templates, reset/snapshots, responsive UI and tests.
- [x] F14: Browser audio-device selector, default unchanged; explicit missing
  device/error, lifecycle races, permissions/device-change handling and i18n.
  Native Track is not offered as a functioning source.
- [x] F08/F12/F17 local slice: inspect remaining persistence writes, add staged/serialized
  preset regression proof; correct fixed-beat labels; localized session/error
  feedback and focused accessibility/recovery tests.
- [ ] F09/F10/F11: existing synthetic descriptor/finite-output and headless
  regressions retained. No new benchmark or physical acceptance claim.
  Further performance profiling and end-to-end/mobile checks are deferred.
- [x] F04/F05/F06/F07/F18 local slice: align EN/PT guides, tester guide, changelog, landing
  and release claims; responsive landing checks; include notices and inspect
  package exclusions. No firewall/system changes or dependency-wide upgrades.
- [x] F19 local handoff: fresh complete tests/lint/production build/UI; inspect ABLX contents,
  compute SHA256, write actual evidence and owner checklist. Only then hand off.

## Verification rules

New behavior: observable failing regression first, then focused GREEN. Preserve
existing source IDs, compatibility and deliberate Note Off. Do not replace
meaningful tests with source-text assertions. Use existing build/package flow;
never copy into installed Live. Keep progress/evidence below after each block.

## Progress

- Delivered candidate: `.release-local/RC-Surface-1.0.0-candidate-2026-09-07.ablx`,
  13,701,769 bytes, ZIP integrity passed. Final CI exit0:756+404 code tests,
  120 UI passes/2 intentional skips; production audit0 known vulnerabilities.
  Remaining manual/deferred work is explicit in the handoff, not marked passed.

- Final owner instruction: stop expanding this review; finish and deliver the
  local Browser candidate now. No further features, refactors or benchmarking.
  The unchecked hardware/native/publication fronts are not release approvals.
- F13/F14 focused UI passes: 8+8 controls, keyboard/reset/geometry, remembered
  explicit input selection, failed/ended capture, no automatic restart on reload.
  AudioProcessor50 and selector2 focused tests passed.
- F08 regression RED/GREEN: save waits for mapping mutations; failed staging
  preserves the old preset; delete propagates errors except an absent file.
- F12/F17: fixed-quarter-beat labels preserve stored durations across meters;
  session loss/replacement/rename feedback localized EN/PT-BR.
- F04/F05/F06/F18 local slice: docs/landing inventory aligned, scrollable narrow
  tables, wrapping envelope labels, notices bundled, dormant Lab/native contract
  excluded from production. Publication, external firewall and physical devices
  remain manual. Focused landing UI passes EN/PT-BR at320/390/768/1440px.
- Final result and exact artifact: see
  internal/RELEASE-CANDIDATE-CHECKLIST.pt-BR.md. Historical progress below records
  intermediate states and does not override that handoff.

- Planning checkpoint: expanded scope recorded; no expanded-scope code edits
  yet. Previous F01/F02 CI: 1149 code tests, 114 UI passed, 2 dormant-Lab skips.
- F03 RED reproduced active YIN/tonal allocations; GREEN48 audio-processor tests.
  Code-only false gate retains algorithms, historical tests explicitly evaluate
  the gated source in an isolated VM. Unpitched onset now opens attack window;
  Stop clears envelope/RMS/tonal references.
- F13 implemented catalog/templates/HTML8+8, flat arc knobs, keyboard/ARIA.
  RED catalog+UI saw6; focused catalog and desktop UI GREEN; mobile fixture
  needs explicit landscape viewport (fixed). Static suite found only stale
  six-control expectations + DOM mock missing setAttribute; fixed, rerun pending.
- Next F14: Browser selector. MDN enumerateDevices/deviceId/ended reviewed:
  permission may hide IDs/labels; exact constraint must fail without fallback.
  Do not stop a stream merely because pre-permission enumeration omits it.
