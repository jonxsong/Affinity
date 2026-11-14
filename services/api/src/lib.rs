mod domain;
mod ranking;
mod rate_limit;
mod repository;
mod training;

pub use domain::{
    ContentItem, Event, EventType, Experiment, ModelVersion, Recommendation, ServingModel,
};
pub use repository::{MemoryRepository, PostgresRepository, Repository};

use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{header, HeaderMap, HeaderName, Method, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use domain::IngestStatus;
use ranking::{interests, recommend_with_model, RankingOptions};
use rate_limit::RateLimiter;
use repository::{arc, NewExperiment, RepositoryError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tower_http::{
    cors::{Any, CorsLayer},
    limit::RequestBodyLimitLayer,
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use training::train_serving_model;
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    repository: Arc<dyn Repository>,
    admin_token: Arc<str>,
    recommendation_requests: Arc<AtomicU64>,
    started_at: Instant,
    rate_limiter: Arc<RateLimiter>,
}

impl AppState {
    pub async fn connect(database_url: &str, admin_token: String) -> Result<Self, RepositoryError> {
        let repository = PostgresRepository::connect(database_url).await?;
        Ok(Self::new(arc(repository), admin_token))
    }

    pub fn test(admin_token: impl Into<String>) -> Self {
        Self::new(arc(MemoryRepository::fixture()), admin_token.into())
    }

    pub fn new(repository: Arc<dyn Repository>, admin_token: String) -> Self {
        Self {
            repository,
            admin_token: admin_token.into(),
            recommendation_requests: Arc::new(AtomicU64::new(0)),
            started_at: Instant::now(),
            rate_limiter: Arc::new(RateLimiter::per_minute(120)),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("{0}")]
    Validation(String),
    #[error("authentication is required for this operation")]
    Unauthorized,
    #[error("{0} was not found")]
    NotFound(String),
    #[error("a resource with the same identity already exists")]
    Conflict,
    #[error("the service could not complete the request")]
    Internal(#[source] RepositoryError),
}

impl From<RepositoryError> for ApiError {
    fn from(error: RepositoryError) -> Self {
        match &error {
            RepositoryError::Database(sqlx::Error::Database(database))
                if database.is_unique_violation() =>
            {
                Self::Conflict
            }
            _ => Self::Internal(error),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let request_id = Uuid::new_v4();
        let (status, code, public_message) = match self {
            Self::Validation(message) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "validation_error",
                message,
            ),
            Self::Unauthorized => (
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "authentication is required for this operation".into(),
            ),
            Self::NotFound(resource) => (
                StatusCode::NOT_FOUND,
                "not_found",
                format!("{resource} was not found"),
            ),
            Self::Conflict => (
                StatusCode::CONFLICT,
                "conflict",
                "a resource with the same identity already exists".into(),
            ),
            Self::Internal(error) => {
                tracing::error!(%request_id, error = ?error, "request failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_error",
                    "the service could not complete the request".into(),
                )
            }
        };
        (
            status,
            Json(json!({"error":{"code":code,"message":public_message,"request_id":request_id}})),
        )
            .into_response()
    }
}

pub fn app(state: AppState) -> Router {
    let request_id_header = HeaderName::from_static("x-request-id");
    let client_id_header = HeaderName::from_static("x-affinity-client-id");
    let api = Router::new()
        .route("/v1/overview", get(overview))
        .route("/v1/events", post(ingest_event))
        .route("/v1/events/batch", post(ingest_batch))
        .route("/v1/users/{id}", get(get_user).delete(delete_user))
        .route("/v1/users/{id}/interests", get(get_interests))
        .route("/v1/users/{id}/history", get(get_history))
        .route("/v1/recommendations/{user_id}", get(get_recommendations))
        .route("/v1/content", get(get_content))
        .route(
            "/v1/content/{content_id}",
            axum::routing::put(upsert_content).delete(archive_content),
        )
        .route("/v1/content/{content_id}/similar", get(get_similar))
        .route("/v1/models", get(get_models))
        .route(
            "/v1/models/active",
            get(get_active_model).put(activate_model),
        )
        .route("/v1/models/train-serving", post(train_active_model))
        .route("/v1/models/{id}/metrics", get(get_model_metrics))
        .route("/v1/models/train", post(start_training))
        .route(
            "/v1/experiments",
            get(get_experiments).post(create_experiment),
        )
        .route(
            "/v1/experiments/{id}/assignment/{user_id}",
            get(get_assignment),
        )
        .route("/v1/sync/export/{user_id}", get(export_user_events))
        .route("/v1/sync/import", post(import_user_events))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            enforce_rate_limit,
        ));
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
        .route("/metrics", get(metrics))
        .merge(api)
        .layer(PropagateRequestIdLayer::new(request_id_header.clone()))
        .layer(SetRequestIdLayer::new(request_id_header, MakeRequestUuid))
        .layer(TraceLayer::new_for_http())
        .layer(RequestBodyLimitLayer::new(1_048_576))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(10),
        ))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
                .allow_headers([
                    header::CONTENT_TYPE,
                    header::AUTHORIZATION,
                    client_id_header,
                ]),
        )
        .with_state(state)
}

