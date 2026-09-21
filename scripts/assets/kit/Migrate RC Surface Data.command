#!/bin/bash
# RC Surface data migrator — macOS wrapper
# Copies ~/Library/Application Support/Ableton/Extensions Data/worm.ableton-rc-surface
# into worm.rc-surface without moving or overwriting.
# Usage: double-click or run from terminal.

set -e

BASE="$HOME/Library/Application Support/Ableton/Extensions Data"
SRC="$BASE/worm.ableton-rc-surface"
DST="$BASE/worm.rc-surface"

if [ ! -d "$SRC" ]; then
  echo "Source folder not found: $SRC"
  echo "No migration needed."
  exit 0
fi

mkdir -p "$DST"

echo "Migrating RC Surface data..."
echo "  Source: $SRC"
echo "  Dest:   $DST"
echo ""

COPIED=0
SKIPPED=0

# Enumerate first so traversal failures cannot be hidden by process substitution.
FILES=$(mktemp)
trap 'rm -f "$FILES"' EXIT
find "$SRC" -type f -print0 > "$FILES"
while IFS= read -r -d '' file; do
  rel="${file#$SRC/}"
  target="$DST/$rel"
  if [ -e "$target" ] || [ -L "$target" ]; then
    SKIPPED=$((SKIPPED + 1))
  else
    mkdir -p "$(dirname "$target")"
    cp -n "$file" "$target"
    COPIED=$((COPIED + 1))
  fi
done < "$FILES"

echo ""
echo "Done. Copied $COPIED file(s). Skipped $SKIPPED existing file(s)."
