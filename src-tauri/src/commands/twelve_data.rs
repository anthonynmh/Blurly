use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use chrono::Local;
use parking_lot::Mutex;
use rusqlite::{params, Connection};
use serde::Deserialize;
use uuid::Uuid;

use crate::commands::db::AppState;
use crate::commands::key_store;
use crate::error::CommandError;
use crate::models::{
    ApiKeyStatus, PriceRefreshInput, PriceRefreshPreview, PriceRefreshRun, TestConnectionResult,
    TwelveDataUsage,
};

const PROVIDER_ID: &str = "twelvedata";
const API_BASE: &str = "https://api.twelvedata.com";
const CREDITS_PER_HOLDING: i64 = 1;
const FALLBACK_DELAY: Duration = Duration::from_secs(10);

#[derive(Debug, Clone)]
struct RefreshCandidate {
    id: String,
    symbol: String,
    provider_symbol: String,
}

#[derive(Debug, Deserialize)]
struct TwelveDataPriceResponse {
    price: Option<String>,
    status: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TwelveDataUsageResponse {
    current_usage: Option<i64>,
    plan_limit: Option<i64>,
    daily_usage: Option<i64>,
    plan_daily_limit: Option<i64>,
    plan_category: Option<String>,
    status: Option<String>,
    message: Option<String>,
}

fn http_client(timeout_secs: u64) -> Result<reqwest::Client, CommandError> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| CommandError::Network(format!("Build Twelve Data HTTP client: {e}")))
}

fn eligible_where_clause() -> &'static str {
    "portfolio_id = ?1
     AND asset_class IN ('Stock', 'ETF', 'Crypto')
     AND quantity > 0"
}

fn count_eligible(conn: &Connection, portfolio_id: &str) -> Result<i64, CommandError> {
    let sql = format!(
        "SELECT COUNT(*) FROM holdings WHERE {}",
        eligible_where_clause()
    );
    Ok(conn.query_row(&sql, params![portfolio_id], |row| row.get(0))?)
}

fn count_skipped(conn: &Connection, portfolio_id: &str) -> Result<i64, CommandError> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM holdings
         WHERE portfolio_id = ?1
           AND NOT (asset_class IN ('Stock', 'ETF', 'Crypto') AND quantity > 0)",
        params![portfolio_id],
        |row| row.get(0),
    )?)
}

