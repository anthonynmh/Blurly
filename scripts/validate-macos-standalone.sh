#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MACOS_DIR="$ROOT_DIR/src-tauri/target/release/bundle/macos"
ARTIFACT_PATH="${1:-}"
TMP_DIR=""

cleanup() {
  if [[ -n "${TMP_DIR:-}" && -d "$TMP_DIR" ]]; then
    rm -rf "$TMP_DIR"
  fi
}

trap cleanup EXIT

if [[ -z "$ARTIFACT_PATH" ]]; then
  ARTIFACT_PATH="$(find "$MACOS_DIR" -maxdepth 1 \( -type f -name '*_app.zip' -o -type d -name '*.app' \) | sort | tail -n 1)"
fi

if [[ -z "$ARTIFACT_PATH" ]]; then
  echo "No standalone app artifact found under $MACOS_DIR." >&2
  exit 1
fi

if [[ -d "$ARTIFACT_PATH" ]]; then
  APP_PATH="$ARTIFACT_PATH"
else
  case "$ARTIFACT_PATH" in
    *.zip)
      TMP_DIR="$(mktemp -d)"
      ditto -x -k "$ARTIFACT_PATH" "$TMP_DIR"
      APP_PATH="$(find "$TMP_DIR" -maxdepth 1 -type d -name '*.app' | sort | head -n 1)"
      ;;
    *)
      echo "Unsupported standalone artifact: $ARTIFACT_PATH" >&2
      exit 1
      ;;
  esac
fi

if [[ -z "${APP_PATH:-}" || ! -d "$APP_PATH" ]]; then
  echo "Could not locate a .app bundle to validate." >&2
  exit 1
fi

echo "Validating standalone app: $APP_PATH"
codesign -dv --verbose=4 "$APP_PATH" >/dev/null
spctl -a -vv "$APP_PATH"
xcrun stapler validate "$APP_PATH"

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

echo "Standalone app validation passed."
