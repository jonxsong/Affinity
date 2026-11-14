# ADR-0001: Start as a modular monolith

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Affinity needs distinct systems, ML, and UI ownership without forcing local
contributors to run a large distributed stack for every change.

## Decision

Keep one Rust API binary with module boundaries for events, users, models, and
recommendations. Run training/evaluation as separate Python jobs. PostgreSQL,
Redis, Qdrant, and Redpanda remain replaceable infrastructure adapters.

## Consequences

The common path stays simple and testable. High-volume event consumption and
ML inference can later be extracted behind the same contracts if measurements
show that independent scaling is worthwhile.

