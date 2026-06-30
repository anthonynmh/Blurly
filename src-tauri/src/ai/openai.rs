//! OpenAI provider. Uses the **Responses API** with the `web_search`
//! tool when web search is enabled. All OpenAI-specific shapes stay in this file
//! so swapping in another provider only touches one module.
//!
//! Request timeout is per-persona: Light (gpt-4o) finishes in seconds so 90s is
//! plenty; Deep (gpt-5.5 + reasoning.effort=high + web_search) routinely runs
//! 5–15 min, so we give it 900s. If even that proves insufficient, the next
//! step is background mode (POST with `background: true`, then poll).

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::ai::prompts::{
    focus_for, persona_suffix, time_window_hint, BASE_PERSONA, REQUIRED_MEMO_SECTIONS,
};

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
    /// 'light' or 'deep' — controls the persona suffix appended to the system prompt.
    pub persona: &'a str,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AnalysisOutput {
    pub markdown: String,
    /// Sources as `[{"title": "...", "url": "..."}]`. Empty when no citations.
    pub sources: Vec<Source>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisQaReport {
    pub pass: bool,
    pub issues: Vec<AnalysisQaIssue>,
    pub missing_sections: Vec<String>,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisQaIssue {
    pub code: String,
    pub severity: String,
    pub section: String,
    pub message: String,
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
        Err(format!(
            "OpenAI {status}: {}",
            body.chars().take(300).collect::<String>()
        ))
    }

    pub async fn run_analysis(
        &self,
        key: &str,
        req: AnalysisRequest<'_>,
    ) -> Result<AnalysisOutput, String> {
        let system = format!(
            "{}\n\n{}\n\n{}",
            focus_for(req.analysis_type),
            BASE_PERSONA,
            persona_suffix(req.persona),
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
            body["tools"] = json!([{ "type": "web_search" }]);
        }
        if req.persona == "deep" {
            body["reasoning"] = json!({ "effort": "high" });
        }

        let timeout_secs = if req.persona == "deep" { 900 } else { 90 };
        let res = http_client(timeout_secs)
            .post(RESPONSES_URL)
            .bearer_auth(key)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Network error: {e}"))?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(format!(
                "OpenAI {status}: {}",
                body.chars().take(500).collect::<String>()
            ));
        }

        let payload: Value = res.json().await.map_err(|e| format!("Bad JSON: {e}"))?;
        Ok(parse_responses_payload(&payload))
    }

    pub async fn run_qa_review(
        &self,
        key: &str,
        req: &AnalysisRequest<'_>,
        output: &AnalysisOutput,
    ) -> Result<AnalysisQaReport, String> {
        let system = "You are a strict QA reviewer for a portfolio-analysis memo. \
Verify the memo once, briefly. Return only JSON matching the schema. \
Do not rewrite the memo. Do not add investment opinions. Fail the memo if required structure, \
recommendation framing, source support, or stale-data caveats are missing.";
        let user = format!(
            "Analysis type: {}\nPersona: {}\nWeb search enabled: {}\n\nRequired top-level sections, exact order:\n{}\n\nCurrent holdings context JSON:\n{}\n\nExtracted sources JSON:\n{}\n\nMemo markdown:\n{}",
            req.analysis_type,
            req.persona,
            req.web_search_enabled,
            REQUIRED_MEMO_SECTIONS
                .iter()
                .map(|s| format!("## {s}"))
                .collect::<Vec<_>>()
                .join("\n"),
            req.input_context_json,
            serde_json::to_string(&output.sources).unwrap_or_else(|_| "[]".to_string()),
            output.markdown,
        );

        let body = json!({
            "model": "gpt-5.4-mini",
            "input": [
                { "role": "system", "content": system },
                { "role": "user", "content": user },
            ],
            "max_output_tokens": 1000,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "portfolio_review_qa",
                    "strict": true,
                    "schema": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["pass", "issues", "missingSections", "summary"],
                        "properties": {
                            "pass": { "type": "boolean" },
                            "issues": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["code", "severity", "section", "message"],
                                    "properties": {
                                        "code": { "type": "string" },
                                        "severity": { "type": "string" },
                                        "section": { "type": "string" },
                                        "message": { "type": "string" }
                                    }
                                }
                            },
                            "missingSections": {
                                "type": "array",
                                "items": { "type": "string" }
                            },
                            "summary": { "type": "string" }
                        }
                    }
                }
            }
        });

        let res = http_client(45)
            .post(RESPONSES_URL)
            .bearer_auth(key)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("QA network error: {e}"))?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(format!(
                "OpenAI QA {status}: {}",
                body.chars().take(500).collect::<String>()
            ));
        }

        let payload: Value = res.json().await.map_err(|e| format!("Bad QA JSON: {e}"))?;
        let text = parse_responses_payload(&payload).markdown;
        parse_qa_report(&text)
    }
}

