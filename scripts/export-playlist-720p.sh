#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
exec node scripts/export-playlist.mjs --skip 6 --width 1280 --height 720 "$@"
