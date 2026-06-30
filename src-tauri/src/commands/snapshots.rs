use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::commands::db::AppState;
use crate::error::CommandError;
use crate::models::{NewSnapshot, SnapshotMeta};

fn row_to_meta(row: &rusqlite::Row<'_>) -> rusqlite::Result<SnapshotMeta> {
    Ok(SnapshotMeta {
        id: row.get(0)?,
        portfolio_id: row.get(1)?,
        snapshot_date: row.get(2)?,
        total_value: row.get(3)?,
        created_at: row.get(4)?,
    })
}

#[tauri::command]
pub async fn create_snapshot(
    state: tauri::State<'_, AppState>,
    input: NewSnapshot,
) -> Result<SnapshotMeta, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO portfolio_snapshots (id, portfolio_id, snapshot_date, total_value, snapshot_json)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                id,
                input.portfolio_id,
                input.snapshot_date,
                input.total_value,
                input.snapshot_json,
            ],
        )?;
        let meta = conn.query_row(
            "SELECT id, portfolio_id, snapshot_date, total_value, created_at
             FROM portfolio_snapshots WHERE id = ?1",
            params![id],
            row_to_meta,
        )?;
        Ok(meta)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn list_snapshots(
    state: tauri::State<'_, AppState>,
    portfolio_id: String,
) -> Result<Vec<SnapshotMeta>, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let mut stmt = conn.prepare(
            "SELECT id, portfolio_id, snapshot_date, total_value, created_at
             FROM portfolio_snapshots
             WHERE portfolio_id = ?1
             ORDER BY snapshot_date DESC",
        )?;
        let rows = stmt.query_map(params![portfolio_id], row_to_meta)?;
        let mut metas = Vec::new();
        for row in rows {
            metas.push(row?);
        }
        Ok(metas)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn get_snapshot(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let snapshot_json: String = conn
            .query_row(
                "SELECT snapshot_json FROM portfolio_snapshots WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(|_| CommandError::NotFound(format!("snapshot {id}")))?;
        let value: serde_json::Value = serde_json::from_str(&snapshot_json)?;
        Ok(value)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn delete_snapshot(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let affected =
            conn.execute("DELETE FROM portfolio_snapshots WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(CommandError::NotFound(format!("snapshot {id}")));
        }
        Ok(())
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}
