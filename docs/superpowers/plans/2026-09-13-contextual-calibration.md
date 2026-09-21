# Contextual calibration — implementation

Approved: one CALIBRATE action scoped to SNS/AUD/VID; absent on PERF/MIX/SNP.
Solo execution. Preserve existing dirty work, no installation, push or release tag.

1. [x] Add tested bounded sample collectors: stable wrap-safe sensor neutral;
   five seconds of playing audio (RMS/envelope gain, no detector timing or Live
   audio changes); camera luminance and fresh hand-detection checks.
2. [x] Add independent session states and compact contextual UI, real progress,
   cancel/reset, source invalidation and rollback. Never activate hardware.
   Camera continuous exposure/focus only when advertised and verified; no
   neutral-hand capture or confidence changes. Unsupported controls remain honest.
3. [x] Wire existing app producers, remove timer-based fake calibration success.
   Audio calibration is session-local and resets with the input; sensor offsets
   remain session-local too, avoiding a stale neutral on a different posture.
4. [x] Add real-page lifecycle/translation tests; update EN/PT guides, landing
   explanation and tester notes. Validate locally with DEV_SYNC=0.
5. [x] Build a uniquely named local ABLX, inspect payload and report focused tests.
   Physical calibration acceptance and earlier release consolidation remain separate.

Implementation seams: static/phone-v3/calibration.js, modules/calibration.js,
app.js, index.html, style.css, shared/i18n-catalog.js. No host or Max changes.
Checks: collectors fail before implementation; source loss, no data, cancellation,
camera unsupported/rollback, page isolation; full CI/lint/build and ZIP comparison.

Result: 730 static + 459 host + 144 Playwright PASS, lint/TypeScript/build PASS.
Log: .agent-context/runtime/calibration-ci.log. Real-page screenshots inspected.
Visual regression caught/repaired before delivery: extra row reduced VID preview;
use a dismissible compact notice instead. Header reflows below 800px so CALIBRATE
is reachable; calibrated state explicitly overrides the generic button color.
R13: .release-local/RC-Surface-1.0.0-calibration-r13.ablx, 13,682,943 bytes,
76 files matched against production build. SHA256:
3B4A2D92A28ACD32AE51413B51B5793CBCB50099020033FD89F409DB9D45E6CC.
Both shipping AMXDs unchanged from r12. No installation, commit, merge, push/tag.
Await only physical SNS/AUD/VID calibration acceptance; not latency compensation.
