//! BYOK API-key storage backed by an encrypted file in the OS app-data dir.
//!
//! Keys NEVER touch the SQLite database. `ai_settings.key_ref` only stores the
//! provider id we last saved a key for — the secret itself lives in an
//! encrypted file (see `key_store`) and is only read inside the Rust process
//! when the analyst runner needs it. This module was previously backed by the
//! `keyring` crate / OS keychain; that path silently no-ops on macOS 26 for
//! signed apps, so we now own the encryption locally.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::Connection;

use crate::commands::ai_settings::{get_ai_settings_inner, set_key_ref};
use crate::commands::db::AppState;
use crate::commands::key_store;
use crate::commands::signing::current_signing_identity_blocking;
use crate::error::CommandError;
use crate::models::{ApiKeyStatus, SigningIdentitySummary, TestConnectionResult};

/// Read a key — used internally by the analysis runner, not exposed to JS.
pub fn read_key(data_dir: &Path, provider: &str) -> Result<String, CommandError> {
    key_store::get_key(data_dir, provider)?.ok_or_else(|| {
        CommandError::Storage(format!(
            "No saved key for provider {provider}. Save a key in AI Settings first."
        ))
    })
}

fn resolved_status(
    provider: String,
    key_ref: Option<String>,
    status: &str,
    message: Option<String>,
    signed_by_when_saved: Option<SigningIdentitySummary>,
    signed_by_now: Option<SigningIdentitySummary>,
) -> ApiKeyStatus {
    ApiKeyStatus {
        provider,
        key_ref,
        status: status.to_string(),
        message,
        signed_by_when_saved,
        signed_by_now,
    }
}

/// Build a summary from the stored cdhash/authority columns.
/// Returns `None` if both columns are NULL (legacy rows pre-migration).
fn stored_signing_summary(
    cdhash: Option<String>,
    authority: Option<String>,
) -> Option<SigningIdentitySummary> {
    if cdhash.is_none() && authority.is_none() {
        return None;
    }
    let is_adhoc = authority.is_none();
    Some(SigningIdentitySummary {
        authority,
        cdhash,
        is_adhoc,
    })
}

fn status_for_missing_entry(
    provider: String,
    key_ref: Option<String>,
    stored_signing: Option<SigningIdentitySummary>,
    current_signing: Option<SigningIdentitySummary>,
) -> ApiKeyStatus {
    let message = match key_ref.as_deref() {
        Some(saved_for) if saved_for == provider.as_str() => Some(format!(
            "Blurly recorded a saved {provider} key, but the encrypted secret file is gone. \
             It may have been deleted from disk. Save the key again to restore it."
        )),
        Some(saved_for) => Some(format!(
            "Blurly expects a key reference for {saved_for}, but there is no readable {provider} \
             secret on disk."
        )),
        None => None,
    };
    let status = if message.is_some() {
        "stale"
    } else {
        "missing"
    };
    resolved_status(
        provider,
        key_ref,
        status,
        message,
        stored_signing,
        current_signing,
    )
}

