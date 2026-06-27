//! BYOK API-key storage backed by the OS keychain (macOS Keychain on Mac).
//!
//! Keys NEVER touch the SQLite database. `ai_settings.key_ref` only stores the
//! provider id we last saved a key for — the secret itself lives in the keychain
//! and is only read inside the Rust process when the analyst runner needs it.

use std::sync::Arc;

use keyring::Entry;
use parking_lot::Mutex;
use rusqlite::Connection;

use crate::commands::ai_settings::{get_ai_settings_inner, set_key_ref};
use crate::commands::db::AppState;
use crate::error::CommandError;
use crate::models::{ApiKeyStatus, TestConnectionResult};

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

fn keychain_write_failed_message(provider: &str, detail: &str) -> CommandError {
    CommandError::Keyring(format!(
        "macOS Keychain saved the {provider} key, but Blurly could not read it back ({detail}). \
         Blurly will not mark the key as saved. If you have older Blurly builds, delete existing \
         'com.blurly.app' items in Keychain Access and try again."
    ))
}

fn resolved_status(
    provider: String,
    key_ref: Option<String>,
    status: &str,
    message: Option<String>,
) -> ApiKeyStatus {
    ApiKeyStatus {
        provider,
        key_ref,
        status: status.to_string(),
        message,
        signed_by_when_saved: None,
        signed_by_now: None,
    }
}

fn status_for_missing_entry(provider: String, key_ref: Option<String>) -> ApiKeyStatus {
    let message = match key_ref.as_deref() {
        Some(saved_for) if saved_for == provider.as_str() => Some(format!(
            "Blurly last saved a {provider} key, but Keychain no longer has a readable entry. \
             This usually means the key was saved by another Blurly build identity or the Keychain \
             item was deleted. Clear the stale entry, then save the key again."
        )),
        Some(saved_for) => Some(format!(
            "Blurly expects a key reference for {saved_for}, but there is no readable {provider} \
             entry in Keychain."
        )),
        None => None,
    };
    let status = if message.is_some() { "stale" } else { "missing" };
    resolved_status(provider, key_ref, status, message)
}

fn verify_saved_key(provider: &str, expected_key: &str) -> Result<(), CommandError> {
    let verify_entry = keychain_entry(provider)?;
    match verify_entry.get_password() {
        Ok(saved_key) if saved_key == expected_key => {
            eprintln!("[blurly] keychain fresh read-back succeeded for provider={provider}");
            Ok(())
        }
        Ok(_) => {
            eprintln!("[blurly] keychain fresh read-back mismatch for provider={provider}");
            Err(keychain_write_failed_message(
                provider,
                "Keychain returned a different value than Blurly just wrote",
            ))
        }
        Err(keyring::Error::NoEntry) => {
            eprintln!(
                "[blurly] keychain fresh read-back returned no entry for provider={provider}"
            );
            Err(keychain_write_failed_message(
                provider,
                "Keychain returned no readable entry immediately after the write",
            ))
        }
        Err(e) => {
            eprintln!("[blurly] keychain fresh read-back failed for provider={provider}: {e}");
            Err(keychain_write_failed_message(provider, &e.to_string()))
        }
    }
}

#[tauri::command]
pub async fn set_api_key(
    state: tauri::State<'_, AppState>,
    provider: String,
    key: String,
) -> Result<ApiKeyStatus, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let key = key.trim().to_string();
        if key.len() < 8 {
            return Err(CommandError::Keyring(
                "API key looks too short after trimming whitespace.".to_string(),
            ));
        }

        let entry = keychain_entry(&provider)?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => {
                eprintln!(
                    "[blurly] delete existing credential failed for provider={provider}: {e}"
                );
                return Err(CommandError::Keyring(format!(
                    "macOS Keychain could not replace the existing {provider} key ({e}). \
                     Delete existing 'com.blurly.app' items in Keychain Access and try again."
                )));
            }
        }

        let entry = keychain_entry(&provider)?;
        if let Err(e) = entry.set_password(&key) {
            eprintln!("[blurly] set_password failed for provider={provider}: {e}");
            let conn = db.lock();
            set_key_ref(&conn, None, None, None)?;
            return Err(CommandError::Keyring(format!(
                "macOS Keychain refused the write ({e}). \
                 If this app is ad-hoc signed (Gatekeeper bypassed), open Keychain Access \
                 and delete any existing 'com.blurly.app' items, then try again."
            )));
        }

        eprintln!(
            "[blurly] set_password succeeded for provider={provider}; verifying fresh read-back"
        );
        if let Err(e) = verify_saved_key(&provider, &key) {
            let conn = db.lock();
            set_key_ref(&conn, None, None, None)?;
            return Err(e);
        }

        let conn = db.lock();
        set_key_ref(&conn, Some(&provider), None, None)?;
        Ok(resolved_status(provider.clone(), Some(provider), "saved", None))
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
        set_key_ref(&conn, None, None, None)?;
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

#[tauri::command]
pub async fn get_api_key_status(
    state: tauri::State<'_, AppState>,
    provider: String,
) -> Result<ApiKeyStatus, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let key_ref = {
            let conn = db.lock();
            get_ai_settings_inner(&conn)?.key_ref
        };

        let entry = keychain_entry(&provider)?;
        match entry.get_password() {
            Ok(_) => Ok(resolved_status(provider, key_ref, "saved", None)),
            Err(keyring::Error::NoEntry) => Ok(status_for_missing_entry(provider, key_ref)),
            Err(e) => {
                eprintln!("[blurly] get_password failed for provider={provider}: {e}");
                Ok(resolved_status(
                    provider,
                    key_ref,
                    "error",
                    Some(format!(
                        "macOS Keychain read failed ({e}). Check Keychain Access for stuck items under 'com.blurly.app'."
                    )),
                ))
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
    let key = key.trim().to_string();
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

#[cfg(test)]
mod tests {
    use super::status_for_missing_entry;

    #[test]
    fn missing_status_when_no_key_ref_exists() {
        let status = status_for_missing_entry("openai".to_string(), None);
        assert_eq!(status.status, "missing");
        assert!(status.message.is_none());
    }

    #[test]
    fn stale_status_when_key_ref_matches_provider() {
        let status = status_for_missing_entry("openai".to_string(), Some("openai".to_string()));
        assert_eq!(status.status, "stale");
        assert!(status
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("another Blurly build identity"));
    }

    #[test]
    fn stale_status_when_other_provider_reference_exists() {
        let status = status_for_missing_entry("openai".to_string(), Some("anthropic".to_string()));
        assert_eq!(status.status, "stale");
        assert!(status
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("anthropic"));
    }
}
