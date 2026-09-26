//! The live subscription-usage endpoint and its types.
//!
//! `GET https://api.anthropic.com/api/oauth/usage` (OAuth bearer) returns the
//! same rolling-window utilization that Claude Code's `/usage` shows.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{credentials::OauthCredentials, CoreError};

pub const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
pub const OAUTH_BETA: &str = "oauth-2025-04-20";

/// A single rolling-limit window (e.g. the 5-hour or 7-day window).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UsageWindow {
    /// Percent of the window consumed (0–100).
    #[serde(default)]
    pub utilization: f64,
    /// RFC3339 reset timestamp, passed through to the UI for countdowns.
    #[serde(default)]
    pub resets_at: Option<String>,
}

/// Pay-as-you-go overflow credits, shown only when the org has them enabled.
/// Field names are snake_case to match both the API payload and the frontend.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ExtraUsage {
    #[serde(default)]
    pub is_enabled: bool,
    #[serde(default)]
    pub monthly_limit: Option<f64>,
    #[serde(default)]
    pub used_credits: Option<f64>,
    #[serde(default)]
    pub utilization: Option<f64>,
    #[serde(default)]
    pub currency: Option<String>,
}

/// The display label attached to a scoped limit row (`scope.model` / `scope.surface`).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LimitScopeLabel {
    #[serde(default)]
    pub display_name: String,
}

/// What a scoped limit row applies to: a model (e.g. "Fable") or a surface
/// (e.g. cloud sessions). The server supplies the display label.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LimitScope {
    #[serde(default)]
    pub model: Option<LimitScopeLabel>,
    #[serde(default)]
    pub surface: Option<LimitScopeLabel>,
}

/// One row of the endpoint's `limits[]` array. Rows are rendered verbatim so a
/// new server-side meter (per-model or per-surface) needs no widget release.
/// Field names are snake_case to match both the API payload and the frontend.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LimitRow {
    /// Meter kind, e.g. `session`, `weekly_all`, `weekly_scoped`.
    #[serde(default)]
    pub kind: String,
    /// Row group, e.g. `session` or `weekly`.
    #[serde(default)]
    pub group: String,
    /// Percent of the window consumed (0–100).
    #[serde(default)]
    pub percent: f64,
    #[serde(default)]
    pub resets_at: Option<String>,
    #[serde(default)]
    pub scope: Option<LimitScope>,
    /// Server's reading of the row, e.g. `normal`, `warning`, `critical`.
    #[serde(default)]
    pub severity: Option<String>,
    #[serde(default)]
    pub is_active: bool,
}

/// A dollar-denominated allowance the endpoint reports under a codename
/// (for example the cloud-sessions credit). Recognised by its `limit_dollars`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CreditBucket {
    /// The top-level key it arrived under.
    pub key: String,
    #[serde(default)]
    pub utilization: f64,
    #[serde(default)]
    pub resets_at: Option<String>,
    #[serde(default)]
    pub limit_dollars: Option<f64>,
    #[serde(default)]
    pub used_dollars: Option<f64>,
    #[serde(default)]
    pub remaining_dollars: Option<f64>,
}

/// Pick the credit buckets out of the top-level fields this widget does not
/// model by name: any object with a numeric `limit_dollars`.
pub fn credit_buckets(other: &BTreeMap<String, Value>) -> Vec<CreditBucket> {
    other
        .iter()
        .filter_map(|(key, value)| {
            let obj = value.as_object()?;
            let limit = obj.get("limit_dollars")?.as_f64()?;
            let num = |name: &str| obj.get(name).and_then(Value::as_f64);
            Some(CreditBucket {
                key: key.clone(),
                utilization: num("utilization").unwrap_or(0.0),
                resets_at: obj
                    .get("resets_at")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                limit_dollars: Some(limit),
                used_dollars: num("used_dollars"),
                remaining_dollars: num("remaining_dollars"),
            })
        })
        .collect()
}

/// Raw response from the usage endpoint. Fields not modelled by name land in
/// `other` so codenamed buckets can still be surfaced.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct RawUsage {
    #[serde(default)]
    pub five_hour: Option<UsageWindow>,
    #[serde(default)]
    pub seven_day: Option<UsageWindow>,
    #[serde(default)]
    pub seven_day_opus: Option<UsageWindow>,
    #[serde(default)]
    pub seven_day_sonnet: Option<UsageWindow>,
    #[serde(default)]
    pub extra_usage: Option<ExtraUsage>,
    #[serde(default)]
    pub limits: Option<Vec<LimitRow>>,
    #[serde(flatten)]
    pub other: BTreeMap<String, Value>,
    /// The response body as received, for the diagnostics panel. Contains no token.
    #[serde(skip)]
    pub raw_json: String,
}