#[tauri::command]
pub async fn set_api_key(
    state: tauri::State<'_, AppState>,
    provider: String,
    key: String,
) -> Result<ApiKeyStatus, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    let data_dir: PathBuf = state.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let key = key.trim().to_string();
        if key.len() < 8 {
            return Err(CommandError::Storage(
                "API key looks too short after trimming whitespace.".to_string(),
            ));
        }

        // Replace any existing secret then write the new one.
        key_store::delete_key(&data_dir, &provider)?;
        key_store::set_key(&data_dir, &provider, &key)?;

        // Verify the read-back so we never claim "saved" without proof.
        eprintln!(
            "[blurly] set_key succeeded for provider={provider}; verifying fresh read-back"
        );
        match key_store::get_key(&data_dir, &provider) {
            Ok(Some(read_back)) if read_back == key => {
                eprintln!(
                    "[blurly] secret-file fresh read-back succeeded for provider={provider}"
                );
            }
            Ok(Some(_)) => {
                eprintln!(
                    "[blurly] secret-file fresh read-back mismatch for provider={provider}"
                );
                let conn = db.lock();
                set_key_ref(&conn, None, None, None)?;
                return Err(CommandError::Storage(format!(
                    "Saved the {provider} key, but the read-back returned different bytes."
                )));
            }
            Ok(None) => {
                eprintln!(
                    "[blurly] secret-file fresh read-back returned None for provider={provider}"
                );
                let conn = db.lock();
                set_key_ref(&conn, None, None, None)?;
                return Err(CommandError::Storage(format!(
                    "Saved the {provider} key, but the secrets file is missing immediately after the write."
                )));
            }
            Err(e) => {
                eprintln!(
                    "[blurly] secret-file fresh read-back failed for provider={provider}: {e}"
                );
                let conn = db.lock();
                set_key_ref(&conn, None, None, None)?;
                return Err(e);
            }
        }

        // Record the current build's signing identity alongside the key
        // reference so future status calls can surface "which build saved
        // this" in the UI. It is no longer used for ACL matching since the
        // secret store is signing-independent.
        let signing = current_signing_identity_blocking();
        let signing_cdhash = signing.cdhash.clone();
        let signing_authority = signing.authority.clone();
        let signed_now = SigningIdentitySummary {
            authority: signing.authority,
            cdhash: signing.cdhash,
            is_adhoc: signing.is_adhoc,
        };

        let conn = db.lock();
        set_key_ref(
            &conn,
            Some(&provider),
            signing_cdhash.as_deref(),
            signing_authority.as_deref(),
        )?;
        Ok(ApiKeyStatus {
            provider: provider.clone(),
            key_ref: Some(provider),
            status: "saved".to_string(),
            message: None,
            signed_by_when_saved: None,
            signed_by_now: Some(signed_now),
        })
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
    let data_dir: PathBuf = state.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        key_store::delete_key(&data_dir, &provider)?;
        let conn = db.lock();
        set_key_ref(&conn, None, None, None)?;
        Ok(())
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn has_api_key(
    state: tauri::State<'_, AppState>,
    provider: String,
) -> Result<bool, CommandError> {
    let data_dir: PathBuf = state.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        Ok(key_store::get_key(&data_dir, &provider)?.is_some())
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
    let data_dir: PathBuf = state.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (key_ref, stored_cdhash, stored_authority) = {
            let conn = db.lock();
            let settings = get_ai_settings_inner(&conn)?;
            (
                settings.key_ref,
                settings.key_signing_cdhash,
                settings.key_signing_authority,
            )
        };

        let current_signing = current_signing_identity_blocking();
        let current_summary = SigningIdentitySummary {
            authority: current_signing.authority.clone(),
            cdhash: current_signing.cdhash.clone(),
            is_adhoc: current_signing.is_adhoc,
        };
        let stored_summary = stored_signing_summary(stored_cdhash, stored_authority);

        match key_store::get_key(&data_dir, &provider) {
            Ok(Some(_)) => Ok(resolved_status(
                provider,
                key_ref,
                "saved",
                None,
                stored_summary,
                Some(current_summary),
            )),
            Ok(None) => Ok(status_for_missing_entry(
                provider,
                key_ref,
                stored_summary,
                Some(current_summary),
            )),
            Err(e) => {
                eprintln!("[blurly] secret-file read failed for provider={provider}: {e}");
                Ok(resolved_status(
                    provider,
                    key_ref,
                    "error",
                    Some(e.to_string()),
                    stored_summary,
                    Some(current_summary),
                ))
            }
        }
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

/// Test a key BEFORE it's saved — accepts the typed key directly so the user
/// can validate before committing to disk. JS never sees the saved key.
#[tauri::command]
pub async fn test_api_key(
    provider: String,
    key: String,
    model: String,
) -> Result<TestConnectionResult, CommandError> {
    let key = key.trim().to_string();
    match provider.as_str() {
        "openai" => match crate::ai::openai::OpenAiProvider
            .test_connection(&key, &model)
            .await
        {
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
        let status = status_for_missing_entry("openai".to_string(), None, None, None);
        assert_eq!(status.status, "missing");
        assert!(status.message.is_none());
    }

    #[test]
    fn stale_status_when_key_ref_matches_provider() {
        let status =
            status_for_missing_entry("openai".to_string(), Some("openai".to_string()), None, None);
        assert_eq!(status.status, "stale");
        assert!(status
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("encrypted secret file is gone"));
    }

    #[test]
    fn stale_status_when_other_provider_reference_exists() {
        let status = status_for_missing_entry(
            "openai".to_string(),
            Some("anthropic".to_string()),
            None,
            None,
        );
        assert_eq!(status.status, "stale");
        assert!(status
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("anthropic"));
    }
}
