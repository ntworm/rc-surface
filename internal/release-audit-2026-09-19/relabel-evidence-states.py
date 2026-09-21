#!/usr/bin/env python3
"""Relabel FEATURES.csv and FILES.csv with the evidence that actually exists.

The previous pass stamped every row as "audited-P02-P03-P04" (features) or
"audited-*" (files) from a template. That is not what happened. This script
rewrites the state columns from three verifiable sources only:

1. progress.jsonl of task rc-surface-release-investigation-2026-09-19 — which
   source files were read in P02, P03, P04 and P06 (names quoted in the entry).
   P05 is a test run and contributes no reading.
2. P05 automated runs — which test files exist on disk and therefore ran under
   `npm test` / `npm run test:ui` (498/500 and 156/158, see TEST-RESULTS.md).
3. The owner's acceptance sessions of 2026-09-18 and 2026-09-19, recorded in
   the Workflow Main bundle tasks/rc-surface-v1-stage-acceptance-2026-09-18
   (EXECUTION.md checklist, findings.md F-001..F-010, evidence/ prints).

A feature status is the semicolon-joined list of evidence kinds present:
  owner-accepted-<date>   item explicitly exercised by the owner, with notes/print
  owner-smoke-<date>      owner reports it works; no per-item record
  automated-test-P05      at least one listed test file exists and ran in P05
  code-reviewed-P0x       source named in the P0x progress entry was read
  blocked-owner-deferred  owner decision recorded in NATIVE-AUDIO-VALIDATION.md (Native Track)
  not-verified            none of the above

Run from the repository root:  python internal/release-audit-2026-09-19/relabel-evidence-states.py
"""
from __future__ import annotations

import csv
import glob
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = Path(__file__).resolve().parent
FEATURES = AUDIT / "FEATURES.csv"
FILES = AUDIT / "FILES.csv"

OWNER_18 = "owner-accepted-2026-09-18"
OWNER_19 = "owner-accepted-2026-09-19"
SMOKE_19 = "owner-smoke-2026-09-19"
HUB = "workflow-main tasks/rc-surface-v1-stage-acceptance-2026-09-18"

# Owner evidence per feature id (or prefix). Source: EXECUTION.md "Verified by
# Worm (Session 2026-09-18)" and findings.md (2026-09-19) in the hub bundle.
OWNER: dict[str, tuple[str, str]] = {}
for i in range(1, 13):
    OWNER[f"pad-{i}"] = (OWNER_19, f"{HUB}: 18/09 pads 1..12 number + mode letter; 19/09 two pads at once, modes A/B/C/D, pad held + XY/LFO")
for i in range(1, 9):
    OWNER[f"knob-{i}"] = (OWNER_19, f"{HUB}: 18/09 MIX tab; 19/09 two knobs at once, knob + fader")
    OWNER[f"fader-{i}"] = (OWNER_19, f"{HUB}: 18/09 faders 0.85 unity, MAP to Live track volume; 19/09 two faders, double-tap reset")
for k in ("xy-1.x", "xy-1.y"):
    OWNER[k] = (OWNER_19, f"{HUB}: 19/09 pad held + XY1 drag (print 03)")
for k in ("xy-2.x", "xy-2.y"):
    OWNER[k] = (OWNER_19, f"{HUB}: 18/09 XY2 puck physics; 19/09 CFG popover (F-001, print 01)")
for i in range(1, 5):
    OWNER[f"lfo-{i}"] = (OWNER_19, f"{HUB}: 18/09 waveforms animate, live shape hot-swap; 19/09 shape/subdivision UX (F-002, print 02)")
    OWNER[f"stutter-{i}"] = (OWNER_19, f"{HUB}: 18/09 amber depth bar, mode select; 19/09 recall raises depth (F-003, print 03)")
