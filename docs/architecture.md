# Architecture

Affinity is a modular monolith around one versioned HTTP contract. Rust owns
request validation, event ingestion, recommendation orchestration, and failure
fallbacks. Python owns reproducible offline features, model training, and
evaluation. The dashboard consumes the same contracts as an external client.

## Runtime data flow

1. Clients submit versioned interaction events to the Rust API.
2. The API validates and deduplicates each event before durable storage.
3. The event consumer updates recency-weighted user features asynchronously.
4. Offline Python jobs train retrieval models from temporal data splits.
5. Item embeddings are exported to Qdrant and model metadata to PostgreSQL.
6. Requests retrieve candidates, filter seen content, rank, diversify, and
   return explicit score components. Heuristic scores are never called
   probabilities.

The checked-in demo uses deterministic public/synthetic sample data and an
in-memory Rust repository so it remains explorable without paid services. The
same repository traits are the boundary for PostgreSQL, Redis, and Qdrant.

## Reliability boundaries

- Event IDs are idempotency keys.
- Invalid events return a stable structured error contract.
- Batched ingestion reports accepted, duplicate, and rejected counts.
- Recommendation serving falls back from personalized retrieval to popularity.
- Admin mutations require a bearer token.
- LLM profiling is optional, cached, versioned, and must not infer sensitive
  attributes.

## Decisions

See [ADR-0001](adr/0001-modular-monolith.md) for the initial deployment shape.

