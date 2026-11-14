use crate::domain::{
    ContentItem, Event, EventType, Experiment, IngestStatus, ModelVersion, OverviewStats,
};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use std::{collections::HashSet, str::FromStr, sync::Arc, time::Duration};
use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum RepositoryError {
    #[error("database operation failed: {0}")]
    Database(#[from] sqlx::Error),
    #[error("stored data is invalid: {0}")]
    InvalidData(String),
}

#[derive(Debug, Clone)]
pub struct NewExperiment {
    pub name: String,
    pub control: String,
    pub treatment: String,
    pub allocation: f64,
}

#[async_trait]
pub trait Repository: Send + Sync {
    fn kind(&self) -> &'static str;
    async fn health(&self) -> Result<(), RepositoryError>;
    async fn ingest(&self, events: &[Event]) -> Result<Vec<IngestStatus>, RepositoryError>;
    async fn user_events(
        &self,
        user_id: &str,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<Event>, RepositoryError>;
    async fn all_content(&self) -> Result<Vec<ContentItem>, RepositoryError>;
    async fn overview(&self) -> Result<OverviewStats, RepositoryError>;
    async fn models(&self) -> Result<Vec<ModelVersion>, RepositoryError>;
    async fn model(&self, id: &str) -> Result<Option<ModelVersion>, RepositoryError>;
    async fn experiments(&self) -> Result<Vec<Experiment>, RepositoryError>;
    async fn experiment(&self, id: Uuid) -> Result<Option<Experiment>, RepositoryError>;
    async fn create_experiment(
        &self,
        experiment: NewExperiment,
    ) -> Result<Experiment, RepositoryError>;
    async fn create_training_job(&self, model_id: &str) -> Result<Uuid, RepositoryError>;
    async fn delete_user(&self, user_id: &str) -> Result<u64, RepositoryError>;
}

#[derive(Clone)]
pub struct PostgresRepository {
    pool: PgPool,
}

impl PostgresRepository {
    pub async fn connect(database_url: &str) -> Result<Self, RepositoryError> {
        let pool = PgPoolOptions::new()
            .max_connections(20)
            .min_connections(1)
            .acquire_timeout(Duration::from_secs(5))
            .connect(database_url)
            .await?;
        sqlx::migrate!("../../infrastructure/migrations")
            .run(&pool)
            .await
            .map_err(sqlx::Error::from)?;
        Ok(Self { pool })
    }

    fn event_from_row(row: &sqlx::postgres::PgRow) -> Result<Event, RepositoryError> {
        let context: Value = row.try_get("context")?;
        Ok(Event {
            event_id: row.try_get("event_id")?,
            user_id: row.try_get("user_id")?,
            content_id: row.try_get("content_id")?,
            event_type: EventType::from_str(row.try_get::<&str, _>("event_type")?)
                .map_err(RepositoryError::InvalidData)?,
            timestamp: row.try_get("occurred_at")?,
            session_id: row.try_get("session_id")?,
            context: serde_json::from_value(context)
                .map_err(|error| RepositoryError::InvalidData(error.to_string()))?,
            surface: row.try_get("surface")?,
            schema_version: u16::try_from(row.try_get::<i16, _>("schema_version")?)
                .map_err(|error| RepositoryError::InvalidData(error.to_string()))?,
        })
    }

    fn content_from_row(row: &sqlx::postgres::PgRow) -> Result<ContentItem, RepositoryError> {
        Ok(ContentItem {
            content_id: row.try_get("content_id")?,
            title: row.try_get("title")?,
            category: row.try_get("category")?,
            description: row.try_get("description")?,
            quality_score: row.try_get("quality_score")?,
            published_at: row.try_get("published_at")?,
            metadata: row.try_get("metadata")?,
        })
    }

    fn model_from_row(row: &sqlx::postgres::PgRow) -> Result<ModelVersion, RepositoryError> {
        Ok(ModelVersion {
            id: row.try_get("id")?,
            architecture: row.try_get("architecture")?,
            dataset_version: row.try_get("dataset_version")?,
            parameters: row.try_get("parameters")?,
            metrics: row.try_get("metrics")?,
            artifact_uri: row.try_get("artifact_uri")?,
            trained_at: row.try_get("trained_at")?,
            status: row.try_get("status")?,
        })
    }

    fn experiment_from_row(row: &sqlx::postgres::PgRow) -> Result<Experiment, RepositoryError> {
        Ok(Experiment {
            id: row.try_get("id")?,
            name: row.try_get("name")?,
            control: row.try_get("control_model")?,
            treatment: row.try_get("treatment_model")?,
            allocation: row.try_get("treatment_allocation")?,
            status: row.try_get("status")?,
            created_at: row.try_get("created_at")?,
        })
    }
}

#[async_trait]
impl Repository for PostgresRepository {
    fn kind(&self) -> &'static str {
        "postgres"
    }

    async fn health(&self) -> Result<(), RepositoryError> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }

    async fn ingest(&self, events: &[Event]) -> Result<Vec<IngestStatus>, RepositoryError> {
        let mut transaction = self.pool.begin().await?;
        let mut statuses = Vec::with_capacity(events.len());
        for event in events {
            let context = serde_json::to_value(&event.context)
                .map_err(|error| RepositoryError::InvalidData(error.to_string()))?;
            let result = sqlx::query(
                "INSERT INTO events (event_id, user_id, content_id, event_type, occurred_at, session_id, context, surface, schema_version) \
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (event_id) DO NOTHING",
            )
            .bind(event.event_id)
            .bind(&event.user_id)
            .bind(&event.content_id)
            .bind(event.event_type.to_string())
            .bind(event.timestamp)
            .bind(&event.session_id)
            .bind(context)
            .bind(&event.surface)
            .bind(i16::try_from(event.schema_version).unwrap_or(1))
            .execute(&mut *transaction)
            .await?;
            statuses.push(if result.rows_affected() == 1 {
                IngestStatus::Accepted
            } else {
                IngestStatus::Duplicate
            });
        }
        transaction.commit().await?;
        Ok(statuses)
    }

    async fn user_events(
        &self,
        user_id: &str,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<Event>, RepositoryError> {
        let rows = sqlx::query(
            "SELECT event_id,user_id,content_id,event_type,occurred_at,session_id,context,surface,schema_version \
             FROM events WHERE user_id=$1 ORDER BY occurred_at DESC,event_id DESC LIMIT $2 OFFSET $3",
        )
        .bind(user_id)
        .bind(i64::try_from(limit).unwrap_or(100))
        .bind(i64::try_from(offset).unwrap_or(0))
        .fetch_all(&self.pool)
        .await?;
        rows.iter().map(Self::event_from_row).collect()
    }

    async fn all_content(&self) -> Result<Vec<ContentItem>, RepositoryError> {
        let rows = sqlx::query(
            "SELECT content_id,title,category,description,quality_score,published_at,metadata FROM content_items ORDER BY content_id",
        )
        .fetch_all(&self.pool)
        .await?;
        rows.iter().map(Self::content_from_row).collect()
    }

    async fn overview(&self) -> Result<OverviewStats, RepositoryError> {
        let row = sqlx::query(
            "SELECT (SELECT COUNT(DISTINCT user_id) FROM events) AS users, \
                    (SELECT COUNT(*) FROM content_items) AS content, \
                    (SELECT COUNT(*) FROM events) AS events, \
                    (SELECT COUNT(*) FROM experiments) AS experiments",
        )
        .fetch_one(&self.pool)
        .await?;
        Ok(OverviewStats {
            total_users: row.try_get("users")?,
            total_content_items: row.try_get("content")?,
            total_events: row.try_get("events")?,
            total_experiments: row.try_get("experiments")?,
        })
    }

    async fn models(&self) -> Result<Vec<ModelVersion>, RepositoryError> {
        let rows = sqlx::query(
            "SELECT id,architecture,dataset_version,parameters,metrics,artifact_uri,trained_at,status FROM model_versions ORDER BY id",
        )
        .fetch_all(&self.pool)
        .await?;
        rows.iter().map(Self::model_from_row).collect()
    }

    async fn model(&self, id: &str) -> Result<Option<ModelVersion>, RepositoryError> {
        let row = sqlx::query(
            "SELECT id,architecture,dataset_version,parameters,metrics,artifact_uri,trained_at,status FROM model_versions WHERE id=$1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        row.as_ref().map(Self::model_from_row).transpose()
    }

    async fn experiments(&self) -> Result<Vec<Experiment>, RepositoryError> {
        let rows = sqlx::query(
            "SELECT id,name,control_model,treatment_model,treatment_allocation,status,created_at FROM experiments ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await?;
        rows.iter().map(Self::experiment_from_row).collect()
    }

    async fn experiment(&self, id: Uuid) -> Result<Option<Experiment>, RepositoryError> {
        let row = sqlx::query(
            "SELECT id,name,control_model,treatment_model,treatment_allocation,status,created_at FROM experiments WHERE id=$1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        row.as_ref().map(Self::experiment_from_row).transpose()
    }

    async fn create_experiment(
        &self,
        experiment: NewExperiment,
    ) -> Result<Experiment, RepositoryError> {
        let id = Uuid::new_v4();
        let row = sqlx::query(
            "INSERT INTO experiments (id,name,control_model,treatment_model,treatment_allocation,status) \
             VALUES ($1,$2,$3,$4,$5,'draft') \
             RETURNING id,name,control_model,treatment_model,treatment_allocation,status,created_at",
        )
        .bind(id)
        .bind(experiment.name)
        .bind(experiment.control)
        .bind(experiment.treatment)
        .bind(experiment.allocation)
        .fetch_one(&self.pool)
        .await?;
        Self::experiment_from_row(&row)
    }

    async fn create_training_job(&self, model_id: &str) -> Result<Uuid, RepositoryError> {
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO training_jobs (id,model_id,status) VALUES ($1,$2,'queued')")
            .bind(id)
            .bind(model_id)
            .execute(&self.pool)
            .await?;
        Ok(id)
    }

    async fn delete_user(&self, user_id: &str) -> Result<u64, RepositoryError> {
        let result = sqlx::query("DELETE FROM events WHERE user_id=$1")
            .bind(user_id)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected())
    }
}

#[derive(Default)]
struct MemoryStore {
    event_ids: HashSet<Uuid>,
    events: Vec<Event>,
    content: Vec<ContentItem>,
    experiments: Vec<Experiment>,
    models: Vec<ModelVersion>,
    training_jobs: Vec<(Uuid, String)>,
}

#[derive(Clone)]
pub struct MemoryRepository {
    store: Arc<RwLock<MemoryStore>>,
}

impl MemoryRepository {
    pub fn new(content: Vec<ContentItem>, models: Vec<ModelVersion>) -> Self {
        Self {
            store: Arc::new(RwLock::new(MemoryStore {
                content,
                models,
                ..MemoryStore::default()
            })),
        }
    }

    pub fn fixture() -> Self {
        let now = Utc::now();
        let content = [
            (
                "item_101",
                "Practical retrieval systems",
                "applied_ml",
                0.92,
            ),
            (
                "item_201",
                "Event streams without drama",
                "data_systems",
                0.88,
            ),
            (
                "item_301",
                "Measuring representation drift",
                "ml_operations",
                0.91,
            ),
            (
                "item_401",
                "Model-debugging interface patterns",
                "design_tools",
                0.87,
            ),
        ]
        .into_iter()
        .enumerate()
        .map(|(index, (id, title, category, quality))| ContentItem {
            content_id: id.into(),
            title: title.into(),
            category: category.into(),
            description: format!("Fixture content for {category}."),
            quality_score: quality,
            published_at: now - chrono::Duration::days(i64::try_from(index).unwrap_or(0)),
            metadata: Value::Object(Default::default()),
        })
        .collect();
        let models = vec![ModelVersion {
            id: "affinity-ranker-v1".into(),
            architecture: "behavioral_policy".into(),
            dataset_version: "runtime-events".into(),
            parameters: serde_json::json!({}),
            metrics: None,
            artifact_uri: None,
            trained_at: None,
            status: "ready".into(),
        }];
        Self::new(content, models)
    }
}

#[async_trait]
impl Repository for MemoryRepository {
    fn kind(&self) -> &'static str {
        "memory_test_adapter"
    }

    async fn health(&self) -> Result<(), RepositoryError> {
        Ok(())
    }

    async fn ingest(&self, events: &[Event]) -> Result<Vec<IngestStatus>, RepositoryError> {
        let mut store = self.store.write().await;
        let mut statuses = Vec::with_capacity(events.len());
        for event in events {
            if store.event_ids.insert(event.event_id) {
                store.events.push(event.clone());
                statuses.push(IngestStatus::Accepted);
            } else {
                statuses.push(IngestStatus::Duplicate);
            }
        }
        Ok(statuses)
    }

    async fn user_events(
        &self,
        user_id: &str,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<Event>, RepositoryError> {
        let mut events: Vec<_> = self
            .store
            .read()
            .await
            .events
            .iter()
            .filter(|event| event.user_id == user_id)
            .cloned()
            .collect();
        events.sort_by_key(|event| std::cmp::Reverse((event.timestamp, event.event_id)));
        Ok(events.into_iter().skip(offset).take(limit).collect())
    }

    async fn all_content(&self) -> Result<Vec<ContentItem>, RepositoryError> {
        Ok(self.store.read().await.content.clone())
    }

    async fn overview(&self) -> Result<OverviewStats, RepositoryError> {
        let store = self.store.read().await;
        let users: HashSet<_> = store
            .events
            .iter()
            .map(|event| event.user_id.as_str())
            .collect();
        Ok(OverviewStats {
            total_users: i64::try_from(users.len()).unwrap_or(i64::MAX),
            total_content_items: i64::try_from(store.content.len()).unwrap_or(i64::MAX),
            total_events: i64::try_from(store.events.len()).unwrap_or(i64::MAX),
            total_experiments: i64::try_from(store.experiments.len()).unwrap_or(i64::MAX),
        })
    }

    async fn models(&self) -> Result<Vec<ModelVersion>, RepositoryError> {
        Ok(self.store.read().await.models.clone())
    }

    async fn model(&self, id: &str) -> Result<Option<ModelVersion>, RepositoryError> {
        Ok(self
            .store
            .read()
            .await
            .models
            .iter()
            .find(|model| model.id == id)
            .cloned())
    }

    async fn experiments(&self) -> Result<Vec<Experiment>, RepositoryError> {
        Ok(self.store.read().await.experiments.clone())
    }

    async fn experiment(&self, id: Uuid) -> Result<Option<Experiment>, RepositoryError> {
        Ok(self
            .store
            .read()
            .await
            .experiments
            .iter()
            .find(|experiment| experiment.id == id)
            .cloned())
    }

    async fn create_experiment(&self, input: NewExperiment) -> Result<Experiment, RepositoryError> {
        let experiment = Experiment {
            id: Uuid::new_v4(),
            name: input.name,
            control: input.control,
            treatment: input.treatment,
            allocation: input.allocation,
            status: "draft".into(),
            created_at: Utc::now(),
        };
        self.store
            .write()
            .await
            .experiments
            .push(experiment.clone());
        Ok(experiment)
    }

    async fn create_training_job(&self, model_id: &str) -> Result<Uuid, RepositoryError> {
        let id = Uuid::new_v4();
        self.store
            .write()
            .await
            .training_jobs
            .push((id, model_id.into()));
        Ok(id)
    }

    async fn delete_user(&self, user_id: &str) -> Result<u64, RepositoryError> {
        let mut store = self.store.write().await;
        let before = store.events.len();
        store.events.retain(|event| event.user_id != user_id);
        store.event_ids = store.events.iter().map(|event| event.event_id).collect();
        Ok(u64::try_from(before - store.events.len()).unwrap_or(u64::MAX))
    }
}

pub fn arc(repository: impl Repository + 'static) -> Arc<dyn Repository> {
    Arc::new(repository)
}

#[allow(dead_code)]
fn _assert_datetime_is_send(_: DateTime<Utc>) {}