OWNER["snapshot.capture_recall_clear_morph"] = (OWNER_19, f"{HUB}: 19/09 capture/recall/clear, Grid Free + Sync OK, Vector XY jumps (F-004), transition time ignored in Vector (F-005); prints 04-05")
OWNER["cfg.per_control_override"] = (OWNER_19, f"{HUB}: 18/09 CFG scoping PERF/MIX, popover sanitation; 19/09 long-press opens CFG, tap-and-drag controls")
OWNER["map.mode.enter_exit"] = (OWNER_18, f"{HUB}: 18/09 MAP mode used to bind faders to Live track volumes")
OWNER["map.bind_continuous"] = (OWNER_18, f"{HUB}: 18/09 faders mapped to Live track volumes and verified operational")
OWNER["map.clear_all"] = (OWNER_19, f"{HUB}: 19/09 'All mappings cleared.' (print 06)")
OWNER["sync.global"] = (OWNER_19, f"{HUB}: 19/09 SYNC on at 120 BPM, snapshot Sync morph followed tempo (prints 03-05)")
OWNER["sensor.vision.gesture.1"] = (OWNER_19, f"{HUB}: 19/09 learned pose G1 3/3, recognized 77% then 63% (F-009), handedness (F-008), MAP editor filter panel (F-007), label (F-010); prints 06-08")
OWNER["vision.static_pose_learner"] = (OWNER_19, f"{HUB}: 19/09 G1 captured 3/3 and tested; drift after minutes (F-009)")
SMOKE_PREFIXES = {
    "sensor.motion.": f"{HUB}: 19/09 owner reports SNS working; no per-axis record",
    "sensor.orient.": f"{HUB}: 19/09 owner reports SNS working; no per-axis record",
    "sensor.audio.": f"{HUB}: 19/09 owner reports AUD tested in an earlier session; no per-descriptor record",
    "sensor.vision.": f"{HUB}: 19/09 owner reports VID tested in an earlier session; no per-signal record",
}
SMOKE_IDS = {"vision.camera_lifecycle": f"{HUB}: 19/09 camera on, LIVE CHECK shown (prints 07-08)"}
# Owner decisions that block a feature, keyed by the document that records them.
# Derived from the source, never from a previous value of the status column, so
# regenerating the CSVs cannot drop them.
BLOCKED = {
    "max.audio_descriptors_device": "internal/NATIVE-AUDIO-VALIDATION.md: PENDING_OWNER_DEFERRED (Native Track bench deferred by the owner)",
}

# Source files named in progress.jsonl entries, by phase -> feature ids that
# depend on them. Only names quoted in the entry are listed.
READ = {
    "P02": {
        "controls.js": ["pad-", "knob-", "fader-", "xy-", "lfo-", "stutter-"],
        "config-mode.js": ["cfg."],
        "mapping-mode.js": ["map."],
        "audio-processor.js": ["sensor.audio.", "audio.descriptor_worklet"],
        "audio-descriptor-worklet.js": ["audio.descriptor_worklet", "sensor.audio."],
        "vision-processor.js": ["sensor.vision.", "vision."],
    },
    "P03": {
        "continuous-target-actuator": ["live.continuous_target_actuator", "live.mappings"],
        "write-scheduler": ["live.write_scheduler_single_flight", "server.backpressure"],
        "host-modulators": ["live.host_modulators", "lfo-", "stutter-"],
        "transport-clock": ["live.transport_clock", "lfo-", "stutter-"],
        "osc-transport": ["live.osc_transport", "sync.global"],
        "session-auth": ["server.ws.hello", "server.session_rotate"],
        "http.ts": ["server.ws.hello", "server.control_frame"],
        "project-config": ["map.preset.save_load_delete", "live.mappings"],
        "safe-input": ["live.mappings"],
    },
    "P04": {
        "sensor-capabilities": ["sensor.motion.", "sensor.orient."],
        "audio-descriptor-stream": ["audio.descriptor_stream", "sensor.audio."],
        "camera-lifecycle": ["vision.camera_lifecycle"],
        "static-pose": ["vision.static_pose_learner", "sensor.vision.gesture."],
        "PinchClutch": ["vision.pinch_clutch", "sensor.vision.pinch"],
        "Receiver v2": ["max.midi_receiver_v2", "map.tap_to_midi_v2", "map.bind_trigger_note"],
        "Audio Sender v2": ["max.audio_sender_v2"],
        "Audio Descriptors device": ["max.audio_descriptors_device"],
    },
    "P06": {
        "build.ts": ["dist.build_prod_ablx"],
        "verify-release": ["dist.verify_release"],
        "check-release-gates": ["dist.verify_release"],
        "package-tester-kit": ["dist.package_tester_kit"],
        "migrate-data": ["dist.migrate_data"],
    },
    # P05 ran the suites; it names live-bench-device-param-writes only as a failing
    # test, not as a source read, and never mentions bench-ws-compression. No
    # code-reviewed label is derived from P05.
}

