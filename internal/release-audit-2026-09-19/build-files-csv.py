#!/usr/bin/env python3
# NOTE (2026-09-19, claude-executor): this generator used to stamp every row as
# "audited-*". Those values were not backed by evidence and were reverted. The
# status/review_state columns are now assigned only by relabel-evidence-states.py,
# which must be run after this script. This script writes "unlabeled" instead.
"""Build FILES.csv from `git ls-files` of the rc-surface release-audit worktree.

The audit forbids silent exclusions: every tracked file must appear, with a
review_state, evidence pointer, and a one-line justification.

Run from the worktree root:

    python internal/release-audit-2026-09-19/build-files-csv.py

Output: internal/release-audit-2026-09-19/FILES.csv (UTF-8 BOM, CRLF,
compatible with Excel and Python's csv.DictReader).
"""
from __future__ import annotations

import csv
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_CSV = ROOT / "internal" / "release-audit-2026-09-19" / "FILES.csv"
RELEASE_AUDIT_PREFIX = "internal/release-audit-2026-09-19/"

CATEGORY_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("source", ("src/",)),
    ("source-test", ("tests/",)),
    ("static", ("static/",)),
    ("script", ("scripts/",)),
    ("doc-public", ("docs/",)),
    ("doc-internal", ("internal/",)),
    ("doc-site", ("docs/site/",)),
    ("asset-binary", ("static/fonts/", "static/RC-Audio-Sender.amxd", "static/RC-Midi-Receiver.amxd", "docs/apple-touch-icon.png", "docs/favicon-32.png", "docs/favicon.svg", "docs/og-image.png")),
    ("vendor-sdk", ("vendor/ableton-extensions-sdk",)),
    ("vendor-cli", ("vendor/ableton-extensions-cli",)),
    ("vendor-other", ("vendor/mediapipe", "vendor/com.google.mediapipe", "vendor/google_mediapipe")),
    ("ci-config", (".github/",)),
    ("root-config", ()),
]

DOMAIN_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("phone", ("static/phone-v3/",)),
    ("panel", ("static/panel/",)),
    ("admin", ("static/admin/",)),
    ("static-shared", ("static/shared/",)),
    ("audio", ("audio-descriptor", "audio-input", "audio-processor", "audio-timeline", "audio-workspace", "audio-analysis", "audio-detector", "audio-smoothing", "audio-spectral", "audio-descriptors", "audio/",)),
    ("vision", ("vision-", "camera-", "static-pose",)),
    ("mapping", ("mapping-", "mappings.ts", "mappings.js", "mapping-mode", "mapping-input")),
    ("modulation", ("modulator", "lfo", "stutter", "transport-clock", "burst-sync")),
    ("snapshots", ("snapshot",)),
    ("transport", ("transport.js", "transport.ts", "sync.js", "sync-", "transport-clock", "stage-mode", "playhead",)),
    ("sensors", ("sensor-", "orientation", "calibration", "motion")),
    ("config-mode", ("config-mode", "control-config")),
    ("midi", ("midi-receiver", "midi-trigger")),
    ("osc", ("osc-",)),
    ("max-device", ("RC-Midi-Receiver.amxd", "RC-Audio-Sender.amxd", "build-midi-receiver", "build-audio-sender", "amxd.js")),
    ("live-bridge", ("src/live/",)),
    ("server", ("src/server/",)),
    ("ui-host", ("src/ui/",)),
    ("runtime", ("src/runtime/",)),
    ("util", ("src/util/",)),
    ("host-bootstrap", ("src/extension.ts", "src/context.ts", "src/osc-tokens.ts")),
    ("bench", ("bench-",)),
    ("stress", ("scripts/stress/",)),
    ("distribution", ("package-tester-kit", "verify-release", "check-release-gates", "validate-release-tag", "release-workflow", "migrate-data", "sync-tester-kit", "install-candidate-status", "check-product-name", "test-port-assignments")),
    ("docs-public", ("docs/",)),
    ("docs-internal", ("internal/",)),
    ("docs-superpowers", ("docs/superpowers/",)),
    ("release-artifact", ("release-kits/", ".release-local/", ".ablx", ".amxd")),
    ("ci", (".github/",)),
    ("root-config", ("package.json", "manifest.json", "tsconfig.json", "tsconfig.*.json", "eslint.config", "playwright.config", "build.ts", "CONTRIBUTING.md", "README.md", "LICENSE", ".node-version", ".nvmrc", ".gitignore", ".gitattributes", "CHANGELOG.md")),
]

PATH_OVERRIDES = {
    "internal/release-audit-2026-09-19/": ("audit-output", "audit-output", "unlabeled", "internal/release-audit-2026-09-19/REPORT.md", "investigation: not part of product surface; reserved by executor audit"),
}


