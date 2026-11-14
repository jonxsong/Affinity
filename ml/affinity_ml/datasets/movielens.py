from __future__ import annotations

import csv
import io
import urllib.request
import zipfile
from pathlib import Path

import numpy as np

from .base import InteractionDataset

MOVIELENS_100K_URL = "https://files.grouplens.org/datasets/movielens/ml-100k.zip"
MOVIELENS_LICENSE_URL = "https://files.grouplens.org/datasets/movielens/ml-100k-README.txt"


def download(destination: Path) -> Path:
    """Download the public GroupLens archive from its canonical source."""
    destination.mkdir(parents=True, exist_ok=True)
    archive = destination / "ml-100k.zip"
    if not archive.exists():
        urllib.request.urlretrieve(MOVIELENS_100K_URL, archive)
    return archive


def load(archive: Path) -> InteractionDataset:
    with zipfile.ZipFile(archive) as source:
        raw = source.read("ml-100k/u.data").decode("utf-8")
    rows = []
    for user, item, rating, timestamp in csv.reader(io.StringIO(raw), delimiter="\t"):
        rows.append((int(user) - 1, int(item) - 1, int(timestamp), max(float(rating) - 2.5, 0.25)))
    values = np.asarray(sorted(rows, key=lambda row: row[2]), dtype=np.float64)
    return InteractionDataset(values, "MovieLens 100K", "ml-100k", MOVIELENS_100K_URL)
