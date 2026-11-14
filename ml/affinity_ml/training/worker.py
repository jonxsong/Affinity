from __future__ import annotations

import argparse
import os
import time
from pathlib import Path
from typing import NamedTuple

import psycopg

from affinity_ml.training.pipeline import TrainingConfig, run_training


class Job(NamedTuple):
    id: str
    model_id: str


def claim_job(database_url: str) -> Job | None:
    with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT id::text, model_id
            FROM training_jobs
            WHERE status = 'queued'
            ORDER BY requested_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
            """
        )
        row = cursor.fetchone()
        if row is None:
            return None
        cursor.execute(
            "UPDATE training_jobs SET status = 'running', started_at = now() WHERE id = %s::uuid",
            (row[0],),
        )
        connection.commit()
        return Job(str(row[0]), str(row[1]))


def finish_job(database_url: str, job_id: str, error: str | None = None) -> None:
    status = "failed" if error else "completed"
    with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE training_jobs
            SET status = %s, completed_at = now(), error_detail = %s
            WHERE id = %s::uuid
            """,
            (status, error[:2000] if error else None, job_id),
        )
        connection.commit()


def work_once(database_url: str, artifacts_dir: Path, epochs: int) -> bool:
    job = claim_job(database_url)
    if job is None:
        return False
    print(f"training job {job.id} requested model {job.model_id}", flush=True)
    try:
        run_dir = run_training(
            TrainingConfig(
                artifacts_dir=artifacts_dir,
                database_url=database_url,
                epochs=epochs,
            )
        )
        finish_job(database_url, job.id)
        print(f"completed job {job.id}: {run_dir}", flush=True)
    except Exception as error:  # noqa: BLE001 - job boundary must persist every failure
        finish_job(database_url, job.id, f"{type(error).__name__}: {error}")
        print(f"failed job {job.id}: {error}", flush=True)
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Process durable Affinity training jobs")
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
    parser.add_argument("--artifacts-dir", type=Path, default=Path("artifacts"))
    parser.add_argument("--poll-seconds", type=float, default=5.0)
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    if not args.database_url:
        parser.error("--database-url or DATABASE_URL is required")
    while True:
        processed = work_once(args.database_url, args.artifacts_dir, args.epochs)
        if args.once:
            break
        if not processed:
            time.sleep(args.poll_seconds)


if __name__ == "__main__":
    main()