fn load_candidates(
    conn: &Connection,
    portfolio_id: &str,
    limit: i64,
) -> Result<Vec<RefreshCandidate>, CommandError> {
    if limit <= 0 {
        return Ok(Vec::new());
    }

    let sql = format!(
        "SELECT id, symbol, COALESCE(NULLIF(provider_symbol, ''), symbol) AS provider_symbol
         FROM holdings
         WHERE {}
         ORDER BY
           price_refreshed_at IS NOT NULL ASC,
           COALESCE(price_refreshed_at, '') ASC,
           as_of_date ASC,
           symbol ASC
         LIMIT ?2",
        eligible_where_clause()
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![portfolio_id, limit], |row| {
        Ok(RefreshCandidate {
            id: row.get(0)?,
            symbol: row.get(1)?,
            provider_symbol: row.get(2)?,
        })
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

fn daily_remaining(usage: &TwelveDataUsage) -> Option<i64> {
    Some((usage.plan_daily_limit? - usage.daily_usage.unwrap_or(0)).max(0))
}

fn safe_per_minute_limit(usage: Option<&TwelveDataUsage>) -> Option<i64> {
    let plan_limit = usage?.plan_limit?;
    if plan_limit <= 0 {
        return None;
    }
    Some(((plan_limit * 3) / 4).max(1))
}

fn recommended_count(eligible_count: i64, usage: Option<&TwelveDataUsage>) -> i64 {
    let mut recommended = eligible_count.max(0);
    if let Some(remaining) = usage.and_then(daily_remaining) {
        recommended = recommended.min(remaining);
    }
    if let Some(per_minute) = safe_per_minute_limit(usage) {
        recommended = recommended.min(per_minute);
    } else {
        recommended = recommended.min(6);
    }
    recommended.max(0)
}

fn max_count(eligible_count: i64, usage: Option<&TwelveDataUsage>) -> i64 {
    let mut max_count = eligible_count.max(0);
    if let Some(remaining) = usage.and_then(daily_remaining) {
        max_count = max_count.min(remaining);
    }
    max_count.max(0)
}

fn delay_between_requests(usage: Option<&TwelveDataUsage>) -> Duration {
    let Some(per_minute) = safe_per_minute_limit(usage) else {
        return FALLBACK_DELAY;
    };
    Duration::from_millis((60_000 / per_minute.max(1) as u64).max(1_000))
}

fn parse_price_response(payload: &str) -> Result<f64, String> {
    let response: TwelveDataPriceResponse =
        serde_json::from_str(payload).map_err(|e| format!("Bad Twelve Data price JSON: {e}"))?;
    if response.status.as_deref() == Some("error") {
        return Err(response
            .message
            .unwrap_or_else(|| "Twelve Data returned an error".to_string()));
    }
    let price_raw = response
        .price
        .ok_or_else(|| "Twelve Data response did not include a price".to_string())?;
    let price = price_raw
        .parse::<f64>()
        .map_err(|e| format!("Twelve Data returned a non-numeric price: {e}"))?;
    if !price.is_finite() || price <= 0.0 {
        return Err("Twelve Data returned an invalid price".to_string());
    }
    Ok(price)
}

fn parse_usage_response(payload: &str) -> Result<TwelveDataUsage, String> {
    let response: TwelveDataUsageResponse =
        serde_json::from_str(payload).map_err(|e| format!("Bad Twelve Data usage JSON: {e}"))?;
    if response.status.as_deref() == Some("error") {
        return Err(response
            .message
            .unwrap_or_else(|| "Twelve Data returned an API usage error".to_string()));
    }
    Ok(TwelveDataUsage {
        current_usage: response.current_usage,
        plan_limit: response.plan_limit,
        daily_usage: response.daily_usage,
        plan_daily_limit: response.plan_daily_limit,
        plan_category: response.plan_category,
    })
}

async fn fetch_usage(key: &str) -> Result<TwelveDataUsage, CommandError> {
    let response = http_client(10)?
        .get(format!("{API_BASE}/api_usage"))
        .query(&[("apikey", key)])
        .send()
        .await
        .map_err(|e| CommandError::Network(format!("Twelve Data API usage request failed: {e}")))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| CommandError::Network(format!("Read Twelve Data API usage response: {e}")))?;
    if !status.is_success() {
        return Err(CommandError::Network(format!(
            "Twelve Data API usage {status}: {}",
            body.chars().take(300).collect::<String>()
        )));
    }
    parse_usage_response(&body).map_err(CommandError::Network)
}

async fn fetch_price(key: &str, symbol: &str) -> Result<f64, String> {
    let response = http_client(10)
        .map_err(|e| e.to_string())?
        .get(format!("{API_BASE}/price"))
        .query(&[("symbol", symbol), ("apikey", key)])
        .send()
        .await
        .map_err(|e| format!("Twelve Data price request failed: {e}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Read Twelve Data price response: {e}"))?;
    if !status.is_success() {
        return Err(format!(
            "Twelve Data price {status}: {}",
            body.chars().take(300).collect::<String>()
        ));
    }
    parse_price_response(&body)
}

fn read_saved_key(data_dir: &std::path::Path) -> Result<Option<String>, CommandError> {
    key_store::get_key(data_dir, PROVIDER_ID)
}

fn saved_status(status: &str, message: Option<String>, has_ref: bool) -> ApiKeyStatus {
    ApiKeyStatus {
        provider: PROVIDER_ID.to_string(),
        key_ref: has_ref.then(|| PROVIDER_ID.to_string()),
        status: status.to_string(),
        message,
        signed_by_when_saved: None,
        signed_by_now: None,
    }
}

#[tauri::command]
pub async fn set_twelve_data_api_key(
    state: tauri::State<'_, AppState>,
    key: String,
) -> Result<ApiKeyStatus, CommandError> {
    let data_dir: PathBuf = state.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let key = key.trim().to_string();
        if key.len() < 8 {
            return Err(CommandError::Storage(
                "Twelve Data API key looks too short after trimming whitespace.".to_string(),
            ));
        }
        key_store::delete_key(&data_dir, PROVIDER_ID)?;
        key_store::set_key(&data_dir, PROVIDER_ID, &key)?;
        Ok(saved_status("saved", None, true))
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn delete_twelve_data_api_key(
    state: tauri::State<'_, AppState>,
) -> Result<(), CommandError> {
    let data_dir: PathBuf = state.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || key_store::delete_key(&data_dir, PROVIDER_ID))
        .await
        .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn get_twelve_data_api_key_status(
    state: tauri::State<'_, AppState>,
) -> Result<ApiKeyStatus, CommandError> {
    let data_dir: PathBuf = state.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || match read_saved_key(&data_dir) {
        Ok(Some(_)) => Ok(saved_status("saved", None, true)),
        Ok(None) => Ok(saved_status("missing", None, false)),
        Err(e) => Ok(saved_status("error", Some(e.to_string()), true)),
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn test_twelve_data_api_key(key: String) -> Result<TestConnectionResult, CommandError> {
    let key = key.trim().to_string();
    match fetch_usage(&key).await {
        Ok(_) => Ok(TestConnectionResult {
            ok: true,
            message: "Connected".to_string(),
        }),
        Err(e) => Ok(TestConnectionResult {
            ok: false,
            message: e.to_string(),
        }),
    }
}

#[tauri::command]
pub async fn get_twelve_data_refresh_preview(
    state: tauri::State<'_, AppState>,
    portfolio_id: String,
) -> Result<PriceRefreshPreview, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    let data_dir: PathBuf = state.data_dir.clone();

    let (key, eligible_count, skipped_count) = tauri::async_runtime::spawn_blocking(move || {
        let key = read_saved_key(&data_dir)?;
        let conn = db.lock();
        Ok::<_, CommandError>((
            key,
            count_eligible(&conn, &portfolio_id)?,
            count_skipped(&conn, &portfolio_id)?,
        ))
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))??;

    let Some(key) = key else {
        return Ok(PriceRefreshPreview {
            has_key: false,
            eligible_count,
            skipped_count,
            recommended_count: 0,
            max_count: 0,
            credits_per_holding: CREDITS_PER_HOLDING,
            usage: None,
            message: Some(
                "Save a Twelve Data API key in Settings before refreshing prices.".to_string(),
            ),
        });
    };

    let (usage, message) = match fetch_usage(&key).await {
        Ok(usage) => (Some(usage), None),
        Err(e) => (
            None,
            Some(format!(
                "Could not read Twelve Data usage. Using a conservative recommendation. {e}"
            )),
        ),
    };
    Ok(PriceRefreshPreview {
        has_key: true,
        eligible_count,
        skipped_count,
        recommended_count: recommended_count(eligible_count, usage.as_ref()),
        max_count: max_count(eligible_count, usage.as_ref()),
        credits_per_holding: CREDITS_PER_HOLDING,
        usage,
        message,
    })
}

// ---------------------------------------------------------------------------
// Background-tracked refresh
//
// The user clicks Start; `start_price_refresh` validates, inserts a run row
// with status='running', spawns the staggered loop on the async runtime, and
// returns the run id synchronously. The UI polls `get_active_price_refresh_run`
// to surface progress. The dialog is dismissable mid-run because state lives
// in the DB, not the frontend.
// ---------------------------------------------------------------------------

fn count_running_for_portfolio(conn: &Connection, portfolio_id: &str) -> Result<i64, CommandError> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM price_refresh_runs
         WHERE portfolio_id = ?1 AND status = 'running'",
        params![portfolio_id],
        |row| row.get(0),
    )?)
}

#[tauri::command]
pub async fn start_price_refresh(
    state: tauri::State<'_, AppState>,
    input: PriceRefreshInput,
) -> Result<String, CommandError> {
    let limit = input.limit.max(0);
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    let data_dir: PathBuf = state.data_dir.clone();
    let portfolio_id = input.portfolio_id;
    let prep_portfolio_id = portfolio_id.clone();

    let (key, eligible_count) = tauri::async_runtime::spawn_blocking(move || {
        let key = read_saved_key(&data_dir)?.ok_or_else(|| {
            CommandError::Storage(
                "Save a Twelve Data API key in Keys before refreshing prices.".to_string(),
            )
        })?;
        let conn = db.lock();
        if count_running_for_portfolio(&conn, &prep_portfolio_id)? > 0 {
            return Err(CommandError::Storage(
                "A price refresh is already running for this portfolio.".to_string(),
            ));
        }
        Ok::<_, CommandError>((key, count_eligible(&conn, &prep_portfolio_id)?))
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))??;

    let usage_before = fetch_usage(&key).await.ok();
    let allowed_limit = limit.min(max_count(eligible_count, usage_before.as_ref()));
    let delay = delay_between_requests(usage_before.as_ref());

    let db_for_load: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    let load_portfolio_id = portfolio_id.clone();
    let candidates = tauri::async_runtime::spawn_blocking(move || {
        let conn = db_for_load.lock();
        load_candidates(&conn, &load_portfolio_id, allowed_limit)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))??;

    let run_id = Uuid::new_v4().to_string();
    let run_id_insert = run_id.clone();
    let portfolio_id_insert = portfolio_id.clone();
    let total_count = candidates.len() as i64;
    let db_for_insert: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db_for_insert.lock();
        conn.execute(
            "INSERT INTO price_refresh_runs
                (id, portfolio_id, status, total_count, processed_count,
                 succeeded_count, failed_count, current_symbol, error_message,
                 started_at, completed_at)
             VALUES (?1, ?2, 'running', ?3, 0, 0, 0, NULL, NULL, datetime('now'), NULL)",
            params![run_id_insert, portfolio_id_insert, total_count],
        )?;
        Ok::<_, CommandError>(())
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))??;

    let db_for_task: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    let task_run_id = run_id.clone();
    tauri::async_runtime::spawn(async move {
        run_refresh_loop(db_for_task, task_run_id, key, candidates, delay).await;
    });

    Ok(run_id)
}