async fn enforce_rate_limit(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    if authorized(request.headers(), &state) {
        return next.run(request).await;
    }
    let key = request
        .headers()
        .get("x-affinity-client-id")
        .and_then(|value| value.to_str().ok())
        .filter(|value| (16..=100).contains(&value.len()))
        .unwrap_or("anonymous");
    let decision = state.rate_limiter.check(key).await;
    if decision.allowed {
        return next.run(request).await;
    }
    let request_id = Uuid::new_v4();
    let mut response = (
        StatusCode::TOO_MANY_REQUESTS,
        Json(json!({"error":{
            "code":"rate_limit_exceeded",
            "message":"Too many requests. Retry after the indicated delay.",
            "request_id":request_id
        }})),
    )
        .into_response();
    response
        .headers_mut()
        .insert(header::RETRY_AFTER, decision.retry_after_seconds.into());
    response
}

async fn health() -> Json<Value> {
    Json(json!({"status":"ok","service":"affinity-api","version":env!("CARGO_PKG_VERSION")}))
}

async fn ready(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    state.repository.health().await?;
    Ok(Json(json!({
        "status":"ready",
        "dependencies":{"repository":state.repository.kind()},
        "version":env!("CARGO_PKG_VERSION")
    })))
}

async fn overview(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let statistics = state.repository.overview().await?;
    let active_model = state.repository.active_serving_model().await?;
    Ok(Json(json!({
        "total_users":statistics.total_users,
        "total_content_items":statistics.total_content_items,
        "total_events":statistics.total_events,
        "total_experiments":statistics.total_experiments,
        "recommendation_requests":state.recommendation_requests.load(Ordering::Relaxed),
        "storage":state.repository.kind(),
        "uptime_seconds":state.started_at.elapsed().as_secs(),
        "active_model":active_model.as_ref().map(|model|model.model_id.as_str()).unwrap_or("affinity-ranker-v1")
    })))
}

async fn metrics(State(state): State<AppState>) -> Result<String, ApiError> {
    let statistics = state.repository.overview().await?;
    Ok(format!(
        "# HELP affinity_events_total Accepted unique events\n# TYPE affinity_events_total gauge\naffinity_events_total {}\n\
         # HELP affinity_users_total Users with observed behavior\n# TYPE affinity_users_total gauge\naffinity_users_total {}\n\
         # HELP affinity_recommendation_requests_total Recommendation requests served\n# TYPE affinity_recommendation_requests_total counter\naffinity_recommendation_requests_total {}\n",
        statistics.total_events,
        statistics.total_users,
        state.recommendation_requests.load(Ordering::Relaxed)
    ))
}

#[derive(Debug, Serialize)]
struct IngestResult {
    event_id: Uuid,
    status: &'static str,
}

