from __future__ import annotations

import json

import pytest

pytest.importorskip("torch")

from affinity_ml.datasets.seed import generate_events
from affinity_ml.training.pipeline import TrainingConfig, run_training


def test_seed_events_are_deterministic_and_unique() -> None:
    first = generate_events(users=3, interactions=4, seed=9)
    second = generate_events(users=3, interactions=4, seed=9)
    assert first == second
    assert len(first) == 12
    assert len({event["event_id"] for event in first}) == 12
    assert all(event["context"]["source"] == "synthetic_seed" for event in first)


def test_training_writes_a_reproducible_manifest(tmp_path) -> None:
    run_dir = run_training(TrainingConfig(seed=7, epochs=1, embedding_dim=8, artifacts_dir=tmp_path))
    manifest = json.loads((run_dir / "manifest.json").read_text())
    assert manifest["dataset"]["source"] == "generated"
    assert {model["architecture"] for model in manifest["models"]} == {
        "popularity",
        "implicit_svd",
        "two_tower",
        "gru4rec",
    }
    assert all(model["metrics"]["mean_inference_ms"] >= 0 for model in manifest["models"])
