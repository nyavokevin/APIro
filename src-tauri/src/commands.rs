//! Tauri commands exposed to the renderer, wired to the shared HTTP / Git /
//! Mock / YAML / Store engines. Kept in their own module so the
//! `generate_handler!` macro-namespace stays conflict-free.

use crate::collections::{self, Node};
use crate::git;
use crate::http;
use crate::mock::{MockHit, MockRegistry, MockServerInfo};
use crate::store::{CookieRow, HistoryItem, Store};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::State;
use tokio_util::sync::CancellationToken;

pub type CancellationMap = DashMap<String, CancellationToken>;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub path: String,
    pub is_git_repo: bool,
    pub branch: Option<String>,
}

/// Default workspace: ~/APIForge (Git-native collections live here).
pub fn default_workspace() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("APIForge")
}

#[tauri::command]
pub async fn requests_execute(
    request: http::RequestInput,
    variables: Vec<EnvVar>,
    run_id: Option<String>,
    store: State<'_, Store>,
    cancel_map: State<'_, CancellationMap>,
) -> Result<http::ApiResponse, String> {
    let mut vars: HashMap<String, String> = HashMap::new();
    for v in variables {
        vars.insert(v.key, v.value);
    }
    let token = if let Some(id) = run_id.clone() {
        let t = CancellationToken::new();
        cancel_map.insert(id, t.clone());
        Some(t)
    } else {
        None
    };
    let response = if let Some(t) = token.clone() {
        // Check cancelled before start
        if t.is_cancelled() {
            return Ok(http::error_response_cancelled());
        }
        tokio::select! {
            res = http::execute(&request, &vars, Some(t.clone())) => res,
            _ = t.cancelled() => http::error_response_cancelled(),
        }
    } else {
        http::execute(&request, &vars, None).await
    };
    if let Some(id) = run_id {
        cancel_map.remove(&id);
    }
    let _ = store.record_history(
        None,
        &request.method,
        &http::resolve(&request.url, &vars),
        Some(response.status_code).filter(|s| *s > 0),
        Some(response.response_time).filter(|t| *t > 0),
        &serde_json::to_string(&request.headers).unwrap_or_default(),
        &serde_json::to_string(&response.headers).unwrap_or_default(),
        &response.body,
        response.error.as_deref(),
        &serde_json::to_string(&request.params).unwrap_or_default(),
        &request.body,
        &request.body_type,
    );
    Ok(response)
}

#[tauri::command]
pub fn requests_cancel(run_id: String, cancel_map: State<'_, CancellationMap>) -> Result<(), String> {
    if let Some((_, token)) = cancel_map.remove(&run_id) {
        token.cancel();
    }
    Ok(())
}

#[tauri::command]
pub fn requests_history(limit: u32, store: State<'_, Store>) -> Result<Vec<HistoryItem>, String> {
    store.history(limit)
}

#[tauri::command]
pub fn workspace_info(store: State<'_, Store>) -> Result<WorkspaceInfo, String> {
    let path = store
        .get_setting("workspace_path")?
        .map(PathBuf::from)
        .unwrap_or_else(default_workspace);
    let is_repo = git::is_repo(&path);
    Ok(WorkspaceInfo {
        path: path.to_string_lossy().to_string(),
        is_git_repo: is_repo,
        branch: if is_repo { git::branch(&path).ok() } else { None },
    })
}

#[tauri::command]
pub fn git_status(dir: String) -> Result<Vec<String>, String> {
    git::status(PathBuf::from(dir).as_path())
}

#[tauri::command]
pub fn git_diff(dir: String, path: Option<String>) -> Result<String, String> {
    let dir = PathBuf::from(dir);
    match path {
        Some(p) => git::diff_file(&dir, &p),
        None => git::diff_all(&dir),
    }
}

#[tauri::command]
pub fn mock_start(info: MockServerInfo, registry: State<'_, MockRegistry>) -> Result<(), String> {
    registry.start(info)
}

#[tauri::command]
pub fn mock_stop(id: String, registry: State<'_, MockRegistry>) -> Result<(), String> {
    registry.stop(&id)
}

#[tauri::command]
pub fn mock_hits(id: String, registry: State<'_, MockRegistry>) -> Result<Vec<MockHit>, String> {
    registry.hits(&id)
}

#[tauri::command]
pub fn yaml_read_tree(dir: Option<String>) -> Result<Vec<Node>, String> {
    let dir = dir.map(PathBuf::from).unwrap_or_else(default_workspace);
    collections::read_tree(&dir)
}

#[tauri::command]
pub fn yaml_save_tree(dir: Option<String>, tree: Node) -> Result<Vec<String>, String> {
    let dir = dir.map(PathBuf::from).unwrap_or_else(default_workspace);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    collections::write_tree(&tree, &dir)
        .map(|files| files.iter().map(|p| p.to_string_lossy().to_string()).collect())
}

#[tauri::command]
pub fn yaml_replace_all(dir: Option<String>, nodes: Vec<Node>) -> Result<Vec<String>, String> {
    let dir = dir.map(PathBuf::from).unwrap_or_else(default_workspace);
    collections::replace_all(&nodes, &dir)
        .map(|files| files.iter().map(|p| p.to_string_lossy().to_string()).collect())
}

#[tauri::command]
pub fn settings_get(key: String, store: State<'_, Store>) -> Result<Option<String>, String> {
    store.get_setting(&key)
}

#[tauri::command]
pub fn settings_set(key: String, value: String, store: State<'_, Store>) -> Result<(), String> {
    store.set_setting(&key, &value)
}

#[tauri::command]
pub fn cookies_for(domain: String, store: State<'_, Store>) -> Result<Vec<CookieRow>, String> {
    store.cookies_for(&domain)
}