TEST_TOKEN = re.compile(r"[A-Za-z0-9_./{},*-]+")


def expand_test_paths(text: str) -> list[Path]:
    """Resolve the free-form test column into existing files on disk."""
    found: list[Path] = []
    for token in TEST_TOKEN.findall(text or ""):
        if not re.search(r"[a-z]", token) or len(token) < 6:
            continue
        candidates: list[str] = []
        brace = re.match(r"^(.*)\{([^}]*)\}(.*)$", token)
        variants = [token]
        if brace:
            variants = [f"{brace.group(1)}{alt}{brace.group(3)}" for alt in brace.group(2).split(",")]
        for variant in variants:
            if "/" in variant:
                candidates.append(variant)
                if not variant.endswith((".mjs", ".ts", ".js", ".json")):
                    candidates += [variant + ".test.mjs", variant + "*.test.mjs"]
            else:
                stem = variant.replace(".test.mjs", "")
                candidates += [
                    f"tests/{stem}.test.mjs", f"tests/{stem}*.test.mjs", f"tests/ui/{stem}.spec.mjs",
                    f"static/phone-v3/{stem}.test.mjs", f"static/phone-v3/{stem}*.test.mjs",
                ]
        for pattern in candidates:
            for hit in glob.glob(str(ROOT / pattern)):
                path = Path(hit)
                if not path.is_file():
                    continue
                rel = path.relative_to(ROOT)
                parent = str(rel.parent).replace("\\", "/")
                runs = (rel.name.endswith(".test.mjs") and parent in NPM_TEST_DIRS) or (
                    rel.name.endswith(".spec.mjs") and (parent == "tests/ui" or parent.startswith("tests/ui/")))
                if runs:
                    found.append(rel)
    return sorted(set(found))


def relabel_features() -> Counter:
    with FEATURES.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fields = list(reader.fieldnames or [])
    if "evidence_basis" not in fields:
        fields.append("evidence_basis")
    counts: Counter = Counter()
    for row in rows:
        fid = row["feature_id"]
        kinds: list[str] = []
        basis: list[str] = []
        if fid in BLOCKED:
            kinds.append("blocked-owner-deferred")
            basis.append(BLOCKED[fid])
        if fid in OWNER:
            kind, note = OWNER[fid]
            kinds.append(kind)
            basis.append(note)
        elif fid in SMOKE_IDS:
            kinds.append(SMOKE_19)
            basis.append(SMOKE_IDS[fid])
        else:
            for prefix, note in SMOKE_PREFIXES.items():
                if fid.startswith(prefix):
                    kinds.append(SMOKE_19)
                    basis.append(note)
                    break
        tests = expand_test_paths((row.get("test") or "") + ";" + (row.get("real_evidence") or ""))
        if tests:
            kinds.append("automated-test-P05")
            basis.append("ran in P05 npm test / test:ui: " + ", ".join(str(t).replace("\\", "/") for t in tests[:4]) + (" …" if len(tests) > 4 else ""))
        phases = []
        for phase, names in READ.items():
            for name, targets in names.items():
                if any(fid == t or fid.startswith(t) for t in targets):
                    phases.append((phase, name))
        if phases:
            by_phase: dict[str, list[str]] = {}
            for phase, name in phases:
                by_phase.setdefault(phase, []).append(name)
            for phase in sorted(by_phase):
                kinds.append(f"code-reviewed-{phase}")
            basis.append("progress.jsonl " + "; ".join(f"{p}: {', '.join(sorted(set(n)))}" for p, n in sorted(by_phase.items())))
        if not kinds:
            kinds.append("not-verified")
            basis.append("no owner session, no existing test file resolved, no source named in progress")
        row["status"] = ";".join(dict.fromkeys(kinds))
        row["evidence_basis"] = " | ".join(basis)
        for kind in dict.fromkeys(kinds):
            counts[kind] += 1
    with FEATURES.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    return counts


