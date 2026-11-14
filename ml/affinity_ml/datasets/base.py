from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class TemporalSplit:
    train: np.ndarray
    validation: np.ndarray
    test: np.ndarray


@dataclass(frozen=True)
class InteractionDataset:
    """Normalized interactions: user, item, timestamp, implicit weight."""

    values: np.ndarray
    name: str
    version: str
    source: str

    def __post_init__(self) -> None:
        if self.values.ndim != 2 or self.values.shape[1] != 4:
            raise ValueError("interactions must have shape [n, 4]")
        if len(self.values) and np.any(np.diff(self.values[:, 2]) < 0):
            raise ValueError("interactions must be globally sorted by timestamp")

    def temporal_split(self, validation_ratio: float = 0.1, test_ratio: float = 0.1) -> TemporalSplit:
        """Split each user's history chronologically, with no future leakage."""
        if validation_ratio < 0 or test_ratio <= 0 or validation_ratio + test_ratio >= 1:
            raise ValueError("split ratios must be positive and sum to less than one")
        train, validation, test = [], [], []
        for user_id in np.unique(self.values[:, 0].astype(np.int64)):
            rows = self.values[self.values[:, 0] == user_id]
            rows = rows[np.argsort(rows[:, 2], kind="stable")]
            test_size = max(1, int(len(rows) * test_ratio))
            validation_size = max(1, int(len(rows) * validation_ratio)) if len(rows) >= 3 else 0
            train_end = max(1, len(rows) - validation_size - test_size)
            train.append(rows[:train_end])
            if validation_size:
                validation.append(rows[train_end : train_end + validation_size])
            test.append(rows[train_end + validation_size :])
        empty = np.empty((0, 4), dtype=np.float64)
        return TemporalSplit(
            train=np.concatenate(train) if train else empty,
            validation=np.concatenate(validation) if validation else empty,
            test=np.concatenate(test) if test else empty,
        )


def synthetic_fixture(
    users: int = 32, items: int = 64, interactions_per_user: int = 12, seed: int = 42
) -> InteractionDataset:
    """Deterministic fixture for tests and demos; never represented as real traffic."""
    rng = np.random.default_rng(seed)
    values = []
    for user in range(users):
        preferred_cluster = user % 4
        candidate_items = np.arange(preferred_cluster, items, 4)
        sampled = rng.choice(candidate_items, size=interactions_per_user, replace=True)
        for step, item in enumerate(sampled):
            values.append((user, int(item), 1_700_000_000 + user * 100 + step, 1.0 + (step % 3) * 0.25))
    array = np.asarray(sorted(values, key=lambda row: row[2]), dtype=np.float64)
    return InteractionDataset(array, "synthetic-cluster-fixture", f"seed-{seed}", "generated")