async fn ingest_event(
    State(state): State<AppState>,
    Json(event): Json<Event>,
) -> Result<(StatusCode, Json<IngestResult>), ApiError> {
    event.validate(Utc::now()).map_err(ApiError::Validation)?;
    let status = state
        .repository
        .ingest(std::slice::from_ref(&event))
        .await?[0];
    let http_status = match status {
        IngestStatus::Accepted => StatusCode::ACCEPTED,
        IngestStatus::Duplicate => StatusCode::OK,
    };
    Ok((
        http_status,
        Json(IngestResult {
            event_id: event.event_id,
            status: status.as_str(),
        }),
    ))
}

#[derive(Debug, Deserialize)]
struct EventBatch {
    events: Vec<Event>,
}

#[derive(Debug, Serialize)]
struct BatchError {
    index: usize,
    code: &'static str,
    message: String,
}

#[derive(Debug, Serialize)]
struct BatchResult {
    accepted: usize,
    duplicates: usize,
    rejected: usize,
    errors: Vec<BatchError>,
}

async fn ingest_batch(
    State(state): State<AppState>,
    Json(batch): Json<EventBatch>,
) -> Result<Json<BatchResult>, ApiError> {
    if batch.events.is_empty() || batch.events.len() > 500 {
        return Err(ApiError::Validation(
            "batch must contain between 1 and 500 events".into(),
        ));
    }
    let now = Utc::now();
    let mut valid = Vec::with_capacity(batch.events.len());
    let mut errors = Vec::new();
    for (index, event) in batch.events.into_iter().enumerate() {
        match event.validate(now) {
            Ok(()) => valid.push(event),
            Err(message) => errors.push(BatchError {
                index,
                code: "validation_error",
                message,
            }),
        }
    }
    let statuses = state.repository.ingest(&valid).await?;
    let accepted = statuses
        .iter()
        .filter(|status| **status == IngestStatus::Accepted)
        .count();
    Ok(Json(BatchResult {
        accepted,
        duplicates: statuses.len() - accepted,
        rejected: errors.len(),
        errors,
    }))
}

#[derive(Debug, Deserialize)]
struct PageQuery {
    #[serde(default = "default_page_limit")]
    limit: usize,
    #[serde(default)]
    cursor: Option<usize>,
}

const fn default_page_limit() -> usize {
    50
}

fn validated_page(query: PageQuery) -> Result<(usize, usize), ApiError> {
    if !(1..=100).contains(&query.limit) {
        return Err(ApiError::Validation(
            "limit must be between 1 and 100".into(),
        ));
    }
    Ok((query.limit, query.cursor.unwrap_or(0)))
}

async fn user_data(
    state: &AppState,
    user_id: &str,
) -> Result<(Vec<Event>, Vec<ContentItem>), ApiError> {
    let (events, content) = tokio::try_join!(
        state.repository.user_events(user_id, 1_000, 0),
        state.repository.all_content()
    )?;
    Ok((events, content))
}

