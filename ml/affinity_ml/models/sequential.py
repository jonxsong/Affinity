from __future__ import annotations

import torch
from torch import nn


class GRU4Rec(nn.Module):
    def __init__(self, items: int, embedding_dim: int = 64, hidden_dim: int = 96) -> None:
        super().__init__()
        self.items = items
        self.embedding = nn.Embedding(items + 1, embedding_dim, padding_idx=items)
        self.gru = nn.GRU(embedding_dim, hidden_dim, batch_first=True)
        self.output = nn.Linear(hidden_dim, items)

    def forward(self, sequences: torch.Tensor, lengths: torch.Tensor | None = None) -> torch.Tensor:
        encoded, _ = self.gru(self.embedding(sequences))
        if lengths is None:
            final = encoded[:, -1]
        else:
            index = (lengths - 1).clamp_min(0).view(-1, 1, 1).expand(-1, 1, encoded.size(-1))
            final = encoded.gather(1, index).squeeze(1)
        return self.output(final)

