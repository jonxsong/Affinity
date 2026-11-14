use reqwest::{header, Client};
use serde::Deserialize;
use serde_json::Value;
use std::{env, time::Duration};

#[derive(Debug)]
struct Config {
    source: String,
    destination: String,
    user_id: String,
    client_id: Option<String>,
    source_token: String,
    destination_token: String,
}

impl Config {
    fn parse() -> Result<Self, String> {
        let mut source = None;
        let mut destination = None;
        let mut user_id = None;
        let mut client_id = None;
        let mut arguments = env::args().skip(1);
        while let Some(argument) = arguments.next() {
            let value = arguments
                .next()
                .ok_or_else(|| format!("{argument} requires a value"))?;
            match argument.as_str() {
                "--source" => source = Some(value.trim_end_matches('/').to_owned()),
                "--destination" => destination = Some(value.trim_end_matches('/').to_owned()),
                "--user-id" => user_id = Some(value),
                "--client-id" => client_id = Some(value),
                _ => return Err(format!("unknown argument: {argument}")),
            }
        }
        let required_env = |name| {
            env::var(name)
                .ok()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| format!("{name} is required"))
        };
        Ok(Self {
            source: source.ok_or_else(|| "--source is required".to_owned())?,
            destination: destination.ok_or_else(|| "--destination is required".to_owned())?,
            user_id: user_id.ok_or_else(|| "--user-id is required".to_owned())?,
            client_id,
            source_token: required_env("AFFINITY_SOURCE_TOKEN")?,
            destination_token: required_env("AFFINITY_DESTINATION_TOKEN")?,
        })
    }
}

#[derive(Debug, Deserialize)]
struct ExportSummary {
    schema_version: u16,
    event_count: usize,
    events: Vec<Value>,
}

#[derive(Debug, Deserialize)]
struct ImportSummary {
    status: String,
    accepted: usize,
    duplicates: usize,
    total: usize,
}

fn add_identity(
    request: reqwest::RequestBuilder,
    client_id: Option<&str>,
) -> reqwest::RequestBuilder {
    match client_id {
        Some(client_id) => request.header("x-affinity-client-id", client_id),
        None => request,
    }
}

async fn response_error(response: reqwest::Response) -> String {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    let message = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|value| value.pointer("/error/message")?.as_str().map(str::to_owned))
        .unwrap_or_else(|| "remote Affinity API rejected the request".into());
    format!("{status}: {message}")
}

#[tokio::main]
async fn main() {
    let config = Config::parse().unwrap_or_else(|error| {
        eprintln!(
            "{error}\nusage: affinity-sync --source URL --destination URL --user-id ID [--client-id ID]\n\
             tokens: AFFINITY_SOURCE_TOKEN and AFFINITY_DESTINATION_TOKEN"
        );
        std::process::exit(2);
    });
    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .expect("build HTTP client");
    let export_request = client
        .get(format!(
            "{}/v1/sync/export/{}",
            config.source,
            urlencoding::encode(&config.user_id)
        ))
        .header(
            header::AUTHORIZATION,
            format!("Bearer {}", config.source_token),
        );
    let export_response = add_identity(export_request, config.client_id.as_deref())
        .send()
        .await
        .unwrap_or_else(|error| {
            eprintln!("source request failed: {error}");
            std::process::exit(1);
        });
    if !export_response.status().is_success() {
        eprintln!(
            "source export failed: {}",
            response_error(export_response).await
        );
        std::process::exit(1);
    }
    let export: ExportSummary = export_response.json().await.unwrap_or_else(|error| {
        eprintln!("source returned an invalid export: {error}");
        std::process::exit(1);
    });
    if export.schema_version != 1 || export.event_count != export.events.len() {
        eprintln!("source export metadata does not match its event payload");
        std::process::exit(1);
    }

    let import_request = client
        .post(format!("{}/v1/sync/import", config.destination))
        .header(
            header::AUTHORIZATION,
            format!("Bearer {}", config.destination_token),
        )
        .json(&serde_json::json!({
            "schema_version":1,
            "events":export.events
        }));
    let import_response = add_identity(import_request, config.client_id.as_deref())
        .send()
        .await
        .unwrap_or_else(|error| {
            eprintln!("destination request failed: {error}");
            std::process::exit(1);
        });
    if !import_response.status().is_success() {
        eprintln!(
            "destination import failed: {}",
            response_error(import_response).await
        );
        std::process::exit(1);
    }
    let imported: ImportSummary = import_response.json().await.unwrap_or_else(|error| {
        eprintln!("destination returned an invalid import result: {error}");
        std::process::exit(1);
    });
    println!(
        "{}",
        serde_json::json!({
            "status":imported.status,
            "user_id":config.user_id,
            "source":config.source,
            "destination":config.destination,
            "exported":export.event_count,
            "accepted":imported.accepted,
            "duplicates":imported.duplicates,
            "total":imported.total
        })
    );
}
