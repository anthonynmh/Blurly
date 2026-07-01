use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::commands::db::AppState;
use crate::error::CommandError;
use crate::models::{
    InvestmentStrategy, NewStrategyMilestone, StrategyMilestone, UpdateInvestmentStrategy,
    UpdateStrategyMilestone,
};

fn merge_nullable<T>(input: Option<Option<T>>, existing: Option<T>) -> Option<T> {
    match input {
        Some(value) => value,
        None => existing,
    }
}

fn normalise_personality(value: &str) -> Result<String, CommandError> {
    match value {
        "passive" | "hybrid" | "active" => Ok(value.to_string()),
        other => Err(CommandError::Storage(format!(
            "Invalid investor personality: {other}"
        ))),
    }
}

fn row_to_strategy(row: &rusqlite::Row<'_>) -> rusqlite::Result<InvestmentStrategy> {
    Ok(InvestmentStrategy {
        investor_personality: row.get(0)?,
        notes: row.get(1)?,
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
    })
}

fn row_to_milestone(row: &rusqlite::Row<'_>) -> rusqlite::Result<StrategyMilestone> {
    Ok(StrategyMilestone {
        id: row.get(0)?,
        label: row.get(1)?,
        description: row.get(2)?,
        target_date: row.get(3)?,
        target_amount: row.get(4)?,
        target_currency: row.get(5)?,
        sort_order: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

const STRATEGY_SELECT: &str =
    "SELECT investor_personality, notes, created_at, updated_at FROM investment_strategy WHERE id = 1";
const MILESTONE_SELECT: &str =
    "SELECT id, label, description, target_date, target_amount, target_currency, sort_order, created_at, updated_at FROM strategy_milestones";

#[tauri::command]
pub async fn get_investment_strategy(
    state: tauri::State<'_, AppState>,
) -> Result<InvestmentStrategy, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let strategy = conn.query_row(STRATEGY_SELECT, [], row_to_strategy)?;
        Ok(strategy)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn update_investment_strategy(
    state: tauri::State<'_, AppState>,
    input: UpdateInvestmentStrategy,
) -> Result<InvestmentStrategy, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let existing = conn.query_row(STRATEGY_SELECT, [], row_to_strategy)?;
        let investor_personality = match input.investor_personality {
            Some(value) => normalise_personality(&value)?,
            None => existing.investor_personality,
        };
        let notes = merge_nullable(input.notes, existing.notes);

        conn.execute(
            "UPDATE investment_strategy SET
                investor_personality = ?1,
                notes = ?2,
                updated_at = datetime('now')
             WHERE id = 1",
            params![investor_personality, notes],
        )?;
        let updated = conn.query_row(STRATEGY_SELECT, [], row_to_strategy)?;
        Ok(updated)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn list_strategy_milestones(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<StrategyMilestone>, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let mut stmt = conn.prepare(&format!(
            "{MILESTONE_SELECT} ORDER BY sort_order ASC, target_date ASC, created_at ASC"
        ))?;
        let rows = stmt.query_map([], row_to_milestone)?;
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
pub async fn create_strategy_milestone(
    state: tauri::State<'_, AppState>,
    input: NewStrategyMilestone,
) -> Result<StrategyMilestone, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO strategy_milestones
                (id, label, description, target_date, target_amount, target_currency, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                input.label,
                input.description,
                input.target_date,
                input.target_amount,
                input.target_currency,
                input.sort_order,
            ],
        )?;
        let milestone = conn.query_row(
            &format!("{MILESTONE_SELECT} WHERE id = ?1"),
            params![id],
            row_to_milestone,
        )?;
        Ok(milestone)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn update_strategy_milestone(
    state: tauri::State<'_, AppState>,
    id: String,
    input: UpdateStrategyMilestone,
) -> Result<StrategyMilestone, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let existing = conn
            .query_row(
                &format!("{MILESTONE_SELECT} WHERE id = ?1"),
                params![id],
                row_to_milestone,
            )
            .map_err(|_| CommandError::NotFound(format!("strategy_milestone {id}")))?;

        let label = input.label.unwrap_or(existing.label);
        let description = merge_nullable(input.description, existing.description);
        let target_date = input.target_date.unwrap_or(existing.target_date);
        let target_amount = merge_nullable(input.target_amount, existing.target_amount);
        let target_currency = merge_nullable(input.target_currency, existing.target_currency);
        let sort_order = input.sort_order.unwrap_or(existing.sort_order);

        conn.execute(
            "UPDATE strategy_milestones SET
                label = ?1,
                description = ?2,
                target_date = ?3,
                target_amount = ?4,
                target_currency = ?5,
                sort_order = ?6,
                updated_at = datetime('now')
             WHERE id = ?7",
            params![
                label,
                description,
                target_date,
                target_amount,
                target_currency,
                sort_order,
                id,
            ],
        )?;
        let milestone = conn.query_row(
            &format!("{MILESTONE_SELECT} WHERE id = ?1"),
            params![id],
            row_to_milestone,
        )?;
        Ok(milestone)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn delete_strategy_milestone(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let affected =
            conn.execute("DELETE FROM strategy_milestones WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(CommandError::NotFound(format!("strategy_milestone {id}")));
        }
        Ok(())
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}
