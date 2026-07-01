use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::ai::openai::{FollowUpMessage, FollowUpRequest, OpenAiProvider};
use crate::commands::ai_keys::read_key;
use crate::commands::ai_settings;
use crate::commands::db::AppState;
use crate::error::CommandError;
use crate::models::{
    AnalystMessage, AnalystThread, AnalystThreadDetail, AskAnalystInput, AskAnalystResult,
    NewAnalystThread,
};

fn row_to_thread(row: &rusqlite::Row<'_>) -> rusqlite::Result<AnalystThread> {
    Ok(AnalystThread {
        id: row.get(0)?,
        analysis_run_id: row.get(1)?,
        title: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn row_to_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<AnalystMessage> {
    Ok(AnalystMessage {
        id: row.get(0)?,
        thread_id: row.get(1)?,
        role: row.get(2)?,
        content: row.get(3)?,
        sources_json: row.get(4)?,
        created_at: row.get(5)?,
    })
}

const THREAD_SELECT: &str =
    "SELECT id, analysis_run_id, title, created_at, updated_at FROM analyst_threads";
const MESSAGE_SELECT: &str =
    "SELECT id, thread_id, role, content, sources_json, created_at FROM analyst_messages";

#[tauri::command]
pub async fn list_analyst_threads(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<AnalystThread>, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let mut stmt = conn.prepare(&format!("{THREAD_SELECT} ORDER BY updated_at DESC"))?;
        let rows = stmt.query_map([], row_to_thread)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn get_analyst_thread(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<Option<AnalystThreadDetail>, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let thread = conn
            .query_row(
                &format!("{THREAD_SELECT} WHERE id = ?1"),
                params![id],
                row_to_thread,
            )
            .optional()?;
        let Some(thread) = thread else {
            return Ok(None);
        };
        let mut stmt = conn.prepare(&format!(
            "{MESSAGE_SELECT} WHERE thread_id = ?1 ORDER BY created_at ASC"
        ))?;
        let rows = stmt.query_map(params![thread.id.clone()], row_to_message)?;
        let mut messages = Vec::new();
        for row in rows {
            messages.push(row?);
        }
        Ok(Some(AnalystThreadDetail { thread, messages }))
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn create_analyst_thread(
    state: tauri::State<'_, AppState>,
    input: NewAnalystThread,
) -> Result<AnalystThread, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let id = Uuid::new_v4().to_string();
        let title = input
            .title
            .filter(|t| !t.trim().is_empty())
            .unwrap_or_else(|| "Ask Analyst".to_string());
        conn.execute(
            "INSERT INTO analyst_threads (id, analysis_run_id, title)
             VALUES (?1, ?2, ?3)",
            params![id, input.analysis_run_id, title],
        )?;
        let thread = conn.query_row(
            &format!("{THREAD_SELECT} WHERE id = ?1"),
            params![id],
            row_to_thread,
        )?;
        Ok(thread)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn delete_analyst_thread(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let affected = conn.execute("DELETE FROM analyst_threads WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(CommandError::NotFound(format!("analyst_thread {id}")));
        }
        Ok(())
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn ask_analyst_question(
    state: tauri::State<'_, AppState>,
    input: AskAnalystInput,
) -> Result<AskAnalystResult, CommandError> {
    let question = input.question.trim().to_string();
    if question.is_empty() {
        return Err(CommandError::Storage(
            "Question cannot be empty".to_string(),
        ));
    }

    let db = Arc::clone(&state.db);
    let setup = {
        let requested_thread_id = input.thread_id.clone();
        let requested_analysis_run_id = input.analysis_run_id.clone();
        let question_for_title = question.clone();
        tauri::async_runtime::spawn_blocking(move || -> Result<_, CommandError> {
            let conn = db.lock();
            let settings = ai_settings::get_ai_settings_inner(&conn)?;
            let selected_run_id = match requested_analysis_run_id {
                Some(id) if !id.trim().is_empty() => Some(id),
                _ => conn
                    .query_row(
                        "SELECT id FROM analysis_runs
                         WHERE status = 'succeeded' AND output_markdown IS NOT NULL
                         ORDER BY created_at DESC LIMIT 1",
                        [],
                        |row| row.get::<_, String>(0),
                    )
                    .optional()?,
            };
            let selected_markdown = match selected_run_id.as_deref() {
                Some(id) => conn
                    .query_row(
                        "SELECT output_markdown FROM analysis_runs
                         WHERE id = ?1 AND status = 'succeeded'",
                        params![id],
                        |row| row.get::<_, Option<String>>(0),
                    )
                    .optional()?
                    .flatten(),
                None => None,
            };

            let thread = match requested_thread_id {
                Some(id) if !id.trim().is_empty() => conn
                    .query_row(
                        &format!("{THREAD_SELECT} WHERE id = ?1"),
                        params![id],
                        row_to_thread,
                    )
                    .map_err(|_| CommandError::NotFound(format!("analyst_thread {id}")))?,
                _ => {
                    let id = Uuid::new_v4().to_string();
                    let title = make_title(&question_for_title);
                    conn.execute(
                        "INSERT INTO analyst_threads (id, analysis_run_id, title)
                         VALUES (?1, ?2, ?3)",
                        params![id, selected_run_id, title],
                    )?;
                    conn.query_row(
                        &format!("{THREAD_SELECT} WHERE id = ?1"),
                        params![id],
                        row_to_thread,
                    )?
                }
            };

            let mut stmt = conn.prepare(&format!(
                "{MESSAGE_SELECT} WHERE thread_id = ?1 ORDER BY created_at ASC"
            ))?;
            let rows = stmt.query_map(params![thread.id.clone()], row_to_message)?;
            let mut prior_messages = Vec::new();
            for row in rows {
                let message = row?;
                prior_messages.push(FollowUpMessage {
                    role: message.role,
                    content: message.content,
                });
            }
            if prior_messages.iter().any(|message| message.role == "user") {
                return Err(CommandError::Storage(
                    "Ask Analyst free plan allows 1 follow-up question per thread. Subscribe to Pro for unlimited follow-up chats with the analyst.".to_string(),
                ));
            }

            let user_message_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO analyst_messages (id, thread_id, role, content)
                 VALUES (?1, ?2, 'user', ?3)",
                params![user_message_id, thread.id, question_for_title],
            )?;
            conn.execute(
                "UPDATE analyst_threads SET updated_at = datetime('now') WHERE id = ?1",
                params![thread.id],
            )?;
            let user_message = conn.query_row(
                &format!("{MESSAGE_SELECT} WHERE id = ?1"),
                params![user_message_id],
                row_to_message,
            )?;

            Ok((
                settings.provider,
                settings.model,
                settings.web_search_enabled,
                thread.id,
                selected_markdown,
                prior_messages,
                user_message,
            ))
        })
        .await
        .map_err(|e| CommandError::Join(e.to_string()))??
    };

    let (
        provider_id,
        model,
        web_search_enabled,
        thread_id,
        selected_markdown,
        prior_messages,
        user_message,
    ) = setup;

    let key_result = {
        let provider_id = provider_id.clone();
        let data_dir = state.data_dir.clone();
        tauri::async_runtime::spawn_blocking(move || read_key(&data_dir, &provider_id))
            .await
            .map_err(|e| CommandError::Join(e.to_string()))?
    };
    let key = key_result.map_err(|e| CommandError::Storage(e.to_string()))?;

    let provider = OpenAiProvider;
    let output = match provider_id.as_str() {
        "openai" => {
            provider
                .run_follow_up(
                    &key,
                    FollowUpRequest {
                        model: &model,
                        web_search_enabled,
                        context_json: &input.context_json,
                        analysis_markdown: selected_markdown.as_deref(),
                        prior_messages: &prior_messages,
                        question: &question,
                    },
                )
                .await
        }
        other => Err(format!("Unknown provider: {other}")),
    }
    .map_err(CommandError::Network)?;

    let db = Arc::clone(&state.db);
    let assistant_content = output.markdown;
    let assistant_sources_json = serde_json::to_string(&output.sources)?;
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let assistant_message_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO analyst_messages (id, thread_id, role, content, sources_json)
             VALUES (?1, ?2, 'assistant', ?3, ?4)",
            params![
                assistant_message_id,
                thread_id,
                assistant_content,
                assistant_sources_json,
            ],
        )?;
        conn.execute(
            "UPDATE analyst_threads SET updated_at = datetime('now') WHERE id = ?1",
            params![thread_id],
        )?;
        let thread = conn.query_row(
            &format!("{THREAD_SELECT} WHERE id = ?1"),
            params![thread_id],
            row_to_thread,
        )?;
        let assistant_message = conn.query_row(
            &format!("{MESSAGE_SELECT} WHERE id = ?1"),
            params![assistant_message_id],
            row_to_message,
        )?;
        Ok(AskAnalystResult {
            thread,
            user_message,
            assistant_message,
        })
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

fn make_title(question: &str) -> String {
    let title = question.trim();
    if title.chars().count() <= 60 {
        return title.to_string();
    }
    let mut out = title.chars().take(57).collect::<String>();
    out.push_str("...");
    out
}
