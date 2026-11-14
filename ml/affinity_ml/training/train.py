from __future__ import annotations

import json
from pathlib import Path

from affinity_ml.datasets.base import synthetic_fixture
from affinity_ml.models.collaborative import ImplicitSVD


def main() -> None:
    dataset = synthetic_fixture()
    split = dataset.temporal_split()
    model = ImplicitSVD(factors=16).fit(split.train)
    artifact = Path("artifacts/implicit-svd-demo.json")
    artifact.parent.mkdir(parents=True, exist_ok=True)
    artifact.write_text(
        json.dumps(
            {
                "model": "implicit_svd",
                "dataset": dataset.name,
                "dataset_version": dataset.version,
                "factors": model.factors,
                "measured_metrics": None,
            },
            indent=2,
        )
    )
    print(f"wrote {artifact}")


if __name__ == "__main__":
    main()
