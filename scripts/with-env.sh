#!/usr/bin/env bash
# Source the project .env (if present), then exec the given command.
# Used by the release: scripts so that APPLE_ID / APPLE_PASSWORD /
# APPLE_TEAM_ID flow into `tauri build` for notarization. Safe no-op
# if .env doesn't exist (e.g. CI without credentials configured).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$REPO_ROOT/.env"
  set +a
fi

# Tauri's build delegates to cargo, but non-interactive shells started by
# agents/CI/wrappers often don't inherit ~/.cargo/bin from a login shell.
# Make cargo discoverable here so callers don't have to plumb PATH at
# every release: site. No-op if cargo is already on PATH.
if ! command -v cargo >/dev/null 2>&1; then
  if [ -x "$HOME/.cargo/bin/cargo" ]; then
    PATH="$HOME/.cargo/bin:$PATH"
    export PATH
  fi
fi

exec "$@"
