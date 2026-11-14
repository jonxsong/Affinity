FROM rust:1.83-slim AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY services/api ./services/api
RUN cargo build --release --package affinity-api

FROM debian:bookworm-slim
RUN useradd --system --uid 10001 affinity
COPY --from=builder /app/target/release/affinity-api /usr/local/bin/affinity-api
USER affinity
EXPOSE 8080
ENTRYPOINT ["affinity-api"]

