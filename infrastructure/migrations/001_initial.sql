CREATE TABLE IF NOT EXISTS events (
  event_id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  content_id TEXT,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  session_id TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}',
  surface TEXT NOT NULL,
  schema_version SMALLINT NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_user_time_idx ON events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_content_time_idx ON events (content_id, occurred_at DESC) WHERE content_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS dead_letter_events (
  id BIGSERIAL PRIMARY KEY,
  payload JSONB NOT NULL,
  error_code TEXT NOT NULL,
  error_detail TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_versions (
  id TEXT PRIMARY KEY,
  architecture TEXT NOT NULL,
  dataset_version TEXT NOT NULL,
  parameters JSONB NOT NULL,
  metrics JSONB,
  artifact_uri TEXT,
  trained_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('configured','training','ready','failed','archived'))
);

CREATE TABLE IF NOT EXISTS experiments (
  id UUID PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  control_model TEXT NOT NULL,
  treatment_model TEXT NOT NULL,
  treatment_allocation DOUBLE PRECISION NOT NULL CHECK (treatment_allocation BETWEEN 0 AND 1),
  status TEXT NOT NULL CHECK (status IN ('draft','running','paused','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

