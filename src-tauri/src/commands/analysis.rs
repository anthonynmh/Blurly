use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::ai::openai::{
    merge_qa_reports, validate_memo_contract, AnalysisOutput, AnalysisQaIssue, AnalysisQaReport,
    AnalysisRequest, OpenAiProvider,
};
use crate::commands::ai_keys::read_key;
use crate::commands::ai_settings;
use crate::commands::db::AppState;
use crate::error::CommandError;
use crate::models::{AnalysisRun, RunAnalysisInput};

fn row_to_run(row: &rusqlite::Row<'_>) -> rusqlite::Result<AnalysisRun> {
    Ok(AnalysisRun {
        id: row.get(0)?,
        analysis_type: row.get(1)?,
        provider: row.get(2)?,
        model: row.get(3)?,
        status: row.get(4)?,
        input_context_json: row.get(5)?,
        output_markdown: row.get(6)?,
        output_json: row.get(7)?,
        sources_json: row.get(8)?,
        error_message: row.get(9)?,
        created_at: row.get(10)?,
        completed_at: row.get(11)?,
        persona: row.get(12)?,
    })
}

const SELECT_COLS: &str =
    "SELECT id, analysis_type, provider, model, status, input_context_json, output_markdown, \
            output_json, sources_json, error_message, created_at, completed_at, persona \
     FROM analysis_runs";

/// Map a persona id to the concrete OpenAI model and whether web search is
/// forced on. Light honours the user's saved web-search toggle; Deep ignores it.
fn persona_runtime(persona: &str, saved_web_search: bool) -> (&'static str, bool) {
    match persona {
        "deep" => ("gpt-5.5", true),
        // 'light' is the default and the fallback for any unknown value.
        _ => ("gpt-4o", saved_web_search),
    }
}

fn normalise_persona(p: &str) -> &'static str {
    match p {
        "deep" => "deep",
        _ => "light",
    }
}

