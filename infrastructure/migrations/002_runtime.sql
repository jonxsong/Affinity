CREATE TABLE IF NOT EXISTS content_items (
  content_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  quality_score REAL NOT NULL CHECK (quality_score BETWEEN 0 AND 1),
  published_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_items_category_idx ON content_items (category);
CREATE INDEX IF NOT EXISTS content_items_published_idx ON content_items (published_at DESC);

CREATE TABLE IF NOT EXISTS training_jobs (
  id UUID PRIMARY KEY,
  model_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_detail TEXT
);

INSERT INTO content_items (content_id, title, category, description, quality_score, published_at, metadata)
VALUES
  ('item_101', 'Practical retrieval systems for recommender teams', 'applied_ml', 'A field guide to candidate generation, retrieval evaluation, and operating vector indexes.', 0.92, now() - interval '2 days', '{"author":"Affinity Research","tags":["retrieval","vector-search"]}'),
  ('item_102', 'Building two-tower models that survive production', 'applied_ml', 'Training objectives, hard negatives, embedding export, and online/offline consistency.', 0.90, now() - interval '5 days', '{"author":"Affinity Research","tags":["pytorch","two-tower"]}'),
  ('item_201', 'Event streams without operational drama', 'data_systems', 'Idempotency, replay, consumer recovery, and practical event contracts.', 0.88, now() - interval '1 day', '{"author":"Systems Weekly","tags":["streaming","reliability"]}'),
  ('item_202', 'Postgres patterns for behavioral products', 'data_systems', 'Indexes, retention, and query patterns for high-volume product events.', 0.84, now() - interval '8 days', '{"author":"Systems Weekly","tags":["postgres","events"]}'),
  ('item_301', 'Measuring representation drift in production', 'ml_operations', 'Monitor embedding populations without confusing projection movement for semantic drift.', 0.91, now() - interval '3 days', '{"author":"ML Operations","tags":["monitoring","embeddings"]}'),
  ('item_302', 'Reproducible offline evaluation', 'ml_operations', 'Temporal holdouts, candidate consistency, uncertainty, and artifact lineage.', 0.94, now() - interval '12 days', '{"author":"ML Operations","tags":["evaluation","mlflow"]}'),
  ('item_401', 'Designing useful model-debugging interfaces', 'design_tools', 'Turn ranking components and behavioral evidence into an effective developer workflow.', 0.87, now() - interval '4 days', '{"author":"Interface Systems","tags":["debugging","ux"]}'),
  ('item_402', 'Visualization patterns for embedding spaces', 'design_tools', 'Responsible projection labeling, cluster inspection, and comparison interactions.', 0.82, now() - interval '15 days', '{"author":"Interface Systems","tags":["visualization","pca"]}'),
  ('item_501', 'Open-source infrastructure as product strategy', 'open_source', 'How transparent systems and strong developer experience compound adoption.', 0.85, now() - interval '6 days', '{"author":"Builder Notes","tags":["open-source","developer-tools"]}'),
  ('item_502', 'Maintaining trustworthy ML benchmarks', 'open_source', 'Dataset provenance, repeatable harnesses, and avoiding misleading claims.', 0.93, now() - interval '9 days', '{"author":"Builder Notes","tags":["benchmarks","reproducibility"]}'),
  ('item_601', 'Experimentation beyond the dashboard', 'experimentation', 'Assignment units, exposure logging, guardrails, and honest stopping rules.', 0.89, now() - interval '7 days', '{"author":"Product Science","tags":["experiments","statistics"]}'),
  ('item_602', 'Cold-start systems that earn the first click', 'experimentation', 'Content quality, contextual popularity, and exploration for new users.', 0.86, now() - interval '11 days', '{"author":"Product Science","tags":["cold-start","exploration"]}')
ON CONFLICT (content_id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  quality_score = EXCLUDED.quality_score,
  published_at = EXCLUDED.published_at,
  metadata = EXCLUDED.metadata;

INSERT INTO model_versions (id, architecture, dataset_version, parameters, metrics, artifact_uri, trained_at, status)
VALUES
  ('popularity-v1', 'popularity', 'runtime-events', '{"window_days":30}', NULL, NULL, NULL, 'ready'),
  ('affinity-ranker-v1', 'behavioral_policy', 'runtime-events', '{"interest_weight":0.55,"quality_weight":0.25,"recency_weight":0.20}', NULL, NULL, NULL, 'ready'),
  ('implicit-svd-v1', 'implicit_svd', 'movielens-100k', '{"factors":32}', NULL, NULL, NULL, 'configured'),
  ('two-tower-v1', 'two_tower', 'movielens-100k', '{"embedding_dim":64}', NULL, NULL, NULL, 'configured'),
  ('gru4rec-v1', 'gru4rec', 'movielens-100k', '{"embedding_dim":64,"hidden_dim":96}', NULL, NULL, NULL, 'configured')
ON CONFLICT (id) DO NOTHING;

