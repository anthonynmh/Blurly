mod ai;
mod commands;
mod error;
mod models;

use std::sync::Arc;

use parking_lot::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = commands::db::init_db(&dir.join("blurly.db"))?;
            app.manage(commands::db::AppState {
                db: Arc::new(Mutex::new(conn)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::holdings::list_holdings,
            commands::holdings::get_holding,
            commands::holdings::create_holding,
            commands::holdings::update_holding,
            commands::holdings::delete_holding,
            commands::portfolio::get_default_portfolio,
            commands::portfolio::get_portfolio,
            commands::snapshots::create_snapshot,
            commands::snapshots::list_snapshots,
            commands::snapshots::get_snapshot,
            commands::snapshots::delete_snapshot,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::watchlist::list_watchlist,
            commands::watchlist::create_watchlist_item,
            commands::watchlist::update_watchlist_item,
            commands::watchlist::delete_watchlist_item,
            commands::ai_settings::get_ai_settings,
            commands::ai_settings::update_ai_settings,
            commands::ai_keys::set_api_key,
            commands::ai_keys::delete_api_key,
            commands::ai_keys::has_api_key,
            commands::ai_keys::test_api_key,
            commands::analysis::list_analysis_runs,
            commands::analysis::get_analysis_run,
            commands::analysis::delete_analysis_run,
            commands::analysis::run_analysis,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