#[tauri::command]
pub async fn list_analysis_runs(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<AnalysisRun>, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let sql = format!("{SELECT_COLS} ORDER BY created_at DESC");
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], row_to_run)?;
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
pub async fn get_analysis_run(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<Option<AnalysisRun>, CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let mut stmt = conn.prepare(&format!("{SELECT_COLS} WHERE id = ?1"))?;
        let mut rows = stmt.query_map(params![id], row_to_run)?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

#[tauri::command]
pub async fn delete_analysis_run(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    let db: Arc<Mutex<Connection>> = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        let affected = conn.execute("DELETE FROM analysis_runs WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(CommandError::NotFound(format!("analysis_run {id}")));
        }
        Ok(())
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

/// Run an analysis end-to-end:
///   1. Insert a pending run row.
///   2. Read provider settings + key.
///   3. Call the provider.
///   4. Persist result (markdown + sources) or error.
/// Returns the final row either way.
#[tauri::command]
pub async fn run_analysis(
    state: tauri::State<'_, AppState>,
    input: RunAnalysisInput,
) -> Result<AnalysisRun, CommandError> {
    // 1. Read AI settings + insert pending row (sync DB work in spawn_blocking).
    // The persona drives model selection; saved ai_settings.model is ignored —
    // it remains in the schema only as legacy state for now.
    let persona = normalise_persona(&input.persona).to_string();
    let db = Arc::clone(&state.db);
    let (run_id, provider_id, model, web_search_enabled) = {
        let input_ctx = input.input_context_json.clone();
        let analysis_type = input.analysis_type.clone();
        let persona_for_insert = persona.clone();
        tauri::async_runtime::spawn_blocking(move || -> Result<_, CommandError> {
            let conn = db.lock();
            let settings = ai_settings::get_ai_settings_inner(&conn)?;
            let (model, web_search) =
                persona_runtime(&persona_for_insert, settings.web_search_enabled);
            let id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO analysis_runs
                    (id, analysis_type, provider, model, status, input_context_json, persona)
                 VALUES (?1, ?2, ?3, ?4, 'running', ?5, ?6)",
                params![
                    id,
                    analysis_type,
                    settings.provider,
                    model,
                    input_ctx,
                    persona_for_insert,
                ],
            )?;
            Ok((id, settings.provider, model.to_string(), web_search))
        })
        .await
        .map_err(|e| CommandError::Join(e.to_string()))??
    };

    // 2. Read the key (separate spawn_blocking — file I/O may block briefly).
    let key_result = {
        let provider_id = provider_id.clone();
        let data_dir = state.data_dir.clone();
        tauri::async_runtime::spawn_blocking(move || read_key(&data_dir, &provider_id))
            .await
            .map_err(|e| CommandError::Join(e.to_string()))?
    };

    let key = match key_result {
        Ok(k) => k,
        Err(e) => return finalise_failure(&state, &run_id, &e.to_string()).await,
    };

    // 3. Call the provider on the async runtime (reqwest is async).
    let provider = OpenAiProvider;
    let analysis_request = AnalysisRequest {
        model: &model,
        analysis_type: &input.analysis_type,
        time_window: &input.time_window,
        web_search_enabled,
        input_context_json: &input.input_context_json,
        persona: &persona,
    };
    let provider_result = match provider_id.as_str() {
        "openai" => provider.run_analysis(&key, analysis_request.clone()).await,
        other => Err(format!("Unknown provider: {other}")),
    };

    // 4. Persist outcome.
    match provider_result {
        Ok(out) => {
            let deterministic_report = validate_memo_contract(
                &out.markdown,
                web_search_enabled,
                &input.input_context_json,
                &out.sources,
            );
            let qa_report = match provider_id.as_str() {
                "openai" => match provider.run_qa_review(&key, &analysis_request, &out).await {
                    Ok(model_report) => merge_qa_reports(model_report, deterministic_report),
                    Err(e) => merge_qa_reports(
                        AnalysisQaReport {
                            pass: false,
                            issues: vec![AnalysisQaIssue {
                                code: "qa_agent_error".to_string(),
                                severity: "error".to_string(),
                                section: "QA".to_string(),
                                message: e,
                            }],
                            missing_sections: Vec::new(),
                            summary: "QA agent failed before it could verify the memo.".to_string(),
                        },
                        deterministic_report,
                    ),
                },
                other => AnalysisQaReport {
                    pass: false,
                    issues: vec![AnalysisQaIssue {
                        code: "unknown_provider_for_qa".to_string(),
                        severity: "error".to_string(),
                        section: "QA".to_string(),
                        message: format!("Unknown provider for QA: {other}"),
                    }],
                    missing_sections: Vec::new(),
                    summary: "QA could not run for the selected provider.".to_string(),
                },
            };

            if qa_report.pass {
                finalise_success(&state, &run_id, &out.markdown, &out.sources).await
            } else {
                finalise_qa_failure(&state, &run_id, &out, &qa_report).await
            }
        }
        Err(e) => finalise_failure(&state, &run_id, &e).await,
    }
}

async fn finalise_success(
    state: &tauri::State<'_, AppState>,
    id: &str,
    markdown: &str,
    sources: &[crate::ai::openai::Source],
) -> Result<AnalysisRun, CommandError> {
    let db = Arc::clone(&state.db);
    let id = id.to_string();
    let markdown = markdown.to_string();
    let sources_json = serde_json::to_string(sources)?;
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        conn.execute(
            "UPDATE analysis_runs SET
                status = 'succeeded',
                output_markdown = ?1,
                sources_json = ?2,
                completed_at = datetime('now')
             WHERE id = ?3",
            params![markdown, sources_json, id],
        )?;
        let run = conn.query_row(
            &format!("{SELECT_COLS} WHERE id = ?1"),
            params![id],
            row_to_run,
        )?;
        Ok(run)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

async fn finalise_failure(
    state: &tauri::State<'_, AppState>,
    id: &str,
    error: &str,
) -> Result<AnalysisRun, CommandError> {
    let db = Arc::clone(&state.db);
    let id = id.to_string();
    let error = error.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        conn.execute(
            "UPDATE analysis_runs SET
                status = 'failed',
                error_message = ?1,
                completed_at = datetime('now')
             WHERE id = ?2",
            params![error, id],
        )?;
        let run = conn.query_row(
            &format!("{SELECT_COLS} WHERE id = ?1"),
            params![id],
            row_to_run,
        )?;
        Ok(run)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

async fn finalise_qa_failure(
    state: &tauri::State<'_, AppState>,
    id: &str,
    output: &AnalysisOutput,
    qa_report: &AnalysisQaReport,
) -> Result<AnalysisRun, CommandError> {
    let db = Arc::clone(&state.db);
    let id = id.to_string();
    let error = qa_failure_message(qa_report);
    let sources_json = serde_json::to_string(&output.sources)?;
    let output_json = serde_json::to_string(&serde_json::json!({
        "draftMarkdown": &output.markdown,
        "qa": qa_report,
    }))?;
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock();
        conn.execute(
            "UPDATE analysis_runs SET
                status = 'failed',
                output_json = ?1,
                sources_json = ?2,
                error_message = ?3,
                completed_at = datetime('now')
             WHERE id = ?4",
            params![output_json, sources_json, error, id],
        )?;
        let run = conn.query_row(
            &format!("{SELECT_COLS} WHERE id = ?1"),
            params![id],
            row_to_run,
        )?;
        Ok(run)
    })
    .await
    .map_err(|e| CommandError::Join(e.to_string()))?
}

fn qa_failure_message(qa_report: &AnalysisQaReport) -> String {
    let first_issue = qa_report
        .issues
        .first()
        .map(|i| format!("{}: {}", i.section, i.message));
    match first_issue {
        Some(issue) => format!("Analysis failed QA: {issue}"),
        None if !qa_report.missing_sections.is_empty() => format!(
            "Analysis failed QA: missing or misordered sections: {}",
            qa_report.missing_sections.join(", ")
        ),
        None => "Analysis failed QA.".to_string(),
    }
}
