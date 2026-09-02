//! Rust-native HTTP engine (reqwest + rustls). Streams response bodies to
//! memory in chunks while timing the transfer, resolves `{{variables}}` and
//! built-in dynamic variables, and mirrors the renderer's ResponseData shape.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{Duration, Instant};

pub type Headers = HashMap<String, String>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Timing {
    pub dns: u64,
    pub tcp: u64,
    pub tls: u64,
    pub ttfb: u64,
    pub download: u64,
    pub total: u64,
}

impl Default for Timing {
    fn default() -> Self {
        Self { dns: 0, tcp: 0, tls: 0, ttfb: 0, download: 0, total: 0 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse {
    pub id: String,
    pub status_code: u16,
    pub status_text: String,
    pub headers: Headers,
    pub body: String,
    pub content_type: String,
    pub response_time: u64,
    pub size: u64,
    pub timeline: Timing,
    pub cookies: Vec<Cookie>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cookie {
    pub name: String,
    pub value: String,
    pub domain: String,
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestInput {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<KeyValuePair>,
    #[serde(default)]
    pub params: Vec<KeyValuePair>,
    #[serde(default)]
    pub body_type: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub follow_redirects: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyValuePair {
    pub key: String,
    pub value: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

fn random_string(len: usize) -> String {
    const CHARS: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut out = String::with_capacity(len);
    for _ in 0..len {
        let idx = (uuid::Uuid::new_v4().as_u128() as usize) % CHARS.len();
        out.push(CHARS[idx] as char);
    }
    out
}

/// Resolve `{{key}}` placeholders from the environment map plus built-in
/// dynamic variables (`{{$timestamp}}`, `{{$randomUUID}}`, `{{$randomEmail}}`, `{{$isoTimestamp}}`,
/// `{{$uuid}}`, `{{$randomInt(min,max)}}`, `{{$randomString(len)}}`, `{{$unixTimestamp}}`).
/// Unknown `{{$...}}` tokens are left untouched.
pub fn resolve(input: &str, vars: &HashMap<String, String>) -> String {
    let mut out = input.to_string();
    for (k, v) in vars {
        let token = format!("{{{{{}}}}}", k);
        if out.contains(&token) {
            out = out.replace(&token, v);
        }
    }
    let mut iterations = 0;
    while let Some(start) = out.find("{{$") {
        if iterations > 20 {
            break;
        }
        iterations += 1;
        let Some(end_rel) = out[start..].find("}}") else { break };
        let token = out[start..start + end_rel + 2].to_string();
        let inner = token.trim_matches(|c| c == '{' || c == '}').trim_start_matches('$');
        // Split name and optional args: name(args)
        let (name, args_str) = if let Some(paren) = inner.find('(') {
            let name_part = &inner[..paren];
            let args_part = inner[paren..].trim_matches(|c| c == '(' || c == ')');
            (name_part.trim(), Some(args_part))
        } else {
            (inner.trim(), None)
        };
        let value: Option<String> = match name {
            "timestamp" | "unixTimestamp" => Some(chrono::Utc::now().timestamp().to_string()),
            "isoTimestamp" => Some(chrono::Utc::now().to_rfc3339()),
            "randomUUID" | "uuid" => Some(uuid::Uuid::new_v4().to_string()),
            "randomEmail" => Some(format!("{}@example.com", uuid::Uuid::new_v4().simple())),
            "randomInt" => {
                let (min, max) = if let Some(a) = args_str {
                    let parts: Vec<&str> = a.split(',').map(|s| s.trim()).collect();
                    let min = parts.first().and_then(|s| s.parse::<i64>().ok()).unwrap_or(0);
                    let max = parts.get(1).and_then(|s| s.parse::<i64>().ok()).unwrap_or(100);
                    (min, max)
                } else {
                    (0, 100)
                };
                if min <= max {
                    let range = (max - min + 1) as u128;
                    let v = (uuid::Uuid::new_v4().as_u128() % range) as i64 + min;
                    Some(v.to_string())
                } else {
                    Some(min.to_string())
                }
            }
            "randomString" => {
                let len = args_str.and_then(|a| a.split(',').next().and_then(|s| s.trim().parse::<usize>().ok())).unwrap_or(10);
                Some(random_string(len.min(100)))
            }
            _ => None,
        };
        if let Some(v) = value {
            out = out.replace(&token, &v);
        } else {
            break; // leave unknown tokens untouched to avoid loops
        }
    }
    out
}

fn enabled_pairs(pairs: &[KeyValuePair], vars: &HashMap<String, String>) -> Vec<(String, String)> {
    pairs
        .iter()
        .filter(|p| p.enabled && !p.key.is_empty())
        .map(|p| (resolve(&p.key, vars), resolve(&p.value, vars)))
        .collect()
}

fn content_type_for(body_type: &str) -> Option<&'static str> {
    match body_type {
        "json" | "graphql" => Some("application/json"),
        "xml" => Some("application/xml"),
        "text" => Some("text/plain"),
        "urlencoded" => Some("application/x-www-form-urlencoded"),
        "form-data" => Some("multipart/form-data"),
        _ => None,
    }
}

fn parse_pairs_for_form(body: &str) -> Vec<(String, String)> {
    // Try JSON object/array first, then key=value lines
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(body) {
        match val {
            serde_json::Value::Object(map) => {
                return map.into_iter().map(|(k, v)| {
                    let vs = match v {
                        serde_json::Value::String(s) => s,
                        other => other.to_string(),
                    };
                    (k, vs)
                }).collect();
            }
            serde_json::Value::Array(arr) => {
                let mut out = Vec::new();
                for item in arr {
                    if let serde_json::Value::Object(map) = item {
                        if let Some((k, v)) = map.get("key").and_then(|k| k.as_str()).zip(map.get("value")) {
                            let vs = match v {
                                serde_json::Value::String(s) => s.clone(),
                                other => other.to_string(),
                            };
                            out.push((k.to_string(), vs));
                        }
                    }
                }
                if !out.is_empty() { return out; }
            }
            _ => {}
        }
    }
    body.lines()
        .filter_map(|l| l.split_once('='))
        .map(|(k, v)| (k.trim().to_string(), v.trim().to_string()))
        .filter(|(k, _)| !k.is_empty())
        .collect()
}

fn build_multipart(pairs: &[(String, String)]) -> (Vec<u8>, String) {
    let boundary = format!("----APIForgeBoundary{}", uuid::Uuid::new_v4().simple());
    let mut body: Vec<u8> = Vec::new();
    for (k, v) in pairs {
        body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
        body.extend_from_slice(format!("Content-Disposition: form-data; name=\"{}\"\r\n\r\n", k).as_bytes());
        body.extend_from_slice(v.as_bytes());
        body.extend_from_slice(b"\r\n");
    }
    body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());
    (body, format!("multipart/form-data; boundary={}", boundary))
}

fn encode_body(body_type: &str, body: &str, vars: &HashMap<String, String>) -> (Vec<u8>, Option<String>) {
    let resolved = resolve(body, vars);
    match body_type {
        "none" | "binary" => (Vec::new(), None),
        "json" => (resolved.into_bytes(), Some("application/json".into())),
        "graphql" => {
            let payload = if resolved.trim_start().starts_with('{') {
                resolved
            } else {
                serde_json::json!({ "query": resolved }).to_string()
            };
            (payload.into_bytes(), Some("application/json".into()))
        }
        "xml" => (resolved.into_bytes(), Some("application/xml".into())),
        "text" => (resolved.into_bytes(), Some("text/plain".into())),
        "urlencoded" => {
            let encoded = resolved
                .split('\n')
                .filter_map(|line| line.split_once('='))
                .map(|(k, v)| format!("{}={}", k.trim(), v.trim()))
                .collect::<Vec<_>>()
                .join("&");
            (encoded.into_bytes(), Some("application/x-www-form-urlencoded".into()))
        }
        "form-data" => {
            let pairs = parse_pairs_for_form(&resolved);
            if pairs.is_empty() {
                (Vec::new(), None)
            } else {
                let (bytes, ct) = build_multipart(&pairs);
                (bytes, Some(ct))
            }
        }
        _ => (resolved.into_bytes(), None),
    }
}

/// Execute an HTTP request, streaming the body in chunks while timing phases.
pub async fn execute(input: &RequestInput, vars: &HashMap<String, String>) -> ApiResponse {
    let started = Instant::now();
    let mut url = resolve(&input.url, vars);
    let params = enabled_pairs(&input.params, vars);
    if !params.is_empty() {
        let qs: Vec<String> = params
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect();
        url.push_str(if url.contains('?') { "&" } else { "?" });
        url.push_str(&qs.join("&"));
    }

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(input.timeout_ms.unwrap_or(30_000)))
        .redirect(if input.follow_redirects.unwrap_or(true) {
            reqwest::redirect::Policy::limited(5)
        } else {
            reqwest::redirect::Policy::none()
        })
        .build()
    {
        Ok(c) => c,
        Err(e) => return error_response(&e.to_string()),
    };

    let method = reqwest::Method::from_bytes(input.method.to_uppercase().as_bytes())
        .unwrap_or(reqwest::Method::GET);
    let mut req = client.request(method, &url);
    for (k, v) in enabled_pairs(&input.headers, vars) {
        req = req.header(&k, &v);
    }
    let sends_body = !matches!(input.method.to_uppercase().as_str(), "GET" | "HEAD")
        && !matches!(input.body_type.as_str(), "none" | "binary");
    if sends_body {
        let (payload, ct) = encode_body(&input.body_type, &input.body, vars);
        let user_ct = enabled_pairs(&input.headers, vars)
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("content-type"))
            .map(|(_, v)| v.clone());
        if let Some(ct) = user_ct.or_else(|| ct.or_else(|| content_type_for(&input.body_type).map(String::from))) {
            req = req.header("Content-Type", ct);
        }
        req = req.body(payload);
    }

    let response = match req.send().await {
        Ok(r) => r,
        Err(e) => return error_response(&e.to_string()),
    };
    let ttfb = started.elapsed().as_millis() as u64;

    let status = response.status();
    let mut headers: Headers = HashMap::new();
    for (k, v) in response.headers() {
        if let Ok(v) = v.to_str() {
            headers.insert(k.to_string(), v.to_string());
        }
    }
    let content_type = headers
        .get("content-type")
        .cloned()
        .unwrap_or_else(|| "text/plain".into());
    let cookies: Vec<Cookie> = response
        .cookies()
        .map(|c| Cookie {
            name: c.name().into(),
            value: c.value().into(),
            domain: c.domain().unwrap_or("").into(),
            path: c.path().unwrap_or("").into(),
        })
        .collect();

    // Stream the body in chunks so large payloads stay responsive.
    let mut body: Vec<u8> = Vec::new();
    {
        use futures_util::StreamExt;
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => body.extend_from_slice(&bytes),
                Err(e) => return error_response(&e.to_string()),
            }
        }
    }
    let total = started.elapsed().as_millis() as u64;
    let download = total.saturating_sub(ttfb);

    ApiResponse {
        id: uuid::Uuid::new_v4().to_string(),
        status_code: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        headers,
        body: String::from_utf8_lossy(&body).to_string(),
        content_type,
        response_time: total,
        size: body.len() as u64,
        timeline: Timing { ttfb, download, total, ..Default::default() },
        cookies,
        error: None,
    }
}

fn error_response(message: &str) -> ApiResponse {
    ApiResponse {
        id: uuid::Uuid::new_v4().to_string(),
        status_code: 0,
        status_text: "Error".into(),
        headers: Headers::new(),
        body: message.into(),
        content_type: "text/plain".into(),
        response_time: 0,
        size: 0,
        timeline: Timing::default(),
        cookies: vec![],
        error: Some(message.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_static_and_dynamic_variables() {
        let mut vars = HashMap::new();
        vars.insert("base".to_string(), "https://x.io".to_string());
        assert_eq!(resolve("{{base}}/users", &vars), "https://x.io/users");
        assert_eq!(resolve("{{$randomUUID}}", &vars).len(), 36);
        assert!(resolve("{{$randomEmail}}", &vars).ends_with("@example.com"));
        assert_eq!(resolve("{{$unknownToken}}", &vars), "{{$unknownToken}}");
    }

    #[test]
    fn encodes_graphql_bodies() {
        let (payload, ct) = encode_body("graphql", "query { users }", &HashMap::new());
        assert_eq!(ct.as_deref(), Some("application/json"));
        assert!(String::from_utf8_lossy(&payload).contains("\"query\""));
    }

    #[test]
    fn urlencoded_bodies_are_serialized() {
        let (payload, ct) = encode_body("urlencoded", "a=1\nb=2", &HashMap::new());
        assert_eq!(ct.as_deref(), Some("application/x-www-form-urlencoded"));
        assert_eq!(String::from_utf8_lossy(&payload), "a=1&b=2");
    }
}