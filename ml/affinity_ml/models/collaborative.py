from __future__ import annotations

import numpy as np


class ImplicitSVD:
    """Reproducible implicit-feedback factorization baseline."""

    def __init__(self, factors: int = 32) -> None:
        self.factors = factors
        self.user_factors: np.ndarray | None = None
        self.item_factors: np.ndarray | None = None
        self.seen: dict[int, set[int]] = {}

    def fit(self, interactions: np.ndarray) -> ImplicitSVD:
        if not len(interactions):
            raise ValueError("cannot fit an empty interaction matrix")
        users = interactions[:, 0].astype(int)
        items = interactions[:, 1].astype(int)
        matrix = np.zeros((users.max() + 1, items.max() + 1), dtype=np.float32)
        for user, item, _, weight in interactions:
            matrix[int(user), int(item)] += float(weight)
            self.seen.setdefault(int(user), set()).add(int(item))
        u, singular, vt = np.linalg.svd(matrix, full_matrices=False)
        size = min(self.factors, len(singular))
        scale = np.sqrt(singular[:size])
        self.user_factors = u[:, :size] * scale
        self.item_factors = vt[:size].T * scale
        return self

    def recommend(self, user_id: int, limit: int = 10) -> list[int]:
        if self.user_factors is None or self.item_factors is None:
            raise RuntimeError("fit must be called before recommend")
        if user_id >= len(self.user_factors):
            return []
        scores = self.item_factors @ self.user_factors[user_id]
        for item in self.seen.get(user_id, set()):
            scores[item] = -np.inf
        return np.argsort(-scores, kind="stable")[:limit].tolist()


class Popularity:
    def fit(self, interactions: np.ndarray) -> Popularity:
        items = interactions[:, 1].astype(int)
        self.ranking = np.argsort(-np.bincount(items), kind="stable").tolist()
        self.seen = {
            int(user): set(interactions[interactions[:, 0] == user, 1].astype(int))
            for user in np.unique(interactions[:, 0])
        }
        return self

    def recommend(self, user_id: int, limit: int = 10) -> list[int]:
        seen = self.seen.get(user_id, set())
        return [item for item in self.ranking if item not in seen][:limit]
