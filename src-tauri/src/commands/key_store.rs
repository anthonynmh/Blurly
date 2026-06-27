//! Local encrypted secret storage in the OS app-data directory.
//!
//! Why this exists (not the OS keychain): on macOS 26 with signed apps,
//! `keyring` v3.6.3's legacy `SecKeychainAddGenericPassword` path silently
//! returns success while writing nothing the same process can later read back.
//! Reproduced both under Hardened Runtime and without; using the modern
//! `keychain-access-groups` entitlement requires a provisioning profile that
//! Developer ID (non-MAS) apps don't ship with. The reliable, cross-platform
//! alternative is to encrypt locally and store next to the SQLite DB.
//!
//! Layout: `<app_data_dir>/secrets/<provider>.bin` — a 12-byte ChaCha20-Poly1305
//! nonce followed by the AEAD ciphertext+tag. File mode 0600 on Unix.
//!
//! The encryption key is derived per machine: BLAKE3 over a fixed domain
//! separator || the host's `IOPlatformUUID` (macOS) or `$HOME` fallback || the
//! app bundle id. Re-deriving on the same machine always produces the same
//! 32-byte key, so saves persist across app restarts. Moving the file to a
//! different machine will fail to decrypt — which is the desired property.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use chacha20poly1305::{
    aead::{Aead, AeadCore, OsRng},
    ChaCha20Poly1305, KeyInit, Nonce,
};

use crate::error::CommandError;

const KEY_DOMAIN: &[u8] = b"blurly-secret-v1";
const BUNDLE_ID: &[u8] = b"com.blurly.app";
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;

fn secrets_path(data_dir: &Path, provider: &str) -> PathBuf {
    data_dir.join("secrets").join(format!("{provider}.bin"))
}

/// Read the host's stable per-machine identifier. Cached for the process
/// lifetime — the identifier never changes mid-process and a single failed
/// ioreg call should not silently start re-keying live secrets.
fn machine_id() -> &'static str {
    static CACHED: OnceLock<String> = OnceLock::new();
    CACHED.get_or_init(|| {
        #[cfg(target_os = "macos")]
        {
            if let Ok(out) = std::process::Command::new("/usr/sbin/ioreg")
                .args(["-rd1", "-c", "IOPlatformExpertDevice"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&out.stdout);
                for line in stdout.lines() {
                    if let Some(idx) = line.find("IOPlatformUUID") {
                        if let Some(eq) = line[idx..].find('=') {
                            let value = line[idx + eq + 1..].trim().trim_matches('"');
                            if !value.is_empty() {
                                return value.to_string();
                            }
                        }
                    }
                }
            }
        }
        std::env::var("HOME").unwrap_or_else(|_| "blurly-default-host".to_string())
    })
}

fn derive_storage_key() -> [u8; 32] {
    let mut hasher = blake3::Hasher::new();
    hasher.update(KEY_DOMAIN);
    hasher.update(machine_id().as_bytes());
    hasher.update(BUNDLE_ID);
    *hasher.finalize().as_bytes()
}

fn cipher() -> ChaCha20Poly1305 {
    let key = derive_storage_key();
    ChaCha20Poly1305::new((&key).into())
}

pub fn set_key(data_dir: &Path, provider: &str, key: &str) -> Result<(), CommandError> {
    let path = secrets_path(data_dir, provider);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            CommandError::Storage(format!("failed to create secrets dir {parent:?}: {e}"))
        })?;
    }

    let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng);
    let ciphertext = cipher()
        .encrypt(&nonce, key.as_bytes())
        .map_err(|e| CommandError::Storage(format!("encrypt failed: {e}")))?;

    let mut blob = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    blob.extend_from_slice(nonce.as_slice());
    blob.extend_from_slice(&ciphertext);

    // Atomic write: stage under .tmp, set permissions, rename into place.
    let tmp = path.with_extension("bin.tmp");
    std::fs::write(&tmp, &blob)
        .map_err(|e| CommandError::Storage(format!("write {tmp:?}: {e}")))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| CommandError::Storage(format!("chmod {tmp:?}: {e}")))?;
    }
    std::fs::rename(&tmp, &path)
        .map_err(|e| CommandError::Storage(format!("rename {tmp:?} -> {path:?}: {e}")))?;
    Ok(())
}

/// Read the stored key for `provider`. Returns `Ok(None)` only when the
/// secret file does not exist; decryption failure (machine change, corruption)
/// surfaces as `Err` so callers can distinguish "never saved" from "saved but
/// unreadable".
pub fn get_key(data_dir: &Path, provider: &str) -> Result<Option<String>, CommandError> {
    let path = secrets_path(data_dir, provider);
    let blob = match std::fs::read(&path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(CommandError::Storage(format!("read {path:?}: {e}"))),
    };
    if blob.len() < NONCE_LEN + TAG_LEN {
        return Err(CommandError::Storage(format!(
            "secrets blob at {path:?} is truncated ({} bytes)",
            blob.len()
        )));
    }
    let (nonce_bytes, ciphertext) = blob.split_at(NONCE_LEN);
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher().decrypt(nonce, ciphertext).map_err(|e| {
        CommandError::Storage(format!(
            "decrypt failed for {provider} ({e}). This usually means the machine identifier \
             changed (restore from backup or hardware migration). Clear the saved key and re-save it."
        ))
    })?;
    String::from_utf8(plaintext)
        .map(Some)
        .map_err(|e| CommandError::Storage(format!("utf-8 decode failed for {provider}: {e}")))
}

pub fn delete_key(data_dir: &Path, provider: &str) -> Result<(), CommandError> {
    let path = secrets_path(data_dir, provider);
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(CommandError::Storage(format!("remove {path:?}: {e}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let mut dir = std::env::temp_dir();
        dir.push(format!(
            "blurly-key-store-test-{}",
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn roundtrip_returns_what_was_written() {
        let dir = temp_dir();
        set_key(&dir, "openai", "sk-secret-value").unwrap();
        let back = get_key(&dir, "openai").unwrap();
        assert_eq!(back.as_deref(), Some("sk-secret-value"));
    }

    #[test]
    fn missing_returns_none_not_error() {
        let dir = temp_dir();
        assert_eq!(get_key(&dir, "openai").unwrap(), None);
    }

    #[test]
    fn delete_makes_get_return_none() {
        let dir = temp_dir();
        set_key(&dir, "openai", "abc12345").unwrap();
        delete_key(&dir, "openai").unwrap();
        assert_eq!(get_key(&dir, "openai").unwrap(), None);
    }

    #[test]
    fn second_set_overwrites_first() {
        let dir = temp_dir();
        set_key(&dir, "openai", "first").unwrap();
        set_key(&dir, "openai", "second-and-final").unwrap();
        assert_eq!(
            get_key(&dir, "openai").unwrap().as_deref(),
            Some("second-and-final")
        );
    }

    #[test]
    fn tampered_ciphertext_fails_decrypt() {
        let dir = temp_dir();
        set_key(&dir, "openai", "sk-original").unwrap();
        let path = secrets_path(&dir, "openai");
        let mut blob = std::fs::read(&path).unwrap();
        let last = blob.len() - 1;
        blob[last] ^= 0xFF;
        std::fs::write(&path, blob).unwrap();
        assert!(get_key(&dir, "openai").is_err());
    }
}
