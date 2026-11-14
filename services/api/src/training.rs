use crate::domain::{ContentItem, Event, EventType, ServingModel};
use chrono::{DateTime, Utc};
use std::collections::HashMap;

#[derive(Default)]
struct Signal {
    weighted_sum: f32,
    weight: f32,
}

impl Signal {
    fn observe(&mut self, value: f32, confidence: f32) {
        self.weighted_sum += value * confidence;
        self.weight += confidence;
    }

    fn posterior(&self, prior: f32, prior_weight: f32) -> f32 {
        ((self.weighted_sum + prior * prior_weight) / (self.weight + prior_weight)).clamp(0.0, 1.0)
    }
}

fn event_target(event_type: EventType) -> (f32, f32) {
    match event_type {
        EventType::ContentImpression => (0.45, 0.10),
        EventType::ContentView => (0.58, 0.45),
        EventType::Click => (0.68, 0.70),
        EventType::Like => (0.86, 1.00),
        EventType::Save => (0.92, 1.15),
        EventType::Share => (0.95, 1.20),
        EventType::Search => (0.60, 0.35),
        EventType::Dismiss => (0.08, 1.00),
        EventType::Follow => (0.90, 1.10),
        EventType::DwellTime => (0.72, 0.65),
        EventType::RecommendationConversion => (1.00, 1.40),
    }
}

fn recency_weight(timestamp: DateTime<Utc>, now: DateTime<Utc>) -> f32 {
    let age_days = (now - timestamp).num_seconds().max(0) as f32 / 86_400.0;
    2.0_f32.powf(-age_days / 30.0).clamp(0.05, 1.0)
}

/// Learns a compact empirical-Bayes prior from observed product behavior.
/// The artifact is intentionally portable JSON so the same model can run in
/// the Rust API and the hosted Worker without Python or a model server.
pub fn train_serving_model(
    events: &[Event],
    content: &[ContentItem],
    now: DateTime<Utc>,
) -> ServingModel {
    let lookup: HashMap<_, _> = content
        .iter()
        .map(|item| (item.content_id.as_str(), item.category.as_str()))
        .collect();
    let mut categories: HashMap<String, Signal> = HashMap::new();
    let mut items: HashMap<String, Signal> = HashMap::new();

    for event in events {
        let Some(content_id) = event.content_id.as_deref() else {
            continue;
        };
        let Some(category) = lookup.get(content_id).copied() else {
            continue;
        };
        let (target, confidence) = event_target(event.event_type);
        let confidence = confidence * recency_weight(event.timestamp, now);
        categories
            .entry(category.to_owned())
            .or_default()
            .observe(target, confidence);
        items
            .entry(content_id.to_owned())
            .or_default()
            .observe(target, confidence);
    }

    let category_scores = categories
        .into_iter()
        .map(|(feature, signal)| (feature, signal.posterior(0.5, 3.0)))
        .collect();
    let content_scores = items
        .into_iter()
        .map(|(feature, signal)| (feature, signal.posterior(0.5, 6.0)))
        .collect();

    ServingModel {
        schema_version: 1,
        model_id: "behavioral-prior-v1".into(),
        trained_at: now,
        training_event_count: events.len(),
        category_scores,
        content_scores,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;
    use uuid::Uuid;

    fn content(now: DateTime<Utc>) -> Vec<ContentItem> {
        vec![
            ContentItem {
                content_id: "liked".into(),
                title: "Liked".into(),
                category: "rust".into(),
                description: String::new(),
                quality_score: 0.8,
                published_at: now,
                metadata: json!({}),
            },
            ContentItem {
                content_id: "dismissed".into(),
                title: "Dismissed".into(),
                category: "typescript".into(),
                description: String::new(),
                quality_score: 0.8,
                published_at: now,
                metadata: json!({}),
            },
        ]
    }

    fn event(content_id: &str, event_type: EventType, now: DateTime<Utc>) -> Event {
        Event {
            event_id: Uuid::new_v4(),
            user_id: "user".into(),
            content_id: Some(content_id.into()),
            event_type,
            timestamp: now,
            session_id: "session".into(),
            context: HashMap::new(),
            surface: "test".into(),
            schema_version: 1,
        }
    }

    #[test]
    fn positive_and_negative_evidence_create_ordered_priors() {
        let now = Utc::now();
        let events = vec![
            event("liked", EventType::Save, now),
            event("liked", EventType::Share, now),
            event("dismissed", EventType::Dismiss, now),
        ];
        let model = train_serving_model(&events, &content(now), now);
        assert!(model.score("liked", "rust") > model.score("dismissed", "typescript"));
        assert_eq!(model.training_event_count, 3);
        model.validate().unwrap();
    }

    #[test]
    fn empty_history_produces_a_valid_neutral_model() {
        let model = train_serving_model(&[], &content(Utc::now()), Utc::now());
        assert_eq!(model.score("unknown", "unknown"), 0.5);
        model.validate().unwrap();
    }
}
