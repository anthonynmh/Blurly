use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::{params, Connection};

use crate::commands::db::AppState;
use crate::error::CommandError;
use crate::models::Portfolio;

fn row_to_portfolio(row: &rusqlite::Row<'_>) -> rusqlite::Result<Portfolio> {
    Ok(Portfolio {
        id: row.get(0)?,
        name: row.get(1)?,
        base_currency: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

#[tauri::command]
pub async fn get_default_portfolio(
    state: tauri::State<'_, AppState>,
) -> Result<Portfolio, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let portfolio = conn.query_row(
            "SELECT id, name, base_currency, created_at, updated_at
             FROM portfolios WHERE id = 'default'",
            [],
            row_to_portfolio,
        ).map_err(|_| CommandError::NotFound("default portfolio".to_string()))?;
        Ok(portfolio)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn get_portfolio(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<Portfolio, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let portfolio = conn.query_row(
            "SELECT id, name, base_currency, created_at, updated_at
             FROM portfolios WHERE id = ?1",
            params![id],
            row_to_portfolio,
        ).map_err(|_| CommandError::NotFound(format!("portfolio {id}")))?;
        Ok(portfolio)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}
