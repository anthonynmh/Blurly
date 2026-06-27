# Blurly

A local-first, offline portfolio tracker for macOS. Manual data entry, no broker integrations, no live prices, no cloud, no auth. Your data stays on your machine.

## Features

- **Holdings management** — add, edit, and delete holdings with symbol, asset class, quantity, cost basis, current price, currency, sector, region, broker, and notes
- **Dashboard** — at-a-glance portfolio total, cash &amp; money-market balance, asset-class donut chart, and top-5 holdings table
- **Multi-currency** — per-currency subtotals shown as chips on the Dashboard; weights and breakdowns computed within the base-currency cohort only
- **Snapshots** — manually capture your portfolio state as a dated JSON record
- **Analyst (BYOK)** — on-demand AI analysis of your *current* holdings with optional web search. macOS-only this phase.
- **Watchlist** — track tickers you don't hold
- **Settings** — portfolio name, base currency, default currency
- **Fully offline by default** — data stored locally; the only network call is the analyst when you explicitly click Run

## Tech Stack

| Layer | Technology |
|-------|------------|
| Shell | Tauri 2 (Rust, macOS) |
| Frontend | React 18 + TypeScript + Vite |
| Routing | react-router-dom v6 (HashRouter) |
| State / Data | TanStack Query v5 |
| Forms | react-hook-form + zod |
| UI | shadcn/ui (neutral palette, new-york style) + recharts |
| Database | SQLite via rusqlite (statically bundled) |
| Migrations | rusqlite_migration |

## Architecture

```
React component
  └─ useQuery / useMutation
       └─ src/services/*.ts           (typed invoke wrappers, zero business logic)
            └─ @tauri-apps/api/core invoke()
                 └─ #[tauri::command] async fn   (src-tauri/src/commands/*.rs)
                      └─ spawn_blocking → parking_lot::Mutex<rusqlite::Connection>
```

**Rules:**
- UI components never import `invoke` directly — only through a service.
- Services are pure invoke wrappers; all business logic lives in `src/lib/calculations.ts`.
- `calculations.ts` is pure functions — no DB, no React, fully unit-testable with Vitest.
- All DB commands wrap work in `tauri::async_runtime::spawn_blocking`; the `Mutex<Connection>` is locked *inside* the closure, never across `.await`.
- `PortfolioSnapshot` (built in TypeScript, persisted as JSON) is the deliberate seam for a future AI-analyst module.

## Data Model

```sql
portfolios          (id, name, base_currency, ...)
holdings            (id, portfolio_id, symbol, asset_class, quantity, current_price, currency, ...)
portfolio_snapshots (id, portfolio_id, snapshot_date, total_value, snapshot_json)
settings            (id=1 singleton, portfolio_name, base_currency, default_currency)
analysis_runs       (id, analysis_type, provider, model, status, input_context_json, output_markdown, sources_json, ...)
watchlist_items     (id, symbol, name, asset_class, sector, region, notes, ...)
ai_settings         (id=1 singleton, provider, model, web_search_enabled, privacy toggles, key_ref)
```

A `default` portfolio row is seeded on first launch; the MVP UI always uses `portfolio_id = 'default'`.

## Project Structure

```
Blurly/
├── src/
│   ├── App.tsx                    # QueryClientProvider + HashRouter + AppShell
│   ├── components/
│   │   ├── ui/                    # shadcn copies
│   │   ├── app-shell.tsx
│   │   ├── sidebar.tsx
│   │   ├── holding-form.tsx       # shared by Add + Edit pages
│   │   ├── holdings-table.tsx
│   │   ├── asset-breakdown.tsx    # recharts donut
│   │   ├── top-holdings-table.tsx
│   │   ├── stat-card.tsx
│   │   └── empty-state.tsx
│   ├── pages/
│   │   ├── dashboard.tsx
│   │   ├── holdings.tsx
│   │   ├── add-holding.tsx
│   │   ├── edit-holding.tsx
│   │   ├── settings.tsx
│   │   └── snapshots.tsx
│   ├── services/                  # typed invoke wrappers
│   └── lib/
│       ├── types.ts
│       ├── calculations.ts        # pure functions (unit-tested)
│       ├── formatters.ts
│       └── invoke.ts              # error-normalising helper
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json            # bundle id com.blurly.app
    ├── migrations/001_init.sql
    └── src/
        ├── lib.rs                 # run() — setup, init_db, manage(AppState)
        ├── main.rs                # calls blurly_lib::run()
        ├── models.rs              # serde DTOs
        ├── error.rs               # thiserror CommandError
        └── commands/
            ├── db.rs              # AppState, init_db
            ├── holdings.rs
            ├── portfolio.rs
            ├── snapshots.rs
            └── settings.rs
```

## Prerequisites

- **Node.js** 20+ and **pnpm** 8+
- **Rust** toolchain (via rustup): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Xcode Command Line Tools**: `xcode-select --install`

## Development

```bash
# Install JS dependencies
pnpm install

# Generate app icons (requires a 1024×1024 PNG source)
pnpm tauri icon path/to/icon.png

# Start dev server (Vite + Tauri)
pnpm tauri dev
```

## Build

```bash
pnpm tauri build
```

Default output:

