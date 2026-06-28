use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Portfolio {
    pub id: String,
    pub name: String,
    pub base_currency: String,
    pub created_at: String,
    pub updated_at: String,
}

// ---------------------------------------------------------------------------
// Holdings
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Holding {
    pub id: String,
    pub portfolio_id: String,
    pub symbol: String,
    pub name: Option<String>,
    pub asset_class: String,
    pub quantity: f64,
    pub average_price: Option<f64>,
    pub current_price: f64,
    pub currency: String,
    pub sector: Option<String>,
    pub region: Option<String>,
    pub broker: Option<String>,
    pub as_of_date: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub price_updated_at: Option<String>,
}

/// Input for bulk price updates from the UpdatePricesDialog.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BulkPriceUpdate {
    pub id: String,
    pub current_price: f64,
    pub as_of_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NewHolding {
    pub portfolio_id: String,
    pub symbol: String,
    pub name: Option<String>,
    pub asset_class: String,
    pub quantity: f64,
    pub average_price: Option<f64>,
    pub current_price: f64,
    pub currency: String,
    pub sector: Option<String>,
    pub region: Option<String>,
    pub broker: Option<String>,
    pub as_of_date: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateHolding {
    pub portfolio_id: Option<String>,
    pub symbol: Option<String>,
    pub name: Option<String>,
    pub asset_class: Option<String>,
    pub quantity: Option<f64>,
    pub average_price: Option<f64>,
    pub current_price: Option<f64>,
    pub currency: Option<String>,
    pub sector: Option<String>,
    pub region: Option<String>,
    pub broker: Option<String>,
    pub as_of_date: Option<String>,
    pub notes: Option<String>,
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SnapshotMeta {
    pub id: String,
    pub portfolio_id: String,
    pub snapshot_date: String,
    pub total_value: f64,
    pub created_at: String,
}

/// Input from TypeScript — the full snapshot JSON is pre-built in TS.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NewSnapshot {
    pub portfolio_id: String,
    pub snapshot_date: String,
    pub total_value: f64,
    /// The full PortfolioSnapshot object serialised to JSON string by TypeScript.
    pub snapshot_json: String,
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub portfolio_name: String,
    pub base_currency: String,
    pub default_currency: String,
    /// USD↔SGD exchange rate: 1 USD = N SGD. Null when not yet set.
    pub fx_usd_sgd_rate: Option<f64>,
    /// Date the FX rate was last set (YYYY-MM-DD).
    pub fx_usd_sgd_as_of: Option<String>,
    /// Provenance of the FX rate: 'manual' (user-entered) or 'web_refresh' (future).
    pub fx_usd_sgd_source: Option<String>,
    /// Number of calendar days before a holding's price is flagged as stale.
    /// Null means use the application default of 7 days.
    pub staleness_threshold_days: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateSettings {
    pub portfolio_name: Option<String>,
    pub base_currency: Option<String>,
    pub default_currency: Option<String>,
    pub fx_usd_sgd_rate: Option<f64>,
    pub fx_usd_sgd_as_of: Option<String>,
    pub fx_usd_sgd_source: Option<String>,
    pub staleness_threshold_days: Option<i64>,
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WatchlistItem {
    pub id: String,
    pub symbol: String,
    pub name: Option<String>,
    pub asset_class: Option<String>,
    pub sector: Option<String>,
    pub region: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NewWatchlistItem {
    pub symbol: String,
    pub name: Option<String>,
    pub asset_class: Option<String>,
    pub sector: Option<String>,
    pub region: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateWatchlistItem {
    pub symbol: Option<String>,
    pub name: Option<String>,
    pub asset_class: Option<String>,
    pub sector: Option<String>,
    pub region: Option<String>,
    pub notes: Option<String>,
}

// ---------------------------------------------------------------------------
// AI Settings (singleton)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiSettings {
    pub provider: String,
    pub model: String,
    pub web_search_enabled: bool,
    pub include_exact_values: bool,
    pub include_quantities: bool,
    pub include_notes: bool,
    pub key_ref: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    /// CDHash of the signing identity active when the key was last saved.
    pub key_signing_cdhash: Option<String>,
    /// Authority string of the signing identity active when the key was last saved.
    pub key_signing_authority: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateAiSettings {
    pub provider: Option<String>,
    pub model: Option<String>,
    pub web_search_enabled: Option<bool>,
    pub include_exact_values: Option<bool>,
    pub include_quantities: Option<bool>,
    pub include_notes: Option<bool>,
}

/// Compact signing-identity summary stored alongside a key reference.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SigningIdentitySummary {
    pub authority: Option<String>,
    pub cdhash: Option<String>,
    pub is_adhoc: bool,
}

/// Full signing identity returned by get_app_signing_identity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SigningIdentity {
    pub team_id: Option<String>,
    pub authority: Option<String>,
    pub identifier: Option<String>,
    pub cdhash: Option<String>,
    pub is_adhoc: bool,
    pub executable_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApiKeyStatus {
    pub provider: String,
    pub key_ref: Option<String>,
    pub status: String,
    pub message: Option<String>,
    /// Signing identity that was active when the key was last saved.
    pub signed_by_when_saved: Option<SigningIdentitySummary>,
    /// Signing identity of the currently running process.
    pub signed_by_now: Option<SigningIdentitySummary>,
}

// ---------------------------------------------------------------------------
// Analysis runs
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisRun {
    pub id: String,
    pub analysis_type: String,
    pub provider: String,
    pub model: String,
    pub status: String,
    pub input_context_json: String,
    pub output_markdown: Option<String>,
    pub output_json: Option<String>,
    pub sources_json: Option<String>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

/// Input to `run_analysis` — JS sends the pre-built portfolio context plus run options.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunAnalysisInput {
    /// JSON string of the AnalysisPortfolioContext (built in TS, opaque to Rust).
    pub input_context_json: String,
    pub analysis_type: String,
    pub time_window: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TestConnectionResult {
    pub ok: bool,
    pub message: String,
}
