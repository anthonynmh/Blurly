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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
