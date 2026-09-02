//! Stateful mock state store — in-memory HashMap with optional SQLite persistence.
//! Scoped per mock server session. Used for POST /users → GET /users/{id} flows.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StateOperation {
    Create,
    Read,
    List,
    Update,
    Delete,
    None,
}

impl Default for StateOperation {
    fn default() -> Self {
        Self::None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MockStateConfig {
    /// Scope key, e.g. "users" — all routes sharing scope share state
    #[serde(default)]
    pub scope: String,
    #[serde(default)]
    pub operation: StateOperation,
    /// Where to extract the key from: "path.id", "body.id", "query.id", "auto"
    #[serde(default)]
    pub key_from: String,
}

#[derive(Debug, Clone)]
pub struct MockState {
    inner: Arc<Mutex<HashMap<String, Value>>>,
    sqlite_path: Option<PathBuf>,
}

impl MockState {
    pub fn new(sqlite_path: Option<PathBuf>) -> Self {
        let store = Arc::new(Mutex::new(HashMap::new()));
        // If sqlite path exists, try to load
        if let Some(ref p) = sqlite_path {
            if p.exists() {
                if let Ok(conn) = rusqlite::Connection::open(p) {
                    let _ = conn.execute(
                        "CREATE TABLE IF NOT EXISTS mock_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
                        [],
                    );
                    if let Ok(mut stmt) = conn.prepare("SELECT key, value FROM mock_state") {
                        if let Ok(rows) = stmt.query_map([], |row| {
                            let k: String = row.get(0)?;
                            let v: String = row.get(1)?;
                            Ok((k, v))
                        }) {
                            let mut map = store.lock().unwrap();
                            for r in rows.flatten() {
                                if let Ok(val) = serde_json::from_str::<Value>(&r.1) {
                                    map.insert(r.0, val);
                                }
                            }
                        }
                    }
                }
            }
        }
        Self {
            inner: store,
            sqlite_path,
        }
    }

    fn persist(&self, key: &str, value: &Value) {
        if let Some(ref p) = self.sqlite_path {
            if let Some(parent) = p.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if let Ok(conn) = rusqlite::Connection::open(p) {
                let _ = conn.execute(
                    "CREATE TABLE IF NOT EXISTS mock_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
                    [],
                );
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO mock_state (key, value) VALUES (?1, ?2)",
                    rusqlite::params![key, serde_json::to_string(value).unwrap_or_default()],
                );
            }
        }
    }

    fn remove_persist(&self, key: &str) {
        if let Some(ref p) = self.sqlite_path {
            if let Ok(conn) = rusqlite::Connection::open(p) {
                let _ = conn.execute("DELETE FROM mock_state WHERE key = ?1", rusqlite::params![key]);
            }
        }
    }

    pub fn get(&self, key: &str) -> Option<Value> {
        self.inner.lock().unwrap().get(key).cloned()
    }

    pub fn set(&self, key: String, value: Value) {
        self.persist(&key, &value);
        self.inner.lock().unwrap().insert(key, value);
    }

    pub fn delete(&self, key: &str) -> Option<Value> {
        self.remove_persist(key);
        self.inner.lock().unwrap().remove(key)
    }

    pub fn list(&self, prefix: &str) -> Vec<Value> {
        let map = self.inner.lock().unwrap();
        map.iter()
            .filter(|(k, _)| k.starts_with(prefix))
            .map(|(_, v)| v.clone())
            .collect()
    }

    pub fn clear(&self) {
        if let Some(ref p) = self.sqlite_path {
            if let Ok(conn) = rusqlite::Connection::open(p) {
                let _ = conn.execute("DELETE FROM mock_state", []);
            }
        }
        self.inner.lock().unwrap().clear();
    }

    pub fn snapshot(&self) -> HashMap<String, Value> {
        self.inner.lock().unwrap().clone()
    }

    pub fn set_bulk(&self, map: HashMap<String, Value>) {
        {
            let mut inner = self.inner.lock().unwrap();
            *inner = map.clone();
        }
        if let Some(ref p) = self.sqlite_path {
            if let Some(parent) = p.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if let Ok(conn) = rusqlite::Connection::open(p) {
                let _ = conn.execute("CREATE TABLE IF NOT EXISTS mock_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)", []);
                let _ = conn.execute("DELETE FROM mock_state", []);
                for (k, v) in map {
                    let _ = conn.execute(
                        "INSERT OR REPLACE INTO mock_state (key, value) VALUES (?1, ?2)",
                        rusqlite::params![k, serde_json::to_string(&v).unwrap_or_default()],
                    );
                }
            }
        }
    }
}

impl Default for MockState {
    fn default() -> Self {
        Self::new(None)
    }
}

/// Helpers for stateful route handling
pub fn extract_key_from_request(
    config: &MockStateConfig,
    path: &str,
    route_path: &str,
    query: &str,
    body: &str,
) -> Option<String> {
    let from = if config.key_from.is_empty() { "auto" } else { &config.key_from };
    match from {
        "path.id" | "path" => extract_path_param(path, route_path),
        "query.id" | "query" => extract_query_param(query, "id"),
        "body.id" | "body" => extract_body_param(body, "id"),
        "auto" => {
            // Try path first, then query, then body
            extract_path_param(path, route_path)
                .or_else(|| extract_query_param(query, "id"))
                .or_else(|| extract_body_param(body, "id"))
        }
        other => {
            // Custom key like "body.userId" or "query.user_id"
            if let Some(stripped) = other.strip_prefix("path.") {
                extract_path_param_named(path, route_path, stripped)
            } else if let Some(stripped) = other.strip_prefix("query.") {
                extract_query_param(query, stripped)
            } else if let Some(stripped) = other.strip_prefix("body.") {
                extract_body_param(body, stripped)
            } else {
                None
            }
        }
    }
}

fn extract_path_param(request_path: &str, route_path: &str) -> Option<String> {
    // Route path may contain {id} or :id — we handle {id} and :id
    // For state, we just take the last segment of request path as id if route has param
    if route_path.contains("{") || route_path.contains(':') {
        // Take last segment
        request_path
            .split('/')
            .next_back()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
    } else {
        None
    }
}

fn extract_path_param_named(request_path: &str, route_path: &str, param: &str) -> Option<String> {
    // Simple: if route contains {param} or :param, extract that segment
    let route_segments: Vec<&str> = route_path.split('/').collect();
    let req_segments: Vec<&str> = request_path.split('/').collect();
    for (i, seg) in route_segments.iter().enumerate() {
        let clean = seg.trim_matches(|c| c == '{' || c == '}' || c == ':');
        // Handle {id?} optional
        let clean = clean.trim_end_matches('?');
        if clean == param {
            if let Some(val) = req_segments.get(i) {
                if !val.is_empty() {
                    return Some(val.to_string());
                }
            }
        }
    }
    None
}

fn extract_query_param(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            if k == key {
                return Some(v.to_string());
            }
        }
    }
    None
}

