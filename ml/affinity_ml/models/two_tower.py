from __future__ import annotations

import torch
from torch import nn
import torch.nn.functional as F


class TwoTower(nn.Module):
    def __init__(self, users: int, items: int, embedding_dim: int = 64) -> None:
        super().__init__()
        self.user_tower = nn.Sequential(nn.Embedding(users, embedding_dim), nn.Linear(embedding_dim, embedding_dim), nn.LayerNorm(embedding_dim))
        self.item_tower = nn.Sequential(nn.Embedding(items, embedding_dim), nn.Linear(embedding_dim, embedding_dim), nn.LayerNorm(embedding_dim))

    def forward(self, user_ids: torch.Tensor, item_ids: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        return F.normalize(self.user_tower(user_ids), dim=-1), F.normalize(self.item_tower(item_ids), dim=-1)

    def contrastive_loss(self, user_ids: torch.Tensor, item_ids: torch.Tensor, temperature: float = 0.07) -> torch.Tensor:
        users, items = self(user_ids, item_ids)
        labels = torch.arange(len(users), device=users.device)
        return F.cross_entropy(users @ items.T / temperature, labels)

