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
        fx_usd_sgd_rate: row.get(3)?,
        fx_usd_sgd_as_of: row.get(4)?,
        fx_usd_sgd_source: row.get(5)?,
        staleness_threshold_days: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
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
            "SELECT portfolio_name, base_currency, default_currency,
                    fx_usd_sgd_rate, fx_usd_sgd_as_of, fx_usd_sgd_source,
                    staleness_threshold_days, created_at, updated_at
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

        // Fetch existing to merge partial update.
        let existing = conn.query_row(
            "SELECT portfolio_name, base_currency, default_currency,
                    fx_usd_sgd_rate, fx_usd_sgd_as_of, fx_usd_sgd_source,
                    staleness_threshold_days, created_at, updated_at
             FROM settings WHERE id = 1",
            [],
            row_to_settings,
        ).map_err(|_| CommandError::NotFound("settings".to_string()))?;

        // Merge: None in the input means "keep existing"; Some overwrites (even with null via Option).
        let portfolio_name = input.portfolio_name.unwrap_or(existing.portfolio_name);
        let base_currency = input.base_currency.unwrap_or(existing.base_currency);
        let default_currency = input.default_currency.unwrap_or(existing.default_currency);
        // For nullable columns: use input value if provided (Some), else keep existing.
        let fx_usd_sgd_rate = input.fx_usd_sgd_rate.or(existing.fx_usd_sgd_rate);
        let fx_usd_sgd_as_of = input.fx_usd_sgd_as_of.or(existing.fx_usd_sgd_as_of);
        let fx_usd_sgd_source = input.fx_usd_sgd_source.or(existing.fx_usd_sgd_source);
        let staleness_threshold_days = input.staleness_threshold_days.or(existing.staleness_threshold_days);

        conn.execute(
            "UPDATE settings SET
                portfolio_name = ?1,
                base_currency = ?2,
                default_currency = ?3,
                fx_usd_sgd_rate = ?4,
                fx_usd_sgd_as_of = ?5,
                fx_usd_sgd_source = ?6,
                staleness_threshold_days = ?7,
                updated_at = datetime('now')
             WHERE id = 1",
            params![
                portfolio_name,
                base_currency,
                default_currency,
                fx_usd_sgd_rate,
                fx_usd_sgd_as_of,
                fx_usd_sgd_source,
                staleness_threshold_days,
            ],
        )?;

        let updated = conn.query_row(
            "SELECT portfolio_name, base_currency, default_currency,
                    fx_usd_sgd_rate, fx_usd_sgd_as_of, fx_usd_sgd_source,
                    staleness_threshold_days, created_at, updated_at
             FROM settings WHERE id = 1",
            [],
            row_to_settings,
        )?;
        Ok(updated)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}
