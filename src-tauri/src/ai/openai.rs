//! OpenAI provider. Uses the **Responses API** with the `web_search_preview`
//! tool when web search is enabled. All OpenAI-specific shapes stay in this file
//! so swapping in another provider only touches one module.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::ai::prompts::{focus_for, time_window_hint, BASE_PERSONA};

const RESPONSES_URL: &str = "https://api.openai.com/v1/responses";

fn http_client(timeout_secs: u64) -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .expect("build reqwest client")
}

pub struct OpenAiProvider;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisRequest<'a> {
    pub model: &'a str,
    pub analysis_type: &'a str,
    pub time_window: &'a str,
    pub web_search_enabled: bool,
    /// Already serialised AnalysisPortfolioContext JSON (built in TS).
    pub input_context_json: &'a str,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AnalysisOutput {
    pub markdown: String,
    /// Sources as `[{"title": "...", "url": "..."}]`. Empty when no citations.
    pub sources: Vec<Source>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Source {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub url: String,
}

impl OpenAiProvider {
    /// Cheap round-trip that exercises the same permission as actual analysis runs.
    /// Uses POST /v1/responses with max_output_tokens=16 so "Test green ⇒ Run green".
    pub async fn test_connection(&self, key: &str, model: &str) -> Result<(), String> {
        let body = json!({
            "model": model,
            "input": "ping",
            "max_output_tokens": 16,
        });
        let res = http_client(10)
            .post(RESPONSES_URL)
            .bearer_auth(key)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Network error: {e}"))?;
        if res.status().is_success() {
            return Ok(());
        }
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        Err(format!("OpenAI {status}: {}", body.chars().take(300).collect::<String>()))
    }

    pub async fn run_analysis(&self, key: &str, req: AnalysisRequest<'_>) -> Result<AnalysisOutput, String> {
        let system = format!(
            "{}\n\n{}",
            focus_for(req.analysis_type),
            BASE_PERSONA
        );
        let user = format!(
            "{}\n\nAnalysis type: {}\n\nCurrent holdings context (JSON):\n{}",
            time_window_hint(req.time_window),
            req.analysis_type,
            req.input_context_json,
        );

        let mut body = json!({
            "model": req.model,
            "input": [
                { "role": "system", "content": system },
                { "role": "user",   "content": user },
            ],
        });
        if req.web_search_enabled {
            body["tools"] = json!([{ "type": "web_search_preview" }]);
        }

        let res = http_client(90)
            .post(RESPONSES_URL)
            .bearer_auth(key)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Network error: {e}"))?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(format!("OpenAI {status}: {}", body.chars().take(500).collect::<String>()));
        }

        let payload: Value = res.json().await.map_err(|e| format!("Bad JSON: {e}"))?;
        Ok(parse_responses_payload(&payload))
    }
}

/// Pull markdown + citation URLs out of an OpenAI Responses payload.
/// The Responses API stabilised on:
///   output: [
///     { type: "message", content: [
///        { type: "output_text", text: "...", annotations: [
///           { type: "url_citation", url: "...", title: "..." }, ... ]
///        }
///     ] }, ...
///   ]
/// `output_text` (a convenience field) may also appear at the top level. We try both.
fn parse_responses_payload(v: &Value) -> AnalysisOutput {
    let mut markdown = String::new();
    let mut sources: Vec<Source> = Vec::new();

    // Preferred path — explicit message output array.
    if let Some(output) = v.get("output").and_then(|o| o.as_array()) {
        for item in output {
            if item.get("type").and_then(|t| t.as_str()) != Some("message") {
                continue;
            }
            let Some(content) = item.get("content").and_then(|c| c.as_array()) else { continue };
            for part in content {
                if part.get("type").and_then(|t| t.as_str()).is_some_and(|t| t.contains("text")) {
                    if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                        if !markdown.is_empty() {
                            markdown.push_str("\n\n");
                        }
                        markdown.push_str(text);
                    }
                    if let Some(anns) = part.get("annotations").and_then(|a| a.as_array()) {
                        for a in anns {
                            if let Some(url) = a.get("url").and_then(|u| u.as_str()) {
                                let title = a.get("title").and_then(|t| t.as_str()).map(String::from);
                                sources.push(Source { title, url: url.to_string() });
                            }
                        }
                    }
                }
            }
        }
    }

    // Fallback — top-level output_text convenience field.
    if markdown.is_empty() {
        if let Some(t) = v.get("output_text").and_then(|t| t.as_str()) {
            markdown.push_str(t);
        }
    }

    AnalysisOutput { markdown, sources }
}
