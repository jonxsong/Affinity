use std::{net::SocketAddr, str::FromStr};

#[derive(Debug, Clone)]
pub struct Config {
    pub address: SocketAddr,
    pub database_url: String,
    pub admin_token: String,
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("{name} is required")]
    Missing { name: &'static str },
    #[error("AFFINITY_API_ADDR is invalid: {0}")]
    InvalidAddress(#[from] std::net::AddrParseError),
    #[error("AFFINITY_ADMIN_TOKEN must contain at least 16 characters")]
    WeakAdminToken,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let address = std::env::var("AFFINITY_API_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into());
        let database_url = required("DATABASE_URL")?;
        let admin_token = required("AFFINITY_ADMIN_TOKEN")?;
        Self {
            address: SocketAddr::from_str(&address)?,
            database_url,
            admin_token,
        }
        .validate()
    }

    fn validate(self) -> Result<Self, ConfigError> {
        if self.admin_token.len() < 16 {
            Err(ConfigError::WeakAdminToken)
        } else {
            Ok(self)
        }
    }
}

fn required(name: &'static str) -> Result<String, ConfigError> {
    std::env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .ok_or(ConfigError::Missing { name })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weak_tokens_are_rejected() {
        let config = Config {
            address: "127.0.0.1:8080".parse().unwrap(),
            database_url: "postgres://local".into(),
            admin_token: "short".into(),
        };
        assert!(matches!(
            config.validate(),
            Err(ConfigError::WeakAdminToken)
        ));
    }
}
