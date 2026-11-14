.PHONY: setup dev seed train evaluate test benchmark build

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

build:
	pnpm build
	docker compose build

