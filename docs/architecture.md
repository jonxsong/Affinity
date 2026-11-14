# Architecture

Affinity uses one versioned HTTP contract across two deployment shapes. The
hosted product runs the exported Next.js console and a same-origin Worker backed
by D1. The complete local and research stack is a modular monolith: Rust owns
request validation, durable event ingestion, recommendation orchestration, and
failure fallbacks; Python owns reproducible offline features, model training,
evaluation, and the durable job worker. The dashboard consumes the same
contracts as an external client.

## Hosted product data flow

1. The exported console calls same-origin `/v1/*` routes, avoiding a fragile
   browser dependency on a developer's `localhost`.
2. The Worker validates versioned interaction events and writes them
   idempotently to D1.
3. Recommendation requests load that visitor's behavior, derive decayed
   interests, remove seen content, and apply quality, recency, and interest
   scores.
4. New users receive a deterministic cold-start ranking; after an interaction,
   the response switches to personalized ranking and includes score evidence.

## Complete local stack data flow

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

The local application uses PostgreSQL and requires no paid service or OpenAI
API key. Redis, Qdrant, Redpanda, and MLflow are optional extension points
rather than hidden requirements. Hosted D1 and local PostgreSQL intentionally
remain separate data planes.

## Reliability boundaries

- Event IDs are idempotency keys.
- Invalid events return a stable structured error contract.
- Batched ingestion reports accepted, duplicate, and rejected counts.
- Recommendation serving falls back from personalized behavior to content quality and recency.
- Hosted events and recommendation counters persist in D1 across Worker instances.
- Admin mutations require a bearer token.
- Privacy deletion removes a user's durable event history.
- Training job claims use row locks and skip already-claimed work.

## Decisions

See [ADR-0001](adr/0001-modular-monolith.md) for the initial deployment shape.

