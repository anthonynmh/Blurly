# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install              # install JS deps (Rust deps fetched on first cargo build)
pnpm tauri dev            # run the desktop app (Vite on :1420 + Tauri shell)
pnpm tauri build          # release build → src-tauri/target/release/bundle/macos/Blurly.app
pnpm build                # frontend-only: tsc typecheck + vite build
pnpm test                 # vitest run (one-shot)
pnpm test:watch           # vitest watch
pnpm vitest run src/lib/calculations.test.ts -t "name of test"   # single test by name
```

There is no JS linter configured. Rust side: `cargo fmt --manifest-path src-tauri/Cargo.toml` and `cargo clippy --manifest-path src-tauri/Cargo.toml`.

## Architecture

Tauri 2 desktop app: React 18 + TS frontend (`src/`) over a Rust backend (`src-tauri/`). The IPC call chain is the spine of the app:

```
React component
  └─ TanStack Query (useQuery / useMutation)
       └─ src/services/*.ts          (typed invoke wrappers — zero business logic)
            └─ src/lib/invoke.ts      (error-normalising shim over @tauri-apps/api/core)
                 └─ #[tauri::command] in src-tauri/src/commands/*.rs
                      └─ tauri::async_runtime::spawn_blocking
                           └─ parking_lot::Mutex<rusqlite::Connection>
```

**Layer rules — these are load-bearing, do not violate:**
- UI components never import `invoke` directly. Always go through a service in `src/services/`.
- Services are pure invoke wrappers — no calculations, no formatting, no React.
- All business logic lives in `src/lib/calculations.ts` as pure functions. This is what `calculations.test.ts` exercises; keeping it Tauri-free is what makes it unit-testable.
- Every DB command wraps its work in `tauri::async_runtime::spawn_blocking`. The `Mutex<Connection>` is locked **inside** the closure, never held across `.await` — holding it across await would deadlock the runtime.
- New Rust commands must be registered in `src-tauri/src/lib.rs` inside `tauri::generate_handler![...]`, otherwise the frontend `invoke()` call fails at runtime with no compile-time signal.

**`PortfolioSnapshot` is a deliberate seam.** Snapshots are built in TypeScript (`calculations.ts`) and persisted as a JSON blob in the `portfolio_snapshots.snapshot_json` column. This is intentional — it's the contract for a future AI-analyst module. Changes to the snapshot shape are schema-relevant even though SQL doesn't enforce them.

## Database

- SQLite via `rusqlite` with the `bundled` feature (no system sqlite needed).
- Schema lives in `src-tauri/migrations/001_init.sql`, applied by `rusqlite_migration` in `src-tauri/src/commands/db.rs`. `to_latest()` is idempotent — it tracks applied versions in `PRAGMA user_version` and only runs new migrations.
- To add a schema change: drop `00N_*.sql` next to `001_init.sql`, then add another `M::up(include_str!("../../migrations/00N_*.sql"))` line to the `Migrations::new(vec![...])` call in `db.rs`. Order matters — never reorder or edit existing migrations.
- Per-connection PRAGMAs (`journal_mode=WAL`, `foreign_keys=ON`) are set in `init_db` and run on every launch — safe to re-apply.
- DB file is created at runtime in the OS app-data dir, **never** in the repo:
  - macOS: `~/Library/Application Support/com.blurly.app/blurly.db`
- A `default` portfolio row is seeded on first launch; the MVP UI always uses `portfolio_id = 'default'`.
- The `settings` table is a singleton enforced by `CHECK (id = 1)`.

To reset local state: delete the `blurly.db` file above; next launch rebuilds the schema.

## Tauri v2 gotchas

- `invoke` lives at `@tauri-apps/api/core`, **not** `@tauri-apps/api` (v1 path). The note at the top of `src/lib/invoke.ts` exists because this trips people up.
- Rust errors crossing the IPC boundary arrive in JS as strings; `src/lib/invoke.ts` re-wraps them as `Error` instances so TanStack Query's error handling works.
- Bundle identifier is `com.blurly.app` (set in `src-tauri/tauri.conf.json`). Changing it orphans the existing user DB.
- Release builds are unsigned — first launch triggers Gatekeeper. Right-click → Open, or `codesign --force --deep --sign - Blurly.app`.

## Project layout pointers

- `src/pages/` — one file per route, wired in `src/App.tsx` via `HashRouter`.
- `src/components/ui/` — shadcn copies, neutral palette, new-york style; configured in `components.json`.
- `src/lib/types.ts` — TS mirror of the Rust DTOs in `src-tauri/src/models.rs`. Keep these in sync manually; there's no codegen.
- `src-tauri/src/error.rs` — `CommandError` via `thiserror`. Add new variants here; `Display` is what reaches the frontend.
