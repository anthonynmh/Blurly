#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_DIR="$ROOT_DIR/src-tauri/target/release/bundle"
MACOS_DIR="$BUNDLE_DIR/macos"
DMG_DIR="$BUNDLE_DIR/dmg"

PRODUCT_NAME="$(node -p "require('./src-tauri/tauri.conf.json').productName")"
VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version")"
ARCH="$(uname -m)"
VOLUME_PATH="/Volumes/$PRODUCT_NAME"
FINAL_DMG="$DMG_DIR/${PRODUCT_NAME}_${VERSION}_${ARCH}.dmg"

detach_blurly_volume() {
  if [[ ! -d "$VOLUME_PATH" ]]; then
    return 0
  fi

  echo "Detaching existing $VOLUME_PATH mount before DMG packaging..."
  DEVICES="$(hdiutil info | awk -F '\t' -v mount="$VOLUME_PATH" '$NF == mount { print $1 }')"

  if [[ -n "$DEVICES" ]]; then
    while IFS= read -r device; do
      if [[ -n "$device" ]]; then
        hdiutil detach "$device" >/dev/null || hdiutil detach -force "$device" >/dev/null
      fi
    done <<< "$DEVICES"
  fi

  if [[ -d "$VOLUME_PATH" ]]; then
    diskutil unmount force "$VOLUME_PATH" >/dev/null
  fi
}

mkdir -p "$MACOS_DIR" "$DMG_DIR"
detach_blurly_volume

rm -f "$MACOS_DIR"/rw."${PRODUCT_NAME}"_*.dmg
rm -f "$DMG_DIR"/rw."${PRODUCT_NAME}"_*.dmg

if pnpm tauri build --bundles dmg "$@"; then
  if [[ -f "$FINAL_DMG" ]]; then
    echo "DMG: $FINAL_DMG"
    exit 0
  fi

  FOUND_DMG="$(find "$DMG_DIR" -maxdepth 1 -type f -name '*.dmg' | sort | tail -n 1)"
  if [[ -n "$FOUND_DMG" ]]; then
    echo "DMG: $FOUND_DMG"
    exit 0
  fi

  echo "Tauri DMG build finished but no final DMG was found under $DMG_DIR." >&2
else
  echo "Tauri DMG build failed. The signed app build remains the primary release artifact." >&2
fi

echo "Run 'pnpm release:macos:standalone' to package the signed .app as a zip." >&2
exit 1
