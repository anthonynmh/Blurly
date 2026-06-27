//! Runtime code-signing identity introspection for macOS.
//!
//! Shells out to `/usr/bin/codesign -dvv` and parses stderr output.
//! The result is cached in a `OnceLock` so subsequent calls are free —
//! the running binary's signature does not change mid-process.

use std::env;
use std::process::Command;
use std::sync::OnceLock;

use crate::error::CommandError;
use crate::models::SigningIdentity;

static SIGNING_IDENTITY: OnceLock<SigningIdentity> = OnceLock::new();

fn parse_codesign_output(exe_path: &str, stderr: &str) -> SigningIdentity {
    let mut team_id: Option<String> = None;
    let mut authority: Option<String> = None;
    let mut identifier: Option<String> = None;
    let mut cdhash: Option<String> = None;
    let mut is_adhoc = false;

    for line in stderr.lines() {
        if let Some(val) = line.strip_prefix("TeamIdentifier=") {
            team_id = Some(val.to_string());
        } else if line.starts_with("Authority=") && authority.is_none() {
            // First Authority= line is the leaf (most specific) certificate.
            authority = Some(line["Authority=".len()..].to_string());
        } else if let Some(val) = line.strip_prefix("Identifier=") {
            if identifier.is_none() {
                identifier = Some(val.to_string());
            }
        } else if let Some(val) = line.strip_prefix("CDHash=") {
            if cdhash.is_none() {
                cdhash = Some(val.to_string());
            }
        } else if line.contains("Signature=adhoc") {
            is_adhoc = true;
        }
    }

    // No TeamIdentifier → ad-hoc or unsigned.
    if team_id.is_none() {
        is_adhoc = true;
    }

    SigningIdentity {
        team_id,
        authority,
        identifier,
        cdhash,
        is_adhoc,
        executable_path: exe_path.to_string(),
    }
}

/// Synchronous introspection — safe to call from inside `spawn_blocking` closures.
///
/// On first call, shells out to `/usr/bin/codesign -dvv`. Subsequent calls return
/// the cached result instantly via `OnceLock`.
pub fn current_signing_identity_blocking() -> SigningIdentity {
    if let Some(cached) = SIGNING_IDENTITY.get() {
        return cached.clone();
    }

    let exe_path = env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let identity = if exe_path.is_empty() {
        SigningIdentity {
            team_id: None,
            authority: None,
            identifier: None,
            cdhash: None,
            is_adhoc: true,
            executable_path: exe_path,
        }
    } else {
        match Command::new("/usr/bin/codesign")
            .args(["-dvv", "--", &exe_path])
            .output()
        {
            Ok(output) => {
                // codesign writes its detailed info to stderr.
                let stderr = String::from_utf8_lossy(&output.stderr);
                eprintln!("[blurly] codesign output for {exe_path}: {stderr}");
                parse_codesign_output(&exe_path, &stderr)
            }
            Err(e) => {
                eprintln!("[blurly] codesign invocation failed: {e}");
                SigningIdentity {
                    team_id: None,
                    authority: None,
                    identifier: None,
                    cdhash: None,
                    is_adhoc: true,
                    executable_path: exe_path,
                }
            }
        }
    };

    let _ = SIGNING_IDENTITY.set(identity.clone());
    identity
}

#[tauri::command]
pub async fn get_app_signing_identity() -> Result<SigningIdentity, CommandError> {
    tauri::async_runtime::spawn_blocking(current_signing_identity_blocking)
        .await
        .map_err(|e| CommandError::Join(e.to_string()))
}
