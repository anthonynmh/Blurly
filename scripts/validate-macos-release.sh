#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_DMG_DIR="$ROOT_DIR/src-tauri/target/release/bundle/dmg"
DMG_PATH="${1:-}"

if [[ -z "$DMG_PATH" ]]; then
  DMG_PATH="$(find "$DEFAULT_DMG_DIR" -maxdepth 1 -type f -name '*.dmg' | sort | tail -n 1)"
fi

if [[ -z "$DMG_PATH" || ! -f "$DMG_PATH" ]]; then
  echo "No DMG found. Pass a DMG path or build one under $DEFAULT_DMG_DIR." >&2
  exit 1
fi

# Strip the column padding hdiutil applies to its tab-separated output. Without
# this, $1 ends up like "/dev/disk12s1       " (trailing spaces) and the trap's
# `hdiutil detach "$DEVICE"` fails with "No such file or directory", leaving
# stale `/Volumes/Blurly` mounts to accumulate across runs.
trim_whitespace() {
  local value="$1"
  # shellcheck disable=SC2001
  printf '%s' "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

# Stale-volume hygiene: previous failed runs may have left `/Volumes/Blurly`,
# `/Volumes/Blurly 1`, ... still mounted. Detach all of them before mounting a
# fresh copy so codesign and stapler validate read the DMG we actually attached.
PRODUCT_NAME="$(node -p "require('$ROOT_DIR/src-tauri/tauri.conf.json').productName")"
detach_stale_volumes() {
  for v in /Volumes/"$PRODUCT_NAME"*; do
    [[ -d "$v" ]] || continue
    echo "Detaching stale mount: $v"
    hdiutil detach -force "$v" >/dev/null 2>&1 || diskutil unmount force "$v" >/dev/null 2>&1 || true
  done
}
detach_stale_volumes

echo "Validating DMG: $DMG_PATH"
hdiutil imageinfo "$DMG_PATH" >/dev/null

ATTACH_OUTPUT="$(hdiutil attach "$DMG_PATH" -readonly -nobrowse)"
DEVICE="$(trim_whitespace "$(printf '%s\n' "$ATTACH_OUTPUT" | awk -F '\t' 'NF >= 3 { device=$1 } END { print device }')")"
MOUNT_POINT="$(trim_whitespace "$(printf '%s\n' "$ATTACH_OUTPUT" | awk -F '\t' 'NF >= 3 { mount=$3 } END { print mount }')")"

cleanup() {
  if [[ -n "${DEVICE:-}" ]]; then
    hdiutil detach "$DEVICE" >/dev/null 2>&1 || hdiutil detach -force "$DEVICE" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

if [[ -z "$MOUNT_POINT" || ! -d "$MOUNT_POINT" ]]; then
  echo "Mounted DMG did not expose a readable mount point." >&2
  exit 1
fi

APP_PATH="$(find "$MOUNT_POINT" -maxdepth 1 -type d -name '*.app' | sort | head -n 1)"
if [[ -z "$APP_PATH" ]]; then
  echo "Mounted DMG does not contain a .app bundle at the top level." >&2
  exit 1
fi

echo "Mounted app: $APP_PATH"
codesign -dv --verbose=4 "$APP_PATH" >/dev/null
spctl -a -vv "$APP_PATH"
xcrun stapler validate "$APP_PATH"
xcrun stapler validate "$DMG_PATH"

EXPECTED_TEAM="D4NKPP62S5"
EXPECTED_AUTHORITY="Developer ID Application: Anthony Neo (D4NKPP62S5)"

# Extract the actual values and compare as plain strings. This decouples the
# check from regex anchoring and pipefail interactions that previously made
# `grep -q` fail intermittently, and the failure message includes the actual
# value so the next agent can act on it without re-running codesign by hand.
CODESIGN_OUTPUT="$(codesign -dvv "$APP_PATH" 2>&1)"
ACTUAL_TEAM="$(printf '%s\n' "$CODESIGN_OUTPUT" | awk -F= '/^TeamIdentifier=/ { print $2; exit }')"
if [[ "$ACTUAL_TEAM" != "$EXPECTED_TEAM" ]]; then
  echo "FAIL: TeamIdentifier mismatch — expected '${EXPECTED_TEAM}', got '${ACTUAL_TEAM}'" >&2
  exit 1
fi

ACTUAL_AUTHORITY="$(printf '%s\n' "$CODESIGN_OUTPUT" | awk -F= '/^Authority=/ { print $2; exit }')"
if [[ "$ACTUAL_AUTHORITY" != "$EXPECTED_AUTHORITY" ]]; then
  echo "FAIL: Authority mismatch — expected '${EXPECTED_AUTHORITY}', got '${ACTUAL_AUTHORITY}'" >&2
  exit 1
fi
echo "Signing identity OK: ${EXPECTED_AUTHORITY}"

echo "macOS release validation passed."
