CREATE TABLE IF NOT EXISTS active_serving_model (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  artifact JSONB NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_occurred_at_idx ON events (occurred_at DESC);
