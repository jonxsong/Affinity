# Production operations

This runbook covers the public Sites deployment and the optional self-hosted Rust stack. Production changes are accepted only after CI passes, the exact source commit is pushed, and the matching immutable Site version succeeds.

## Service objectives

| Signal | Objective | Alert threshold |
|---|---:|---:|
| Public health availability | 99.9% over 30 days | two failures in five minutes |
| Recommendation error rate | under 1% over 15 minutes | 2% over five minutes |
| Recommendation p95 | under 500 ms over 15 minutes | 750 ms over five minutes |
| Event acceptance | at least 99% excluding invalid input and duplicates | under 98% over five minutes |

Every error carries `request_id`. Preserve that identifier when escalating an incident. Do not include admin tokens, browser client IDs, or raw event context in logs or tickets.

## Release and rollback

1. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `cargo test --workspace`, and the Python suite.
2. Build the Worker archive from the pushed commit with `pnpm build` and the repository Site workflow.
3. Apply D1 migrations before the version is deployed. Migrations are append-only; never edit a migration that has reached production.
4. Smoke-test `/health`, `/v1/overview`, event ingestion, and recommendations with a fresh client identity.
5. Roll back by redeploying the last known-good immutable Site version. Database migrations in this repository are backward compatible and are not rolled back during an application rollback.

## PostgreSQL backup and restore

Create an encrypted or access-controlled backup before every schema migration and at least daily:

```bash
docker compose exec -T postgres pg_dump \
  --username affinity --dbname affinity \
  --format=custom --no-owner --no-acl > affinity-$(date +%Y%m%d-%H%M%S).dump
```

Keep daily backups for 14 days and monthly backups for 12 months. Store copies outside the application host and restrict them like production data.

Quarterly, restore the newest backup into an empty verification database and run the readiness check:

```bash
createdb affinity_restore_test
pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname affinity_restore_test affinity-YYYYMMDD-HHMMSS.dump
DATABASE_URL=postgres://affinity:REDACTED@localhost/affinity_restore_test \
  cargo run --release --manifest-path services/api/Cargo.toml
curl --fail http://127.0.0.1:8080/ready
```

Record the restore date, backup identifier, duration, and readiness result. A backup is not considered healthy until this restore drill succeeds.

## Retention and privacy deletion

- Public visitors are scoped by a random browser client identity. Different browsers cannot read one another's history.
- A visitor can delete their own hosted user history with `DELETE /v1/users/{id}` using the same `x-affinity-client-id` header that created it.
- The self-hosted Rust endpoint requires the admin bearer token because identity is expected to be enforced by the deployment gateway.
- Maintenance removes events outside the configured retention window; the hosted runtime also clears old quota buckets:

```bash
curl -X POST https://affinity.jonzhang.dev/v1/admin/maintenance \
  -H "Authorization: Bearer $AFFINITY_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"retention_days":365}'
```

Run maintenance monthly and before lowering the documented retention window. Never copy browser client IDs into analytics systems.

## Secret rotation

1. Generate a new random admin token of at least 32 bytes.
2. Update the Sites secret or the self-hosted secret manager. Never commit it or place it in shell history.
3. Deploy a new immutable version so the environment revision becomes active.
4. Verify an authenticated admin read/mutation and confirm the old token fails.
5. Rotate immediately after suspected exposure, operator departure, or backup/log leakage; otherwise rotate every 90 days.

## Incident response

1. Declare severity and freeze deployments.
2. Confirm impact with health, request IDs, error rate, and dependency readiness.
3. Contain abuse by reducing public quotas or rolling back. Rotate secrets if authentication may be involved.
4. Preserve relevant structured logs without copying sensitive payloads.
5. Restore service, validate the four smoke paths, and monitor for 30 minutes.
6. Publish an internal post-incident review within five business days with timeline, contributing factors, corrective owners, and due dates.

## Self-hosted production start

The production override binds web and API ports to loopback so a TLS reverse proxy can be the only public listener, removes direct dependency ports, enables restart policies, and refuses missing production secrets:

```bash
docker compose -f docker-compose.production.yml \
  up --build --detach
```

Terminate TLS at the reverse proxy, restrict `/metrics` and admin routes at that gateway, and allow only the intended frontend origin for cross-origin requests.