pub fn validate_memo_contract(
    markdown: &str,
    web_search_enabled: bool,
    input_context_json: &str,
    sources: &[Source],
) -> AnalysisQaReport {
    let mut issues = Vec::new();
    let missing_sections = missing_or_misordered_sections(markdown);
    if !missing_sections.is_empty() {
        issues.push(AnalysisQaIssue {
            code: "required_sections".to_string(),
            severity: "error".to_string(),
            section: "memo".to_string(),
            message: "Required top-level headings are missing or out of order.".to_string(),
        });
    }

    let overweight_section = section_body(markdown, "Overweight / Underweight Review");
    if contains_weight_call(overweight_section) {
        for required in [
            "**Current weight:**",
            "**Reference point:**",
            "**Time horizon:**",
            "**Justification:**",
            "**Recommendation to consider:**",
            "**Evidence trail for user verification:**",
            "**Caveats:**",
        ] {
            if !overweight_section.contains(required) {
                issues.push(AnalysisQaIssue {
                    code: "missing_weight_review_field".to_string(),
                    severity: "error".to_string(),
                    section: "Overweight / Underweight Review".to_string(),
                    message: format!("Missing required field `{required}`."),
                });
            }
        }
    }

    let lower = markdown.to_lowercase();
    if web_search_enabled && sources.is_empty() {
        issues.push(AnalysisQaIssue {
            code: "missing_sources".to_string(),
            severity: "error".to_string(),
            section: "Sources".to_string(),
            message: "Web search was enabled but no extracted sources were returned.".to_string(),
        });
    }

    if stale_holdings_count(input_context_json) > 0
        && !(lower.contains("stale") && lower.contains("oldest"))
    {
        issues.push(AnalysisQaIssue {
            code: "missing_stale_data_caveat".to_string(),
            severity: "error".to_string(),
            section: "Portfolio Snapshot".to_string(),
            message: "Context contains stale holdings but the memo does not call out stale data and oldest as-of date.".to_string(),
        });
    }

    AnalysisQaReport {
        pass: issues.is_empty(),
        issues,
        missing_sections,
        summary: String::new(),
    }
}

pub fn merge_qa_reports(
    mut model_report: AnalysisQaReport,
    deterministic_report: AnalysisQaReport,
) -> AnalysisQaReport {
    model_report.issues.extend(deterministic_report.issues);
    for section in deterministic_report.missing_sections {
        if !model_report.missing_sections.contains(&section) {
            model_report.missing_sections.push(section);
        }
    }
    model_report.pass = model_report.issues.is_empty() && model_report.missing_sections.is_empty();
    if model_report.summary.trim().is_empty() {
        model_report.summary = if model_report.pass {
            "QA passed.".to_string()
        } else {
            "QA failed.".to_string()
        };
    }
    model_report
}

pub fn parse_qa_report(text: &str) -> Result<AnalysisQaReport, String> {
    serde_json::from_str::<AnalysisQaReport>(text.trim())
        .map_err(|e| format!("Bad QA report JSON: {e}"))
}

