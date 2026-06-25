use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::{params, Connection};

use crate::commands::db::AppState;
use crate::error::CommandError;
use crate::models::{Settings, UpdateSettings};

fn row_to_settings(row: &rusqlite::Row<'_>) -> rusqlite::Result<Settings> {
    Ok(Settings {
        portfolio_name: row.get(0)?,
        base_currency: row.get(1)?,
        default_currency: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

#[tauri::command]
pub async fn get_settings(
    state: tauri::State<'_, AppState>,
) -> Result<Settings, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let settings = conn.query_row(
            "SELECT portfolio_name, base_currency, default_currency, created_at, updated_at
             FROM settings WHERE id = 1",
            [],
            row_to_settings,
        ).map_err(|_| CommandError::NotFound("settings".to_string()))?;
        Ok(settings)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn update_settings(
    state: tauri::State<'_, AppState>,
    input: UpdateSettings,
) -> Result<Settings, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();

        // Fetch existing to merge partial update
        let existing = conn.query_row(
            "SELECT portfolio_name, base_currency, default_currency, created_at, updated_at
             FROM settings WHERE id = 1",
            [],
            row_to_settings,
        ).map_err(|_| CommandError::NotFound("settings".to_string()))?;

        let portfolio_name = input.portfolio_name.unwrap_or(existing.portfolio_name);
        let base_currency = input.base_currency.unwrap_or(existing.base_currency);
        let default_currency = input.default_currency.unwrap_or(existing.default_currency);

        conn.execute(
            "UPDATE settings SET
                portfolio_name = ?1,
                base_currency = ?2,
                default_currency = ?3,
                updated_at = datetime('now')
             WHERE id = 1",
            params![portfolio_name, base_currency, default_currency],
        )?;

        let updated = conn.query_row(
            "SELECT portfolio_name, base_currency, default_currency, created_at, updated_at
             FROM settings WHERE id = 1",
            [],
            row_to_settings,
        )?;
        Ok(updated)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}