async fn get_user(
    State(state): State<AppState>,
    Path(user_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let (events, content) = user_data(&state, &user_id).await?;
    let profile = interests(&events, &content, Utc::now());
    Ok(Json(json!({
        "user_id":user_id,
        "representation":if events.len()<5{"cold_start"}else{"behavioral"},
        "observed_event_count":events.len(),
        "profile_version":1,
        "long_term_interest_count":profile.long_term.len(),
        "recent_interest_count":profile.recent.len(),
        "inferred_sensitive_attributes":[]
    })))
}

async fn get_interests(
    State(state): State<AppState>,
    Path(user_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let (events, content) = user_data(&state, &user_id).await?;
    let profile = interests(&events, &content, Utc::now());
    Ok(Json(
        json!({"user_id":user_id,"source":"observed_behavior","long_term":profile.long_term,"recent":profile.recent,"score_type":"recency_weighted_affinity"}),
    ))
}

async fn get_history(
    State(state): State<AppState>,
    Path(user_id): Path<String>,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    let (limit, offset) = validated_page(query)?;
    let items = state
        .repository
        .user_events(&user_id, limit + 1, offset)
        .await?;
    let has_more = items.len() > limit;
    let items: Vec<_> = items.into_iter().take(limit).collect();
    Ok(Json(
        json!({"user_id":user_id,"items":items,"next_cursor":has_more.then_some(offset+limit)}),
    ))
}

#[derive(Debug, Deserialize)]
struct RecommendationQuery {
    #[serde(default = "default_recommendation_limit")]
    limit: usize,
    #[serde(default = "default_relevance_weight")]
    relevance_weight: f32,
    #[serde(default = "default_recency_weight")]
    recency_weight: f32,
    #[serde(default = "default_quality_weight")]
    quality_weight: f32,
    #[serde(default = "default_diversity_weight")]
    diversity_weight: f32,
}

const fn default_recommendation_limit() -> usize {
    10
}
const fn default_relevance_weight() -> f32 {
    0.55
}
const fn default_recency_weight() -> f32 {
    0.20
}
const fn default_quality_weight() -> f32 {
    0.25
}
const fn default_diversity_weight() -> f32 {
    0.20
}

async fn get_recommendations(
    State(state): State<AppState>,
    Path(user_id): Path<String>,
    Query(query): Query<RecommendationQuery>,
) -> Result<Json<Value>, ApiError> {
    if !(1..=100).contains(&query.limit) {
        return Err(ApiError::Validation(
            "limit must be between 1 and 100".into(),
        ));
    }
    let options = RankingOptions {
        relevance_weight: query.relevance_weight,
        recency_weight: query.recency_weight,
        quality_weight: query.quality_weight,
        diversity_weight: query.diversity_weight,
    }
    .validate()
    .map_err(ApiError::Validation)?;
    let (events, content) = user_data(&state, &user_id).await?;
    let active_model = state.repository.active_serving_model().await?;
    let result = recommend_with_model(
        &events,
        &content,
        options,
        query.limit,
        Utc::now(),
        active_model.as_ref(),
    );
    state
        .recommendation_requests
        .fetch_add(1, Ordering::Relaxed);
    Ok(Json(
        json!({"user_id":user_id,"model_version":active_model.as_ref().map(|model|model.model_id.as_str()).unwrap_or("affinity-ranker-v1"),"fallback_used":result.fallback_used,"items":result.items}),
    ))
}

async fn get_content(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    Ok(Json(json!({"items":state.repository.all_content().await?})))
}

async fn upsert_content(
    State(state): State<AppState>,
    Path(content_id): Path<String>,
    headers: HeaderMap,
    Json(mut item): Json<ContentItem>,
) -> Result<Json<Value>, ApiError> {
    if !authorized(&headers, &state) {
        return Err(ApiError::Unauthorized);
    }
    if item.content_id != content_id {
        return Err(ApiError::Validation(
            "path content_id must match the request body".into(),
        ));
    }
    item.content_id = content_id;
    item.validate().map_err(ApiError::Validation)?;
    state.repository.upsert_content(&item).await?;
    Ok(Json(json!({"status":"active","item":item})))
}

async fn archive_content(
    State(state): State<AppState>,
    Path(content_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    if !authorized(&headers, &state) {
        return Err(ApiError::Unauthorized);
    }
    if !state.repository.archive_content(&content_id).await? {
        return Err(ApiError::NotFound("content".into()));
    }
    Ok(Json(json!({"status":"archived","content_id":content_id})))
}

async fn get_similar(
    State(state): State<AppState>,
    Path(content_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let content = state.repository.all_content().await?;
    let source = content
        .iter()
        .find(|item| item.content_id == content_id)
        .ok_or_else(|| ApiError::NotFound("content".into()))?;
    let mut items: Vec<_> = content
        .iter()
        .filter(|item| item.content_id != content_id)
        .map(|item| {
            let category_match = f32::from(item.category == source.category);
            let score = 0.75 * category_match + 0.25 * item.quality_score;
            json!({"content":item,"score":score,"score_type":"content_similarity_heuristic"})
        })
        .collect();
    items.sort_by(|left, right| {
        right["score"]
            .as_f64()
            .unwrap_or_default()
            .total_cmp(&left["score"].as_f64().unwrap_or_default())
    });
    items.truncate(10);
    Ok(Json(
        json!({"content_id":content_id,"model_version":"content-similarity-v1","items":items}),
    ))
}

async fn get_models(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    Ok(Json(json!({"items":state.repository.models().await?})))
}

async fn get_active_model(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let model = state.repository.active_serving_model().await?;
    Ok(Json(json!({
        "active":model.is_some(),
        "model":model,
        "fallback_model":"affinity-ranker-v1"
    })))
}

async fn activate_model(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(model): Json<ServingModel>,
) -> Result<Json<Value>, ApiError> {
    if !authorized(&headers, &state) {
        return Err(ApiError::Unauthorized);
    }
    model.validate().map_err(ApiError::Validation)?;
    state.repository.activate_serving_model(&model).await?;
    Ok(Json(json!({
        "status":"active",
        "model_id":model.model_id,
        "training_event_count":model.training_event_count
    })))
}

#[derive(Debug, Deserialize)]
struct ServingTrainingRequest {
    #[serde(default = "default_training_event_limit")]
    event_limit: usize,
}

const fn default_training_event_limit() -> usize {
    100_000
}

async fn train_active_model(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ServingTrainingRequest>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    if !authorized(&headers, &state) {
        return Err(ApiError::Unauthorized);
    }
    if !(1..=1_000_000).contains(&request.event_limit) {
        return Err(ApiError::Validation(
            "event_limit must be between 1 and 1000000".into(),
        ));
    }
    let (events, content) = tokio::try_join!(
        state.repository.all_events(request.event_limit),
        state.repository.all_content()
    )?;
    let model = train_serving_model(&events, &content, Utc::now());
    model.validate().map_err(ApiError::Validation)?;
    state.repository.activate_serving_model(&model).await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({"status":"active","model":model})),
    ))
}

#[derive(Debug, Deserialize)]
struct SyncImport {
    schema_version: u16,
    events: Vec<Event>,
}

async fn export_user_events(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    if !authorized(&headers, &state) {
        return Err(ApiError::Unauthorized);
    }
    let events = state.repository.user_events(&user_id, 100_000, 0).await?;
    Ok(Json(json!({
        "schema_version":1,
        "exported_at":Utc::now(),
        "user_id":user_id,
        "event_count":events.len(),
        "events":events
    })))
}

async fn import_user_events(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(import): Json<SyncImport>,
) -> Result<Json<Value>, ApiError> {
    if !authorized(&headers, &state) {
        return Err(ApiError::Unauthorized);
    }
    if import.schema_version != 1 || import.events.len() > 100_000 {
        return Err(ApiError::Validation(
            "sync payload must use schema_version=1 and contain at most 100000 events".into(),
        ));
    }
    let now = Utc::now();
    for event in &import.events {
        event.validate(now).map_err(ApiError::Validation)?;
    }
    let statuses = state.repository.ingest(&import.events).await?;
    let accepted = statuses
        .iter()
        .filter(|status| **status == IngestStatus::Accepted)
        .count();
    Ok(Json(json!({
        "status":"complete",
        "accepted":accepted,
        "duplicates":statuses.len()-accepted,
        "total":statuses.len()
    })))
}

async fn get_model_metrics(
    State(state): State<AppState>,
    Path(model_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let model = state
        .repository
        .model(&model_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("model".into()))?;
    Ok(Json(
        json!({"model_id":model.id,"measured":model.metrics.is_some(),"metrics":model.metrics,"trained_at":model.trained_at,"dataset_version":model.dataset_version}),
    ))
}

fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    let mut difference = left.len() ^ right.len();
    for index in 0..left.len().max(right.len()) {
        difference |= usize::from(
            left.get(index).copied().unwrap_or_default()
                ^ right.get(index).copied().unwrap_or_default(),
        );
    }
    difference == 0
}

fn authorized(headers: &HeaderMap, state: &AppState) -> bool {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .is_some_and(|token| constant_time_equal(token.as_bytes(), state.admin_token.as_bytes()))
}

#[derive(Debug, Deserialize)]
struct TrainingRequest {
    model_id: String,
}

async fn start_training(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<TrainingRequest>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    if !authorized(&headers, &state) {
        return Err(ApiError::Unauthorized);
    }
    state
        .repository
        .model(&request.model_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("model".into()))?;
    let job_id = state
        .repository
        .create_training_job(&request.model_id)
        .await?;
    Ok((
        StatusCode::ACCEPTED,
        Json(json!({"job_id":job_id,"model_id":request.model_id,"status":"queued"})),
    ))
}

async fn get_experiments(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    Ok(Json(json!({"items":state.repository.experiments().await?})))
}

#[derive(Debug, Deserialize)]
struct CreateExperimentRequest {
    name: String,
    control: String,
    treatment: String,
    allocation: f64,
}

async fn create_experiment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateExperimentRequest>,
) -> Result<(StatusCode, Json<Experiment>), ApiError> {
    if !authorized(&headers, &state) {
        return Err(ApiError::Unauthorized);
    }
    if request.name.trim().is_empty() || request.name.len() > 120 {
        return Err(ApiError::Validation(
            "name must contain between 1 and 120 characters".into(),
        ));
    }
    if !(0.0..=1.0).contains(&request.allocation) {
        return Err(ApiError::Validation(
            "allocation must be between 0 and 1".into(),
        ));
    }
    let experiment = state
        .repository
        .create_experiment(NewExperiment {
            name: request.name,
            control: request.control,
            treatment: request.treatment,
            allocation: request.allocation,
        })
        .await?;
    Ok((StatusCode::CREATED, Json(experiment)))
}

