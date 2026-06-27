//! BYOK API-key storage backed by the OS keychain (macOS Keychain on Mac).
//!
//! Keys NEVER touch the SQLite database. `ai_settings.key_ref` only stores the
//! provider id we last saved a key for — the secret itself lives in the keychain
//! and is only read inside the Rust process when the analyst runner needs it.

use std::sync::Arc;

use keyring::Entry;
use parking_lot::Mutex;
use rusqlite::Connection;

use crate::commands::ai_settings::set_key_ref;
use crate::commands::db::AppState;
use crate::error::CommandError;
use crate::models::TestConnectionResult;

pub const KEYCHAIN_SERVICE: &str = "com.blurly.app";

pub fn keychain_entry(provider: &str) -> Result<Entry, CommandError> {
    Entry::new(KEYCHAIN_SERVICE, provider).map_err(|e| CommandError::Keyring(e.to_string()))
}

/// Read a key — used internally by the analysis runner, not exposed to JS.
pub fn read_key(provider: &str) -> Result<String, CommandError> {
    let entry = keychain_entry(provider)?;
    entry
        .get_password()
        .map_err(|e| CommandError::Keyring(e.to_string()))
}

#[tauri::command]
pub async fn set_api_key(
    state: tauri::State<'_, AppState>,
    provider: String,
    key: String,
) -> Result<(), CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let entry = keychain_entry(&provider)?;
        if let Err(e) = entry.set_password(&key) {
            eprintln!("[blurly] set_password failed for provider={provider}: {e}");
            return Err(CommandError::Keyring(format!(
                "macOS Keychain refused the write ({e}). \
                 If this app is ad-hoc signed (Gatekeeper bypassed), open Keychain Access \
                 and delete any existing 'com.blurly.app' items, then try again."
            )));
        }
        let conn = db.lock();
        set_key_ref(&conn, Some(&provider))?;
        Ok(())
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn delete_api_key(
    state: tauri::State<'_, AppState>,
    provider: String,
) -> Result<(), CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let entry = keychain_entry(&provider)?;
        // keyring v3: delete_credential. Missing entry is not an error from the user's POV.
        let _ = entry.delete_credential();
        let conn = db.lock();
        set_key_ref(&conn, None)?;
        Ok(())
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn has_api_key(provider: String) -> Result<bool, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let entry = keychain_entry(&provider)?;
        match entry.get_password() {
            Ok(_) => Ok(true),
            Err(keyring::Error::NoEntry) => Ok(false),
            Err(e) => {
                eprintln!("[blurly] get_password failed for provider={provider}: {e}");
                Err(CommandError::Keyring(format!(
                    "macOS Keychain read failed ({e}). Check Keychain Access for stuck items under 'com.blurly.app'."
                )))
            }
        }
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

/// Test a key BEFORE it's saved — accepts the typed key directly so the user can
/// validate before committing to keychain. JS never sees the saved key, by design.
#[tauri::command]
pub async fn test_api_key(
    provider: String,
    key: String,
    model: String,
) -> Result<TestConnectionResult, CommandError> {
    match provider.as_str() {
        "openai" => match crate::ai::openai::OpenAiProvider.test_connection(&key, &model).await {
            Ok(()) => Ok(TestConnectionResult {
                ok: true,
                message: "Connected".to_string(),
            }),
            Err(e) => Ok(TestConnectionResult {
                ok: false,
                message: e,
            }),
        },
        other => Ok(TestConnectionResult {
            ok: false,
            message: format!("Unknown provider: {other}"),
        }),
    }
}
