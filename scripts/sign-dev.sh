#!/usr/bin/env bash
set -euo pipefail
# Re-sign the debug Blurly binary with the pinned Developer ID identity so
# Keychain ACLs remain stable across rebuilds. Run after `pnpm tauri dev`'s
# first build, or any time cargo rebuilds the binary.

IDENTITY="${BLURLY_SIGN_IDENTITY:-Developer ID Application: Anthony Neo (D4NKPP62S5)}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGETS=(
  "$REPO_ROOT/src-tauri/target/debug/blurly"
  "$REPO_ROOT/src-tauri/target/debug/bundle/macos/Blurly.app"
)

signed=0
for t in "${TARGETS[@]}"; do
  if [[ -e "$t" ]]; then
    echo "Re-signing $t with identity: $IDENTITY"
    codesign --force --options runtime --sign "$IDENTITY" "$t"
    signed=$((signed+1))
  fi
done

if [[ "$signed" -eq 0 ]]; then
  echo "No debug binaries found yet. Run \`pnpm tauri dev\` first, then re-run this script." >&2
  exit 1
fi

echo "Re-signed $signed target(s)."
