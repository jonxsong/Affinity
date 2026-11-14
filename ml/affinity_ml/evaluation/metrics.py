from __future__ import annotations

import math
from collections.abc import Iterable

import numpy as np


def recall_at_k(recommendations: list[int], relevant: set[int], k: int) -> float:
    return len(set(recommendations[:k]) & relevant) / len(relevant) if relevant else 0.0


def ndcg_at_k(recommendations: list[int], relevant: set[int], k: int) -> float:
    dcg = sum(1 / math.log2(rank + 2) for rank, item in enumerate(recommendations[:k]) if item in relevant)
    ideal = sum(1 / math.log2(rank + 2) for rank in range(min(len(relevant), k)))
    return dcg / ideal if ideal else 0.0


def reciprocal_rank(recommendations: list[int], relevant: set[int]) -> float:
    return next((1 / rank for rank, item in enumerate(recommendations, start=1) if item in relevant), 0.0)


def catalog_coverage(recommendation_lists: Iterable[list[int]], catalog_size: int) -> float:
    unique = {item for recommendations in recommendation_lists for item in recommendations}
    return len(unique) / catalog_size if catalog_size else 0.0


def intra_list_diversity(recommendations: list[int], embeddings: np.ndarray) -> float:
    if len(recommendations) < 2:
        return 0.0
    vectors = embeddings[recommendations]
    vectors = vectors / np.maximum(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-12)
    similarities = vectors @ vectors.T
    upper = similarities[np.triu_indices(len(vectors), k=1)]
    return float(np.mean(1 - upper))

