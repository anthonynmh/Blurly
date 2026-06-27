#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_DIR="$ROOT_DIR/src-tauri/target/release/bundle"
MACOS_DIR="$BUNDLE_DIR/macos"
DMG_DIR="$BUNDLE_DIR/dmg"
APP_INPUT="${1:-}"
ZIP_OUTPUT="${2:-}"
DEVICE=""

find_top_level_app() {
  find "$1" -maxdepth 1 -type d -name '*.app' | sort | head -n 1
}

cleanup() {
  if [[ -n "${DEVICE:-}" ]]; then
    hdiutil detach "$DEVICE" >/dev/null
  fi
}

trap cleanup EXIT

mkdir -p "$MACOS_DIR"

if [[ -n "$APP_INPUT" && ! -d "$APP_INPUT" ]]; then
  echo "App path does not exist: $APP_INPUT" >&2
  exit 1
fi

APP_SOURCE="$APP_INPUT"
if [[ -z "$APP_SOURCE" ]]; then
  APP_SOURCE="$(find_top_level_app "$MACOS_DIR")"
fi

if [[ -z "$APP_SOURCE" ]]; then
  DMG_PATH="$(find "$DMG_DIR" -maxdepth 1 -type f -name '*.dmg' | sort | tail -n 1)"
  if [[ -z "$DMG_PATH" || ! -f "$DMG_PATH" ]]; then
    echo "No standalone app or DMG found under $BUNDLE_DIR." >&2
    exit 1
  fi

  echo "Extracting standalone app from DMG: $DMG_PATH"
  ATTACH_OUTPUT="$(hdiutil attach "$DMG_PATH" -readonly -nobrowse)"
  DEVICE="$(printf '%s\n' "$ATTACH_OUTPUT" | awk -F '\t' 'NF >= 3 { device=$1 } END { print device }')"
  MOUNT_POINT="$(printf '%s\n' "$ATTACH_OUTPUT" | awk -F '\t' 'NF >= 3 { mount=$3 } END { print mount }')"

  if [[ -z "$MOUNT_POINT" || ! -d "$MOUNT_POINT" ]]; then
    echo "Mounted DMG did not expose a readable mount point." >&2
    exit 1
  fi

  APP_SOURCE="$(find_top_level_app "$MOUNT_POINT")"
  if [[ -z "$APP_SOURCE" ]]; then
    echo "Mounted DMG does not contain a top-level .app bundle." >&2
    exit 1
  fi
fi

APP_NAME="$(basename "$APP_SOURCE")"
APP_DEST="$MACOS_DIR/$APP_NAME"

if [[ "$APP_SOURCE" != "$APP_DEST" ]]; then
  rm -rf "$APP_DEST"
  ditto "$APP_SOURCE" "$APP_DEST"
fi

PRODUCT_NAME="$(node -p "require('./src-tauri/tauri.conf.json').productName")"
VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version")"
ARCH="$(uname -m)"

if [[ -z "$ZIP_OUTPUT" ]]; then
  ZIP_OUTPUT="$MACOS_DIR/${PRODUCT_NAME}_${VERSION}_${ARCH}_app.zip"
fi

rm -f "$ZIP_OUTPUT"
ditto -c -k --sequesterRsrc --keepParent "$APP_DEST" "$ZIP_OUTPUT"

echo "Standalone app: $APP_DEST"
echo "Standalone zip: $ZIP_OUTPUT"