fn extract_body_param(body: &str, key: &str) -> Option<String> {
    if body.is_empty() {
        return None;
    }
    if let Ok(val) = serde_json::from_str::<Value>(body) {
        if let Some(v) = val.get(key) {
            return Some(match v {
                Value::String(s) => s.clone(),
                _ => v.to_string(),
            });
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn state_crud() {
        let state = MockState::new(None);
        state.set("users:123".to_string(), json!({"id":"123","name":"Alice"}));
        assert_eq!(state.get("users:123").unwrap()["name"], "Alice");
        state.delete("users:123");
        assert!(state.get("users:123").is_none());
    }

    #[test]
    fn state_list() {
        let state = MockState::new(None);
        state.set("users:1".into(), json!({"id":1}));
        state.set("users:2".into(), json!({"id":2}));
        state.set("products:1".into(), json!({"id":1}));
        assert_eq!(state.list("users:").len(), 2);
        assert_eq!(state.list("products:").len(), 1);
    }

    #[test]
    fn extract_keys() {
        assert_eq!(
            extract_path_param("/users/123", "/users/{id}").as_deref(),
            Some("123")
        );
        assert_eq!(
            extract_query_param("id=42&foo=bar", "id").as_deref(),
            Some("42")
        );
        assert_eq!(
            extract_body_param(r#"{"id":"99","name":"Bob"}"#, "id").as_deref(),
            Some("99")
        );
    }
}
