FROM rust:1.100-slim AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY infrastructure/migrations ./infrastructure/migrations
COPY services/api ./services/api
RUN cargo build --release --package affinity-api

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 affinity
COPY --from=builder /app/target/release/affinity-api /usr/local/bin/affinity-api
USER affinity
EXPOSE 8080
ENTRYPOINT ["affinity-api"]

