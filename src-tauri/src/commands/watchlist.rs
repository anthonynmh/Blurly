use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::commands::db::AppState;
use crate::error::CommandError;
use crate::models::{NewWatchlistItem, UpdateWatchlistItem, WatchlistItem};

fn row_to_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<WatchlistItem> {
    Ok(WatchlistItem {
        id: row.get(0)?,
        symbol: row.get(1)?,
        name: row.get(2)?,
        asset_class: row.get(3)?,
        sector: row.get(4)?,
        region: row.get(5)?,
        notes: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

const SELECT_COLS: &str =
    "SELECT id, symbol, name, asset_class, sector, region, notes, created_at, updated_at FROM watchlist_items";

#[tauri::command]
pub async fn list_watchlist(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<WatchlistItem>, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let sql = format!("{SELECT_COLS} ORDER BY created_at ASC");
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], row_to_item)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn create_watchlist_item(
    state: tauri::State<'_, AppState>,
    input: NewWatchlistItem,
) -> Result<WatchlistItem, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO watchlist_items (id, symbol, name, asset_class, sector, region, notes)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                input.symbol,
                input.name,
                input.asset_class,
                input.sector,
                input.region,
                input.notes,
            ],
        )?;
        let item = conn.query_row(
            &format!("{SELECT_COLS} WHERE id = ?1"),
            params![id],
            row_to_item,
        )?;
        Ok(item)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn update_watchlist_item(
    state: tauri::State<'_, AppState>,
    id: String,
    input: UpdateWatchlistItem,
) -> Result<WatchlistItem, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let existing = conn
            .query_row(
                &format!("{SELECT_COLS} WHERE id = ?1"),
                params![id],
                row_to_item,
            )
            .map_err(|_| CommandError::NotFound(format!("watchlist_item {id}")))?;

        let symbol = input.symbol.unwrap_or(existing.symbol);
        let name = if input.name.is_some() {
            input.name
        } else {
            existing.name
        };
        let asset_class = if input.asset_class.is_some() {
            input.asset_class
        } else {
            existing.asset_class
        };
        let sector = if input.sector.is_some() {
            input.sector
        } else {
            existing.sector
        };
        let region = if input.region.is_some() {
            input.region
        } else {
            existing.region
        };
        let notes = if input.notes.is_some() {
            input.notes
        } else {
            existing.notes
        };

        conn.execute(
            "UPDATE watchlist_items SET
                symbol = ?1, name = ?2, asset_class = ?3, sector = ?4,
                region = ?5, notes = ?6, updated_at = datetime('now')
             WHERE id = ?7",
            params![symbol, name, asset_class, sector, region, notes, id],
        )?;

        let updated = conn.query_row(
            &format!("{SELECT_COLS} WHERE id = ?1"),
            params![id],
            row_to_item,
        )?;
        Ok(updated)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn delete_watchlist_item(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let affected = conn.execute("DELETE FROM watchlist_items WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(CommandError::NotFound(format!("watchlist_item {id}")));
        }
        Ok(())
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}