fn stable_assignment(experiment_id: Uuid, user_id: &str) -> f64 {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in experiment_id
        .as_bytes()
        .iter()
        .copied()
        .chain(user_id.as_bytes().iter().copied())
    {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash as f64 / u64::MAX as f64
}

async fn get_assignment(
    State(state): State<AppState>,
    Path((experiment_id, user_id)): Path<(Uuid, String)>,
) -> Result<Json<Value>, ApiError> {
    let experiment = state
        .repository
        .experiment(experiment_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("experiment".into()))?;
    let bucket = stable_assignment(experiment_id, &user_id);
    let (variant, model) = if bucket < experiment.allocation {
        ("treatment", experiment.treatment.as_str())
    } else {
        ("control", experiment.control.as_str())
    };
    Ok(Json(
        json!({"experiment_id":experiment_id,"user_id":user_id,"variant":variant,"model":model,"bucket":bucket}),
    ))
}

async fn delete_user(
    State(state): State<AppState>,
    Path(user_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    if !authorized(&headers, &state) {
        return Err(ApiError::Unauthorized);
    }
    let deleted_events = state.repository.delete_user(&user_id).await?;
    Ok(Json(
        json!({"user_id":user_id,"deleted_events":deleted_events,"status":"deleted"}),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use std::collections::HashMap;
    use tower::ServiceExt;

    fn event(id: Uuid, content_id: &str, event_type: EventType) -> Event {
        Event {
            event_id: id,
            user_id: "usr_test".into(),
            content_id: Some(content_id.into()),
            event_type,
            timestamp: Utc::now(),
            session_id: "session_1".into(),
            context: HashMap::new(),
            surface: "test".into(),
            schema_version: 1,
        }
    }

    #[tokio::test]
    async fn duplicate_event_is_idempotent() {
        let app = app(AppState::test("secret"));
        let event = event(Uuid::new_v4(), "item_101", EventType::Click);
        for expected in [StatusCode::ACCEPTED, StatusCode::OK] {
            let response = app
                .clone()
                .oneshot(
                    Request::post("/v1/events")
                        .header("content-type", "application/json")
                        .body(Body::from(serde_json::to_vec(&event).unwrap()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
        }
    }

    #[tokio::test]
    async fn ingested_behavior_changes_recommendations() {
        let app = app(AppState::test("secret"));
        let event = event(Uuid::new_v4(), "item_101", EventType::Save);
        app.clone()
            .oneshot(
                Request::post("/v1/events")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_vec(&event).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let response = app
            .oneshot(
                Request::get("/v1/recommendations/usr_test")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert!(!value["fallback_used"].as_bool().unwrap());
        assert!(value["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|item| item["content_id"] != "item_101"));
    }

    #[tokio::test]
    async fn admin_endpoint_requires_bearer_token() {
        let response = app(AppState::test("secret"))
            .oneshot(
                Request::post("/v1/models/train")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"model_id":"affinity-ranker-v1"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn content_lifecycle_is_authenticated_and_immediately_queryable() {
        let app = app(AppState::test("secret"));
        let item = ContentItem {
            content_id: "item_runtime".into(),
            title: "Runtime-managed content".into(),
            category: "operations".into(),
            description: "A content item managed without redeploying the API.".into(),
            quality_score: 0.91,
            published_at: Utc::now(),
            metadata: json!({"source":"test"}),
        };
        let unauthorized = app
            .clone()
            .oneshot(
                Request::put("/v1/content/item_runtime")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_vec(&item).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

        let upserted = app
            .clone()
            .oneshot(
                Request::put("/v1/content/item_runtime")
                    .header("authorization", "Bearer secret")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_vec(&item).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(upserted.status(), StatusCode::OK);

        let listed = app
            .clone()
            .oneshot(Request::get("/v1/content").body(Body::empty()).unwrap())
            .await
            .unwrap();
        let body = listed.into_body().collect().await.unwrap().to_bytes();
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert!(value["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["content_id"] == "item_runtime"));

        let archived = app
            .oneshot(
                Request::delete("/v1/content/item_runtime")
                    .header("authorization", "Bearer secret")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(archived.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn trained_serving_model_is_activated_and_used() {
        let app = app(AppState::test("secret"));
        let observed = event(Uuid::new_v4(), "item_101", EventType::Save);
        app.clone()
            .oneshot(
                Request::post("/v1/events")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_vec(&observed).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        let response = app
            .clone()
            .oneshot(
                Request::post("/v1/models/train-serving")
                    .header("authorization", "Bearer secret")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"event_limit":1000}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);

        let response = app
            .oneshot(
                Request::get("/v1/recommendations/usr_test")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["model_version"], "behavioral-prior-v1");
        assert_eq!(value["items"][0]["model_version"], "behavioral-prior-v1");
    }

    #[tokio::test]
    async fn sync_export_and_import_are_authenticated_and_idempotent() {
        let source = app(AppState::test("secret"));
        let observed = event(Uuid::new_v4(), "item_201", EventType::Click);
        source
            .clone()
            .oneshot(
                Request::post("/v1/events")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_vec(&observed).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let export = source
            .oneshot(
                Request::get("/v1/sync/export/usr_test")
                    .header("authorization", "Bearer secret")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let export_body = export.into_body().collect().await.unwrap().to_bytes();
        let mut payload: Value = serde_json::from_slice(&export_body).unwrap();
        payload.as_object_mut().unwrap().remove("exported_at");
        payload.as_object_mut().unwrap().remove("event_count");
        payload.as_object_mut().unwrap().remove("user_id");

        let destination = app(AppState::test("secret"));
        for expected_accepted in [1, 0] {
            let response = destination
                .clone()
                .oneshot(
                    Request::post("/v1/sync/import")
                        .header("authorization", "Bearer secret")
                        .header("content-type", "application/json")
                        .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            let body = response.into_body().collect().await.unwrap().to_bytes();
            let value: Value = serde_json::from_slice(&body).unwrap();
            assert_eq!(value["accepted"], expected_accepted);
        }
    }

    #[test]
    fn experiment_assignment_is_deterministic() {
        let experiment_id = Uuid::new_v4();
        assert_eq!(
            stable_assignment(experiment_id, "user-42"),
            stable_assignment(experiment_id, "user-42")
        );
    }

    #[test]
    fn token_comparison_handles_different_lengths() {
        assert!(constant_time_equal(b"secret", b"secret"));
        assert!(!constant_time_equal(b"secret", b"secret-long"));
        assert!(!constant_time_equal(b"secret", b"public"));
    }
}
