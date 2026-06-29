# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Commands

```bash
pnpm install              # install JS deps (Rust deps fetched on first cargo build)
pnpm tauri dev            # run the desktop app (Vite on :1420 + Tauri shell)
pnpm tauri build          # release build → src-tauri/target/release/bundle/macos/Blurly.app
pnpm build                # frontend-only: tsc typecheck + vite build
pnpm test                 # vitest run (one-shot)
pnpm test:watch           # vitest watch
pnpm vitest run src/lib/calculations.test.ts -t "name of test"   # single test by name
pnpm signing:dev              # sign the built app with Developer ID (dev flow)
pnpm signing:check            # verify the current signing state
```

There is no JS linter configured. Rust side: `cargo fmt --manifest-path src-tauri/Cargo.toml` and `cargo clippy --manifest-path src-tauri/Cargo.toml`.

## Dev flow

Feature work uses the `dev` branch and PRs back into `main`.

1. Start by grounding in the repo: read relevant files, inspect tests/config, and check `git status --short --branch`.
2. Prepare `dev` from `origin/main`:
   - `git fetch origin`
   - if `dev` exists locally, checkout it and fast-forward it to `origin/main` when possible
   - otherwise create it from `origin/main`
3. Implement the accepted plan in focused changes. Keep commits logical: schema/backend, frontend, docs/release metadata, or other natural boundaries.
4. QA before publishing. Usual checks are:
   - `pnpm test`
   - `pnpm build`
   - `cargo clippy --manifest-path src-tauri/Cargo.toml`
   - `cargo test --manifest-path src-tauri/Cargo.toml` when Rust behavior/tests changed
5. Push `dev` and open or update a PR from `dev` into `main` with a concise summary and verification notes.

Avoid committing unrelated formatter churn. If a formatter rewrites files outside the task, restore those unrelated files before committing. The reusable Codex skill for this process is `blurly-dev-flow`.

## Local macOS release flow

Use the dedicated `blurly-local-macos-release` skill when asked to bump the version and create a local signed + notarized macOS DMG.

Release version bumps must update:

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- the `blurly` package entry in `src-tauri/Cargo.lock`

The local DMG release flow is:

```bash
pnpm release:macos:dmg
./scripts/with-env.sh xcrun notarytool submit src-tauri/target/release/bundle/dmg/Blurly_<VERSION>_<ARCH>.dmg --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
xcrun stapler staple src-tauri/target/release/bundle/dmg/Blurly_<VERSION>_<ARCH>.dmg
pnpm release:macos:validate src-tauri/target/release/bundle/dmg/Blurly_<VERSION>_<ARCH>.dmg
```

Prerequisites are the Developer ID Application certificate configured in `tauri.conf.json` and repo-root `.env` values for `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID`. If Tauri DMG bundling fails after leaving `/Volumes/Blurly` mounted, detach the stale mount with `hdiutil detach` and rerun the DMG build. Final handoff should include the DMG path, SHA-256 checksum, notarization IDs, stapling status, signing identity, and any uncommitted version files.

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

**`PortfolioSnapshot` is a deliberate seam.** Snapshots are built in TypeScript (`calculations.ts`) and persisted as a JSON blob in the `portfolio_snapshots.snapshot_json` column. This is the contract the AI analyst module consumes — analysis runs read snapshots and produce results stored separately. Changes to the snapshot shape are schema-relevant even though SQL doesn't enforce them. The analyst lives in `src-tauri/src/ai/` and is invoked via `commands/analysis.rs`.

## Database

- SQLite via `rusqlite` with the `bundled` feature (no system sqlite needed).
- Schema lives across the `00N_*.sql` files in `src-tauri/migrations/`: `001_init.sql` is the initial schema; `002_analyst.sql` adds AI analyst tables; `003_key_signing.sql` adds BYOK key-signing tables. Applied by `rusqlite_migration` in `src-tauri/src/commands/db.rs`. `to_latest()` is idempotent — it tracks applied versions in `PRAGMA user_version` and only runs new migrations.
- To add a schema change: drop `00N_*.sql` next to `001_init.sql`, then add another `M::up(include_str!("../../migrations/00N_*.sql"))` line to the `Migrations::new(vec![...])` call in `db.rs`. Order matters — never reorder or edit existing migrations.
- Per-connection PRAGMAs (`journal_mode=WAL`, `foreign_keys=ON`) are set in `init_db` and run on every launch — safe to re-apply.
- DB file is created at runtime in the OS app-data dir, **never** in the repo:
  - macOS: `~/Library/Application Support/com.blurly.app/blurly.db`
- A `default` portfolio row is seeded on first launch; the MVP UI always uses `portfolio_id = 'default'`.
- The `settings` table is a singleton enforced by `CHECK (id = 1)`.

To reset local state: delete the `blurly.db` file above; next launch rebuilds the schema.

## AI analyst & BYOK

- The analyst calls OpenAI, orchestrated by `commands/analysis.rs`. Core client in `src-tauri/src/ai/openai.rs`; prompts in `src-tauri/src/ai/prompts.rs`. Frontend wiring: `src/lib/analysis.ts` + `src/services/analysis-service.ts`. Results are persisted as analysis runs (schema in `002_analyst.sql`).
- API keys are BYOK. Keys are stored in a ChaCha20-Poly1305 encrypted file on disk — the OS keychain was rejected to avoid OS-level prompts and cross-platform friction (see commit `56dc854`). Storage impl: `src-tauri/src/commands/key_store.rs`; commands exposed to the frontend: `src-tauri/src/commands/ai_keys.rs` (`set_api_key`, `delete_api_key`, `get_api_key_status`, `has_api_key`, `test_api_key`). Frontend service: `src/services/ai-keys-service.ts`.
- AI settings (model selection, etc.): `src-tauri/src/commands/ai_settings.rs` ↔ `src/services/ai-settings-service.ts`.

## Tauri v2 gotchas

- `invoke` lives at `@tauri-apps/api/core`, **not** `@tauri-apps/api` (v1 path). The note at the top of `src/lib/invoke.ts` exists because this trips people up.
- Rust errors crossing the IPC boundary arrive in JS as strings; `src/lib/invoke.ts` re-wraps them as `Error` instances so TanStack Query's error handling works.
- Bundle identifier is `com.blurly.app` (set in `src-tauri/tauri.conf.json`). Changing it orphans the existing user DB.
- Release builds are signed with a Developer ID Application cert (`"Developer ID Application: Anthony Neo (D4NKPP62S5)"`, set in `src-tauri/tauri.conf.json` as `signingIdentity`). Use `pnpm signing:dev` (`scripts/sign-dev.sh`) to sign after a local build; `pnpm signing:check` to verify. `get_app_signing_identity` Tauri command (`src-tauri/src/commands/signing.rs`) exposes the active identity to the frontend.

## Project layout pointers

- `src/pages/` — one file per route, wired in `src/App.tsx` via `HashRouter`.
- `src/components/ui/` — shadcn copies, neutral palette, new-york style; configured in `components.json`.
- `src/lib/types.ts` — TS mirror of the Rust DTOs in `src-tauri/src/models.rs`. Keep these in sync manually; there's no codegen.
- `src/lib/` — also contains `analysis.ts` (analyst client wiring), `formatters.ts` (display helpers), `platform.ts` (platform detection), alongside `calculations.ts`.
- `src-tauri/src/ai/` — analyst client (`openai.rs`), prompts (`prompts.rs`), module root (`mod.rs`).
- `src-tauri/src/error.rs` — `CommandError` via `thiserror`. Add new variants here; `Display` is what reaches the frontend.
