use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::{HashMap, HashSet}, sync::Arc, time::Duration};
use tokio::sync::RwLock;
use tower_http::{cors::CorsLayer, limit::RequestBodyLimitLayer, timeout::TimeoutLayer, trace::TraceLayer};
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    inner: Arc<RwLock<Store>>,
    admin_token: Arc<str>,
}

#[derive(Default)]
struct Store {
    event_ids: HashSet<Uuid>,
    events: Vec<Event>,
    experiments: Vec<Experiment>,
}

impl AppState {
    pub fn demo(admin_token: String) -> Self {
        Self { inner: Arc::new(RwLock::new(Store::default())), admin_token: admin_token.into() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    ContentImpression, ContentView, Click, Like, Save, Share, Search, Dismiss,
    Follow, DwellTime, RecommendationConversion,
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

fn schema_v1() -> u16 { 1 }

impl Event {
    fn validate(&self) -> Result<(), ApiError> {
        if self.user_id.trim().is_empty() || self.session_id.trim().is_empty() || self.surface.trim().is_empty() {
            return Err(ApiError::validation("user_id, session_id, and surface must be non-empty"));
        }
        if self.schema_version != 1 { return Err(ApiError::validation("only event schema_version=1 is supported")); }
        if self.timestamp > Utc::now() + chrono::Duration::minutes(5) { return Err(ApiError::validation("timestamp is too far in the future")); }
        Ok(())
    }
}

#[derive(Debug, Serialize)]
struct IngestResult { event_id: Uuid, status: &'static str }

#[derive(Debug, Deserialize)]
struct EventBatch { events: Vec<Event> }

#[derive(Debug, Serialize)]
struct BatchResult { accepted: usize, duplicates: usize, rejected: usize, errors: Vec<BatchError> }

#[derive(Debug, Serialize)]
struct BatchError { index: usize, code: &'static str, message: String }

#[derive(Debug, Clone, Serialize)]
pub struct Recommendation {
    content_id: String,
    title: String,
    category: String,
    score: f32,
    score_type: &'static str,
    components: ScoreComponents,
    explanation: String,
    model_version: &'static str,
}

#[derive(Debug, Clone, Serialize)]
struct ScoreComponents { relevance: f32, recency: f32, diversity: f32, quality: f32 }

#[derive(Debug, Deserialize)]
struct RecommendationQuery { #[serde(default = "default_limit")] limit: usize, #[serde(default)] strategy: Option<String> }
fn default_limit() -> usize { 10 }

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Experiment {
    id: String,
    name: String,
    control: String,
    treatment: String,
    allocation: f32,
    status: String,
}

#[derive(Debug, Serialize)]
struct UserProfile {
    user_id: String,
    representation: &'static str,
    observed_event_count: usize,
    profile_version: u8,
    inferred_sensitive_attributes: Vec<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("{message}")]
    Validation { message: String },
    #[error("unauthorized")]
    Unauthorized,
    #[error("not found")]
    NotFound,
}

impl ApiError { fn validation(message: impl Into<String>) -> Self { Self::Validation { message: message.into() } } }

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let message = self.to_string();
        let (status, code) = match self { Self::Validation { .. } => (StatusCode::UNPROCESSABLE_ENTITY, "validation_error"), Self::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"), Self::NotFound => (StatusCode::NOT_FOUND, "not_found") };
        let body = Json(json!({ "error": { "code": code, "message": message, "request_id": Uuid::new_v4() } }));
        (status, body).into_response()
    }
}

pub fn app(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
        .route("/metrics", get(metrics))
        .route("/v1/events", post(ingest_event))
        .route("/v1/events/batch", post(ingest_batch))
        .route("/v1/users/{id}", get(get_user))
        .route("/v1/users/{id}/interests", get(get_interests))
        .route("/v1/users/{id}/history", get(get_history))
        .route("/v1/recommendations/{user_id}", get(get_recommendations))
        .route("/v1/content/{content_id}/similar", get(get_similar))
        .route("/v1/models", get(get_models))
        .route("/v1/models/{id}/metrics", get(get_model_metrics))
        .route("/v1/models/train", post(start_training))
        .route("/v1/experiments", get(get_experiments).post(create_experiment))
        .layer(TraceLayer::new_for_http())
        .layer(RequestBodyLimitLayer::new(1_048_576))
        .layer(TimeoutLayer::new(Duration::from_secs(10)))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

async fn health() -> Json<Value> { Json(json!({"status":"ok","service":"affinity-api"})) }
async fn ready() -> Json<Value> { Json(json!({"status":"ready","dependencies":{"repository":"in_memory_demo"}})) }
async fn metrics(State(state): State<AppState>) -> String {
    let store = state.inner.read().await;
    format!("# HELP affinity_events_total Accepted unique events\n# TYPE affinity_events_total counter\naffinity_events_total {}\n", store.events.len())
}

async fn ingest_event(State(state): State<AppState>, Json(event): Json<Event>) -> Result<(StatusCode, Json<IngestResult>), ApiError> {
    event.validate()?;
    let mut store = state.inner.write().await;
    if !store.event_ids.insert(event.event_id) { return Ok((StatusCode::OK, Json(IngestResult { event_id: event.event_id, status: "duplicate" }))); }
    let id = event.event_id; store.events.push(event);
    Ok((StatusCode::ACCEPTED, Json(IngestResult { event_id: id, status: "accepted" })))
}

async fn ingest_batch(State(state): State<AppState>, Json(batch): Json<EventBatch>) -> Result<Json<BatchResult>, ApiError> {
    if batch.events.is_empty() || batch.events.len() > 500 { return Err(ApiError::validation("batch must contain 1 to 500 events")); }
    let mut result = BatchResult { accepted: 0, duplicates: 0, rejected: 0, errors: vec![] };
    let mut store = state.inner.write().await;
    for (index, event) in batch.events.into_iter().enumerate() {
        if let Err(error) = event.validate() { result.rejected += 1; result.errors.push(BatchError { index, code: "validation_error", message: error.to_string() }); continue; }
        if !store.event_ids.insert(event.event_id) { result.duplicates += 1; } else { store.events.push(event); result.accepted += 1; }
    }
    Ok(Json(result))
}

async fn get_user(State(state): State<AppState>, Path(id): Path<String>) -> Json<UserProfile> {
    let count = state.inner.read().await.events.iter().filter(|event| event.user_id == id).count();
    Json(UserProfile { user_id: id, representation: if count < 5 { "cold_start" } else { "behavioral" }, observed_event_count: count, profile_version: 1, inferred_sensitive_attributes: vec![] })
}

async fn get_interests(Path(id): Path<String>) -> Json<Value> { Json(json!({"user_id":id,"source":"deterministic_demo","long_term":[{"topic":"applied_ml","weight":0.86},{"topic":"data_systems","weight":0.78}],"recent":[{"topic":"retrieval_systems","weight":0.94}],"score_type":"recency_weighted_affinity"})) }

async fn get_history(State(state): State<AppState>, Path(id): Path<String>) -> Json<Value> {
    let events: Vec<Event> = state.inner.read().await.events.iter().filter(|event| event.user_id == id).rev().take(50).cloned().collect();
    Json(json!({"user_id":id,"items":events,"next_cursor":null}))
}

fn demo_recommendations() -> Vec<Recommendation> {
    [
        ("item_101", "Practical retrieval systems", "applied_ml", .913, [.88,.94,.76,.89], "Matches recent retrieval reading and long-term ML interest."),
        ("item_204", "Event streams without drama", "data_systems", .864, [.83,.78,.92,.86], "Strong systems affinity and useful list diversity."),
        ("item_311", "Measuring representation drift", "ml_operations", .821, [.85,.69,.81,.84], "Semantic match to evaluation history; previously unseen."),
        ("item_422", "Model-debugging interface patterns", "design_tools", .774, [.71,.83,.88,.78], "Bridges design interest with current debugging intent."),
    ].into_iter().map(|(id,title,category,score,c,explanation)| Recommendation { content_id:id.into(), title:title.into(), category:category.into(), score, score_type:"heuristic_policy_score", components:ScoreComponents{relevance:c[0],recency:c[1],diversity:c[2],quality:c[3]}, explanation:explanation.into(), model_version:"als-v1" }).collect()
}

async fn get_recommendations(Path(user_id): Path<String>, Query(query): Query<RecommendationQuery>) -> Result<Json<Value>, ApiError> {
    if !(1..=100).contains(&query.limit) { return Err(ApiError::validation("limit must be between 1 and 100")); }
    let items: Vec<_> = demo_recommendations().into_iter().take(query.limit).collect();
    Ok(Json(json!({"user_id":user_id,"strategy":query.strategy.unwrap_or_else(||"balanced".into()),"model_version":"als-v1","fallback_used":false,"items":items})))
}

async fn get_similar(Path(content_id): Path<String>) -> Json<Value> { Json(json!({"content_id":content_id,"model_version":"two-tower-v1","items":demo_recommendations().into_iter().take(3).collect::<Vec<_>>()})) }
async fn get_models() -> Json<Value> { Json(json!({"items":[{"id":"popularity-v1","status":"baseline","metrics":null},{"id":"als-v1","status":"configured","metrics":null},{"id":"two-tower-v1","status":"ready_to_train","metrics":null},{"id":"gru4rec-v1","status":"ready_to_train","metrics":null}]})) }
async fn get_model_metrics(Path(id): Path<String>) -> Json<Value> { Json(json!({"model_id":id,"measured":false,"metrics":null,"message":"Run make evaluate to record measured metrics."})) }

fn authorized(headers: &HeaderMap, state: &AppState) -> bool {
    headers.get(header::AUTHORIZATION).and_then(|value| value.to_str().ok()).is_some_and(|value| value.strip_prefix("Bearer ") == Some(state.admin_token.as_ref()))
}
async fn start_training(State(state): State<AppState>, headers: HeaderMap) -> Result<(StatusCode, Json<Value>), ApiError> {
    if !authorized(&headers, &state) { return Err(ApiError::Unauthorized); }
    Ok((StatusCode::ACCEPTED, Json(json!({"job_id":Uuid::new_v4(),"status":"queued","note":"Local worker must be running."}))))
}

async fn get_experiments(State(state): State<AppState>) -> Json<Value> { let items = state.inner.read().await.experiments.clone(); Json(json!({"items":items})) }
async fn create_experiment(State(state): State<AppState>, headers: HeaderMap, Json(mut experiment): Json<Experiment>) -> Result<(StatusCode, Json<Experiment>), ApiError> {
    if !authorized(&headers, &state) { return Err(ApiError::Unauthorized); }
    if experiment.name.trim().is_empty() || !(0.0..=1.0).contains(&experiment.allocation) { return Err(ApiError::validation("name is required and allocation must be in [0, 1]")); }
    experiment.id = Uuid::new_v4().to_string(); experiment.status = "draft".into(); state.inner.write().await.experiments.push(experiment.clone());
    Ok((StatusCode::CREATED, Json(experiment)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    fn event(id: Uuid) -> Event { Event { event_id:id, user_id:"usr_test".into(), content_id:Some("item_1".into()), event_type:EventType::Click, timestamp:Utc::now(), session_id:"session_1".into(), context:HashMap::new(), surface:"test".into(), schema_version:1 } }

    #[tokio::test]
    async fn duplicate_event_is_idempotent() {
        let app = app(AppState::demo("secret".into())); let id = Uuid::new_v4();
        for expected in [StatusCode::ACCEPTED, StatusCode::OK] {
            let response = app.clone().oneshot(Request::post("/v1/events").header("content-type","application/json").body(Body::from(serde_json::to_vec(&event(id)).unwrap())).unwrap()).await.unwrap();
            assert_eq!(response.status(), expected);
        }
    }

    #[tokio::test]
    async fn admin_endpoint_requires_bearer_token() {
        let response = app(AppState::demo("secret".into())).oneshot(Request::post("/v1/models/train").body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        assert!(std::str::from_utf8(&body).unwrap().contains("unauthorized"));
    }

    #[tokio::test]
    async fn recommendation_scores_are_labeled_heuristics() {
        let response = app(AppState::demo("secret".into())).oneshot(Request::get("/v1/recommendations/usr_test?limit=2").body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["items"].as_array().unwrap().len(), 2);
        assert_eq!(value["items"][0]["score_type"], "heuristic_policy_score");
    }
}