async fn run_refresh_loop(
    db: Arc<Mutex<Connection>>,
    run_id: String,
    key: String,
    candidates: Vec<RefreshCandidate>,
    delay: Duration,
) {
    let today = Local::now().date_naive().format("%Y-%m-%d").to_string();
    let mut succeeded: i64 = 0;
    let mut failed: i64 = 0;

    for (index, candidate) in candidates.iter().enumerate() {
        // Set current_symbol *before* the fetch so the UI sees what's in flight.
        let mark_db = Arc::clone(&db);
        let mark_run = run_id.clone();
        let mark_symbol = candidate.symbol.clone();
        let _ = tauri::async_runtime::spawn_blocking(move || {
            let conn = mark_db.lock();
            conn.execute(
                "UPDATE price_refresh_runs SET current_symbol = ?1 WHERE id = ?2",
                params![mark_symbol, mark_run],
            )
        })
        .await;

        let price_result = fetch_price(&key, &candidate.provider_symbol).await;
        match price_result {
            Ok(price) => {
                let row_db = Arc::clone(&db);
                let id = candidate.id.clone();
                let today_str = today.clone();
                let _ = tauri::async_runtime::spawn_blocking(move || {
                    let conn = row_db.lock();
                    conn.execute(
                        "UPDATE holdings SET
                            current_price = ?1,
                            as_of_date = ?2,
                            price_updated_at = datetime('now'),
                            price_source = 'twelvedata',
                            price_refreshed_at = datetime('now'),
                            price_refresh_error = NULL,
                            updated_at = datetime('now')
                         WHERE id = ?3",
                        params![price, today_str, id],
                    )
                })
                .await;
                succeeded += 1;
            }
            Err(message) => {
                let row_db = Arc::clone(&db);
                let id = candidate.id.clone();
                let _ = tauri::async_runtime::spawn_blocking(move || {
                    let conn = row_db.lock();
                    conn.execute(
                        "UPDATE holdings SET
                            price_refreshed_at = datetime('now'),
                            price_refresh_error = ?1,
                            updated_at = datetime('now')
                         WHERE id = ?2",
                        params![message, id],
                    )
                })
                .await;
                failed += 1;
            }
        }

        let processed = (index + 1) as i64;
        let progress_db = Arc::clone(&db);
        let progress_run = run_id.clone();
        let _ = tauri::async_runtime::spawn_blocking(move || {
            let conn = progress_db.lock();
            conn.execute(
                "UPDATE price_refresh_runs SET
                    processed_count = ?1,
                    succeeded_count = ?2,
                    failed_count = ?3
                 WHERE id = ?4",
                params![processed, succeeded, failed, progress_run],
            )
        })
        .await;

        if index + 1 < candidates.len() {
            tokio::time::sleep(delay).await;
        }
    }

    let final_status = if !candidates.is_empty() && succeeded == 0 {
        "failed"
    } else {
        "succeeded"
    };
    let final_db = Arc::clone(&db);
    let final_run = run_id.clone();
    let _ = tauri::async_runtime::spawn_blocking(move || {
        let conn = final_db.lock();
        conn.execute(
            "UPDATE price_refresh_runs SET
                status = ?1,
                current_symbol = NULL,
                completed_at = datetime('now')
             WHERE id = ?2",
            params![final_status, final_run],
        )
    })
    .await;
}

