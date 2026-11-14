from __future__ import annotations

import argparse
import json
import os
import random
import time
import uuid
from collections.abc import Callable
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn.functional as F

from affinity_ml.datasets.base import InteractionDataset, TemporalSplit, synthetic_fixture
from affinity_ml.datasets.movielens import download as download_movielens
from affinity_ml.datasets.movielens import load as load_movielens
from affinity_ml.evaluation.metrics import catalog_coverage, ndcg_at_k, recall_at_k, reciprocal_rank
from affinity_ml.models.collaborative import ImplicitSVD, Popularity
from affinity_ml.models.sequential import GRU4Rec
from affinity_ml.models.two_tower import TwoTower


@dataclass(frozen=True)
class TrainingConfig:
    dataset: str = "synthetic"
    seed: int = 42
    epochs: int = 8
    embedding_dim: int = 32
    artifacts_dir: Path = Path("artifacts")
    data_dir: Path = Path("data")
    database_url: str | None = None


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.use_deterministic_algorithms(True)


def _load_dataset(config: TrainingConfig) -> InteractionDataset:
    if config.dataset == "synthetic":
        return synthetic_fixture(seed=config.seed)
    if config.dataset == "movielens-100k":
        return load_movielens(download_movielens(config.data_dir))
    raise ValueError(f"unsupported dataset: {config.dataset}")


def _user_histories(interactions: np.ndarray) -> dict[int, list[int]]:
    histories: dict[int, list[int]] = {}
    for user, item, *_ in interactions[np.argsort(interactions[:, 2], kind="stable")]:
        histories.setdefault(int(user), []).append(int(item))
    return histories


def _evaluate(
    split: TemporalSplit,
    catalog_size: int,
    recommend: Callable[[int, int], list[int]],
) -> dict[str, float]:
    relevant = {
        int(user): set(split.test[split.test[:, 0] == user, 1].astype(int))
        for user in np.unique(split.test[:, 0])
    }
    recommendations: list[list[int]] = []
    recalls_10: list[float] = []
    recalls_20: list[float] = []
    ndcgs_10: list[float] = []
    ndcgs_20: list[float] = []
    reciprocal_ranks: list[float] = []
    started = time.perf_counter()
    for user, targets in relevant.items():
        ranked = recommend(user, 20)
        recommendations.append(ranked)
        recalls_10.append(recall_at_k(ranked, targets, 10))
        recalls_20.append(recall_at_k(ranked, targets, 20))
        ndcgs_10.append(ndcg_at_k(ranked, targets, 10))
        ndcgs_20.append(ndcg_at_k(ranked, targets, 20))
        reciprocal_ranks.append(reciprocal_rank(ranked, targets))
    elapsed = time.perf_counter() - started
    users = max(len(relevant), 1)
    return {
        "recall_at_10": float(np.mean(recalls_10)),
        "recall_at_20": float(np.mean(recalls_20)),
        "ndcg_at_10": float(np.mean(ndcgs_10)),
        "ndcg_at_20": float(np.mean(ndcgs_20)),
        "mrr": float(np.mean(reciprocal_ranks)),
        "catalog_coverage": catalog_coverage(recommendations, catalog_size),
        "mean_inference_ms": elapsed * 1000 / users,
    }


def _train_two_tower(
    split: TemporalSplit, users: int, items: int, config: TrainingConfig
) -> tuple[TwoTower, float]:
    model = TwoTower(users, items, config.embedding_dim)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.01, weight_decay=1e-4)
    user_ids = torch.tensor(split.train[:, 0], dtype=torch.long)
    item_ids = torch.tensor(split.train[:, 1], dtype=torch.long)
    started = time.perf_counter()
    model.train()
    for _ in range(config.epochs):
        permutation = torch.randperm(len(user_ids))
        for indices in permutation.split(128):
            loss = model.contrastive_loss(user_ids[indices], item_ids[indices])
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
    return model.eval(), time.perf_counter() - started


def _two_tower_recommender(
    model: TwoTower, seen: dict[int, list[int]], items: int
) -> Callable[[int, int], list[int]]:
    all_items = torch.arange(items)

    def recommend(user: int, limit: int) -> list[int]:
        with torch.inference_mode():
            user_ids = torch.full((items,), user)
            users, item_vectors = model(user_ids, all_items)
            scores = torch.sum(users * item_vectors, dim=1)
            if history := seen.get(user):
                scores[torch.tensor(history)] = -torch.inf
            return torch.argsort(scores, descending=True)[:limit].tolist()

    return recommend


def _sequence_examples(histories: dict[int, list[int]], padding: int) -> tuple[torch.Tensor, torch.Tensor]:
    sequences: list[list[int]] = []
    targets: list[int] = []
    width = max((len(history) - 1 for history in histories.values()), default=1)
    for history in histories.values():
        for position in range(1, len(history)):
            prefix = history[:position][-width:]
            sequences.append(prefix + [padding] * (width - len(prefix)))
            targets.append(history[position])
    return torch.tensor(sequences), torch.tensor(targets)


def _train_gru(histories: dict[int, list[int]], items: int, config: TrainingConfig) -> tuple[GRU4Rec, float]:
    model = GRU4Rec(items, config.embedding_dim, config.embedding_dim * 2)
    sequences, targets = _sequence_examples(histories, items)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.01, weight_decay=1e-4)
    started = time.perf_counter()
    model.train()
    for _ in range(config.epochs):
        permutation = torch.randperm(len(sequences))
        for indices in permutation.split(128):
            batch = sequences[indices]
            lengths = (batch != items).sum(dim=1)
            loss = F.cross_entropy(model(batch, lengths), targets[indices])
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
    return model.eval(), time.perf_counter() - started


