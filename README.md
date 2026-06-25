# Blurly

A local-first, offline portfolio tracker for macOS. Manual data entry, no broker integrations, no live prices, no cloud, no auth. Your data stays on your machine.

## Features

- **Holdings management** — add, edit, and delete holdings with symbol, asset class, quantity, cost basis, current price, currency, sector, region, broker, and notes
- **Dashboard** — at-a-glance portfolio total, cash &amp; money-market balance, asset-class donut chart, and top-5 holdings table
- **Multi-currency** — per-currency subtotals shown as chips on the Dashboard; weights and breakdowns computed within the base-currency cohort only
- **Snapshots** — manually capture your portfolio state as a dated JSON record; designed as the seam for a future AI-analyst module
- **Settings** — portfolio name, base currency, default currency
- **Fully offline** — data stored in a local SQLite database; no network required

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
portfolios     (id, name, base_currency, ...)
holdings       (id, portfolio_id, symbol, asset_class, quantity, current_price, currency, ...)
portfolio_snapshots (id, portfolio_id, snapshot_date, total_value, snapshot_json)
settings       (id=1 singleton, portfolio_name, base_currency, default_currency)
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

Output: `src-tauri/target/release/bundle/macos/Blurly.app`

> **Note:** The unsigned app will trigger macOS Gatekeeper on first launch. Right-click → Open to bypass, or ad-hoc sign with `codesign --force --deep --sign - Blurly.app`.

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

## Future Roadmap

- CSV import / export
- Encrypted local database (SQLCipher)
- Target allocation &amp; rebalancing drift alerts
- AI analyst module (snapshot JSON as context)
- Optional cloud sync (end-to-end encrypted)
- Signed &amp; notarized Mac distribution
- Price import via copy-paste from financial sites

## License

MIT
