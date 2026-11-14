use crate::domain::{
    ContentItem, Event, EventType, InterestScore, Recommendation, ScoreComponents, ServingModel,
};
use chrono::{DateTime, Utc};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy)]
pub struct RankingOptions {
    pub relevance_weight: f32,
    pub recency_weight: f32,
    pub quality_weight: f32,
    pub diversity_weight: f32,
}

impl Default for RankingOptions {
    fn default() -> Self {
        Self {
            relevance_weight: 0.55,
            recency_weight: 0.20,
            quality_weight: 0.25,
            diversity_weight: 0.20,
        }
    }
}

impl RankingOptions {
    pub fn validate(self) -> Result<Self, String> {
        for (name, value) in [
            ("relevance_weight", self.relevance_weight),
            ("recency_weight", self.recency_weight),
            ("quality_weight", self.quality_weight),
            ("diversity_weight", self.diversity_weight),
        ] {
            if !value.is_finite() || !(0.0..=1.0).contains(&value) {
                return Err(format!("{name} must be a finite number between 0 and 1"));
            }
        }
        let primary = self.relevance_weight + self.recency_weight + self.quality_weight;
        if primary <= f32::EPSILON {
            return Err("at least one primary ranking weight must be positive".into());
        }
        Ok(Self {
            relevance_weight: self.relevance_weight / primary,
            recency_weight: self.recency_weight / primary,
            quality_weight: self.quality_weight / primary,
            diversity_weight: self.diversity_weight,
        })
    }
}

#[derive(Debug, Clone)]
pub struct InterestProfile {
    pub long_term: Vec<InterestScore>,
    pub recent: Vec<InterestScore>,
}

fn event_strength(event: &Event) -> f32 {
    match event.event_type {
        EventType::ContentImpression => 0.05,
        EventType::ContentView => 0.30,
        EventType::Click => 0.60,
        EventType::Like => 1.00,
        EventType::Save => 1.10,
        EventType::Share => 1.20,
        EventType::Search => 0.35,
        EventType::Dismiss => -0.55,
        EventType::Follow => 1.00,
        EventType::DwellTime => {
            let seconds = event
                .context
                .get("seconds")
                .and_then(|value| value.as_f64())
                .unwrap_or(30.0)
                .clamp(0.0, 600.0);
            (seconds as f32 / 120.0).clamp(0.05, 1.25)
        }
        EventType::RecommendationConversion => 1.50,
    }
}

fn decay(timestamp: DateTime<Utc>, now: DateTime<Utc>, half_life_days: f32) -> f32 {
    let age_seconds = (now - timestamp).num_seconds().max(0) as f32;
    2.0_f32.powf(-age_seconds / (half_life_days * 86_400.0))
}

fn normalize(scores: HashMap<String, (f32, usize)>) -> Vec<InterestScore> {
    let maximum = scores
        .values()
        .map(|(score, _)| score.max(0.0))
        .fold(0.0_f32, f32::max);
    let mut result: Vec<_> = scores
        .into_iter()
        .filter_map(|(topic, (score, evidence_count))| {
            (score > 0.0).then_some(InterestScore {
                topic,
                weight: if maximum > 0.0 {
                    (score / maximum).clamp(0.0, 1.0)
                } else {
                    0.0
                },
                evidence_count,
            })
        })
        .collect();
    result.sort_by(|left, right| {
        right
            .weight
            .total_cmp(&left.weight)
            .then_with(|| left.topic.cmp(&right.topic))
    });
    result
}

pub fn interests(events: &[Event], content: &[ContentItem], now: DateTime<Utc>) -> InterestProfile {
    let categories: HashMap<_, _> = content
        .iter()
        .map(|item| (item.content_id.as_str(), item.category.as_str()))
        .collect();
    let mut long_term: HashMap<String, (f32, usize)> = HashMap::new();
    let mut recent: HashMap<String, (f32, usize)> = HashMap::new();

    for event in events {
        let category = event
            .content_id
            .as_deref()
            .and_then(|id| categories.get(id).copied())
            .map(str::to_owned)
            .or_else(|| {
                event
                    .context
                    .get("category")
                    .and_then(|value| value.as_str())
                    .map(str::to_owned)
            });
        let Some(category) = category else { continue };
        let strength = event_strength(event);
        for (target, half_life) in [(&mut long_term, 30.0), (&mut recent, 2.0)] {
            let entry = target.entry(category.clone()).or_insert((0.0, 0));
            entry.0 += strength * decay(event.timestamp, now, half_life);
            entry.1 += 1;
        }
    }

    InterestProfile {
        long_term: normalize(long_term),
        recent: normalize(recent),
    }
}

pub struct RankingResult {
    pub items: Vec<Recommendation>,
    pub fallback_used: bool,
}

