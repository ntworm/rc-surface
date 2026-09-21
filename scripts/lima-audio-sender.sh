#!/usr/bin/env bash
# lima-audio-sender.sh — install RC-Audio-Sender.amxd into a local Max
# installation under Lima (or any local-only mount).
#
# The Max device is a binary artifact built by scripts/build-audio-sender.js.
# This wrapper only handles the copy step into the target folder; it never
# touches git, the ableton-store, or any sync state. The local Max process
# discovers the device through Max's standard patch-loading path.
#
# Usage:
#   MAX_PACKAGES=~/lima/max-packages bash scripts/lima-audio-sender.sh
#   MAX_PACKAGES=/Volumes/Ableton/Max bash scripts/lima-audio-sender.sh
#
# Exit codes:
#   0  installed
#   1  missing MAX_PACKAGES or source artifact
#   2  copy failed

set -euo pipefail

repoRoot="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$repoRoot/static/RC-Audio-Sender.amxd"
dest="${MAX_PACKAGES:?MAX_PACKAGES must point at a local Max packages folder}"

if [ ! -f "$src" ]; then
  echo "lima-audio-sender: source artifact missing: $src" >&2
  exit 1
fi

if [ ! -d "$dest" ]; then
  echo "lima-audio-sender: MAX_PACKAGES is not a directory: $dest" >&2
  exit 1
fi

# Local-only copy. The script never reaches the ableton-store; if the
# destination is on a Lima mount, the file lands there via the mount
# layer the same way any other local write would.
cp -f "$src" "$dest/RC-Audio-Sender.amxd" || {
  echo "lima-audio-sender: copy failed" >&2
  exit 2
}

echo "lima-audio-sender: installed RC-Audio-Sender.amxd to $dest"
