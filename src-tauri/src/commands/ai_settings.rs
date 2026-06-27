use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::{params, Connection};

use crate::commands::db::AppState;
use crate::error::CommandError;
use crate::models::{AiSettings, UpdateAiSettings};

fn row_to_ai_settings(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiSettings> {
    Ok(AiSettings {
        provider: row.get(0)?,
        model: row.get(1)?,
        web_search_enabled: row.get::<_, i64>(2)? != 0,
        include_exact_values: row.get::<_, i64>(3)? != 0,
        include_quantities: row.get::<_, i64>(4)? != 0,
        include_notes: row.get::<_, i64>(5)? != 0,
        key_ref: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        key_signing_cdhash: row.get(9)?,
        key_signing_authority: row.get(10)?,
    })
}

const SELECT_COLS: &str =
    "SELECT provider, model, web_search_enabled, include_exact_values, include_quantities, \
            include_notes, key_ref, created_at, updated_at, \
            key_signing_cdhash, key_signing_authority \
     FROM ai_settings WHERE id = 1";

/// Synchronous lookup used by other commands that already hold the lock.
pub fn get_ai_settings_inner(conn: &Connection) -> Result<AiSettings, CommandError> {
    conn.query_row(SELECT_COLS, [], row_to_ai_settings)
        .map_err(|_| CommandError::NotFound("ai_settings".to_string()))
}

#[tauri::command]
pub async fn get_ai_settings(
    state: tauri::State<'_, AppState>,
) -> Result<AiSettings, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        get_ai_settings_inner(&conn)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn update_ai_settings(
    state: tauri::State<'_, AppState>,
    input: UpdateAiSettings,
) -> Result<AiSettings, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let existing = conn
            .query_row(SELECT_COLS, [], row_to_ai_settings)
            .map_err(|_| CommandError::NotFound("ai_settings".to_string()))?;

        let provider = input.provider.unwrap_or(existing.provider);
        let model = input.model.unwrap_or(existing.model);
        let web_search_enabled = input.web_search_enabled.unwrap_or(existing.web_search_enabled);
        let include_exact_values = input
            .include_exact_values
            .unwrap_or(existing.include_exact_values);
        let include_quantities = input.include_quantities.unwrap_or(existing.include_quantities);
        let include_notes = input.include_notes.unwrap_or(existing.include_notes);

        conn.execute(
            "UPDATE ai_settings SET
                provider = ?1,
                model = ?2,
                web_search_enabled = ?3,
                include_exact_values = ?4,
                include_quantities = ?5,
                include_notes = ?6,
                updated_at = datetime('now')
             WHERE id = 1",
            params![
                provider,
                model,
                web_search_enabled as i64,
                include_exact_values as i64,
                include_quantities as i64,
                include_notes as i64,
            ],
        )?;

        let updated = conn.query_row(SELECT_COLS, [], row_to_ai_settings)?;
        Ok(updated)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

/// Internal helper — set the key_ref and optional signing identity columns after a
/// successful key write. Pass `None` for signing args when clearing the key.
pub fn set_key_ref(
    conn: &Connection,
    key_ref: Option<&str>,
    signing_cdhash: Option<&str>,
    signing_authority: Option<&str>,
) -> Result<(), CommandError> {
    conn.execute(
        "UPDATE ai_settings \
         SET key_ref = ?1, key_signing_cdhash = ?2, key_signing_authority = ?3, \
             updated_at = datetime('now') \
         WHERE id = 1",
        params![key_ref, signing_cdhash, signing_authority],
    )?;
    Ok(())
}