def _gru_recommender(
    model: GRU4Rec, histories: dict[int, list[int]], items: int
) -> Callable[[int, int], list[int]]:
    def recommend(user: int, limit: int) -> list[int]:
        history = histories.get(user, [])
        if not history:
            return []
        sequence = torch.tensor([history])
        with torch.inference_mode():
            scores = model(sequence, torch.tensor([len(history)]))[0]
            scores[torch.tensor(history)] = -torch.inf
            return torch.argsort(scores, descending=True)[:limit].tolist()

    return recommend


def _register_models(database_url: str, records: list[dict[str, Any]]) -> None:
    import psycopg

    with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
        for record in records:
            cursor.execute(
                """
                INSERT INTO model_versions
                    (id, architecture, dataset_version, parameters, metrics, artifact_uri, trained_at, status)
                VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s, now(), 'ready')
                ON CONFLICT (id) DO UPDATE SET
                    dataset_version = EXCLUDED.dataset_version,
                    parameters = EXCLUDED.parameters,
                    metrics = EXCLUDED.metrics,
                    artifact_uri = EXCLUDED.artifact_uri,
                    trained_at = EXCLUDED.trained_at,
                    status = EXCLUDED.status
                """,
                (
                    record["id"],
                    record["architecture"],
                    record["dataset_version"],
                    json.dumps(record["parameters"]),
                    json.dumps(record["metrics"]),
                    record["artifact_uri"],
                ),
            )
        connection.commit()


def run_training(config: TrainingConfig) -> Path:
    seed_everything(config.seed)
    dataset = _load_dataset(config)
    split = dataset.temporal_split()
    users = int(dataset.values[:, 0].max()) + 1
    items = int(dataset.values[:, 1].max()) + 1
    histories = _user_histories(split.train)
    run_id = f"{dataset.version}-{config.seed}-{uuid.uuid4().hex[:8]}"
    run_dir = config.artifacts_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    records: list[dict[str, Any]] = []

    def record(name: str, parameters: dict[str, Any], metrics: dict[str, float], artifact: str) -> None:
        metrics_path = run_dir / f"{name}-metrics.json"
        metrics_path.write_text(json.dumps(metrics, indent=2, sort_keys=True), encoding="utf-8")
        records.append(
            {
                "id": f"{name}-{run_id}",
                "architecture": name,
                "dataset_version": dataset.version,
                "parameters": parameters,
                "metrics": metrics,
                "artifact_uri": str(run_dir / artifact),
            }
        )

    started = time.perf_counter()
    popularity = Popularity().fit(split.train)
    metrics = _evaluate(split, items, popularity.recommend)
    metrics["training_seconds"] = time.perf_counter() - started
    (run_dir / "popularity.json").write_text(json.dumps(popularity.ranking), encoding="utf-8")
    record("popularity", {}, metrics, "popularity.json")

    started = time.perf_counter()
    svd = ImplicitSVD(config.embedding_dim).fit(split.train)
    metrics = _evaluate(split, items, svd.recommend)
    metrics["training_seconds"] = time.perf_counter() - started
    np.savez_compressed(run_dir / "implicit-svd.npz", users=svd.user_factors, items=svd.item_factors)
    record("implicit_svd", {"factors": config.embedding_dim}, metrics, "implicit-svd.npz")

    two_tower, training_seconds = _train_two_tower(split, users, items, config)
    metrics = _evaluate(split, items, _two_tower_recommender(two_tower, histories, items))
    metrics["training_seconds"] = training_seconds
    torch.save(two_tower.state_dict(), run_dir / "two-tower.pt")
    record("two_tower", {"embedding_dim": config.embedding_dim}, metrics, "two-tower.pt")

    gru, training_seconds = _train_gru(histories, items, config)
    metrics = _evaluate(split, items, _gru_recommender(gru, histories, items))
    metrics["training_seconds"] = training_seconds
    torch.save(gru.state_dict(), run_dir / "gru4rec.pt")
    record(
        "gru4rec",
        {"embedding_dim": config.embedding_dim, "hidden_dim": config.embedding_dim * 2},
        metrics,
        "gru4rec.pt",
    )

    manifest = {
        "run_id": run_id,
        "dataset": asdict(dataset) | {"values": f"{len(dataset.values)} rows"},
        "models": records,
    }
    (run_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")
    if config.database_url:
        _register_models(config.database_url, records)
    return run_dir


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and evaluate Affinity recommendation models")
    parser.add_argument("--dataset", choices=("synthetic", "movielens-100k"), default="synthetic")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--embedding-dim", type=int, default=32)
    parser.add_argument("--artifacts-dir", type=Path, default=Path("artifacts"))
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
    args = parser.parse_args()
    run_dir = run_training(
        TrainingConfig(
            dataset=args.dataset,
            seed=args.seed,
            epochs=args.epochs,
            embedding_dim=args.embedding_dim,
            artifacts_dir=args.artifacts_dir,
            data_dir=args.data_dir,
            database_url=args.database_url,
        )
    )
    print(f"wrote reproducible model run to {run_dir}")


if __name__ == "__main__":
    main()
