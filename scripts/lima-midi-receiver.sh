#!/usr/bin/env bash
# lima-midi-receiver.sh — install RC-Midi-Receiver.amxd into a local Max
# installation under Lima (or any local-only mount).
#
# Companion to scripts/lima-audio-sender.sh. Same local-only contract:
# this script never touches git, the ableton-store, or any sync state. If
# MAX_PACKAGES points at a Lima mount, the file lands there via the mount
# layer the same way any other local write would.
#
# Usage:
#   MAX_PACKAGES=~/lima/max-packages bash scripts/lima-midi-receiver.sh
#
# Exit codes:
#   0  installed
#   1  missing MAX_PACKAGES or source artifact
#   2  copy failed

set -euo pipefail

repoRoot="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$repoRoot/static/RC-Midi-Receiver.amxd"
dest="${MAX_PACKAGES:?MAX_PACKAGES must point at a local Max packages folder}"

if [ ! -f "$src" ]; then
  echo "lima-midi-receiver: source artifact missing: $src" >&2
  exit 1
fi

if [ ! -d "$dest" ]; then
  echo "lima-midi-receiver: MAX_PACKAGES is not a directory: $dest" >&2
  exit 1
fi

cp -f "$src" "$dest/RC-Midi-Receiver.amxd" || {
  echo "lima-midi-receiver: copy failed" >&2
  exit 2
}

echo "lima-midi-receiver: installed RC-Midi-Receiver.amxd to $dest"