/// What the frontend renders: usage windows plus a friendly plan label.
/// The access token is never included.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSnapshot {
    pub plan: String,
    pub subscription_type: Option<String>,
    pub rate_limit_tier: Option<String>,
    pub five_hour: Option<UsageWindow>,
    pub seven_day: Option<UsageWindow>,
    pub seven_day_opus: Option<UsageWindow>,
    pub seven_day_sonnet: Option<UsageWindow>,
    pub extra_usage: Option<ExtraUsage>,
    pub limits: Option<Vec<LimitRow>>,
    pub credits: Vec<CreditBucket>,
    pub raw_json: String,
    pub fetched_at_ms: i64,
}

/// Parse a raw usage JSON payload.
pub fn parse_usage(raw: &str) -> Result<RawUsage, CoreError> {
    Ok(serde_json::from_str(raw)?)
}

/// Build a friendly plan name from the subscription type and rate-limit tier.
/// e.g. `("max", "default_claude_max_5x")` -> `"Claude Max 5x"`.
pub fn plan_label(subscription_type: Option<&str>, rate_limit_tier: Option<&str>) -> String {
    let tier = rate_limit_tier.unwrap_or("");
    let detail = if tier.contains("max_20x") {
        "Max 20x".to_string()
    } else if tier.contains("max_5x") {
        "Max 5x".to_string()
    } else if tier.contains("max") {
        "Max".to_string()
    } else if tier.contains("team") {
        "Team".to_string()
    } else if tier.contains("pro") {
        "Pro".to_string()
    } else if tier.contains("free") {
        "Free".to_string()
    } else {
        match subscription_type {
            Some("max") => "Max".to_string(),
            Some("pro") => "Pro".to_string(),
            Some(other) if !other.is_empty() => capitalize(other),
            _ => String::new(),
        }
    };

    if detail.is_empty() {
        "Claude".to_string()
    } else {
        format!("Claude {detail}")
    }
}

fn capitalize(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

/// Call the usage endpoint with the given bearer token.
pub async fn fetch_raw_usage(
    client: &reqwest::Client,
    token: &str,
) -> Result<RawUsage, CoreError> {
    let resp = client
        .get(USAGE_URL)
        .header("Authorization", format!("Bearer {token}"))
        .header("anthropic-beta", OAUTH_BETA)
        .header("User-Agent", "claude-usage-widget")
        .send()
        .await?;

    let status = resp.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(CoreError::Unauthorized);
    }
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        let retry_after = resp
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.trim().parse::<u64>().ok())
            .filter(|&s| s > 0);
        return Err(CoreError::RateLimited(retry_after));
    }
    if !status.is_success() {
        return Err(CoreError::Http(status.as_u16()));
    }
    let text = resp.text().await?;
    let mut raw = parse_usage(&text)?;
    raw.raw_json = text;
    Ok(raw)
}

