from __future__ import annotations

import numpy as np


def time_decay_weights(timestamps: np.ndarray, reference_time: float, half_life_seconds: float) -> np.ndarray:
    if half_life_seconds <= 0:
        raise ValueError("half_life_seconds must be positive")
    ages = np.maximum(reference_time - timestamps, 0)
    return np.exp2(-ages / half_life_seconds)


def weighted_item_profile(item_vectors: np.ndarray, timestamps: np.ndarray, reference_time: float, half_life_seconds: float = 604_800) -> np.ndarray:
    if len(item_vectors) == 0:
        return np.zeros(item_vectors.shape[1] if item_vectors.ndim == 2 else 0, dtype=np.float32)
    weights = time_decay_weights(timestamps, reference_time, half_life_seconds)
    profile = np.average(item_vectors, axis=0, weights=weights)
    norm = np.linalg.norm(profile)
    return (profile / norm if norm else profile).astype(np.float32)