fn missing_or_misordered_sections(markdown: &str) -> Vec<String> {
    let mut missing = Vec::new();
    let mut cursor = 0;
    for section in REQUIRED_MEMO_SECTIONS {
        let needle = format!("## {section}");
        let Some(pos) = markdown[cursor..].find(&needle) else {
            missing.push(section.to_string());
            continue;
        };
        cursor += pos + needle.len();
    }
    missing
}

fn section_body<'a>(markdown: &'a str, section: &str) -> &'a str {
    let needle = format!("## {section}");
    let Some(start) = markdown.find(&needle) else {
        return "";
    };
    let body_start = start + needle.len();
    let body = &markdown[body_start..];
    match body.find("\n## ") {
        Some(end) => &body[..end],
        None => body,
    }
}

fn contains_weight_call(section: &str) -> bool {
    section.contains("### ") && (section.contains("Overweight") || section.contains("Underweight"))
}

fn stale_holdings_count(input_context_json: &str) -> u64 {
    serde_json::from_str::<Value>(input_context_json)
        .ok()
        .and_then(|v| v.get("staleHoldingsCount").and_then(Value::as_u64))
        .unwrap_or(0)
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
            let Some(content) = item.get("content").and_then(|c| c.as_array()) else {
                continue;
            };
            for part in content {
                if part
                    .get("type")
                    .and_then(|t| t.as_str())
                    .is_some_and(|t| t.contains("text"))
                {
                    if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                        if !markdown.is_empty() {
                            markdown.push_str("\n\n");
                        }
                        markdown.push_str(text);
                    }
                    if let Some(anns) = part.get("annotations").and_then(|a| a.as_array()) {
                        for a in anns {
                            if let Some(url) = a.get("url").and_then(|u| u.as_str()) {
                                let title =
                                    a.get("title").and_then(|t| t.as_str()).map(String::from);
                                sources.push(Source {
                                    title,
                                    url: url.to_string(),
                                });
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

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_memo() -> String {
        [
            "## Portfolio Snapshot\nNo stale positions.",
            "## Allocation Diagnosis\nBalanced enough.",
            "## Overweight / Underweight Review\n### Equity — Overweight\n**Current weight:** 70%\n**Reference point:** diversified allocation\n**Time horizon:** long-term, 3+ years\n**Justification:** Portfolio facts support the view.\n**Recommendation to consider:** consider reviewing target equity range.\n**Evidence trail for user verification:** portfolio context shows 70% equity.\n**Caveats:** strategy may intentionally prefer equities.",
            "## Rebalancing Considerations\nConsider reviewing target bands.",
            "## Strategy Fit\nClarify target allocation.",
            "## Risks, Watchlist & Open Questions\nVerify strategy and taxes.",
            "## Sources\nWeb search disabled for this run.",
        ]
        .join("\n\n")
    }

    #[test]
    fn validates_required_sections_in_order() {
        let report =
            validate_memo_contract(&valid_memo(), false, r#"{"staleHoldingsCount":0}"#, &[]);
        assert!(report.pass, "{report:?}");
        assert!(report.missing_sections.is_empty());
    }

    #[test]
    fn reports_missing_or_misordered_sections() {
        let memo = "## Portfolio Snapshot\n\n## Sources\n";
        let report = validate_memo_contract(memo, false, r#"{"staleHoldingsCount":0}"#, &[]);
        assert!(!report.pass);
        assert!(report
            .missing_sections
            .contains(&"Allocation Diagnosis".to_string()));
    }

    #[test]
    fn parses_qa_report_json() {
        let report = parse_qa_report(
            r#"{"pass":false,"issues":[{"code":"missing_sources","severity":"error","section":"Sources","message":"No sources."}],"missingSections":["Sources"],"summary":"Failed."}"#,
        )
        .unwrap();
        assert!(!report.pass);
        assert_eq!(report.issues[0].code, "missing_sources");
        assert_eq!(report.missing_sections, vec!["Sources"]);
    }
}