/// Fetch usage and assemble a snapshot for the given credentials.
pub async fn fetch_usage_snapshot(
    client: &reqwest::Client,
    creds: &OauthCredentials,
    now_ms: i64,
) -> Result<UsageSnapshot, CoreError> {
    let raw = fetch_raw_usage(client, &creds.access_token).await?;
    Ok(UsageSnapshot {
        plan: plan_label(
            creds.subscription_type.as_deref(),
            creds.rate_limit_tier.as_deref(),
        ),
        subscription_type: creds.subscription_type.clone(),
        rate_limit_tier: creds.rate_limit_tier.clone(),
        five_hour: raw.five_hour,
        seven_day: raw.seven_day,
        seven_day_opus: raw.seven_day_opus,
        seven_day_sonnet: raw.seven_day_sonnet,
        extra_usage: raw.extra_usage,
        limits: raw.limits,
        credits: credit_buckets(&raw.other),
        raw_json: raw.raw_json,
        fetched_at_ms: now_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
        "five_hour": {"utilization": 3.0, "resets_at": "2026-06-13T09:10:00+00:00"},
        "seven_day": {"utilization": 0.0, "resets_at": "2026-06-14T05:00:00+00:00"},
        "seven_day_opus": null,
        "seven_day_sonnet": {"utilization": 12.5, "resets_at": null},
        "extra_unknown_field": {"foo": 1}
    }"#;

    #[test]
    fn parses_usage_payload() {
        let u = parse_usage(SAMPLE).unwrap();
        assert_eq!(u.five_hour.as_ref().unwrap().utilization, 3.0);
        assert_eq!(
            u.five_hour.as_ref().unwrap().resets_at.as_deref(),
            Some("2026-06-13T09:10:00+00:00")
        );
        assert!(u.seven_day_opus.is_none());
        assert_eq!(u.seven_day_sonnet.as_ref().unwrap().utilization, 12.5);
        assert!(u.seven_day_sonnet.as_ref().unwrap().resets_at.is_none());
    }

    #[test]
    fn empty_object_yields_no_windows() {
        let u = parse_usage("{}").unwrap();
        assert!(u.five_hour.is_none());
        assert!(u.seven_day.is_none());
    }

    #[test]
    fn parses_extra_usage_when_present() {
        let raw = r#"{"five_hour":{"utilization":1.0},"extra_usage":{"is_enabled":true,"monthly_limit":50.0,"used_credits":12.5,"utilization":25.0,"currency":"USD"}}"#;
        let u = parse_usage(raw).unwrap();
        let extra = u.extra_usage.unwrap();
        assert!(extra.is_enabled);
        assert_eq!(extra.monthly_limit, Some(50.0));
        assert_eq!(extra.used_credits, Some(12.5));
        assert_eq!(extra.currency.as_deref(), Some("USD"));
    }

    #[test]
    fn extra_usage_absent_is_none() {
        let u = parse_usage(r#"{"five_hour":{"utilization":1.0}}"#).unwrap();
        assert!(u.extra_usage.is_none());
    }

    #[test]
    fn parses_scoped_limit_rows() {
        let raw = r#"{
            "five_hour": {"utilization": 1.0},
            "limits": [
                {"kind": "session", "group": "session", "percent": 1.0, "resets_at": null, "severity": "normal", "is_active": true},
                {"kind": "weekly_scoped", "group": "weekly", "percent": 42.5, "resets_at": "2026-06-14T05:00:00+00:00",
                 "scope": {"model": {"display_name": "Fable"}}, "severity": "warning", "is_active": false},
                {"kind": "weekly_scoped", "group": "weekly", "percent": 7.0, "resets_at": null,
                 "scope": {"surface": {"display_name": "Cloud sessions"}}, "severity": "normal", "is_active": false, "unknown": 1}
            ]
        }"#;
        let u = parse_usage(raw).unwrap();
        let rows = u.limits.unwrap();
        assert_eq!(rows.len(), 3);
        assert!(rows[0].scope.is_none());
        assert!(rows[0].is_active);
        let fable = &rows[1];
        assert_eq!(fable.kind, "weekly_scoped");
        assert_eq!(fable.percent, 42.5);
        assert_eq!(fable.severity.as_deref(), Some("warning"));
        assert_eq!(
            fable.scope.as_ref().unwrap().model.as_ref().unwrap().display_name,
            "Fable"
        );
        let cloud = &rows[2];
        assert_eq!(
            cloud.scope.as_ref().unwrap().surface.as_ref().unwrap().display_name,
            "Cloud sessions"
        );
        assert!(cloud.scope.as_ref().unwrap().model.is_none());
    }

    #[test]
    fn detects_codenamed_credit_buckets() {
        let raw = r#"{
            "five_hour": {"utilization": 30.0, "limit_dollars": null, "used_dollars": null},
            "tangelo": null,
            "iguana_necktie": {"utilization": 20.6, "resets_at": "2026-11-05T07:59:00+00:00",
                               "limit_dollars": 250, "used_dollars": 51.5, "remaining_dollars": 198.5, "locked_reason": null},
            "nimbus_quill": {"utilization": 0.0, "resets_at": null, "limit_dollars": null},
            "spend": {"percent": 99, "limit": {"amount_minor": 2400}},
            "member_dashboard_available": false
        }"#;
        let u = parse_usage(raw).unwrap();
        let credits = credit_buckets(&u.other);
        assert_eq!(credits.len(), 1);
        let c = &credits[0];
        assert_eq!(c.key, "iguana_necktie");
        assert_eq!(c.utilization, 20.6);
        assert_eq!(c.limit_dollars, Some(250.0));
        assert_eq!(c.used_dollars, Some(51.5));
        assert_eq!(c.remaining_dollars, Some(198.5));
        assert_eq!(c.resets_at.as_deref(), Some("2026-11-05T07:59:00+00:00"));
        assert!(!u.other.contains_key("five_hour"));
    }

    #[test]
    fn limits_absent_is_none() {
        let u = parse_usage(r#"{"five_hour":{"utilization":1.0}}"#).unwrap();
        assert!(u.limits.is_none());
    }

    #[test]
    fn plan_label_variants() {
        assert_eq!(plan_label(Some("max"), Some("default_claude_max_5x")), "Claude Max 5x");
        assert_eq!(plan_label(Some("max"), Some("claude_max_20x")), "Claude Max 20x");
        assert_eq!(plan_label(Some("pro"), Some("claude_pro")), "Claude Pro");
        assert_eq!(plan_label(Some("max"), None), "Claude Max");
        assert_eq!(plan_label(None, None), "Claude");
        assert_eq!(plan_label(Some("enterprise"), None), "Claude Enterprise");
    }
}
