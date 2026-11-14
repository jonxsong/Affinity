use chrono::Utc;
use reqwest::{Client, StatusCode};
use serde::Serialize;
use serde_json::json;
use std::{
    env,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tokio::{sync::Mutex, task::JoinSet};
use uuid::Uuid;

#[derive(Debug, Clone)]
struct Config {
    base_url: String,
    requests: usize,
    concurrency: usize,
}

impl Config {
    fn parse() -> Result<Self, String> {
        let mut base_url = "http://localhost:8080".to_owned();
        let mut requests = 1_000_usize;
        let mut concurrency = 16_usize;
        let mut arguments = env::args().skip(1);
        while let Some(argument) = arguments.next() {
            let value = arguments
                .next()
                .ok_or_else(|| format!("{argument} requires a value"))?;
            match argument.as_str() {
                "--base-url" => base_url = value.trim_end_matches('/').to_owned(),
                "--requests" => {
                    requests = value
                        .parse()
                        .map_err(|_| "--requests must be an integer".to_owned())?;
                }
                "--concurrency" => {
                    concurrency = value
                        .parse()
                        .map_err(|_| "--concurrency must be an integer".to_owned())?;
                }
                _ => return Err(format!("unknown argument: {argument}")),
            }
        }
        if requests < 2 || concurrency == 0 || concurrency > 1_024 {
            return Err("requests must be at least 2 and concurrency must be 1..=1024".into());
        }
        Ok(Self {
            base_url,
            requests,
            concurrency: concurrency.min(requests),
        })
    }
}

#[derive(Debug, Serialize)]
struct LatencySummary {
    p50_ms: f64,
    p95_ms: f64,
    p99_ms: f64,
    maximum_ms: f64,
}

#[derive(Debug, Serialize)]
struct BenchmarkReport {
    schema_version: u16,
    measured_at: String,
    base_url: String,
    requests: usize,
    concurrency: usize,
    successful: usize,
    failed: usize,
    wall_time_ms: f64,
    requests_per_second: f64,
    latency: LatencySummary,
    runtime: Runtime,
    disclaimer: &'static str,
}

#[derive(Debug, Serialize)]
struct Runtime {
    os: &'static str,
    architecture: &'static str,
    logical_cpus: usize,
}

fn percentile(samples: &[Duration], percentile: f64) -> Duration {
    let index = ((samples.len().saturating_sub(1)) as f64 * percentile).round() as usize;
    samples[index.min(samples.len().saturating_sub(1))]
}

fn milliseconds(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1_000.0
}

async fn execute(client: &Client, base_url: &str, user_id: &str, index: usize) -> StatusCode {
    if index.is_multiple_of(2) {
        let content_id = ["item_101", "item_201", "item_301", "item_401"][index % 4];
        client
            .post(format!("{base_url}/v1/events"))
            .json(&json!({
                "event_id":Uuid::new_v4(),
                "user_id":user_id,
                "content_id":content_id,
                "event_type":if index.is_multiple_of(6) {"save"} else {"click"},
                "timestamp":Utc::now(),
                "session_id":format!("benchmark-{user_id}"),
                "context":{"benchmark":true},
                "surface":"rust-benchmark",
                "schema_version":1
            }))
            .send()
            .await
            .map(|response| response.status())
            .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR)
    } else {
        client
            .get(format!("{base_url}/v1/recommendations/{user_id}?limit=10"))
            .send()
            .await
            .map(|response| response.status())
            .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR)
    }
}

#[tokio::main]
async fn main() {
    let config = Config::parse().unwrap_or_else(|error| {
        eprintln!(
            "{error}\nusage: affinity-benchmark [--base-url URL] [--requests N] [--concurrency N]"
        );
        std::process::exit(2);
    });
    let client = Client::builder()
        .pool_max_idle_per_host(config.concurrency)
        .timeout(Duration::from_secs(10))
        .build()
        .expect("build HTTP client");
    let next = Arc::new(AtomicUsize::new(0));
    let samples = Arc::new(Mutex::new(Vec::with_capacity(config.requests)));
    let successful = Arc::new(AtomicUsize::new(0));
    let failed = Arc::new(AtomicUsize::new(0));
    let user_id = format!("benchmark_{}", Uuid::new_v4().simple());
    let wall_started = Instant::now();
    let mut workers = JoinSet::new();

    for _ in 0..config.concurrency {
        let client = client.clone();
        let base_url = config.base_url.clone();
        let user_id = user_id.clone();
        let next = Arc::clone(&next);
        let samples = Arc::clone(&samples);
        let successful = Arc::clone(&successful);
        let failed = Arc::clone(&failed);
        let request_count = config.requests;
        workers.spawn(async move {
            loop {
                let index = next.fetch_add(1, Ordering::Relaxed);
                if index >= request_count {
                    break;
                }
                let started = Instant::now();
                let status = execute(&client, &base_url, &user_id, index).await;
                let elapsed = started.elapsed();
                if status.is_success() {
                    successful.fetch_add(1, Ordering::Relaxed);
                } else {
                    failed.fetch_add(1, Ordering::Relaxed);
                }
                samples.lock().await.push(elapsed);
            }
        });
    }
    while let Some(result) = workers.join_next().await {
        result.expect("benchmark worker panicked");
    }

    let wall_time = wall_started.elapsed();
    let mut samples = samples.lock().await.clone();
    samples.sort_unstable();
    let report = BenchmarkReport {
        schema_version: 1,
        measured_at: Utc::now().to_rfc3339(),
        base_url: config.base_url,
        requests: config.requests,
        concurrency: config.concurrency,
        successful: successful.load(Ordering::Relaxed),
        failed: failed.load(Ordering::Relaxed),
        wall_time_ms: milliseconds(wall_time),
        requests_per_second: config.requests as f64 / wall_time.as_secs_f64(),
        latency: LatencySummary {
            p50_ms: milliseconds(percentile(&samples, 0.50)),
            p95_ms: milliseconds(percentile(&samples, 0.95)),
            p99_ms: milliseconds(percentile(&samples, 0.99)),
            maximum_ms: milliseconds(*samples.last().expect("samples are non-empty")),
        },
        runtime: Runtime {
            os: env::consts::OS,
            architecture: env::consts::ARCH,
            logical_cpus: std::thread::available_parallelism()
                .map(usize::from)
                .unwrap_or(1),
        },
        disclaimer: "Measured on the named runtime and workload; not a universal production claim.",
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&report).expect("serialize report")
    );
    if report.failed > 0 {
        std::process::exit(1);
    }
}