pub fn recommend_with_model(
    events: &[Event],
    content: &[ContentItem],
    options: RankingOptions,
    limit: usize,
    now: DateTime<Utc>,
    serving_model: Option<&ServingModel>,
) -> RankingResult {
    let profile = interests(events, content, now);
    let long_term: HashMap<_, _> = profile
        .long_term
        .iter()
        .map(|interest| (interest.topic.as_str(), interest.weight))
        .collect();
    let recent: HashMap<_, _> = profile
        .recent
        .iter()
        .map(|interest| (interest.topic.as_str(), interest.weight))
        .collect();
    let seen: HashSet<_> = events
        .iter()
        .filter_map(|event| event.content_id.as_deref())
        .collect();
    let fallback_used = long_term.is_empty() && recent.is_empty();

    let mut candidates: Vec<_> = content
        .iter()
        .filter(|item| !seen.contains(item.content_id.as_str()))
        .map(|item| {
            let relevance = if fallback_used {
                0.0
            } else {
                0.35 * long_term
                    .get(item.category.as_str())
                    .copied()
                    .unwrap_or(0.0)
                    + 0.65 * recent.get(item.category.as_str()).copied().unwrap_or(0.0)
            };
            let age_days = (now - item.published_at).num_seconds().max(0) as f32 / 86_400.0;
            let recency = 2.0_f32.powf(-age_days / 21.0).clamp(0.0, 1.0);
            let learned_prior = serving_model
                .map(|model| model.score(&item.content_id, &item.category))
                .unwrap_or(0.5);
            let policy_score = options.relevance_weight * relevance
                + options.recency_weight * recency
                + options.quality_weight * item.quality_score;
            let base = if serving_model.is_some() {
                0.80 * policy_score + 0.20 * learned_prior
            } else {
                policy_score
            };
            (item, relevance, recency, learned_prior, base)
        })
        .collect();

    let mut selected = Vec::with_capacity(limit.min(candidates.len()));
    let mut categories: HashMap<&str, usize> = HashMap::new();
    while selected.len() < limit && !candidates.is_empty() {
        let (best_index, _) = candidates
            .iter()
            .enumerate()
            .map(|(index, (item, _, _, _, base))| {
                let repeat_count = *categories.get(item.category.as_str()).unwrap_or(&0) as f32;
                let adjusted = *base - options.diversity_weight * 0.12 * repeat_count;
                (index, adjusted)
            })
            .max_by(|left, right| left.1.total_cmp(&right.1))
            .expect("non-empty candidate list");
        let (item, relevance, recency, learned_prior, base) = candidates.swap_remove(best_index);
        let repeat_count = *categories.get(item.category.as_str()).unwrap_or(&0);
        let diversity = 1.0 / (1.0 + repeat_count as f32);
        *categories.entry(item.category.as_str()).or_default() += 1;
        let score = (base + options.diversity_weight * 0.08 * diversity).clamp(0.0, 1.0);
        let explanation = if serving_model.is_some() && learned_prior >= 0.65 {
            format!(
                "The active trained model raised this {} item; live quality and freshness checks still apply.",
                item.category
            )
        } else if fallback_used {
            format!(
                "Cold-start fallback selected high-quality, recent {} content.",
                item.category
            )
        } else if relevance > 0.5 {
            format!(
                "Strong match for the user's recent and long-term {} interest.",
                item.category
            )
        } else {
            format!(
                "Adds {} coverage while preserving quality and freshness.",
                item.category
            )
        };
        selected.push(Recommendation {
            content_id: item.content_id.clone(),
            title: item.title.clone(),
            category: item.category.clone(),
            description: item.description.clone(),
            score,
            score_type: "heuristic_policy_score",
            components: ScoreComponents {
                relevance,
                recency,
                diversity,
                quality: item.quality_score,
                learned_prior,
            },
            explanation,
            model_version: serving_model
                .map(|model| model.model_id.clone())
                .unwrap_or_else(|| "affinity-ranker-v1".into()),
        });
    }
    RankingResult {
        items: selected,
        fallback_used,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use uuid::Uuid;

    fn content(now: DateTime<Utc>) -> Vec<ContentItem> {
        [
            ("ml", "applied_ml", 0.9),
            ("systems", "data_systems", 0.8),
            ("ml-2", "applied_ml", 0.85),
        ]
        .into_iter()
        .map(|(id, category, quality)| ContentItem {
            content_id: id.into(),
            title: id.into(),
            category: category.into(),
            description: id.into(),
            quality_score: quality,
            published_at: now,
            metadata: json!({}),
        })
        .collect()
    }

    #[test]
    fn recent_positive_behavior_changes_ranking_and_filters_seen_content() {
        let now = Utc::now();
        let event = Event {
            event_id: Uuid::new_v4(),
            user_id: "user".into(),
            content_id: Some("ml".into()),
            event_type: EventType::Save,
            timestamp: now,
            session_id: "session".into(),
            context: HashMap::new(),
            surface: "test".into(),
            schema_version: 1,
        };
        let result = recommend_with_model(
            &[event],
            &content(now),
            RankingOptions::default(),
            3,
            now,
            None,
        );
        assert!(!result.fallback_used);
        assert_eq!(result.items[0].content_id, "ml-2");
        assert!(result.items.iter().all(|item| item.content_id != "ml"));
    }

    #[test]
    fn empty_history_uses_labeled_fallback() {
        let now = Utc::now();
        let result =
            recommend_with_model(&[], &content(now), RankingOptions::default(), 2, now, None);
        assert!(result.fallback_used);
        assert!(result.items[0].explanation.contains("Cold-start"));
    }
}