- `src-tauri/target/release/bundle/macos/Blurly.app`

> **Note:** The unsigned app will trigger macOS Gatekeeper on first launch. Right-click → Open to bypass, or ad-hoc sign with `codesign --force --deep --sign - Blurly.app`.

Create and validate the standalone zip artifact:

```bash
pnpm release:macos:standalone
pnpm release:macos:validate:standalone
```

That produces `src-tauri/target/release/bundle/macos/Blurly_<version>_aarch64_app.zip`.

Create a DMG explicitly when needed:

```bash
pnpm release:macos:dmg
pnpm release:macos:validate
```

The DMG script detaches any stale `/Volumes/Blurly` mount and removes leftover writable staging images before invoking Tauri's DMG bundler. If the DMG step still fails, ship the signed `.app` or standalone zip instead of treating the default build as failed.

## Data Location

```
~/Library/Application Support/com.blurly.app/blurly.db
```

Inspect with: `sqlite3 ~/Library/"Application Support"/com.blurly.app/blurly.db`

## Running Tests

```bash
pnpm test
```

Runs Vitest against `src/lib/calculations.test.ts` (pure TS, no Tauri dependency).

## Analyst Module (BYOK)

The Analyst is an on-demand, opt-in AI review of your current holdings. It is intentionally framed as long-term *investment research*, not financial advice.

### Design highlights

- **Reads current holdings, not snapshots.** The analyst builds an in-memory `AnalysisPortfolioContext` from `holdings` at runtime (`src/lib/analysis.ts`). Snapshot data is never consulted — keeping the two systems independent.
- **BYOK — Bring Your Own Key.** Blurly never ships a default API key. You enter your own OpenAI key in **AI Settings** → it is stored as a per-machine encrypted file under the OS app data directory (see [Key storage](#key-storage)). The key is **never** written to `blurly.db`; only the provider id (e.g. `openai`) is kept in `ai_settings.key_ref` as a flag.
- **Provider-agnostic surface.** All OpenAI-specific code lives in `src-tauri/src/ai/openai.rs`. Adding another provider is a single new file under `src-tauri/src/ai/` plus a match arm in `commands/analysis.rs`.
- **GPT web search.** When enabled, the analyst calls OpenAI's Responses API with the `web_search_preview` tool to surface impactful recent news (sector moves, macro shifts) relevant to your holdings.
- **Two-part memo.** Output is structured: primary focus on rebalancing & long-term positioning, secondary section on impactful recent news. Always with sources.

### Privacy defaults

Defaults are privacy-conscious. **Off by default**: exact market values, share quantities, free-form notes. **Always on**: symbols, asset classes, currency, portfolio weights, sectors, regions. Toggle individually in **AI Settings**, and use the *Data preview* on the Analyst page to see exactly what will be sent before clicking Run.

### Windows note

Analyst BYOK is **not supported on Windows** in this phase. The Windows release builds, and you can use the rest of the app, but Analyst / AI Settings / Analysis History show an in-app warning banner and the Run / Save Key / Test Connection buttons are disabled. macOS is the supported platform for this phase.

### Key storage

API keys are encrypted at rest on disk, **not** in the OS keychain. The earlier `keyring` v3 backend was found to silently no-op on macOS 26 for Developer-ID-signed apps (`SecKeychainAddGenericPassword` returns success but writes nothing), so storage now lives in the app itself.

- **Location:** `<app_data_dir>/secrets/<provider>.bin` (e.g. `~/Library/Application Support/com.blurly.app/secrets/openai.bin` on macOS). File mode `0600` on Unix.
- **Cipher:** ChaCha20-Poly1305 AEAD via the `chacha20poly1305` crate. Layout: 12-byte nonce ‖ ciphertext+tag.
- **Key derivation:** BLAKE3 over a fixed domain separator, the host's `IOPlatformUUID` (or `$HOME` fallback), and the bundle id `com.blurly.app`. The derivation is deterministic per machine — restarting the app re-derives the same key — but a different machine cannot decrypt the file.
- **Implications:** moving `~/Library/Application Support/com.blurly.app` between machines (Time Machine restore to a different Mac, etc.) makes the saved key unreadable. The UI surfaces this as a *Saved key unreadable* state; the fix is to clear and re-save.
- **Threat model in scope:** read-only access to the user's data dir from another local user, accidental backup leakage to systems without the original machine UUID.
- **Out of scope:** an attacker with full read access to the user's home directory on the same machine (they can derive the same key). For that threat model, FileVault is the appropriate layer.

Implemented in `src-tauri/src/commands/key_store.rs`; consumed by `src-tauri/src/commands/ai_keys.rs`.

### Known limitations

- OpenAI is the only provider implemented.
- No real-time price fetching — prices come from your manual `current_price` entries.
- Web-search "time window" is a prompt hint, not a hard filter.
- Analyst output is research, not advice. Memos avoid direct buy/sell instructions.

## Future Roadmap

- CSV import / export
- Encrypted local database (SQLCipher)
- Target allocation &amp; rebalancing drift alerts
- Additional AI providers
- Optional cloud sync (end-to-end encrypted)
- Signed &amp; notarized Mac distribution
- Price import via copy-paste from financial sites

## License

MIT
