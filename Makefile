.PHONY: setup dev seed train evaluate test benchmark benchmark-rust build

setup:
	pnpm install
	docker compose pull

dev:
	docker compose up --build

seed:
	docker compose run --rm ml python -m affinity_ml.datasets.seed

train:
	docker compose run --rm ml python -m affinity_ml.training.train

evaluate:
	docker compose run --rm ml python -m affinity_ml.evaluation.compare

test:
	pnpm test
	docker compose run --rm api cargo test
	docker compose run --rm ml pytest

benchmark:
	docker compose --profile benchmark run --rm k6 run /scripts/ingestion.js

benchmark-rust:
	cargo run --release --manifest-path services/api/Cargo.toml --bin affinity-benchmark -- --base-url http://localhost:8080 --requests 1000 --concurrency 16

build:
	pnpm build
	docker compose build

