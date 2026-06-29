use std::sync::Arc;
use std::time::Duration;

use chrono::NaiveDate;
use parking_lot::Mutex;
use rusqlite::{params, Connection};
use serde::Deserialize;

use crate::commands::db::AppState;
use crate::error::CommandError;
use crate::models::Settings;

const FRANKFURTER_USD_SGD_URL: &str = "https://api.frankfurter.dev/v2/rate/USD/SGD";

#[derive(Debug, Clone, PartialEq)]
struct FrankfurterRate {
    as_of: String,
    rate: f64,
}

#[derive(Debug, Deserialize)]
struct FrankfurterRateResponse {
    date: String,
    base: String,
    quote: String,
    rate: f64,
}

fn parse_frankfurter_rate(json: &str) -> Result<FrankfurterRate, String> {
    let payload: FrankfurterRateResponse =
        serde_json::from_str(json).map_err(|e| format!("Bad Frankfurter JSON: {e}"))?;
    validate_frankfurter_rate(payload)
}

fn validate_frankfurter_rate(payload: FrankfurterRateResponse) -> Result<FrankfurterRate, String> {
    if payload.base != "USD" || payload.quote != "SGD" {
        return Err(format!(
            "Unexpected Frankfurter pair: {}/{}",
            payload.base, payload.quote
        ));
    }

    if !payload.rate.is_finite() || payload.rate <= 0.0 {
        return Err("Frankfurter returned an invalid USD/SGD rate".to_string());
    }

    NaiveDate::parse_from_str(&payload.date, "%Y-%m-%d")
        .map_err(|e| format!("Bad Frankfurter date: {e}"))?;

    Ok(FrankfurterRate {
        as_of: payload.date,
        rate: payload.rate,
    })
}

fn row_to_settings(row: &rusqlite::Row<'_>) -> rusqlite::Result<Settings> {
    Ok(Settings {
        portfolio_name: row.get(0)?,
        base_currency: row.get(1)?,
        default_currency: row.get(2)?,
        fx_usd_sgd_rate: row.get(3)?,
        fx_usd_sgd_as_of: row.get(4)?,
        fx_usd_sgd_source: row.get(5)?,
        fx_usd_sgd_refreshed_at: row.get(6)?,
        staleness_threshold_days: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

#[tauri::command]
pub async fn refresh_fx_rate(state: tauri::State<'_, AppState>) -> Result<Settings, CommandError> {
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| CommandError::Network(format!("Build HTTP client: {e}")))?
        .get(FRANKFURTER_USD_SGD_URL)
        .send()
        .await
        .map_err(|e| CommandError::Network(format!("Frankfurter request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(CommandError::Network(format!(
            "Frankfurter {status}: {}",
            body.chars().take(300).collect::<String>()
        )));
    }

    let body = response
        .text()
        .await
        .map_err(|e| CommandError::Network(format!("Read Frankfurter response: {e}")))?;
    let fx = parse_frankfurter_rate(&body).map_err(CommandError::Network)?;

    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        conn.execute(
            "UPDATE settings SET
                fx_usd_sgd_rate = ?1,
                fx_usd_sgd_as_of = ?2,
                fx_usd_sgd_source = ?3,
                fx_usd_sgd_refreshed_at = datetime('now'),
                updated_at = datetime('now')
             WHERE id = 1",
            params![fx.rate, fx.as_of, "frankfurter"],
        )?;

        let settings = conn.query_row(
            "SELECT portfolio_name, base_currency, default_currency,
                    fx_usd_sgd_rate, fx_usd_sgd_as_of, fx_usd_sgd_source,
                    fx_usd_sgd_refreshed_at,
                    staleness_threshold_days, created_at, updated_at
             FROM settings WHERE id = 1",
            [],
            row_to_settings,
        )?;
        Ok(settings)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::parse_frankfurter_rate;

    #[test]
    fn parses_valid_usd_sgd_rate() {
        let parsed = parse_frankfurter_rate(
            r#"{"date":"2026-06-29","base":"USD","quote":"SGD","rate":1.2947}"#,
        )
        .expect("valid Frankfurter payload");

        assert_eq!(parsed.as_of, "2026-06-29");
        assert_eq!(parsed.rate, 1.2947);
    }

    #[test]
    fn rejects_unexpected_pair() {
        let err = parse_frankfurter_rate(
            r#"{"date":"2026-06-29","base":"EUR","quote":"SGD","rate":1.5}"#,
        )
        .expect_err("wrong pair should fail");

        assert!(err.contains("Unexpected Frankfurter pair"));
    }

    #[test]
    fn rejects_invalid_rate() {
        let err =
            parse_frankfurter_rate(r#"{"date":"2026-06-29","base":"USD","quote":"SGD","rate":0}"#)
                .expect_err("zero rate should fail");

        assert!(err.contains("invalid USD/SGD rate"));
    }

    #[test]
    fn rejects_invalid_date() {
        let err = parse_frankfurter_rate(
            r#"{"date":"20260629","base":"USD","quote":"SGD","rate":1.2947}"#,
        )
        .expect_err("bad date should fail");

        assert!(err.contains("Bad Frankfurter date"));
    }
}
