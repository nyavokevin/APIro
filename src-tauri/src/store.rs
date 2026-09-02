//! Local persistence: request history + cookies in SQLite, settings in the
//! same DB. No cloud, no telemetry.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Store {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub id: String,
    pub request_id: Option<String>,
    pub method: String,
    pub url: String,
    pub status_code: Option<u16>,
    pub response_time: Option<u64>,
    pub request_headers: String,
    pub response_headers: String,
    pub response_body: String,
    pub error: Option<String>,
    pub timestamp: i64,
    #[serde(default)]
    pub request_params: String,
    #[serde(default)]
    pub request_body: String,
    #[serde(default)]
    pub request_body_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CookieRow {
    pub domain: String,
    pub name: String,
    pub value: String,
    pub path: String,
    pub expires: Option<i64>,
}

fn db_path() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("apiforge").join("store.db")
}

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS request_history (
    id TEXT PRIMARY KEY,
    request_id TEXT,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    status_code INTEGER,
    response_time INTEGER,
    request_headers TEXT DEFAULT '{}',
    response_headers TEXT DEFAULT '{}',
    response_body TEXT DEFAULT '',
    error TEXT,
    timestamp INTEGER NOT NULL,
    request_params TEXT DEFAULT '[]',
    request_body TEXT DEFAULT '',
    request_body_type TEXT DEFAULT 'none'
);
CREATE INDEX IF NOT EXISTS idx_history_timestamp ON request_history(timestamp);
CREATE TABLE IF NOT EXISTS cookies (
    domain TEXT NOT NULL,
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    path TEXT NOT NULL DEFAULT '/',
    expires INTEGER,
    PRIMARY KEY (domain, name, path)
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);";

impl Store {
    pub fn open() -> Result<Self, String> {
        let path = db_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
        // Migration for existing DBs: add new columns if missing (ignore errors)
        let _ = conn.execute("ALTER TABLE request_history ADD COLUMN request_params TEXT DEFAULT '[]'", []);
        let _ = conn.execute("ALTER TABLE request_history ADD COLUMN request_body TEXT DEFAULT ''", []);
        let _ = conn.execute("ALTER TABLE request_history ADD COLUMN request_body_type TEXT DEFAULT 'none'", []);
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn record_history(
        &self,
        request_id: Option<&str>,
        method: &str,
        url: &str,
        status_code: Option<u16>,
        response_time: Option<u64>,
        request_headers: &str,
        response_headers: &str,
        response_body: &str,
        error: Option<&str>,
        request_params: &str,
        request_body: &str,
        request_body_type: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|_| "poisoned")?;
        conn.execute(
            "INSERT INTO request_history
             (id, request_id, method, url, status_code, response_time, request_headers, response_headers, response_body, error, timestamp, request_params, request_body, request_body_type)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            rusqlite::params![
                uuid::Uuid::new_v4().to_string(),
                request_id,
                method,
                url,
                status_code,
                response_time,
                request_headers,
                response_headers,
                truncate(response_body, 100_000),
                error,
                chrono::Utc::now().timestamp_millis(),
                request_params,
                truncate(request_body, 100_000),
                request_body_type
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn history(&self, limit: u32) -> Result<Vec<HistoryItem>, String> {
        let conn = self.conn.lock().map_err(|_| "poisoned")?;
        let mut stmt = conn
            .prepare("SELECT id, request_id, method, url, status_code, response_time, request_headers, response_headers, response_body, error, timestamp, request_params, request_body, request_body_type FROM request_history ORDER BY timestamp DESC LIMIT ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([limit], |row| {
                Ok(HistoryItem {
                    id: row.get(0)?,
                    request_id: row.get(1)?,
                    method: row.get(2)?,
                    url: row.get(3)?,
                    status_code: row.get(4)?,
                    response_time: row.get(5)?,
                    request_headers: row.get(6)?,
                    response_headers: row.get(7)?,
                    response_body: row.get(8)?,
                    error: row.get(9)?,
                    timestamp: row.get(10)?,
                    request_params: row.get::<_, Option<String>>(11)?.unwrap_or_else(|| "[]".to_string()),
                    request_body: row.get::<_, Option<String>>(12)?.unwrap_or_default(),
                    request_body_type: row.get::<_, Option<String>>(13)?.unwrap_or_else(|| "none".to_string()),
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }
}

fn truncate(s: &str, max_chars: usize) -> String {
    if s.len() <= max_chars {
        s.to_string()
    } else {
        let mut end = max_chars;
        while !s.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}…", &s[..end])
    }
}

impl Store {
    pub fn put_cookie(&self, cookie: &CookieRow) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|_| "poisoned")?;
        conn.execute(
            "INSERT INTO cookies (domain, name, value, path, expires) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(domain, name, path) DO UPDATE SET value = excluded.value, expires = excluded.expires",
            rusqlite::params![cookie.domain, cookie.name, cookie.value, cookie.path, cookie.expires],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn cookies_for(&self, domain: &str) -> Result<Vec<CookieRow>, String> {
        let conn = self.conn.lock().map_err(|_| "poisoned")?;
        let mut stmt = conn
            .prepare("SELECT domain, name, value, path, expires FROM cookies WHERE domain = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([domain], |row| {
                Ok(CookieRow {
                    domain: row.get(0)?,
                    name: row.get(1)?,
                    value: row.get(2)?,
                    path: row.get(3)?,
                    expires: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock().map_err(|_| "poisoned")?;
        let mut stmt = conn
            .prepare("SELECT value FROM settings WHERE key = ?1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([key]).map_err(|e| e.to_string())?;
        match rows.next().map_err(|e| e.to_string())? {
            Some(row) => Ok(Some(row.get(0).map_err(|e| e.to_string())?)),
            None => Ok(None),
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|_| "poisoned")?;
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![key, value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_and_history_round_trip() {
        let store = Store::open().expect("store opens");
        store.set_setting("test-key", "test-value").unwrap();
        assert_eq!(store.get_setting("test-key").unwrap().as_deref(), Some("test-value"));
        store
            .record_history(Some("r1"), "GET", "https://x.io", Some(200), Some(5), "{}", "{}", "ok", None, "[]", "", "none")
            .unwrap();
        let items = store.history(10).unwrap();
        assert!(items.iter().any(|i| i.url == "https://x.io" && i.method == "GET"));
    }
}