#[tauri::command]
pub async fn get_active_price_refresh_run(
    state: tauri::State<'_, AppState>,
    portfolio_id: String,
) -> Result<Option<PriceRefreshRun>, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        match conn.query_row(
            "SELECT id, portfolio_id, status, total_count, processed_count,
                    succeeded_count, failed_count, current_symbol, error_message,
                    started_at, completed_at
             FROM price_refresh_runs
             WHERE portfolio_id = ?1 AND status = 'running'
             ORDER BY started_at DESC
             LIMIT 1",
            params![portfolio_id],
            |row| {
                Ok(PriceRefreshRun {
                    id: row.get(0)?,
                    portfolio_id: row.get(1)?,
                    status: row.get(2)?,
                    total_count: row.get(3)?,
                    processed_count: row.get(4)?,
                    succeeded_count: row.get(5)?,
                    failed_count: row.get(6)?,
                    current_symbol: row.get(7)?,
                    error_message: row.get(8)?,
                    started_at: row.get(9)?,
                    completed_at: row.get(10)?,
                })
            },
        ) {
            Ok(run) => Ok(Some(run)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(CommandError::Db(e)),
        }
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn get_latest_price_refresh_run(
    state: tauri::State<'_, AppState>,
    portfolio_id: String,
) -> Result<Option<PriceRefreshRun>, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        match conn.query_row(
            "SELECT id, portfolio_id, status, total_count, processed_count,
                    succeeded_count, failed_count, current_symbol, error_message,
                    started_at, completed_at
             FROM price_refresh_runs
             WHERE portfolio_id = ?1
             ORDER BY started_at DESC
             LIMIT 1",
            params![portfolio_id],
            |row| {
                Ok(PriceRefreshRun {
                    id: row.get(0)?,
                    portfolio_id: row.get(1)?,
                    status: row.get(2)?,
                    total_count: row.get(3)?,
                    processed_count: row.get(4)?,
                    succeeded_count: row.get(5)?,
                    failed_count: row.get(6)?,
                    current_symbol: row.get(7)?,
                    error_message: row.get(8)?,
                    started_at: row.get(9)?,
                    completed_at: row.get(10)?,
                })
            },
        ) {
            Ok(run) => Ok(Some(run)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(CommandError::Db(e)),
        }
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

/// Reconciliation run at startup: any row left in 'running' state is an orphan
/// from a previous app session and would otherwise wedge the UI banner forever.
pub fn mark_orphaned_runs_failed(conn: &Connection) -> Result<(), CommandError> {
    conn.execute(
        "UPDATE price_refresh_runs SET
            status = 'failed',
            error_message = 'Interrupted — app restarted before the refresh finished.',
            completed_at = datetime('now')
         WHERE status = 'running'",
        [],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        delay_between_requests, max_count, parse_price_response, parse_usage_response,
        recommended_count, TwelveDataUsage,
    };
    use std::time::Duration;

    #[test]
    fn parses_valid_price() {
        let price = parse_price_response(r#"{"price":"200.99001"}"#).unwrap();
        assert_eq!(price, 200.99001);
    }

    #[test]
    fn rejects_provider_price_error() {
        let err =
            parse_price_response(r#"{"status":"error","message":"symbol not found"}"#).unwrap_err();
        assert!(err.contains("symbol not found"));
    }

    #[test]
    fn rejects_invalid_price() {
        assert!(parse_price_response(r#"{"price":"0"}"#).is_err());
        assert!(parse_price_response(r#"{"price":"not-a-number"}"#).is_err());
        assert!(parse_price_response(r#"{}"#).is_err());
    }

    #[test]
    fn parses_usage() {
        let usage = parse_usage_response(
            r#"{"current_usage":2,"plan_limit":8,"daily_usage":10,"plan_daily_limit":800,"plan_category":"free"}"#,
        )
        .unwrap();
        assert_eq!(usage.plan_limit, Some(8));
        assert_eq!(usage.plan_daily_limit, Some(800));
    }

    #[test]
    fn computes_soft_recommendation_from_usage() {
        let usage = TwelveDataUsage {
            current_usage: Some(2),
            plan_limit: Some(8),
            daily_usage: Some(790),
            plan_daily_limit: Some(800),
            plan_category: Some("free".to_string()),
        };
        assert_eq!(recommended_count(20, Some(&usage)), 6);
        assert_eq!(max_count(20, Some(&usage)), 10);
    }

    #[test]
    fn recommendation_respects_daily_remaining() {
        let usage = TwelveDataUsage {
            current_usage: Some(0),
            plan_limit: Some(20),
            daily_usage: Some(799),
            plan_daily_limit: Some(800),
            plan_category: None,
        };
        assert_eq!(recommended_count(20, Some(&usage)), 1);
        assert_eq!(max_count(20, Some(&usage)), 1);
    }

    #[test]
    fn delay_uses_seventy_five_percent_of_minute_limit() {
        let usage = TwelveDataUsage {
            current_usage: None,
            plan_limit: Some(8),
            daily_usage: None,
            plan_daily_limit: None,
            plan_category: None,
        };
        assert_eq!(
            delay_between_requests(Some(&usage)),
            Duration::from_secs(10)
        );
    }
}
