use affinity_api::{Event, EventType, PostgresRepository, Repository};
use chrono::Utc;
use std::collections::HashMap;
use uuid::Uuid;

#[tokio::test]
async fn postgres_repository_is_durable_and_idempotent() {
    let Ok(database_url) = std::env::var("TEST_DATABASE_URL") else {
        eprintln!("TEST_DATABASE_URL is not set; skipping PostgreSQL integration test");
        return;
    };
    let repository = PostgresRepository::connect(&database_url)
        .await
        .expect("connect and migrate test database");
    repository.health().await.expect("repository is healthy");

    let user_id = format!("integration-{}", Uuid::new_v4());
    let event = Event {
        event_id: Uuid::new_v4(),
        user_id: user_id.clone(),
        content_id: Some("item_101".into()),
        event_type: EventType::Save,
        timestamp: Utc::now(),
        session_id: "integration-session".into(),
        context: HashMap::new(),
        surface: "integration-test".into(),
        schema_version: 1,
    };

    let first = repository
        .ingest(std::slice::from_ref(&event))
        .await
        .unwrap();
    let second = repository
        .ingest(std::slice::from_ref(&event))
        .await
        .unwrap();
    assert_eq!(first[0].as_str(), "accepted");
    assert_eq!(second[0].as_str(), "duplicate");

    let stored = repository.user_events(&user_id, 10, 0).await.unwrap();
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].event_id, event.event_id);
    assert!(repository.overview().await.unwrap().total_content_items >= 12);

    assert_eq!(repository.delete_user(&user_id).await.unwrap(), 1);
    assert!(repository
        .user_events(&user_id, 10, 0)
        .await
        .unwrap()
        .is_empty());
}