DOCS_READ_P01 = {
    "README.md", "CHANGELOG.md", "package.json", "manifest.json", "internal/RELEASE-GATES-1.0.json",
    "internal/LIVE-WRITE-CEILING-1.0.md", "internal/RELEASE-CANDIDATE-CHECKLIST.pt-BR.md",
    "internal/RELEASE-CANDIDATE-CHECKLIST.md", "internal/TESTER-GUIDE.md", "docs/USER-GUIDE.md",
    "docs/USER-GUIDE.pt-BR.md", "internal/NATIVE-AUDIO-VALIDATION.md",
}
SRC_READ = {
    "P02": ["static/phone-v3/controls.js", "static/phone-v3/config-mode.js", "static/phone-v3/mapping-mode.js",
            "static/phone-v3/audio-processor.js", "static/phone-v3/audio-descriptor-worklet.js",
            "static/phone-v3/vision-processor.js"],
    "P03": ["src/live/continuous-target-actuator.ts", "src/live/write-scheduler.ts", "src/live/host-modulators.ts",
            "src/live/transport-clock.ts", "src/live/osc-transport.ts", "src/server/session-auth.ts",
            "src/server/http.ts", "src/live/project-config.ts", "src/live/safe-input.ts"],
    "P04": ["static/phone-v3/sensor-capabilities.js", "static/phone-v3/audio-descriptor-stream.js",
            "static/phone-v3/camera-lifecycle.js", "static/RC-Midi-Receiver.amxd", "static/RC-Audio-Sender.amxd"],
    "P06": ["build.ts", "scripts/verify-release.mjs", "scripts/check-release-gates.mjs",
            "scripts/package-tester-kit.mjs", "scripts/migrate-data.mjs"],
}
NPM_TEST_DIRS = {"static/admin", "static/panel", "static/phone-v3", "static/shared", "scripts", "tests"}
BUILD_INPUTS = {"package.json", "package-lock.json", "tsconfig.json", "build.ts", "eslint.config.mjs",
                "eslint.config.js", ".eslintrc.json", "playwright.config.mjs", "playwright.config.ts"}


def relabel_files() -> Counter:
    with FILES.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fields = list(reader.fieldnames or [])
    read_index: dict[str, str] = {}
    for phase, paths in SRC_READ.items():
        for path in paths:
            # Accept the exact path or any tracked path ending with that name.
            read_index[path] = phase
    counts: Counter = Counter()
    for row in rows:
        path = row["path"].replace("\\", "/")
        states: list[str] = []
        evidence: list[str] = []
        for read_path, phase in read_index.items():
            if path == read_path or path.endswith("/" + Path(read_path).name):
                states.append(f"read-{phase}")
                evidence.append(f"named in progress.jsonl {phase}")
        if path in DOCS_READ_P01 or path.endswith(("USER-GUIDE.md", "USER-GUIDE.pt-BR.md")):
            states.append("read-P01")
            evidence.append("read during P01/P02 document pass (progress.jsonl)")
        parent = str(Path(path).parent).replace("\\", "/")
        # Exactly the globs in package.json: test:static, test:src and playwright testDir.
        by_npm_test = path.endswith(".test.mjs") and parent in NPM_TEST_DIRS
        by_test_ui = path.endswith(".spec.mjs") and (parent == "tests/ui" or parent.startswith("tests/ui/"))
        if by_npm_test:
            states.append("executed-P05")
            evidence.append("ran under npm test in P05 (package.json test:static/test:src globs; TEST-RESULTS.md)")
        elif by_test_ui:
            states.append("executed-P05")
            evidence.append("ran under npm run test:ui in P05 (playwright testDir tests/ui; TEST-RESULTS.md)")
        elif Path(path).name in BUILD_INPUTS:
            states.append("executed-P05")
            evidence.append("consumed by npm ci / lint / build:prod in P05 (TEST-RESULTS.md)")
        if not states:
            states.append("inventoried")
            evidence.append("listed by git ls-files; not read or executed in this audit")
        row["review_state"] = ";".join(dict.fromkeys(states))
        row["evidence"] = "; ".join(dict.fromkeys(evidence))
        row["justification"] = "tracked file; state reflects only recorded evidence (see relabel-evidence-states.py)"
        for state in dict.fromkeys(states):
            counts[state] += 1
    with FILES.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    return counts


def main() -> None:
    feature_counts = relabel_features()
    file_counts = relabel_files()
    print("FEATURES.csv evidence kinds (a row may carry several):")
    for kind, count in sorted(feature_counts.items()):
        print(f"  {kind}: {count}")
    print("FILES.csv review states:")
    for state, count in sorted(file_counts.items()):
        print(f"  {state}: {count}")


if __name__ == "__main__":
    main()
