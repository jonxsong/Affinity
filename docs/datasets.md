# Datasets

The default offline adapter targets [MovieLens 100K](https://grouplens.org/datasets/movielens/100k/), distributed by GroupLens for research use. Review the canonical dataset README and usage terms before redistribution. Affinity downloads data only when a developer explicitly runs the dataset command; the archive and derived Parquet files are gitignored.

All adapters normalize interactions to `(user_id, item_id, timestamp, implicit_weight)`. Splits are per-user temporal holdouts: training always precedes validation, which always precedes test. Features and negative samples must be computed from the training partition only.

The tiny fixture used in unit tests is generated, deterministic, and labeled synthetic. It exists to validate behavior—not to support performance or quality claims.

