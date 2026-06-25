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
        entry
            .set_password(&key)
            .map_err(|e| CommandError::Keyring(e.to_string()))?;
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
            Err(e) => Err(CommandError::Keyring(e.to_string())),
        }
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn test_api_key(
    provider: String,
    model: String,
) -> Result<TestConnectionResult, CommandError> {
    let key = tauri::async_runtime::spawn_blocking({
        let provider = provider.clone();
        move || read_key(&provider)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))??;

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
