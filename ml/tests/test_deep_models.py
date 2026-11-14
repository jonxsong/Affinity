import pytest

torch = pytest.importorskip("torch")

from affinity_ml.models.sequential import GRU4Rec
from affinity_ml.models.two_tower import TwoTower


def test_two_tower_shapes_and_finite_loss() -> None:
    model = TwoTower(users=8, items=16, embedding_dim=12)
    users, items = model(torch.tensor([0, 1, 2]), torch.tensor([3, 4, 5]))
    assert users.shape == items.shape == (3, 12)
    assert torch.isfinite(model.contrastive_loss(torch.tensor([0, 1, 2]), torch.tensor([3, 4, 5])))


def test_gru4rec_produces_item_logits() -> None:
    model = GRU4Rec(items=20, embedding_dim=8, hidden_dim=12)
    logits = model(torch.tensor([[1, 2, 3], [4, 5, 20]]), torch.tensor([3, 2]))
    assert logits.shape == (2, 20)

