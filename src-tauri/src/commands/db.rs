use std::path::Path;
use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};

use crate::error::CommandError;

/// Application state managed by Tauri.
/// Wrapped in Arc so the inner Mutex can be cheaply cloned into spawn_blocking closures.
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
}

/// Open (or create) the SQLite database at `path`, run any pending migrations,
/// and return the connection with WAL + foreign-keys enabled.
pub fn init_db(path: &Path) -> Result<Connection, CommandError> {
    let mut conn = Connection::open(path)?;

    // Per-connection PRAGMAs — must be set before migrations run.
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

    let migrations = Migrations::new(vec![
        M::up(include_str!("../../migrations/001_init.sql")),
        M::up(include_str!("../../migrations/002_analyst.sql")),
        M::up(include_str!("../../migrations/003_key_signing.sql")),
    ]);

    migrations.to_latest(&mut conn)?;

    Ok(conn)
}