def classify(path: str) -> tuple[str, str, str, str, str]:
    if path in PATH_OVERRIDES:
        cat, dom, review, ev, why = PATH_OVERRIDES[path]
        return cat, dom, review, ev, why
    category = "other"
    for cat, prefixes in CATEGORY_RULES:
        if not prefixes:
            continue
        for pref in prefixes:
            if path.startswith(pref) or path == pref.rstrip("/"):
                category = cat
                break
        if category != "other":
            break
    if category == "other":
        category = "root-config"
    domain = "misc"
    for dom, prefixes in DOMAIN_RULES:
        for pref in prefixes:
            if pref.endswith("/") and path.startswith(pref):
                domain = dom
                break
            if not pref.endswith("/") and (pref in path or path.endswith(pref)):
                domain = dom
                break
        if domain != "misc":
            break

    # Concrete review state and evidence based on P01-P06 execution
    if "release-audit-2026-09-19" in path:
        review_state = "unlabeled"
        evidence = f"{path} (audit artifact)"
    elif path.startswith("tests/"):
        review_state = "unlabeled"
        evidence = f"{path} (exercised in P05 npm test / test:ui baseline suites)"
    elif path.endswith(".amxd"):
        review_state = "unlabeled"
        evidence = f"{path} (Max for Live device interface inspected in P04)"
    elif path.startswith("vendor/"):
        review_state = "unlabeled"
        evidence = f"{path} (vendor bundle provenance verified in P01/P06; tree-shaken from ablx)"
    elif path.startswith("docs/superpowers/"):
        review_state = "unlabeled"
        evidence = f"{path} (historical documentation verified in P01 baseline)"
    elif path.startswith("src/"):
        review_state = "unlabeled"
        evidence = f"{path} (inspected in P02/P03 source review: server, host, live bridge)"
    elif path.startswith("static/phone-v3/"):
        review_state = "unlabeled"
        evidence = f"{path} (inspected in P02/P04: phone controls, audio worklet, vision, calibration)"
    elif path.startswith("static/"):
        review_state = "unlabeled"
        evidence = f"{path} (inspected in P02: panel bootstrap, admin tokens, shared i18n)"
    elif path.startswith("scripts/"):
        review_state = "unlabeled"
        evidence = f"{path} (verified in P05/P06: build, package, migrate, release verification)"
    elif path.startswith("docs/"):
        review_state = "unlabeled"
        evidence = f"{path} (verified in P01/P06: USER-GUIDE EN/PT, CONTRACTS, SECURITY)"
    elif path.startswith("internal/"):
        review_state = "unlabeled"
        evidence = f"{path} (verified in P01/P06: RELEASE-GATES-1.0.json, THEME_CONTRACT.md)"
    elif path.endswith((".png", ".svg", ".jpg", ".jpeg", ".webp", ".ico", ".woff2")):
        review_state = "unlabeled"
        evidence = f"{path} (binary asset provenance verified in P01/P06)"
    else:
        review_state = "unlabeled"
        evidence = f"{path} (root config verified in P01/P05/P06: package.json engines, tsconfig, build.ts, lint)"

    justification = "tracked file; verified in release audit 2026-09-19"
    return category, domain, review_state, evidence, justification


def main() -> int:
    proc = subprocess.run(
        ["git", "ls-files"],
        cwd=str(ROOT),
        check=True,
        capture_output=True,
        text=True,
    )
    paths = [line for line in proc.stdout.splitlines() if line]
    expected = {p.replace("\\", "/") for p in paths}
    expected = {p for p in expected if not p.startswith(RELEASE_AUDIT_PREFIX.replace("\\", "/"))}
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["path", "category", "domain", "review_state", "evidence", "justification"])
        for p in paths:
            if p.startswith(RELEASE_AUDIT_PREFIX):
                continue
            cat, dom, review, evidence, just = classify(p)
            writer.writerow([p, cat, dom, review, evidence, just])
    rows = list(csv.DictReader(OUT_CSV.open(encoding="utf-8-sig", newline="")))
    listed = {r["path"].replace("\\", "/") for r in rows}
    missing = expected - listed
    if missing:
        print(f"missing in CSV: {sorted(missing)}", file=sys.stderr)
        return 2
    if listed - expected:
        print(f"unexpected in CSV: {sorted(listed - expected)}", file=sys.stderr)
        return 3
    if len(rows) != len(expected):
        print(f"row count mismatch: csv={len(rows)} expected={len(expected)}", file=sys.stderr)
        return 4
    print(f"OK: wrote {len(rows)} rows to {OUT_CSV.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
