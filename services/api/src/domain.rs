use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashMap, fmt, str::FromStr};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    ContentImpression,
    ContentView,
    Click,
    Like,
    Save,
    Share,
    Search,
    Dismiss,
    Follow,
    DwellTime,
    RecommendationConversion,
}

impl fmt::Display for EventType {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let value = serde_json::to_value(self).map_err(|_| fmt::Error)?;
        formatter.write_str(value.as_str().ok_or(fmt::Error)?)
    }
}

impl FromStr for EventType {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        serde_json::from_value(Value::String(value.to_owned())).map_err(|error| error.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub event_id: Uuid,
    pub user_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_id: Option<String>,
    pub event_type: EventType,
    pub timestamp: DateTime<Utc>,
    pub session_id: String,
    #[serde(default)]
    pub context: HashMap<String, Value>,
    pub surface: String,
    #[serde(default = "schema_v1")]
    pub schema_version: u16,
}

const fn schema_v1() -> u16 {
    1
}

impl Event {
    pub fn validate(&self, now: DateTime<Utc>) -> Result<(), String> {
        for (name, value, limit) in [
            ("user_id", self.user_id.as_str(), 200),
            ("session_id", self.session_id.as_str(), 200),
            ("surface", self.surface.as_str(), 100),
        ] {
            if value.trim().is_empty() {
                return Err(format!("{name} must be non-empty"));
            }
            if value.len() > limit {
                return Err(format!("{name} must be at most {limit} characters"));
            }
        }
        if self
            .content_id
            .as_ref()
            .is_some_and(|value| value.len() > 200)
        {
            return Err("content_id must be at most 200 characters".into());
        }
        if self.schema_version != 1 {
            return Err("only event schema_version=1 is supported".into());
        }
        if self.timestamp > now + chrono::Duration::minutes(5) {
            return Err("timestamp is too far in the future".into());
        }
        if self.timestamp < now - chrono::Duration::days(3650) {
            return Err("timestamp is older than the ten-year retention boundary".into());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentItem {
    pub content_id: String,
    pub title: String,
    pub category: String,
    pub description: String,
    pub quality_score: f32,
    pub published_at: DateTime<Utc>,
    pub metadata: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Experiment {
    pub id: Uuid,
    pub name: String,
    pub control: String,
    pub treatment: String,
    pub allocation: f64,
    pub status: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelVersion {
    pub id: String,
    pub architecture: String,
    pub dataset_version: String,
    pub parameters: Value,
    pub metrics: Option<Value>,
    pub artifact_uri: Option<String>,
    pub trained_at: Option<DateTime<Utc>>,
    pub status: String,
}

/// Portable online-serving artifact shared by the trainer, Rust API, and hosted Worker.
/// Scores are bounded priors, not probabilities. They are blended with live behavior,
/// freshness, and quality by the ranking policy.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ServingModel {
    pub schema_version: u16,
    pub model_id: String,
    pub trained_at: DateTime<Utc>,
    pub training_event_count: usize,
    #[serde(default)]
    pub category_scores: HashMap<String, f32>,
    #[serde(default)]
    pub content_scores: HashMap<String, f32>,
}

impl ServingModel {
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 {
            return Err("only serving model schema_version=1 is supported".into());
        }
        if self.model_id.trim().is_empty() || self.model_id.len() > 120 {
            return Err("model_id must contain between 1 and 120 characters".into());
        }
        if self.category_scores.len() > 10_000 || self.content_scores.len() > 1_000_000 {
            return Err("serving model exceeds the supported feature count".into());
        }
        for (feature, score) in self
            .category_scores
            .iter()
            .chain(self.content_scores.iter())
        {
            if feature.trim().is_empty() || feature.len() > 200 {
                return Err("serving model feature names must contain 1 to 200 characters".into());
            }
            if !score.is_finite() || !(0.0..=1.0).contains(score) {
                return Err(format!(
                    "serving score for {feature} must be between 0 and 1"
                ));
            }
        }
        Ok(())
    }

    pub fn score(&self, content_id: &str, category: &str) -> f32 {
        self.content_scores
            .get(content_id)
            .copied()
            .or_else(|| self.category_scores.get(category).copied())
            .unwrap_or(0.5)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct InterestScore {
    pub topic: String,
    pub weight: f32,
    pub evidence_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScoreComponents {
    pub relevance: f32,
    pub recency: f32,
    pub diversity: f32,
    pub quality: f32,
    pub learned_prior: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct Recommendation {
    pub content_id: String,
    pub title: String,
    pub category: String,
    pub description: String,
    pub score: f32,
    pub score_type: &'static str,
    pub components: ScoreComponents,
    pub explanation: String,
    pub model_version: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IngestStatus {
    Accepted,
    Duplicate,
}

impl IngestStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Accepted => "accepted",
            Self::Duplicate => "duplicate",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct OverviewStats {
    pub total_users: i64,
    pub total_content_items: i64,
    pub total_events: i64,
    pub total_experiments: i64,
}
