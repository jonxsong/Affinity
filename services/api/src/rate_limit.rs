use std::{
    collections::HashMap,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LimitDecision {
    pub allowed: bool,
    pub retry_after_seconds: u64,
}

#[derive(Debug)]
struct Bucket {
    window_started: Instant,
    requests: u32,
    last_seen: Instant,
}

#[derive(Debug)]
pub struct RateLimiter {
    buckets: Mutex<HashMap<String, Bucket>>,
    limit: u32,
    window: Duration,
    retention: Duration,
}

impl RateLimiter {
    pub fn per_minute(limit: u32) -> Self {
        Self::new(limit, Duration::from_secs(60))
    }

    pub fn new(limit: u32, window: Duration) -> Self {
        assert!(limit > 0, "rate limit must be greater than zero");
        assert!(!window.is_zero(), "rate-limit window must be non-zero");
        Self {
            buckets: Mutex::new(HashMap::new()),
            limit,
            window,
            retention: window.saturating_mul(2),
        }
    }

    pub async fn check(&self, key: &str) -> LimitDecision {
        self.check_at(key, Instant::now()).await
    }

    async fn check_at(&self, key: &str, now: Instant) -> LimitDecision {
        let mut buckets = self.buckets.lock().await;
        if buckets.len() > 1_000 {
            let retention = self.retention;
            buckets.retain(|_, bucket| now.duration_since(bucket.last_seen) <= retention);
        }

        let bucket = buckets.entry(key.to_owned()).or_insert(Bucket {
            window_started: now,
            requests: 0,
            last_seen: now,
        });
        bucket.last_seen = now;
        if now.duration_since(bucket.window_started) >= self.window {
            bucket.window_started = now;
            bucket.requests = 0;
        }

        if bucket.requests >= self.limit {
            return LimitDecision {
                allowed: false,
                retry_after_seconds: self
                    .window
                    .saturating_sub(now.duration_since(bucket.window_started))
                    .as_secs()
                    .max(1),
            };
        }

        bucket.requests += 1;
        LimitDecision {
            allowed: true,
            retry_after_seconds: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn rejects_requests_after_capacity_and_resets_next_window() {
        let limiter = RateLimiter::new(2, Duration::from_secs(10));
        let started = Instant::now();
        assert!(limiter.check_at("client", started).await.allowed);
        assert!(limiter.check_at("client", started).await.allowed);
        let limited = limiter
            .check_at("client", started + Duration::from_secs(4))
            .await;
        assert!(!limited.allowed);
        assert_eq!(limited.retry_after_seconds, 6);
        assert!(
            limiter
                .check_at("client", started + Duration::from_secs(10))
                .await
                .allowed
        );
    }

    #[tokio::test]
    async fn isolates_clients() {
        let limiter = RateLimiter::new(1, Duration::from_secs(60));
        assert!(limiter.check("client-a").await.allowed);
        assert!(!limiter.check("client-a").await.allowed);
        assert!(limiter.check("client-b").await.allowed);
    }
}
