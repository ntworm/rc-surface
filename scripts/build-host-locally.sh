#!/usr/bin/env bash
# build-host-locally.sh — local-only build wrapper.
#
# Runs the A+B slices of the pipeline without touching any sync state or
# any host installation. The script is intentionally minimal: it delegates
# to scripts/sync-tester-kit.mjs so the npm and shell entry points agree.
#
# Usage:
#   bash scripts/build-host-locally.sh
#   bash scripts/build-host-locally.sh --only=A
#
# Exit codes match sync-tester-kit.mjs (0=ok, 2=bad-args, 3=missing-entry,
# 4=missing-target for slice R). The script itself never exits non-zero
# for local-only failures: it surfaces them but leaves the host alone.

set -euo pipefail

repoRoot="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$repoRoot/scripts/sync-tester-kit.mjs" "$@"
