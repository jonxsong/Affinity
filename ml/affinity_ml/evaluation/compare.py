from __future__ import annotations

import json
import time

import numpy as np

from affinity_ml.datasets.base import synthetic_fixture
from affinity_ml.evaluation.metrics import catalog_coverage, ndcg_at_k, recall_at_k, reciprocal_rank
from affinity_ml.models.collaborative import ImplicitSVD, Popularity


def evaluate(model: Popularity | ImplicitSVD, train: np.ndarray, test: np.ndarray, k: int = 10) -> dict[str, float]:
    started = time.perf_counter()
    model.fit(train)
    training_seconds = time.perf_counter() - started
    recommendation_lists, recalls, ndcgs, reciprocal_ranks = [], [], [], []
    for user in np.unique(test[:, 0]).astype(int):
        relevant = set(test[test[:, 0] == user, 1].astype(int))
        recommendations = model.recommend(user, k)
        recommendation_lists.append(recommendations)
        recalls.append(recall_at_k(recommendations, relevant, k))
        ndcgs.append(ndcg_at_k(recommendations, relevant, k))
        reciprocal_ranks.append(reciprocal_rank(recommendations, relevant))
    catalog_size = int(max(train[:, 1].max(), test[:, 1].max())) + 1
    return {"recall@10": float(np.mean(recalls)), "ndcg@10": float(np.mean(ndcgs)), "mrr": float(np.mean(reciprocal_ranks)), "catalog_coverage": catalog_coverage(recommendation_lists, catalog_size), "training_seconds": training_seconds}


def main() -> None:
    split = synthetic_fixture().temporal_split()
    report = {"disclaimer": "Measured on deterministic synthetic fixture; not a product benchmark.", "popularity": evaluate(Popularity(), split.train, split.test), "implicit_svd": evaluate(ImplicitSVD(16), split.train, split.test)}
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

