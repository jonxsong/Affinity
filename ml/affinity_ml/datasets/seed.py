from __future__ import annotations

import argparse
import json
import os
import urllib.request
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import numpy as np

EVENT_TYPES = ("content_view", "click", "save", "like", "share")
ITEM_IDS = tuple(f"item_{category}{index:02d}" for category in range(1, 7) for index in range(1, 3))


def generate_events(users: int = 32, interactions: int = 18, seed: int = 42) -> list[dict[str, Any]]:
    """Create deterministic, labeled synthetic events accepted by the Rust API."""
    if users < 1 or interactions < 1:
        raise ValueError("users and interactions must be positive")
    rng = np.random.default_rng(seed)
    origin = datetime(2025, 1, 1, tzinfo=UTC)
    events: list[dict[str, Any]] = []
    for user in range(users):
        preferred_category = user % 6
        preferred = ITEM_IDS[preferred_category * 2 : preferred_category * 2 + 2]
        for step in range(interactions):
            explore = rng.random() < 0.2
            content_id = str(rng.choice(ITEM_IDS if explore else preferred))
            event_type = str(rng.choice(EVENT_TYPES, p=(0.42, 0.26, 0.14, 0.12, 0.06)))
            occurred_at = origin + timedelta(minutes=user * interactions + step)
            event_key = f"affinity:{seed}:{user}:{step}"
            events.append(
                {
                    "event_id": str(uuid.uuid5(uuid.NAMESPACE_URL, event_key)),
                    "user_id": f"usr_seed_{user:04d}",
                    "content_id": content_id,
                    "event_type": event_type,
                    "timestamp": occurred_at.isoformat().replace("+00:00", "Z"),
                    "session_id": f"synthetic-{seed}-{user:04d}",
                    "context": {"source": "synthetic_seed", "seed": seed},
                    "surface": "synthetic_seed",
                    "schema_version": 1,
                }
            )
    return events


def post_events(api_url: str, events: list[dict[str, Any]], batch_size: int = 250) -> int:
    accepted = 0
    for offset in range(0, len(events), batch_size):
        body = json.dumps({"events": events[offset : offset + batch_size]}).encode()
        request = urllib.request.Request(
            f"{api_url.rstrip('/')}/v1/events/batch",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.load(response)
        accepted += int(payload["accepted"])
    return accepted


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Affinity with deterministic synthetic behavior")
    parser.add_argument("--api-url", default=os.getenv("AFFINITY_API_URL", "http://localhost:8080"))
    parser.add_argument("--users", type=int, default=32)
    parser.add_argument("--interactions", type=int, default=18)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    events = generate_events(args.users, args.interactions, args.seed)
    accepted = post_events(args.api_url, events)
    print(f"accepted {accepted}/{len(events)} events into {args.api_url}")


if __name__ == "__main__":
    main()
