use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::commands::db::AppState;
use crate::error::CommandError;
use crate::models::{BulkPriceUpdate, Holding, NewHolding, UpdateHolding};

fn row_to_holding(row: &rusqlite::Row<'_>) -> rusqlite::Result<Holding> {
    Ok(Holding {
        id: row.get(0)?,
        portfolio_id: row.get(1)?,
        symbol: row.get(2)?,
        name: row.get(3)?,
        asset_class: row.get(4)?,
        quantity: row.get(5)?,
        average_price: row.get(6)?,
        current_price: row.get(7)?,
        currency: row.get(8)?,
        sector: row.get(9)?,
        region: row.get(10)?,
        broker: row.get(11)?,
        as_of_date: row.get(12)?,
        notes: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
        price_updated_at: row.get(16)?,
    })
}

fn query_holdings(conn: &Connection, sql: &str, params: &[&dyn rusqlite::ToSql]) -> Result<Vec<Holding>, CommandError> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params, row_to_holding)?;
    let mut holdings = Vec::new();
    for row in rows {
        holdings.push(row?);
    }
    Ok(holdings)
}

#[tauri::command]
pub async fn list_holdings(
    state: tauri::State<'_, AppState>,
    portfolio_id: String,
) -> Result<Vec<Holding>, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        query_holdings(
            &conn,
            "SELECT id, portfolio_id, symbol, name, asset_class, quantity, average_price,
                    current_price, currency, sector, region, broker, as_of_date, notes,
                    created_at, updated_at, price_updated_at
             FROM holdings
             WHERE portfolio_id = ?1
             ORDER BY created_at ASC",
            params![portfolio_id],
        )
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn get_holding(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<Option<Holding>, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let mut stmt = conn.prepare(
            "SELECT id, portfolio_id, symbol, name, asset_class, quantity, average_price,
                    current_price, currency, sector, region, broker, as_of_date, notes,
                    created_at, updated_at, price_updated_at
             FROM holdings WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], row_to_holding)?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn create_holding(
    state: tauri::State<'_, AppState>,
    input: NewHolding,
) -> Result<Holding, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO holdings (id, portfolio_id, symbol, name, asset_class, quantity,
                average_price, current_price, currency, sector, region, broker,
                as_of_date, notes, price_updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, datetime('now'))",
            params![
                id,
                input.portfolio_id,
                input.symbol,
                input.name,
                input.asset_class,
                input.quantity,
                input.average_price,
                input.current_price,
                input.currency,
                input.sector,
                input.region,
                input.broker,
                input.as_of_date,
                input.notes,
            ],
        )?;
        let holding = conn.query_row(
            "SELECT id, portfolio_id, symbol, name, asset_class, quantity, average_price,
                    current_price, currency, sector, region, broker, as_of_date, notes,
                    created_at, updated_at, price_updated_at
             FROM holdings WHERE id = ?1",
            params![id],
            row_to_holding,
        )?;
        Ok(holding)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn update_holding(
    state: tauri::State<'_, AppState>,
    id: String,
    input: UpdateHolding,
) -> Result<Holding, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();

        // Fetch existing holding first
        let existing = conn.query_row(
            "SELECT id, portfolio_id, symbol, name, asset_class, quantity, average_price,
                    current_price, currency, sector, region, broker, as_of_date, notes,
                    created_at, updated_at, price_updated_at
             FROM holdings WHERE id = ?1",
            params![id],
            row_to_holding,
        ).map_err(|_| CommandError::NotFound(format!("holding {id}")))?;

        // Determine if price-related fields changed BEFORE consuming them.
        let price_changed = input.current_price.map(|p| p != existing.current_price).unwrap_or(false);
        let date_changed = input.as_of_date.as_deref().map(|d| d != existing.as_of_date).unwrap_or(false);
        let refresh_price_ts = price_changed || date_changed;

        let symbol = input.symbol.unwrap_or(existing.symbol);
        let name = input.name.or(existing.name);
        let asset_class = input.asset_class.unwrap_or(existing.asset_class);
        let quantity = input.quantity.unwrap_or(existing.quantity);
        let average_price = if input.average_price.is_some() {
            input.average_price
        } else {
            existing.average_price
        };
        let current_price = input.current_price.unwrap_or(existing.current_price);
        let currency = input.currency.unwrap_or(existing.currency);
        let sector = if input.sector.is_some() { input.sector } else { existing.sector };
        let region = if input.region.is_some() { input.region } else { existing.region };
        let broker = if input.broker.is_some() { input.broker } else { existing.broker };
        let as_of_date = input.as_of_date.unwrap_or(existing.as_of_date);
        let notes = if input.notes.is_some() { input.notes } else { existing.notes };

        conn.execute(
            "UPDATE holdings SET
                symbol = ?1, name = ?2, asset_class = ?3, quantity = ?4,
                average_price = ?5, current_price = ?6, currency = ?7,
                sector = ?8, region = ?9, broker = ?10, as_of_date = ?11,
                notes = ?12, updated_at = datetime('now'),
                price_updated_at = CASE WHEN ?13 THEN datetime('now') ELSE price_updated_at END
             WHERE id = ?14",
            params![
                symbol, name, asset_class, quantity,
                average_price, current_price, currency,
                sector, region, broker, as_of_date,
                notes, refresh_price_ts, id,
            ],
        )?;

        let updated = conn.query_row(
            "SELECT id, portfolio_id, symbol, name, asset_class, quantity, average_price,
                    current_price, currency, sector, region, broker, as_of_date, notes,
                    created_at, updated_at, price_updated_at
             FROM holdings WHERE id = ?1",
            params![id],
            row_to_holding,
        )?;
        Ok(updated)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn delete_holding(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let affected = conn.execute("DELETE FROM holdings WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(CommandError::NotFound(format!("holding {id}")));
        }
        Ok(())
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

/// Bulk-update current prices and as-of dates for multiple holdings in one
/// atomic transaction. Called by the UpdatePricesDialog to commit all edits at once.
#[tauri::command]
pub async fn update_prices_bulk(
    state: tauri::State<'_, AppState>,
    updates: Vec<BulkPriceUpdate>,
) -> Result<(), CommandError> {
    let db = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let mut conn = db.lock();
        let tx = conn.transaction()?;
        for u in &updates {
            tx.execute(
                "UPDATE holdings SET
                    current_price = ?1,
                    as_of_date = ?2,
                    price_updated_at = datetime('now'),
                    updated_at = datetime('now')
                 WHERE id = ?3",
                params![u.current_price, u.as_of_date, u.id],
            )?;
        }
        tx.commit()?;
        Ok(())
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}
