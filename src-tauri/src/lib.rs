mod ai;
mod commands;
mod error;
mod models;

use std::sync::Arc;

use parking_lot::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = commands::db::init_db(&dir.join("blurly.db"))?;
            // Recover any price-refresh runs left in 'running' state by a prior
            // session — otherwise the Holdings progress banner would hang forever.
            commands::twelve_data::mark_orphaned_runs_failed(&conn)?;
            app.manage(commands::db::AppState {
                db: Arc::new(Mutex::new(conn)),
                data_dir: dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::holdings::list_holdings,
            commands::holdings::get_holding,
            commands::holdings::create_holding,
            commands::holdings::update_holding,
            commands::holdings::delete_holding,
            commands::holdings::update_prices_bulk,
            commands::portfolio::get_default_portfolio,
            commands::portfolio::get_portfolio,
            commands::snapshots::create_snapshot,
            commands::snapshots::list_snapshots,
            commands::snapshots::get_snapshot,
            commands::snapshots::delete_snapshot,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::fx::refresh_fx_rate,
            commands::twelve_data::set_twelve_data_api_key,
            commands::twelve_data::delete_twelve_data_api_key,
            commands::twelve_data::get_twelve_data_api_key_status,
            commands::twelve_data::test_twelve_data_api_key,
            commands::twelve_data::get_twelve_data_refresh_preview,
            commands::twelve_data::start_price_refresh,
            commands::twelve_data::get_active_price_refresh_run,
            commands::twelve_data::get_latest_price_refresh_run,
            commands::watchlist::list_watchlist,
            commands::watchlist::create_watchlist_item,
            commands::watchlist::update_watchlist_item,
            commands::watchlist::delete_watchlist_item,
            commands::ai_settings::get_ai_settings,
            commands::ai_settings::update_ai_settings,
            commands::ai_keys::set_api_key,
            commands::ai_keys::delete_api_key,
            commands::ai_keys::get_api_key_status,
            commands::ai_keys::has_api_key,
            commands::ai_keys::test_api_key,
            commands::signing::get_app_signing_identity,
            commands::analysis::list_analysis_runs,
            commands::analysis::get_analysis_run,
            commands::analysis::delete_analysis_run,
            commands::analysis::run_analysis,
            commands::strategy::get_investment_strategy,
            commands::strategy::update_investment_strategy,
            commands::strategy::list_strategy_milestones,
            commands::strategy::create_strategy_milestone,
            commands::strategy::update_strategy_milestone,
            commands::strategy::delete_strategy_milestone,
            commands::strategy_reservations::list_strategy_cash_reservations,
            commands::strategy_reservations::create_strategy_cash_reservation,
            commands::strategy_reservations::update_strategy_cash_reservation,
            commands::strategy_reservations::delete_strategy_cash_reservation,
            commands::analyst_chat::list_analyst_threads,
            commands::analyst_chat::get_analyst_thread,
            commands::analyst_chat::create_analyst_thread,
            commands::analyst_chat::delete_analyst_thread,
            commands::analyst_chat::ask_analyst_question,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
