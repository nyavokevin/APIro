//! Mock Server v2 — axum-based, spec-driven, stateful, YAML-native, 3 modes.
//! Backward compatible with v1 MockRoute/MockServerInfo but extends with variants, state, proxy/record, YAML.

pub mod mcp;
pub mod openapi_gen;
pub mod state;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::{
    body::Body,
    extract::{Request, State as AxumState},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::any,
    Router,
};
use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

use state::{MockState, MockStateConfig};

// ── Core types (backward compatible + v2 extensions) ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MockMode {
    Mock,
    Proxy,
    Record,
}

impl Default for MockMode {
    fn default() -> Self {
        Self::Mock
    }
}

impl std::fmt::Display for MockMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Mock => write!(f, "mock"),
            Self::Proxy => write!(f, "proxy"),
            Self::Record => write!(f, "record"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockVariant {
    pub name: String,
    pub status: u16,
    pub body: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    /// Trigger selector: "header:x-mock-variant=validation-error" or "query:empty=true" or "header:x-mock-status=404"
    #[serde(default)]
    pub trigger: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockRoute {
    pub id: String,
    pub method: String,
    pub path: String,
    pub status: u16,
    pub body: String,
    #[serde(default)]
    pub delay_ms: u64,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub variants: Vec<MockVariant>,
    #[serde(default)]
    pub state: Option<MockStateConfig>,
    /// For non-axum callers that use `delay` field
    #[serde(default)]
    pub delay: Option<u64>,
    /// Chaos injection: extra jitter 0..chaosLatency ms added to delay (Phase4 F)
    #[serde(default)]
    pub chaos_latency: Option<u64>,
    #[serde(default)]
    pub chaos_error_rate: Option<u8>,
}

impl MockRoute {
    pub fn effective_delay(&self) -> u64 {
        let base = if self.delay_ms > 0 {
            self.delay_ms
        } else {
            self.delay.unwrap_or(0)
        };
        if let Some(jitter) = self.chaos_latency {
            if jitter > 0 {
                let r = (uuid::Uuid::new_v4().as_u128() % (jitter as u128 + 1)) as u64;
                return base + r;
            }
        }
        base
    }
    pub fn chaos_error_status(&self) -> Option<u16> {
        if let Some(rate) = self.chaos_error_rate {
            if rate > 0 {
                let r = (uuid::Uuid::new_v4().as_u128() % 100) as u8;
                if r < rate {
                    return Some(500);
                }
            }
        }
        None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockHit {
    pub id: String,
    pub method: String,
    pub path: String,
    pub status: u16,
    pub timestamp: u64,
    #[serde(default)]
    pub latency_ms: u64,
    #[serde(default)]
    pub matched_route: Option<String>,
    #[serde(default)]
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockServerInfo {
    pub id: String,
    pub name: String,
    pub port: u16,
    pub running: bool,
    pub routes: Vec<MockRoute>,
    #[serde(default)]
    pub mode: MockMode,
    #[serde(default)]
    pub target_url: Option<String>,
    #[serde(default)]
    pub state_enabled: bool,
    #[serde(default)]
    pub mocks_dir: Option<String>,
    #[serde(default)]
    pub latency_ms: u64,
    /// v2 flag: enable GraphQL mocking (resolve by operation name) behind a toggle.
    #[serde(default)]
    pub graphql_enabled: bool,
}

// ── YAML persistence (one file per route = *.mock.yaml) ──

const MOCK_EXT: &str = ".mock.yaml";

fn mocks_dir_for_server(server_id: &str, custom: Option<&str>) -> PathBuf {
    if let Some(dir) = custom {
        PathBuf::from(dir)
    } else {
        let base = dirs::data_dir()
            .or_else(dirs::config_dir)
            .unwrap_or_else(|| PathBuf::from("."));
        base.join("apiforge").join("mocks").join(sanitize_id(server_id))
    }
}

fn sanitize_id(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

fn sanitize_path(p: &str) -> String {
    p.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

pub fn write_mocks_to_dir(server: &MockServerInfo, dir: &Path) -> Result<Vec<PathBuf>, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    // Clean stale *.mock.yaml that are not in current routes (preserve .git etc)
    let existing: Vec<PathBuf> = std::fs::read_dir(dir)
        .map(|rd| rd.filter_map(|e| e.ok().map(|e| e.path())).collect())
        .unwrap_or_default();
    let expected_names: std::collections::HashSet<String> = server
        .routes
        .iter()
        .map(|r| format!("{}-{}{}", r.method.to_lowercase(), sanitize_path(&r.path), MOCK_EXT))
        .collect();
    for p in existing {
        if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
            if name.ends_with(MOCK_EXT) && !expected_names.contains(name) {
                let _ = std::fs::remove_file(&p);
            }
        }
    }
    let mut written = Vec::new();
    for route in &server.routes {
        let fname = format!("{}-{}{}", route.method.to_lowercase(), sanitize_path(&route.path), MOCK_EXT);
        let file = dir.join(fname);
        let yaml = serde_yaml::to_string(route).map_err(|e| e.to_string())?;
        std::fs::write(&file, yaml).map_err(|e| e.to_string())?;
        written.push(file);
    }
    // Also write server meta
    let meta = dir.join("_server.yaml");
    let meta_yaml = serde_yaml::to_string(server).map_err(|e| e.to_string())?;
    std::fs::write(&meta, meta_yaml).map_err(|e| e.to_string())?;
    written.push(meta);
    Ok(written)
}

pub fn read_mocks_from_dir(dir: &Path) -> Result<Vec<MockRoute>, String> {
    let mut routes = Vec::new();
    if !dir.exists() {
        return Ok(routes);
    }
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let p = entry.path();
        if p.is_file() {
            if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                if name.ends_with(MOCK_EXT) && name != "_server.yaml" {
                    let raw = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
                    if let Ok(route) = serde_yaml::from_str::<MockRoute>(&raw) {
                        routes.push(route);
                    }
                }
            }
        }
    }
    Ok(routes)
}

pub fn read_server_meta(dir: &Path) -> Option<MockServerInfo> {
    let meta = dir.join("_server.yaml");
    if !meta.exists() {
        return None;
    }
    let raw = std::fs::read_to_string(&meta).ok()?;
    serde_yaml::from_str(&raw).ok()
}

// ── Route matching with path params ──

fn path_matches(route_path: &str, request_path: &str) -> bool {
    if route_path == request_path {
        return true;
    }
    // Support {id} and :id
    let route_segs: Vec<&str> = route_path.split('/').collect();
    let req_segs: Vec<&str> = request_path.split('/').collect();
    if route_segs.len() != req_segs.len() {
        return false;
    }
    for (r, q) in route_segs.iter().zip(req_segs.iter()) {
        if r.starts_with('{') && r.ends_with('}') {
            continue;
        }
        if r.starts_with(':') {
            continue;
        }
        if r != q {
            return false;
        }
    }
    true
}

fn extract_path_params(route_path: &str, request_path: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    let route_segs: Vec<&str> = route_path.split('/').collect();
    let req_segs: Vec<&str> = request_path.split('/').collect();
    for (r, q) in route_segs.iter().zip(req_segs.iter()) {
        if r.starts_with('{') && r.ends_with('}') {
            let key = r.trim_matches(|c| c == '{' || c == '}').trim_end_matches('?').to_string();
            out.insert(key, (*q).to_string());
        } else if r.starts_with(':') {
            let key = r[1..].to_string();
            out.insert(key, (*q).to_string());
        }
    }
    out
}

fn select_variant(route: &MockRoute, headers: &HeaderMap, query: &str) -> Option<MockVariant> {
    for v in &route.variants {
        if let Some(trigger) = &v.trigger {
            if trigger.starts_with("header:") {
                let rest = &trigger["header:".len()..];
                if let Some((k, val)) = rest.split_once('=') {
                    if let Some(hv) = headers.get(k.trim()) {
                        if hv.to_str().unwrap_or("") == val.trim() {
                            return Some(v.clone());
                        }
                    }
                    // Also check for missing header trigger
                    if val.trim() == "missing" && headers.get(k.trim()).is_none() {
                        return Some(v.clone());
                    }
                }
            } else if trigger.starts_with("query:") {
                let rest = &trigger["query:".len()..];
                if let Some((k, val)) = rest.split_once('=') {
                    for pair in query.split('&') {
                        if let Some((qk, qv)) = pair.split_once('=') {
                            if qk == k.trim() && qv == val.trim() {
                                return Some(v.clone());
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

// ── Server handle ──

struct Handle {
    stop: Option<oneshot::Sender<()>>,
    hits: Arc<Mutex<Vec<MockHit>>>,
    state: Arc<MockState>,
    join_handle: Option<tokio::task::JoinHandle<()>>,
    info: Arc<Mutex<MockServerInfo>>,
    routes: Arc<Mutex<Vec<MockRoute>>>,
    /// Dedicated runtime per server so start() works with or without an ambient tokio context.
    runtime: Option<tokio::runtime::Runtime>,
}

pub struct MockRegistry {
    servers: Mutex<HashMap<String, Handle>>,
}

impl MockRegistry {
    pub fn new() -> Self {
        Self {
            servers: Mutex::new(HashMap::new()),
        }
    }

    pub fn list(&self) -> Vec<MockServerInfo> {
        let servers = self.servers.lock().unwrap();
        servers
            .values()
            .map(|h| h.info.lock().unwrap().clone())
            .collect()
    }

    pub fn get(&self, id: &str) -> Option<MockServerInfo> {
        let servers = self.servers.lock().unwrap();
        servers.get(id).map(|h| h.info.lock().unwrap().clone())
    }

    /// Start a mock server. Fails when the registry already holds `id` or port in use.
    pub fn start(&self, mut info: MockServerInfo) -> Result<(), String> {
        let mut servers = self.servers.lock().map_err(|_| "poisoned registry")?;
        if servers.contains_key(&info.id) {
            return Err(format!("mock server '{}' is already running", info.id));
        }

        // Persist YAML first (one file per route)
        let dir = mocks_dir_for_server(&info.id, info.mocks_dir.as_deref());
        let _ = write_mocks_to_dir(&info, &dir);

        let port = info.port;
        let addr = format!("127.0.0.1:{}", port);

        // State store per server
        let state_path = if info.state_enabled {
            let base = dirs::data_dir()
                .or_else(dirs::config_dir)
                .unwrap_or_else(|| PathBuf::from("."));
            Some(base.join("apiforge").join("mocks").join(format!("{}-state.db", sanitize_id(&info.id))))
        } else {
            None
        };
        let mock_state = Arc::new(MockState::new(state_path));

        let hits: Arc<Mutex<Vec<MockHit>>> = Arc::new(Mutex::new(Vec::new()));
        let routes = Arc::new(Mutex::new(info.routes.clone()));
        let mode = info.mode.clone();
        let target_url = info.target_url.clone();
        let hits_clone = Arc::clone(&hits);
        let state_clone = Arc::clone(&mock_state);
        let routes_clone = Arc::clone(&routes);

        // Also keep info for updates
        info.running = true;
        let info_arc = Arc::new(Mutex::new(info.clone()));
        let info_for_handler = Arc::clone(&info_arc);

        let (tx, rx) = oneshot::channel::<()>();

        // Build axum router with fallback handler
        let app_state = AppState {
            routes: routes_clone,
            hits: hits_clone,
            state: state_clone,
            mode: mode.clone(),
            target_url: target_url.clone(),
            server_info: info_for_handler,
        };

        let app = Router::new()
            .fallback(any(handler))
            .with_state(app_state)
            .layer(tower_http::cors::CorsLayer::permissive());

        let listener = std::net::TcpListener::bind(&addr).map_err(|e| format!("cannot bind {addr}: {e}"))?;
        listener
            .set_nonblocking(true)
            .map_err(|e| e.to_string())?;

        // Dedicated runtime per mock server, created on its own thread so
        // `start()` works with or without an ambient tokio context (CLI, Tauri, tests).
        let moved_listener = listener;
        let (rt, join_handle) = std::thread::spawn(move || -> Result<(tokio::runtime::Runtime, tokio::task::JoinHandle<()>), String> {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .worker_threads(1)
                .enable_all()
                .build()
                .map_err(|e| format!("tokio runtime: {e}"))?;
            let join = rt.block_on(async move {
                let tokio_listener =
                    tokio::net::TcpListener::from_std(moved_listener).map_err(|e| e.to_string())?;
                let server = axum::serve(tokio_listener, app);
                let graceful = server.with_graceful_shutdown(async {
                    let _ = rx.await;
                });
                Ok::<_, String>(tokio::spawn(async move {
                    let _ = graceful.await;
                }))
            })?;
            Ok((rt, join))
        })
        .join()
        .map_err(|_| "mock server thread panicked".to_string())??;

        // Wait a bit to ensure bind succeeded (<500ms requirement)
        std::thread::sleep(Duration::from_millis(50));

        servers.insert(
            info.id.clone(),
            Handle {
                stop: Some(tx),
                hits,
                state: mock_state,
                join_handle: Some(join_handle),
                info: info_arc,
                routes: Arc::clone(&routes),
                runtime: Some(rt),
            },
        );
        Ok(())
    }

    pub fn stop(&self, id: &str) -> Result<(), String> {
        let mut servers = self.servers.lock().map_err(|_| "poisoned registry")?;
        let mut handle = servers
            .remove(id)
            .ok_or_else(|| format!("no running mock server '{id}'"))?;
        if let Some(tx) = handle.stop.take() {
            let _ = tx.send(());
        }
        // Shut down the server's dedicated runtime on a detached thread —
        // shutdown blocks, which is not allowed inside an async context.
        if let Some(rt) = handle.runtime.take() {
            std::thread::spawn(move || rt.shutdown_timeout(Duration::from_millis(300)));
        }
        // Don't block on join_handle; let it shut down gracefully
        // Update info running flag if still accessible (already removed)
        Ok(())
    }

    pub fn hits(&self, id: &str) -> Result<Vec<MockHit>, String> {
        let servers = self.servers.lock().map_err(|_| "poisoned registry")?;
        let handle = servers.get(id).ok_or_else(|| format!("no running mock server '{id}'"))?;
        let hits = handle.hits.lock().unwrap().clone();
        Ok(hits)
    }

    pub fn clear_hits(&self, id: &str) -> Result<(), String> {
        let servers = self.servers.lock().map_err(|_| "poisoned registry")?;
        let handle = servers.get(id).ok_or_else(|| format!("no running mock server '{id}'"))?;
        handle.hits.lock().unwrap().clear();
        Ok(())
    }

    pub fn export_hits_json(&self, id: &str) -> Result<String, String> {
        let hits = self.hits(id)?;
        serde_json::to_string_pretty(&hits).map_err(|e| e.to_string())
    }

    pub fn state_snapshot(&self, id: &str) -> Result<HashMap<String, serde_json::Value>, String> {
        let servers = self.servers.lock().map_err(|_| "poisoned registry")?;
        let handle = servers.get(id).ok_or_else(|| format!("no running mock server '{id}'"))?;
        Ok(handle.state.snapshot())
    }

    pub fn state_set(&self, id: &str, key: String, value: Option<serde_json::Value>) -> Result<(), String> {
        let servers = self.servers.lock().map_err(|_| "poisoned registry")?;
        let handle = servers.get(id).ok_or_else(|| format!("no running mock server '{id}'"))?;
        if let Some(v) = value {
            handle.state.set(key, v);
        } else {
            handle.state.delete(&key);
        }
        Ok(())
    }

    pub fn state_clear(&self, id: &str) -> Result<(), String> {
        let servers = self.servers.lock().map_err(|_| "poisoned registry")?;
        let handle = servers.get(id).ok_or_else(|| format!("no running mock server '{id}'"))?;
        handle.state.clear();
        Ok(())
    }

    pub fn update_route(&self, server_id: &str, route: MockRoute) -> Result<(), String> {
        let servers = self.servers.lock().map_err(|_| "poisoned registry")?;
        let handle = servers.get(server_id).ok_or_else(|| format!("no running mock server '{server_id}'"))?;
        {
            let mut info = handle.info.lock().unwrap();
            if let Some(pos) = info.routes.iter().position(|r| r.id == route.id) {
                info.routes[pos] = route.clone();
            } else {
                info.routes.push(route.clone());
            }
            // Persist
            let dir = mocks_dir_for_server(&info.id, info.mocks_dir.as_deref());
            let _ = write_mocks_to_dir(&info, &dir);
        }
        // Hot-reload the running server's route table (MCP create_route + record mode rely on this)
        if let Ok(mut rt) = handle.routes.lock() {
            if let Some(pos) = rt.iter().position(|r| r.id == route.id) {
                rt[pos] = route.clone();
            } else {
                rt.push(route.clone());
            }
        }
        Ok(())
    }

    pub fn list_routes(&self, server_id: &str) -> Result<Vec<MockRoute>, String> {
        let servers = self.servers.lock().map_err(|_| "poisoned registry")?;
        let handle = servers.get(server_id).ok_or_else(|| format!("no running mock server '{server_id}'"))?;
        let routes = handle.info.lock().unwrap().routes.clone();
        Ok(routes)
    }

    pub fn create_route(&self, server_id: &str, route: MockRoute) -> Result<MockRoute, String> {
        self.update_route(server_id, route.clone())?;
        Ok(route)
    }

    pub fn persist_all(&self) -> Result<(), String> {
        let servers = self.servers.lock().map_err(|_| "poisoned registry")?;
        for handle in servers.values() {
            let info = handle.info.lock().unwrap().clone();
            let dir = mocks_dir_for_server(&info.id, info.mocks_dir.as_deref());
            write_mocks_to_dir(&info, &dir)?;
        }
        Ok(())
    }

    pub fn update_server(&self, info: MockServerInfo) -> Result<MockServerInfo, String> {
        let servers = self.servers.lock().map_err(|_| "poisoned registry")?;
        let handle = servers.get(&info.id).ok_or_else(|| format!("no server '{}'", info.id))?;
        {
            let mut cur = handle.info.lock().unwrap();
            *cur = info.clone();
            let dir = mocks_dir_for_server(&cur.id, cur.mocks_dir.as_deref());
            write_mocks_to_dir(&cur, &dir)?;
        }
        if let Ok(mut routes) = handle.routes.lock() {
            *routes = info.routes.clone();
        }
        Ok(info)
    }

    pub fn delete_server(&self, id: &str) -> Result<(), String> {
        let mut servers = self.servers.lock().map_err(|_| "poisoned registry")?;
        if let Some(mut handle) = servers.remove(id) {
            if let Some(tx) = handle.stop.take() {
                let _ = tx.send(());
            }
            if let Some(rt) = handle.runtime.take() {
                std::thread::spawn(move || rt.shutdown_timeout(Duration::from_millis(300)));
            }
        }
        // Remove YAML dir
        let dir = mocks_dir_for_server(id, None);
        let _ = std::fs::remove_dir_all(&dir);
        Ok(())
    }
}

// ── Tauri commands (migrated from commands.rs + v2) ──

#[tauri::command]
pub fn mock_list(registry: tauri::State<MockRegistry>) -> Result<Vec<MockServerInfo>, String> {
    Ok(registry.list())
}

#[tauri::command]
pub fn mock_create(info: MockServerInfo, registry: tauri::State<MockRegistry>) -> Result<MockServerInfo, String> {
    let dir = mocks_dir_for_server(&info.id, info.mocks_dir.as_deref());
    write_mocks_to_dir(&info, &dir)?;
    Ok(info)
}

#[tauri::command]
pub fn mock_update(info: MockServerInfo, registry: tauri::State<MockRegistry>) -> Result<MockServerInfo, String> {
    registry.update_server(info)
}

#[tauri::command]
pub fn mock_delete(id: String, registry: tauri::State<MockRegistry>) -> Result<(), String> {
    registry.delete_server(&id)
}

#[tauri::command]
pub fn mock_clear_hits(id: String, registry: tauri::State<MockRegistry>) -> Result<(), String> {
    registry.clear_hits(&id)
}

#[tauri::command]
pub fn mock_export_hits(id: String, registry: tauri::State<MockRegistry>) -> Result<String, String> {
    registry.export_hits_json(&id)
}

#[tauri::command]
pub fn mock_state_snapshot(id: String, registry: tauri::State<MockRegistry>) -> Result<HashMap<String, serde_json::Value>, String> {
    registry.state_snapshot(&id)
}

#[tauri::command]
pub fn mock_state_set(id: String, key: String, value: Option<serde_json::Value>, registry: tauri::State<MockRegistry>) -> Result<(), String> {
    registry.state_set(&id, key, value)
}

#[tauri::command]
pub fn mock_state_clear(id: String, registry: tauri::State<MockRegistry>) -> Result<(), String> {
    registry.state_clear(&id)
}

#[tauri::command]
pub fn mock_list_routes(id: String, registry: tauri::State<MockRegistry>) -> Result<Vec<MockRoute>, String> {
    registry.list_routes(&id)
}

#[tauri::command]
pub fn mock_create_route(id: String, route: MockRoute, registry: tauri::State<MockRegistry>) -> Result<MockRoute, String> {
    registry.create_route(&id, route)
}

#[tauri::command]
pub fn mock_update_route(id: String, route: MockRoute, registry: tauri::State<MockRegistry>) -> Result<MockRoute, String> {
    registry.update_route(&id, route.clone())?;
    Ok(route)
}

#[tauri::command]
pub fn mock_delete_route(id: String, route_id: String, registry: tauri::State<MockRegistry>) -> Result<(), String> {
    let servers = registry.servers.lock().map_err(|_| "poisoned registry".to_string())?;
    let handle = servers.get(&id).ok_or_else(|| format!("no server '{id}'"))?;
    {
        let mut info = handle.info.lock().unwrap();
        info.routes.retain(|r| r.id != route_id);
        let dir = mocks_dir_for_server(&info.id, info.mocks_dir.as_deref());
        write_mocks_to_dir(&info, &dir)?;
    }
    if let Some(handle) = servers.get(&id) {
        if let Ok(mut routes) = handle.routes.lock() {
            routes.retain(|r| r.id != route_id);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn mock_generate_from_openapi(
    spec: String,
    base_url: Option<String>,
    generate_variants: Option<bool>,
    output_dir: Option<String>,
    registry: tauri::State<MockRegistry>,
) -> Result<openapi_gen::GenerationResult, String> {
    let value: serde_json::Value = if spec.trim_start().starts_with('{') {
        serde_json::from_str(&spec).map_err(|e| format!("invalid JSON spec: {e}"))?
    } else {
        // Try YAML
        serde_yaml::from_str::<serde_json::Value>(&spec).map_err(|e| format!("invalid YAML spec: {e}"))?
    };
    let opts = openapi_gen::GenerationOptions {
        base_url: base_url.unwrap_or_else(|| "http://localhost:3000".to_string()),
        generate_variants: generate_variants.unwrap_or(true),
        status_codes: vec![],
    };
    let result = openapi_gen::generate_from_openapi(&value, &opts);
    // Optionally persist to output_dir as YAML files (one per route)
    if let Some(dir) = output_dir {
        let dir_path = PathBuf::from(dir);
        std::fs::create_dir_all(&dir_path).map_err(|e| e.to_string())?;
        for route in &result.routes {
            let fname = format!("{}-{}{}", route.method.to_lowercase(), sanitize_path(&route.path), MOCK_EXT);
            let file = dir_path.join(fname);
            let yaml = serde_yaml::to_string(route).map_err(|e| e.to_string())?;
            std::fs::write(&file, yaml).map_err(|e| e.to_string())?;
        }
    }
    let _ = registry; // keep for future diff vs existing
    Ok(result)
}

#[tauri::command]
pub fn mock_diff_specs(old_spec: String, new_spec: String) -> Result<openapi_gen::DiffResult, String> {
    let old_val: serde_json::Value = serde_json::from_str(&old_spec)
        .or_else(|_| serde_yaml::from_str(&old_spec))
        .map_err(|e| format!("invalid old spec: {e}"))?;
    let new_val: serde_json::Value = serde_json::from_str(&new_spec)
        .or_else(|_| serde_yaml::from_str(&new_spec))
        .map_err(|e| format!("invalid new spec: {e}"))?;
    Ok(openapi_gen::diff_specs(&old_val, &new_val))
}

#[tauri::command]
pub fn mock_mcp_list_tools() -> Result<Vec<mcp::McpTool>, String> {
    Ok(mcp::list_tools())
}

#[tauri::command]
pub fn mock_mcp_call(tool: String, arguments: serde_json::Value, registry: tauri::State<MockRegistry>) -> Result<mcp::McpResult, String> {
    match tool.as_str() {
        "mock_list_routes" => {
            let server_id = arguments.get("serverId").and_then(|v| v.as_str()).unwrap_or("");
            let routes = if server_id.is_empty() {
                let list = registry.list();
                list.into_iter().flat_map(|s| s.routes).collect::<Vec<_>>()
            } else {
                registry.list_routes(server_id).unwrap_or_default()
            };
            Ok(mcp::tool_result_text(serde_json::to_string_pretty(&routes).unwrap_or_default()))
        }
        "mock_create_route" => {
            let server_id = arguments.get("serverId").and_then(|v| v.as_str()).ok_or("missing serverId")?;
            let method = arguments.get("method").and_then(|v| v.as_str()).unwrap_or("GET").to_string();
            let path = arguments.get("path").and_then(|v| v.as_str()).unwrap_or("/").to_string();
            let status = arguments.get("status").and_then(|v| v.as_u64()).unwrap_or(200) as u16;
            let body = arguments.get("body").and_then(|v| v.as_str()).unwrap_or("{}").to_string();
            let route = MockRoute {
                id: uuid::Uuid::new_v4().to_string(),
                method,
                path,
                status,
                body,
                delay_ms: arguments.get("delayMs").and_then(|v| v.as_u64()).unwrap_or(0),
                headers: HashMap::new(),
                variants: vec![],
                state: None,
                delay: None,
                chaos_latency: None,
                chaos_error_rate: None,
            };
            registry.create_route(server_id, route.clone())?;
            Ok(mcp::tool_result_text(format!("created route {}", route.id)))
        }
        "mock_set_state" => {
            let server_id = arguments.get("serverId").and_then(|v| v.as_str()).ok_or("missing serverId")?;
            let key = arguments.get("key").and_then(|v| v.as_str()).ok_or("missing key")?;
            let value = arguments.get("value").cloned();
            registry.state_set(server_id, key.to_string(), value)?;
            Ok(mcp::tool_result_text("state updated"))
        }
        "mock_hit_log" => {
            let server_id = arguments.get("serverId").and_then(|v| v.as_str()).ok_or("missing serverId")?;
            let limit = arguments.get("limit").and_then(|v| v.as_u64()).unwrap_or(50) as usize;
            let hits = registry.hits(server_id).unwrap_or_default();
            let slice = hits.into_iter().take(limit).collect::<Vec<_>>();
            Ok(mcp::tool_result_text(serde_json::to_string_pretty(&slice).unwrap_or_default()))
        }
        "mock_generate_from_openapi" => {
            let spec = if let Some(p) = arguments.get("specPath").and_then(|v| v.as_str()) {
                std::fs::read_to_string(p).map_err(|e| e.to_string())?
            } else if let Some(j) = arguments.get("specJson").and_then(|v| v.as_str()) {
                j.to_string()
            } else {
                return Ok(mcp::tool_result_error("missing specPath or specJson"));
            };
            let base_url = arguments.get("baseUrl").and_then(|v| v.as_str()).unwrap_or("http://localhost:3000").to_string();
            let val: serde_json::Value = serde_json::from_str(&spec).or_else(|_| serde_yaml::from_str(&spec)).map_err(|e| e.to_string())?;
            let opts = openapi_gen::GenerationOptions { base_url, generate_variants: true, status_codes: vec![] };
            let res = openapi_gen::generate_from_openapi(&val, &opts);
            Ok(mcp::tool_result_text(serde_json::to_string_pretty(&res).unwrap_or_default()))
        }
        "mock_diff_spec" => {
            let old = arguments.get("oldSpecPath").and_then(|v| v.as_str()).ok_or("missing oldSpecPath")?;
            let new = arguments.get("newSpecPath").and_then(|v| v.as_str()).ok_or("missing newSpecPath")?;
            let old_str = std::fs::read_to_string(old).map_err(|e| e.to_string())?;
            let new_str = std::fs::read_to_string(new).map_err(|e| e.to_string())?;
            let old_val: serde_json::Value = serde_json::from_str(&old_str).or_else(|_| serde_yaml::from_str(&old_str)).map_err(|e| e.to_string())?;
            let new_val: serde_json::Value = serde_json::from_str(&new_str).or_else(|_| serde_yaml::from_str(&new_str)).map_err(|e| e.to_string())?;
            let diff = openapi_gen::diff_specs(&old_val, &new_val);
            Ok(mcp::tool_result_text(serde_json::to_string_pretty(&diff).unwrap_or_default()))
        }
        _ => Ok(mcp::tool_result_error(format!("unknown tool: {tool}"))),
    }
}

#[derive(Clone)]
struct AppState {
    routes: Arc<Mutex<Vec<MockRoute>>>,
    hits: Arc<Mutex<Vec<MockHit>>>,
    state: Arc<MockState>,
    mode: MockMode,
    target_url: Option<String>,
    server_info: Arc<Mutex<MockServerInfo>>,
}

// ── Axum handler ──

async fn handler(AxumState(state): AxumState<AppState>, req: Request) -> Response {
    let start = Instant::now();
    let method = req.method().to_string().to_uppercase();
    let uri = req.uri().clone();
    let path = uri.path().to_string();
    let query = uri.query().unwrap_or("").to_string();
    let headers = req.headers().clone();

    // Read body for stateful and record modes (limit to 200kb)
    let (parts, body) = req.into_parts();
    let body_bytes = match axum::body::to_bytes(body, 200_000).await {
        Ok(b) => b,
        Err(_) => bytes::Bytes::new(),
    };
    let body_str = String::from_utf8_lossy(&body_bytes).to_string();

    // GraphQL mocking (behind the per-server toggle): resolve by operation name
    if state
        .server_info
        .lock()
        .map(|i| i.graphql_enabled)
        .unwrap_or(false)
        && (path == "/graphql" || path.ends_with("/graphql"))
    {
        if let Some(resp) = handle_graphql(&state, &method, &path, &query, &body_str, &headers, start).await {
            return resp;
        }
    }

    // Find matched route (with param matching)
    let routes_guard = state.routes.lock().unwrap().clone();
    let matched = routes_guard.iter().find(|r| r.method.eq_ignore_ascii_case(&method) && path_matches(&r.path, &path)).cloned();

    // Handle stateful logic if enabled
    if let Some(ref route) = matched {
        if let Some(ref cfg) = route.state {
            handle_stateful(&state.state, cfg, &method, &path, &route.path, &query, &body_str);
        }
    }

    // Check for stateful read: if GET and state has data for that key, return it
    if let Some(ref route) = matched {
        if let Some(ref cfg) = route.state {
            if cfg.operation == state::StateOperation::Read || cfg.operation == state::StateOperation::List {
                let key = state::extract_key_from_request(cfg, &path, &route.path, &query, &body_str)
                    .unwrap_or_else(|| format!("{}:{}", cfg.scope, path));
                let full_key = if cfg.operation == state::StateOperation::List {
                    cfg.scope.clone()
                } else {
                    format!("{}:{}", cfg.scope, key)
                };
                if cfg.operation == state::StateOperation::List {
                    let list = state.state.list(&format!("{}:", cfg.scope));
                    if !list.is_empty() {
                        let body = serde_json::to_string_pretty(&list).unwrap_or_else(|_| "[]".to_string());
                        let latency = start.elapsed().as_millis() as u64;
                        log_hit(&state.hits, &method, &path, 200, latency, Some(route.id.clone()), &state.mode);
                        return build_response(200, body, &route.headers, route.effective_delay(), &headers).await;
                    }
                } else if let Some(val) = state.state.get(&full_key) {
                    let body = serde_json::to_string_pretty(&val).unwrap_or_else(|_| "{}".to_string());
                    let latency = start.elapsed().as_millis() as u64;
                    log_hit(&state.hits, &method, &path, 200, latency, Some(route.id.clone()), &state.mode);
                    return build_response(200, body, &route.headers, route.effective_delay(), &headers).await;
                }
            }
        }
    }

    // Mode handling
    match state.mode {
        MockMode::Proxy => {
            return proxy_request(&state, &method, &path, &query, &headers, &body_str, start, matched).await;
        }
        MockMode::Record => {
            // Try mock first, if found serve mock, else proxy and record
            if let Some(route) = matched {
                // Check variant selection
                let variant = select_variant(&route, &headers, &query);
                let (status, body, headers_map, delay) = if let Some(v) = variant {
                    (v.status, v.body.clone(), v.headers.clone(), route.effective_delay())
                } else {
                    // Stateful already handled above; check if we should handle create/update state
                    if let Some(ref cfg) = route.state {
                        handle_stateful_writes(&state.state, cfg, &method, &path, &route.path, &query, &body_str);
                    }
                    (route.status, route.body.clone(), route.headers.clone(), route.effective_delay())
                };
                let latency = start.elapsed().as_millis() as u64;
                log_hit(&state.hits, &method, &path, status, latency, Some(route.id.clone()), &state.mode);
                return build_response(status, body, &headers_map, delay, &headers).await;
            }
            // No mock, proxy and record
            let resp = proxy_request(&state, &method, &path, &query, &headers, &body_str, start, None).await;
            // After proxy, save as new mock if successful
            if let Some(target) = &state.target_url {
                // Record logic is inside proxy_request via side effect; we need to save
                // For simplicity, we record in proxy_request when mode == Record
            }
            return resp;
        }
        MockMode::Mock => {
            // Fall through to mock handling below
        }
    }

    // Mock mode: serve defined mocks (with chaos injection)
    if let Some(route) = matched.clone() {
        if let Some(err_status) = route.chaos_error_status() {
            let latency = start.elapsed().as_millis() as u64;
            log_hit(&state.hits, &method, &path, err_status, latency, Some(route.id.clone()), &state.mode);
            return build_response(err_status, r#"{"error":"chaos injected 500"}"#.into(), &HashMap::new(), route.effective_delay(), &headers).await;
        }
        // Handle state writes for mock mode as well
        if let Some(ref cfg) = route.state {
            handle_stateful_writes(&state.state, cfg, &method, &path, &route.path, &query, &body_str);
        }
        let variant = select_variant(&route, &headers, &query);
        let (status, body, headers_map, delay) = if let Some(v) = variant {
            (v.status, v.body.clone(), v.headers.clone(), route.effective_delay())
        } else {
            (route.status, route.body.clone(), route.headers.clone(), route.effective_delay())
        };
        let latency = start.elapsed().as_millis() as u64;
        log_hit(&state.hits, &method, &path, status, latency, Some(route.id.clone()), &state.mode);
        return build_response(status, body, &headers_map, delay, &headers).await;
    }

    // No match
    let latency = start.elapsed().as_millis() as u64;
    log_hit(&state.hits, &method, &path, 404, latency, None, &state.mode);
    let body = format!("{{\"error\":\"no mock for {method} {path}\"}}");
    build_response(404, body, &HashMap::new(), 0, &headers).await
}

fn handle_stateful(state: &MockState, cfg: &MockStateConfig, method: &str, path: &str, route_path: &str, query: &str, body: &str) {
    // This is called before handling; for reads it will be handled in handler, for writes we handle after
    let _ = (state, cfg, method, path, route_path, query, body);
}

fn handle_stateful_writes(state: &MockState, cfg: &MockStateConfig, method: &str, path: &str, route_path: &str, query: &str, body: &str) {
    let key_opt = state::extract_key_from_request(cfg, path, route_path, query, body);
    let scope = &cfg.scope;
    match cfg.operation {
        state::StateOperation::Create => {
            let key = key_opt.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let full_key = format!("{}:{}", scope, key);
            // Try to parse body as JSON, else store raw
            let value = if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
                // Ensure id field
                let mut obj = if let serde_json::Value::Object(m) = v { m } else { serde_json::Map::new() };
                obj.entry("id".to_string()).or_insert(serde_json::Value::String(key.clone()));
                serde_json::Value::Object(obj)
            } else {
                serde_json::json!({"id": key, "raw": body})
            };
            state.set(full_key, value);
        }
        state::StateOperation::Update => {
            if let Some(k) = key_opt {
                let full_key = format!("{}:{}", scope, k);
                if let Some(existing) = state.get(&full_key) {
                    let new_val = if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
                        // Merge
                        let mut existing_map = if let serde_json::Value::Object(m) = existing { m } else { serde_json::Map::new() };
                        if let serde_json::Value::Object(m) = v {
                            for (kk, vv) in m {
                                existing_map.insert(kk, vv);
                            }
                        }
                        serde_json::Value::Object(existing_map)
                    } else {
                        serde_json::Value::String(body.to_string())
                    };
                    state.set(full_key, new_val);
                }
            }
        }
        state::StateOperation::Delete => {
            if let Some(k) = key_opt {
                let full_key = format!("{}:{}", scope, k);
                state.delete(&full_key);
            }
        }
        _ => {}
    }
    let _ = method;
}

async fn handle_graphql(
    app_state: &AppState,
    method: &str,
    path: &str,
    query: &str,
    body: &str,
    headers: &HeaderMap,
    start: Instant,
) -> Option<Response> {
    if method != "POST" && method != "GET" {
        return None;
    }
    let operation = if method == "POST" {
        extract_graphql_operation(body)
    } else {
        extract_query_value(query, "operationName").filter(|s| !s.is_empty())
    };

    let routes = app_state.routes.lock().unwrap().clone();
    let graphql_routes: Vec<MockRoute> = routes
        .into_iter()
        .filter(|r| r.method.eq_ignore_ascii_case("GRAPHQL"))
        .collect();
    if graphql_routes.is_empty() {
        return None; // no GRAPHQL routes defined — fall through to normal handling
    }

    let matched = match operation.as_deref() {
        Some(op) => graphql_routes
            .iter()
            .find(|r| r.path == op || r.path == format!("/{op}") || r.path == "*")
            .cloned(),
        None => graphql_routes.iter().find(|r| r.path == "*").cloned(),
    };

    let latency = start.elapsed().as_millis() as u64;
    match matched {
        Some(route) => {
            log_hit(
                &app_state.hits,
                method,
                path,
                route.status,
                latency,
                Some(route.id.clone()),
                &app_state.mode,
            );
            Some(
                build_response(
                    route.status,
                    route.body.clone(),
                    &route.headers,
                    route.effective_delay(),
                    headers,
                )
                .await,
            )
        }
        None => {
            let opname = operation.unwrap_or_else(|| "<anonymous>".to_string());
            log_hit(&app_state.hits, method, path, 404, latency, None, &app_state.mode);
            let err = serde_json::json!({
                "errors": [{ "message": format!("no mock for GraphQL operation '{opname}'") }]
            });
            Some(build_response(404, err.to_string(), &HashMap::new(), 0, headers).await)
        }
    }
}

/// Extract the GraphQL operation name from a JSON body (operationName field,
/// or the named operation in the query document).
fn extract_graphql_operation(body: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    if let Some(name) = v.get("operationName").and_then(|o| o.as_str()) {
        if !name.is_empty() {
            return Some(name.to_string());
        }
    }
    let q = v.get("query").and_then(|q| q.as_str())?;
    let re = regex::Regex::new(r"(?:query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)").ok()?;
    re.captures(q)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
}

fn extract_query_value(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            if k == key {
                return Some(v.to_string());
            }
        }
    }
    None
}

async fn proxy_request(
    app_state: &AppState,
    method: &str,
    path: &str,
    query: &str,
    headers: &HeaderMap,
    body: &str,
    start: Instant,
    matched: Option<MockRoute>,
) -> Response {
    let target = match &app_state.target_url {
        Some(u) => u.clone(),
        None => {
            let latency = start.elapsed().as_millis() as u64;
            log_hit(&app_state.hits, method, path, 502, latency, None, &app_state.mode);
            return build_response(502, r#"{"error":"no targetUrl for proxy mode"}"#.to_string(), &HashMap::new(), 0, headers).await;
        }
    };
    let url = format!("{}{}{}", target.trim_end_matches('/'), path, if query.is_empty() { "".to_string() } else { format!("?{}", query) });

    let client = reqwest::Client::builder().danger_accept_invalid_certs(true).build().unwrap_or_else(|_| reqwest::Client::new());
    let mut req_builder = match method {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "PATCH" => client.patch(&url),
        "DELETE" => client.delete(&url),
        "HEAD" => client.head(&url),
        "OPTIONS" => client.request(reqwest::Method::OPTIONS, &url),
        _ => client.get(&url),
    };

    // Forward headers (skip host, connection)
    for (k, v) in headers.iter() {
        let name = k.as_str().to_lowercase();
        if matches!(name.as_str(), "host" | "connection" | "content-length") {
            continue;
        }
        if let Ok(val) = v.to_str() {
            req_builder = req_builder.header(k.clone(), val);
        }
    }
    if !body.is_empty() {
        req_builder = req_builder.body(body.to_string());
    }

    match req_builder.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let resp_headers = resp.headers().clone();
            let bytes = resp.bytes().await.unwrap_or_default();
            let body_str = String::from_utf8_lossy(&bytes).to_string();
            let latency = start.elapsed().as_millis() as u64;
            log_hit(&app_state.hits, method, path, status, latency, matched.as_ref().map(|r| r.id.clone()), &app_state.mode);

            // Record mode: save as new mock if not already exists
            if app_state.mode == MockMode::Record && matched.is_none() {
                let mut headers_map = HashMap::new();
                for (k, v) in resp_headers.iter() {
                    if let Ok(val) = v.to_str() {
                        headers_map.insert(k.to_string(), val.to_string());
                    }
                }
                let new_route = MockRoute {
                    id: uuid::Uuid::new_v4().to_string(),
                    method: method.to_string(),
                    path: path.to_string(),
                    status,
                    body: body_str.clone(),
                    delay_ms: 0,
                    headers: headers_map.clone(),
                    variants: Vec::new(),
                    state: None,
                    delay: None,
                chaos_latency: None,
                chaos_error_rate: None,
                };
                // Persist to dir
                if let Ok(mut info) = app_state.server_info.try_lock() {
                    // Dedupe: skip if an identical method+path route was already recorded
                    let already = info.routes.iter().any(|r| r.method.eq_ignore_ascii_case(method) && r.path == path);
                    if !already {
                        let dir = mocks_dir_for_server(&info.id, info.mocks_dir.as_deref());
                        // Push into the locked info so subsequent writes accumulate all recordings
                        info.routes.push(new_route.clone());
                        let _ = write_mocks_to_dir(&info, &dir);
                        // Also update in-memory routes
                        if let Ok(mut routes) = app_state.routes.try_lock() {
                            routes.push(new_route);
                        }
                    }
                }
            }

            let mut resp_headers_map = HashMap::new();
            for (k, v) in resp_headers.iter() {
                if let Ok(val) = v.to_str() {
                    resp_headers_map.insert(k.to_string(), val.to_string());
                }
            }
            build_response(status, body_str, &resp_headers_map, 0, headers).await
        }
        Err(e) => {
            let latency = start.elapsed().as_millis() as u64;
            log_hit(&app_state.hits, method, path, 502, latency, None, &app_state.mode);
            build_response(502, format!(r#"{{"error":"proxy failed: {}"}}"#, e), &HashMap::new(), 0, headers).await
        }
    }
}

fn log_hit(hits: &Arc<Mutex<Vec<MockHit>>>, method: &str, path: &str, status: u16, latency: u64, route_id: Option<String>, mode: &MockMode) {
    let mut log = hits.lock().unwrap();
    log.insert(
        0,
        MockHit {
            id: uuid::Uuid::new_v4().to_string(),
            method: method.to_string(),
            path: path.to_string(),
            status,
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            latency_ms: latency,
            matched_route: route_id,
            mode: mode.to_string(),
        },
    );
    log.truncate(500);
}

async fn build_response(status: u16, body: String, headers: &HashMap<String, String>, delay_ms: u64, _req_headers: &HeaderMap) -> Response {
    if delay_ms > 0 {
        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
    }
    let mut builder = Response::builder().status(StatusCode::from_u16(status).unwrap_or(StatusCode::OK));
    // Default CORS and content-type
    builder = builder.header("access-control-allow-origin", "*");
    builder = builder.header("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS");
    builder = builder.header("access-control-allow-headers", "Content-Type, Authorization, X-Mock-Variant, X-Mock-Status");
    let mut has_ct = false;
    for (k, v) in headers {
        if k.eq_ignore_ascii_case("content-type") {
            has_ct = true;
        }
        if let (Ok(name), Ok(val)) = (k.parse::<HeaderName>(), v.parse::<HeaderValue>()) {
            builder = builder.header(name, val);
        }
    }
    if !has_ct {
        builder = builder.header("content-type", "application/json");
    }
    builder.body(Body::from(body)).unwrap_or_else(|_| Response::new(Body::empty()))
}

// ── Tests (keep compat with v1) ──

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_stop_and_hit_roundtrip() {
        let registry = MockRegistry::new();
        let info = MockServerInfo {
            id: "m1".into(),
            name: "test".into(),
            port: 39171,
            running: true,
            routes: vec![MockRoute {
                id: "r1".into(),
                method: "GET".into(),
                path: "/ping".into(),
                status: 200,
                body: "{\"pong\":true}".into(),
                delay_ms: 0,
                headers: HashMap::new(),
                variants: vec![],
                state: None,
                delay: None,
                chaos_latency: None,
                chaos_error_rate: None,
            }],
            mode: MockMode::Mock,
            target_url: None,
            state_enabled: false,
            mocks_dir: None,
            latency_ms: 0,
            graphql_enabled: false,
        };
        // Use a runtime to test async start
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            // We can't easily test axum without running server, but we test registry
            let _ = registry.start(info);
            // Give server time to bind (<500ms requirement)
            tokio::time::sleep(Duration::from_millis(100)).await;
            let hits = registry.hits("m1").expect("hits readable");
            assert!(hits.is_empty());
            registry.stop("m1").expect("server stops");
            assert!(registry.stop("m1").is_err());
        });
    }

    fn test_server(id: &str, port: u16, routes: Vec<MockRoute>, graphql_enabled: bool) -> MockServerInfo {
        MockServerInfo {
            id: id.into(),
            name: "e2e".into(),
            port,
            running: false,
            routes,
            mode: MockMode::Mock,
            target_url: None,
            state_enabled: false,
            mocks_dir: None,
            latency_ms: 0,
            graphql_enabled,
        }
    }

    #[test]
    fn yaml_roundtrip() {
        let route = MockRoute {
            id: "r1".into(),
            method: "GET".into(),
            path: "/users/{id}".into(),
            status: 200,
            body: r#"{"id":"123"}"#.into(),
            delay_ms: 0,
            headers: HashMap::new(),
            variants: vec![MockVariant {
                name: "empty".into(),
                status: 200,
                body: "[]".into(),
                headers: HashMap::new(),
                trigger: Some("query:empty=true".into()),
            }],
            state: Some(crate::mock::state::MockStateConfig {
                scope: "users".into(),
                operation: crate::mock::state::StateOperation::Read,
                key_from: "auto".into(),
            }),
            delay: None,

            chaos_latency: None,

            chaos_error_rate: None,
        };
        let yaml = serde_yaml::to_string(&route).unwrap();
        assert!(yaml.contains("method: GET"));
        let back: MockRoute = serde_yaml::from_str(&yaml).unwrap();
        assert_eq!(back.path, "/users/{id}");
        assert_eq!(back.variants.len(), 1);
    }

    #[test]
    fn path_matching() {
        assert!(path_matches("/users/{id}", "/users/123"));
        assert!(path_matches("/users/:id", "/users/123"));
        assert!(!path_matches("/users/{id}", "/users"));
        assert!(path_matches("/health", "/health"));
        assert!(!path_matches("/users", "/users/123"));
    }

    #[tokio::test]
    async fn stateful_flow_end_to_end() {
        let registry = MockRegistry::new();
        let info = test_server(
            "e2e-state",
            39173,
            vec![
                MockRoute {
                    id: "create".into(),
                    method: "POST".into(),
                    path: "/users".into(),
                    status: 201,
                    body: "{\"created\":true}".into(),
                    delay_ms: 0,
                    headers: HashMap::new(),
                    variants: vec![],
                    state: Some(state::MockStateConfig {
                        scope: "users".into(),
                        operation: state::StateOperation::Create,
                        key_from: "auto".into(),
                    }),
                    delay: None,
                chaos_latency: None,
                chaos_error_rate: None,
                },
                MockRoute {
                    id: "read".into(),
                    method: "GET".into(),
                    path: "/users/{id}".into(),
                    status: 200,
                    body: "{}".into(),
                    delay_ms: 0,
                    headers: HashMap::new(),
                    variants: vec![],
                    state: Some(state::MockStateConfig {
                        scope: "users".into(),
                        operation: state::StateOperation::Read,
                        key_from: "auto".into(),
                    }),
                    delay: None,
                chaos_latency: None,
                chaos_error_rate: None,
                },
            ],
            false,
        );
        registry.start(info).expect("server starts");
        tokio::time::sleep(Duration::from_millis(150)).await;

        let client = reqwest::Client::new();
        let base = "http://127.0.0.1:39173";
        let created = client
            .post(format!("{base}/users"))
            .header("content-type", "application/json")
            .body(r#"{"id":"u1","name":"Ada"}"#)
            .send()
            .await
            .expect("post");
        assert_eq!(created.status().as_u16(), 201);

        let fetched = client.get(format!("{base}/users/u1")).send().await.expect("get");
        assert_eq!(fetched.status().as_u16(), 200);
        let body = fetched.text().await.expect("body");
        assert!(body.contains("Ada"), "stored record should be served, got: {body}");

        let hits = registry.hits("e2e-state").expect("hits");
        assert!(hits.len() >= 2);
        assert!(hits.iter().any(|h| h.matched_route.as_deref() == Some("read")));
        registry.stop("e2e-state").expect("stop");
    }

    #[tokio::test]
    async fn graphql_operation_mocking_end_to_end() {
        let registry = MockRegistry::new();
        let info = test_server(
            "e2e-gql",
            39174,
            vec![MockRoute {
                id: "gq-user".into(),
                method: "GRAPHQL".into(),
                path: "GetUser".into(),
                status: 200,
                body: r#"{"data":{"user":{"name":"Ada"}}}"#.into(),
                delay_ms: 0,
                headers: HashMap::new(),
                variants: vec![],
                state: None,
                delay: None,
                chaos_latency: None,
                chaos_error_rate: None,
            }],
            true,
        );
        registry.start(info).expect("server starts");
        tokio::time::sleep(Duration::from_millis(150)).await;

        let client = reqwest::Client::new();
        let base = "http://127.0.0.1:39174";
        let resp = client
            .post(format!("{base}/graphql"))
            .header("content-type", "application/json")
            .body(r#"{"query":"query GetUser { user { name } }"}"#)
            .send()
            .await
            .expect("post");
        assert_eq!(resp.status().as_u16(), 200);
        assert!(resp.text().await.unwrap().contains("Ada"));

        // Unknown operation -> GraphQL-style 404 error payload
        let resp = client
            .post(format!("{base}/graphql"))
            .header("content-type", "application/json")
            .body(r#"{"query":"query Other { x }"}"#)
            .send()
            .await
            .expect("post");
        assert_eq!(resp.status().as_u16(), 404);
        assert!(resp.text().await.unwrap().contains("no mock for GraphQL operation 'Other'"));
        registry.stop("e2e-gql").expect("stop");
    }

    #[tokio::test]
    async fn hot_reload_route_via_registry() {
        let registry = MockRegistry::new();
        let info = test_server("e2e-hot", 39175, vec![], false);
        registry.start(info).expect("server starts");
        tokio::time::sleep(Duration::from_millis(150)).await;

        registry
            .create_route(
                "e2e-hot",
                MockRoute {
                    id: "late".into(),
                    method: "GET".into(),
                    path: "/late".into(),
                    status: 200,
                    body: "{\"late\":true}".into(),
                    delay_ms: 0,
                    headers: HashMap::new(),
                    variants: vec![],
                    state: None,
                    delay: None,
                chaos_latency: None,
                chaos_error_rate: None,
                },
            )
            .expect("route created");

        let client = reqwest::Client::new();
        let resp = client.get("http://127.0.0.1:39175/late").send().await.expect("get");
        assert_eq!(resp.status().as_u16(), 200);
        assert!(resp.text().await.unwrap().contains("late"));
        registry.stop("e2e-hot").expect("stop");
    }
}
