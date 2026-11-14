import numpy as np

from affinity_ml.datasets.base import synthetic_fixture
from affinity_ml.evaluation.metrics import ndcg_at_k, recall_at_k, reciprocal_rank
from affinity_ml.features.user import time_decay_weights
from affinity_ml.models.collaborative import ImplicitSVD, Popularity


def test_temporal_split_has_no_future_leakage() -> None:
    split = synthetic_fixture(users=5, interactions_per_user=10).temporal_split()
    for user in np.unique(split.test[:, 0]):
        train_times = split.train[split.train[:, 0] == user, 2]
        test_times = split.test[split.test[:, 0] == user, 2]
        assert train_times.max() < test_times.min()


def test_recommendation_models_exclude_seen_items() -> None:
    split = synthetic_fixture(users=8, items=24).temporal_split()
    for model in (Popularity(), ImplicitSVD(4)):
        model.fit(split.train)
        seen = set(split.train[split.train[:, 0] == 0, 1].astype(int))
        assert not set(model.recommend(0, 10)) & seen


def test_metrics_known_example() -> None:
    recommendations, relevant = [3, 1, 9, 7], {1, 7}
    assert recall_at_k(recommendations, relevant, 2) == 0.5
    assert 0 < ndcg_at_k(recommendations, relevant, 4) <= 1
    assert reciprocal_rank(recommendations, relevant) == 0.5


def test_time_decay_favors_recent_events() -> None:
    weights = time_decay_weights(np.array([0, 50, 100]), reference_time=100, half_life_seconds=50)
    np.testing.assert_allclose(weights, [0.25, 0.5, 1.0])


def test_reproducible_fixture_and_factorization() -> None:
    a, b = synthetic_fixture(seed=7), synthetic_fixture(seed=7)
    np.testing.assert_array_equal(a.values, b.values)
    model_a = ImplicitSVD(4).fit(a.temporal_split().train)
    model_b = ImplicitSVD(4).fit(b.temporal_split().train)
    assert model_a.recommend(0) == model_b.recommend(0)

