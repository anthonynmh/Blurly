use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::{params, Connection};

use crate::commands::db::AppState;
use crate::error::CommandError;
use crate::models::{Settings, UpdateSettings};

fn merge_nullable<T>(input: Option<Option<T>>, existing: Option<T>) -> Option<T> {
    match input {
        Some(value) => value,
        None => existing,
    }
}

fn merge_settings(existing: Settings, input: UpdateSettings) -> Settings {
    Settings {
        portfolio_name: input.portfolio_name.unwrap_or(existing.portfolio_name),
        base_currency: input.base_currency.unwrap_or(existing.base_currency),
        default_currency: input.default_currency.unwrap_or(existing.default_currency),
        fx_usd_sgd_rate: merge_nullable(input.fx_usd_sgd_rate, existing.fx_usd_sgd_rate),
        fx_usd_sgd_as_of: merge_nullable(input.fx_usd_sgd_as_of, existing.fx_usd_sgd_as_of),
        fx_usd_sgd_source: merge_nullable(input.fx_usd_sgd_source, existing.fx_usd_sgd_source),
        staleness_threshold_days: input
            .staleness_threshold_days
            .or(existing.staleness_threshold_days),
        created_at: existing.created_at,
        updated_at: existing.updated_at,
    }
}

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
pub async fn get_settings(state: tauri::State<'_, AppState>) -> Result<Settings, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let settings = conn
            .query_row(
                "SELECT portfolio_name, base_currency, default_currency,
                    fx_usd_sgd_rate, fx_usd_sgd_as_of, fx_usd_sgd_source,
                    staleness_threshold_days, created_at, updated_at
             FROM settings WHERE id = 1",
                [],
                row_to_settings,
            )
            .map_err(|_| CommandError::NotFound("settings".to_string()))?;
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
        let existing = conn
            .query_row(
                "SELECT portfolio_name, base_currency, default_currency,
                    fx_usd_sgd_rate, fx_usd_sgd_as_of, fx_usd_sgd_source,
                    staleness_threshold_days, created_at, updated_at
             FROM settings WHERE id = 1",
                [],
                row_to_settings,
            )
            .map_err(|_| CommandError::NotFound("settings".to_string()))?;

        let merged = merge_settings(existing, input);

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
                merged.portfolio_name,
                merged.base_currency,
                merged.default_currency,
                merged.fx_usd_sgd_rate,
                merged.fx_usd_sgd_as_of,
                merged.fx_usd_sgd_source,
                merged.staleness_threshold_days,
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

#[cfg(test)]
mod tests {
    use super::merge_settings;
    use crate::models::{Settings, UpdateSettings};

    fn sample_settings() -> Settings {
        Settings {
            portfolio_name: "Main".to_string(),
            base_currency: "USD".to_string(),
            default_currency: "USD".to_string(),
            fx_usd_sgd_rate: Some(1.35),
            fx_usd_sgd_as_of: Some("2026-06-28".to_string()),
            fx_usd_sgd_source: Some("manual".to_string()),
            staleness_threshold_days: Some(7),
            created_at: "2026-06-28T00:00:00Z".to_string(),
            updated_at: "2026-06-28T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn keeps_nullable_fields_when_omitted() {
        let merged = merge_settings(
            sample_settings(),
            UpdateSettings {
                portfolio_name: Some("Renamed".to_string()),
                base_currency: None,
                default_currency: None,
                fx_usd_sgd_rate: None,
                fx_usd_sgd_as_of: None,
                fx_usd_sgd_source: None,
                staleness_threshold_days: None,
            },
        );

        assert_eq!(merged.portfolio_name, "Renamed");
        assert_eq!(merged.fx_usd_sgd_rate, Some(1.35));
        assert_eq!(merged.fx_usd_sgd_as_of.as_deref(), Some("2026-06-28"));
        assert_eq!(merged.fx_usd_sgd_source.as_deref(), Some("manual"));
    }

    #[test]
    fn clears_nullable_fields_when_explicit_null_is_provided() {
        let merged = merge_settings(
            sample_settings(),
            UpdateSettings {
                portfolio_name: None,
                base_currency: None,
                default_currency: None,
                fx_usd_sgd_rate: Some(None),
                fx_usd_sgd_as_of: Some(None),
                fx_usd_sgd_source: Some(None),
                staleness_threshold_days: None,
            },
        );

        assert_eq!(merged.fx_usd_sgd_rate, None);
        assert_eq!(merged.fx_usd_sgd_as_of, None);
        assert_eq!(merged.fx_usd_sgd_source, None);
    }
}
