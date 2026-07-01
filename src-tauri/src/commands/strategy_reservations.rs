use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::commands::db::AppState;
use crate::error::CommandError;
use crate::models::{
    NewStrategyCashReservation, StrategyCashReservation, UpdateStrategyCashReservation,
};

fn merge_nullable<T>(input: Option<Option<T>>, existing: Option<T>) -> Option<T> {
    match input {
        Some(value) => value,
        None => existing,
    }
}

fn row_to_reservation(row: &rusqlite::Row<'_>) -> rusqlite::Result<StrategyCashReservation> {
    Ok(StrategyCashReservation {
        id: row.get(0)?,
        holding_id: row.get(1)?,
        milestone_id: row.get(2)?,
        amount: row.get(3)?,
        currency: row.get(4)?,
        notes: row.get(5)?,
        sort_order: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

const RESERVATION_SELECT: &str = "SELECT id, holding_id, milestone_id, amount, currency, notes, sort_order, created_at, updated_at FROM strategy_cash_reservations";

fn normalise_currency(value: &str) -> Result<String, CommandError> {
    let upper = value.trim().to_ascii_uppercase();
    if upper == "SGD" || upper == "USD" {
        Ok(upper)
    } else {
        Err(CommandError::Storage(format!(
            "Reservation currency must be SGD or USD, got {value}"
        )))
    }
}

fn validate_amount(amount: f64) -> Result<(), CommandError> {
    if !amount.is_finite() || amount < 0.0 {
        return Err(CommandError::Storage(format!(
            "Reservation amount must be a non-negative finite number, got {amount}"
        )));
    }
    Ok(())
}

/// Ensure the target holding exists and its asset_class is Cash or MoneyMarket.
fn validate_holding_is_cash_equivalent(
    conn: &Connection,
    holding_id: &str,
) -> Result<(), CommandError> {
    let asset_class: String = conn
        .query_row(
            "SELECT asset_class FROM holdings WHERE id = ?1",
            params![holding_id],
            |row| row.get(0),
        )
        .map_err(|_| CommandError::NotFound(format!("holding {holding_id}")))?;
    if asset_class != "Cash" && asset_class != "MoneyMarket" {
        return Err(CommandError::Storage(format!(
            "Reservations can only be linked to Cash or MoneyMarket holdings (holding {holding_id} is {asset_class})"
        )));
    }
    Ok(())
}

fn validate_milestone_exists(conn: &Connection, milestone_id: &str) -> Result<(), CommandError> {
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM strategy_milestones WHERE id = ?1",
            params![milestone_id],
            |_| Ok(true),
        )
        .unwrap_or(false);
    if !exists {
        return Err(CommandError::NotFound(format!(
            "strategy_milestone {milestone_id}"
        )));
    }
    Ok(())
}

#[tauri::command]
pub async fn list_strategy_cash_reservations(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<StrategyCashReservation>, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let mut stmt = conn.prepare(&format!(
            "{RESERVATION_SELECT} ORDER BY sort_order ASC, created_at ASC"
        ))?;
        let rows = stmt.query_map([], row_to_reservation)?;
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
pub async fn create_strategy_cash_reservation(
    state: tauri::State<'_, AppState>,
    input: NewStrategyCashReservation,
) -> Result<StrategyCashReservation, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();

        validate_amount(input.amount)?;
        let currency = normalise_currency(&input.currency)?;
        validate_holding_is_cash_equivalent(&conn, &input.holding_id)?;
        validate_milestone_exists(&conn, &input.milestone_id)?;

        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO strategy_cash_reservations
                (id, holding_id, milestone_id, amount, currency, notes, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                input.holding_id,
                input.milestone_id,
                input.amount,
                currency,
                input.notes,
                input.sort_order,
            ],
        )?;
        let reservation = conn.query_row(
            &format!("{RESERVATION_SELECT} WHERE id = ?1"),
            params![id],
            row_to_reservation,
        )?;
        Ok(reservation)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn update_strategy_cash_reservation(
    state: tauri::State<'_, AppState>,
    id: String,
    input: UpdateStrategyCashReservation,
) -> Result<StrategyCashReservation, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let existing = conn
            .query_row(
                &format!("{RESERVATION_SELECT} WHERE id = ?1"),
                params![id],
                row_to_reservation,
            )
            .map_err(|_| CommandError::NotFound(format!("strategy_cash_reservation {id}")))?;

        let holding_id = input.holding_id.unwrap_or(existing.holding_id);
        let milestone_id = input.milestone_id.unwrap_or(existing.milestone_id);
        let amount = input.amount.unwrap_or(existing.amount);
        let currency_raw = input.currency.unwrap_or(existing.currency);
        let notes = merge_nullable(input.notes, existing.notes);
        let sort_order = input.sort_order.unwrap_or(existing.sort_order);

        validate_amount(amount)?;
        let currency = normalise_currency(&currency_raw)?;
        validate_holding_is_cash_equivalent(&conn, &holding_id)?;
        validate_milestone_exists(&conn, &milestone_id)?;

        conn.execute(
            "UPDATE strategy_cash_reservations SET
                holding_id = ?1,
                milestone_id = ?2,
                amount = ?3,
                currency = ?4,
                notes = ?5,
                sort_order = ?6,
                updated_at = datetime('now')
             WHERE id = ?7",
            params![
                holding_id,
                milestone_id,
                amount,
                currency,
                notes,
                sort_order,
                id,
            ],
        )?;
        let reservation = conn.query_row(
            &format!("{RESERVATION_SELECT} WHERE id = ?1"),
            params![id],
            row_to_reservation,
        )?;
        Ok(reservation)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn delete_strategy_cash_reservation(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let affected = conn.execute(
            "DELETE FROM strategy_cash_reservations WHERE id = ?1",
            params![id],
        )?;
        if affected == 0 {
            return Err(CommandError::NotFound(format!(
                "strategy_cash_reservation {id}"
            )));
        }
        Ok(())
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}
