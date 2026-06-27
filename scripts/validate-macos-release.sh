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

echo "Validating DMG: $DMG_PATH"
hdiutil imageinfo "$DMG_PATH" >/dev/null

ATTACH_OUTPUT="$(hdiutil attach "$DMG_PATH" -readonly -nobrowse)"
DEVICE="$(printf '%s\n' "$ATTACH_OUTPUT" | awk -F '\t' 'NF >= 3 { device=$1 } END { print device }')"
MOUNT_POINT="$(printf '%s\n' "$ATTACH_OUTPUT" | awk -F '\t' 'NF >= 3 { mount=$3 } END { print mount }')"

cleanup() {
  if [[ -n "${DEVICE:-}" ]]; then
    hdiutil detach "$DEVICE" >/dev/null
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
if ! codesign -dvv "$APP_PATH" 2>&1 | grep -q "^TeamIdentifier=${EXPECTED_TEAM}$"; then
  echo "FAIL: TeamIdentifier mismatch — expected ${EXPECTED_TEAM}" >&2
  exit 1
fi
if ! codesign -dvv "$APP_PATH" 2>&1 | grep -q "^Authority=${EXPECTED_AUTHORITY}$"; then
  echo "FAIL: Authority mismatch — expected ${EXPECTED_AUTHORITY}" >&2
  exit 1
fi
echo "Signing identity OK: ${EXPECTED_AUTHORITY}"

echo "macOS release validation passed."
