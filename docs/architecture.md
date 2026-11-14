# Architecture

Affinity is a modular monolith around one versioned HTTP contract. Rust owns
request validation, durable event ingestion, recommendation orchestration, and
failure fallbacks. Python owns reproducible offline features, model training,
evaluation, and the durable job worker. The dashboard consumes the same
contracts as an external client.

## Runtime data flow

1. Clients submit versioned interaction events to the Rust API.
2. The API validates and deduplicates each event in a PostgreSQL transaction.
3. The Rust policy derives recency-weighted long- and short-term interests from
   stored behavior.
4. Admin requests create PostgreSQL training jobs; a Python worker claims them
   with `FOR UPDATE SKIP LOCKED` so multiple workers remain safe.
5. Jobs train four model families on one temporal protocol, write immutable
   artifacts, and update the model registry.
6. Requests load candidates and behavior, filter seen content, score, diversify, and
   return explicit score components. Heuristic scores are never called
   probabilities.

The hosted static build falls back to deterministic showcase data when it
cannot reach an API. The local application uses PostgreSQL and requires no paid
service or OpenAI API key. Redis, Qdrant, Redpanda, and MLflow are optional
extension points rather than hidden requirements.

## Reliability boundaries

- Event IDs are idempotency keys.
- Invalid events return a stable structured error contract.
- Batched ingestion reports accepted, duplicate, and rejected counts.
- Recommendation serving falls back from personalized behavior to content quality and recency.
- Admin mutations require a bearer token.
- Privacy deletion removes a user's durable event history.
- Training job claims use row locks and skip already-claimed work.

## Decisions

See [ADR-0001](adr/0001-modular-monolith.md) for the initial deployment shape.

