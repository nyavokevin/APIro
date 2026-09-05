use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use super::models::{SourceScanResult, ScannedRoute};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldChange {
    pub field: String,
    pub old_value: String,
    pub new_value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteChange {
    pub route: ScannedRoute,
    pub changes: Vec<FieldChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanDiff {
    pub added: Vec<ScannedRoute>,
    pub removed: Vec<ScannedRoute>,
    pub modified: Vec<RouteChange>,
    pub previous_timestamp: Option<u64>,
    pub current_timestamp: Option<u64>,
}

fn route_key(route: &ScannedRoute) -> String {
    format!("{}:{}", route.method.to_uppercase(), route.path)
}

fn params_signature(params: &[super::models::RouteParam]) -> String {
    let mut v: Vec<String> = params.iter().map(|p| format!("{}:{:?}:{}", p.name, p.location, p.required)).collect();
    v.sort();
    v.join("|")
}

pub fn diff_scans(previous: &SourceScanResult, current: &SourceScanResult) -> ScanDiff {
    let prev_map: HashMap<String, &ScannedRoute> = previous.routes.iter().map(|r| (route_key(r), r)).collect();
    let curr_map: HashMap<String, &ScannedRoute> = current.routes.iter().map(|r| (route_key(r), r)).collect();

    let prev_keys: HashSet<String> = prev_map.keys().cloned().collect();
    let curr_keys: HashSet<String> = curr_map.keys().cloned().collect();

    let mut added = Vec::new();
    let mut removed = Vec::new();
    let mut modified = Vec::new();

    for key in curr_keys.difference(&prev_keys) {
        if let Some(r) = curr_map.get(key) {
            added.push((*r).clone());
        }
    }
    for key in prev_keys.difference(&curr_keys) {
        if let Some(r) = prev_map.get(key) {
            removed.push((*r).clone());
        }
    }
    for key in prev_keys.intersection(&curr_keys) {
        if let (Some(prev_r), Some(curr_r)) = (prev_map.get(key), curr_map.get(key)) {
            let mut changes = Vec::new();
            if prev_r.auth_required != curr_r.auth_required {
                changes.push(FieldChange {
                    field: "auth_required".to_string(),
                    old_value: prev_r.auth_required.to_string(),
                    new_value: curr_r.auth_required.to_string(),
                });
            }
            if prev_r.method != curr_r.method {
                changes.push(FieldChange {
                    field: "method".to_string(),
                    old_value: prev_r.method.clone(),
                    new_value: curr_r.method.clone(),
                });
            }
            let prev_params = params_signature(&prev_r.params);
            let curr_params = params_signature(&curr_r.params);
            if prev_params != curr_params {
                changes.push(FieldChange {
                    field: "params".to_string(),
                    old_value: prev_params,
                    new_value: curr_params,
                });
            }
            let prev_body = prev_r.body_schema.clone().unwrap_or_default();
            let curr_body = curr_r.body_schema.clone().unwrap_or_default();
            if prev_body != curr_body {
                changes.push(FieldChange {
                    field: "body_schema".to_string(),
                    old_value: prev_body,
                    new_value: curr_body,
                });
            }
            if !changes.is_empty() {
                modified.push(RouteChange {
                    route: (*curr_r).clone(),
                    changes,
                });
            }
        }
    }

    added.sort_by(|a, b| a.path.cmp(&b.path).then(a.method.cmp(&b.method)));
    removed.sort_by(|a, b| a.path.cmp(&b.path).then(a.method.cmp(&b.method)));
    modified.sort_by(|a, b| a.route.path.cmp(&b.route.path));

    ScanDiff {
        added,
        removed,
        modified,
        previous_timestamp: None,
        current_timestamp: None,
    }
}

// --- History persistence ---

fn project_hash(project_path: &str) -> String {
    // Simple sanitized hash: replace non-alphanumeric with _
    let mut s = String::new();
    for c in project_path.chars() {
        if c.is_alphanumeric() {
            s.push(c);
        } else {
            s.push('_');
        }
    }
    if s.len() > 64 {
        s.truncate(64);
    }
    // Add short hash suffix to avoid collisions for similar paths
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    project_path.hash(&mut hasher);
    let h = hasher.finish();
    format!("{}_{:x}", s, h & 0xFFFFFF)
}

fn history_dir(project_path: &str) -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    Some(home.join(".apiforge").join("scan-history").join(project_hash(project_path)))
}

pub fn save_scan_history(project_path: &str, result: &SourceScanResult) -> Result<String, String> {
    let dir = history_dir(project_path).ok_or("Could not determine home directory")?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let file = dir.join(format!("{}.json", ts));
    let json = serde_json::to_string_pretty(result).map_err(|e| e.to_string())?;
    fs::write(&file, json).map_err(|e| e.to_string())?;

    // Keep only 10 latest
    let mut entries: Vec<PathBuf> = fs::read_dir(&dir).map_err(|e| e.to_string())?
        .filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.extension().map(|e| e=="json").unwrap_or(false)).collect();
    entries.sort_by_key(|p| p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default());
    if entries.len() > 10 {
        let to_remove = entries.len() - 10;
        for p in entries.iter().take(to_remove) {
            let _ = fs::remove_file(p);
        }
    }
    Ok(file.to_string_lossy().to_string())
}

pub fn get_last_scan(project_path: &str) -> Result<Option<SourceScanResult>, String> {
    let dir = match history_dir(project_path) {
        Some(d) => d,
        None => return Ok(None),
    };
    if !dir.exists() {
        return Ok(None);
    }
    let mut entries: Vec<PathBuf> = fs::read_dir(&dir).map_err(|e| e.to_string())?
        .filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.extension().map(|e| e=="json").unwrap_or(false)).collect();
    if entries.is_empty() {
        return Ok(None);
    }
    entries.sort_by_key(|p| p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default());
    // Latest is last sorted (timestamp filename)
    let latest = entries.last().unwrap();
    let content = fs::read_to_string(latest).map_err(|e| e.to_string())?;
    let result: SourceScanResult = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(Some(result))
}

pub fn get_scan_history(project_path: &str) -> Result<Vec<SourceScanResult>, String> {
    let dir = match history_dir(project_path) {
        Some(d) => d,
        None => return Ok(vec![]),
    };
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut entries: Vec<PathBuf> = fs::read_dir(&dir).map_err(|e| e.to_string())?
        .filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.extension().map(|e| e=="json").unwrap_or(false)).collect();
    entries.sort_by_key(|p| p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default());
    let mut out = Vec::new();
    for p in entries.iter().rev().take(10) {
        if let Ok(c) = fs::read_to_string(p) {
            if let Ok(r) = serde_json::from_str::<SourceScanResult>(&c) {
                out.push(r);
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn scanner_get_last_scan(project_path: String) -> Result<Option<SourceScanResult>, String> {
    get_last_scan(&project_path)
}

#[tauri::command]
pub fn scanner_diff_scans(previous: SourceScanResult, current: SourceScanResult) -> Result<ScanDiff, String> {
    Ok(diff_scans(&previous, &current))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::models::{RouteParam, ParamLocation, ScannerLanguage, BackendFramework};

    fn make_route(method: &str, path: &str, auth: bool, params: Vec<RouteParam>) -> ScannedRoute {
        ScannedRoute {
            method: method.to_string(),
            path: path.to_string(),
            handler: "handler".to_string(),
            middlewares: vec![],
            file: "test.js".to_string(),
            line: 1,
            params,
            description: None,
            auth_required: auth,
            body_schema: None,
            response_schemas: vec![],
        }
    }

    fn make_result(routes: Vec<ScannedRoute>) -> SourceScanResult {
        SourceScanResult {
            framework: BackendFramework::Express,
            language: ScannerLanguage::JavaScript,
            confidence: 0.85,
            total_files: 1,
            total_routes: routes.len(),
            routes,
            warnings: vec![],
        }
    }

    #[test]
    fn test_no_change() {
        let r = make_route("GET", "/users", false, vec![]);
        let prev = make_result(vec![r.clone()]);
        let curr = make_result(vec![r]);
        let diff = diff_scans(&prev, &curr);
        assert!(diff.added.is_empty());
        assert!(diff.removed.is_empty());
        assert!(diff.modified.is_empty());
    }

    #[test]
    fn test_added() {
        let prev = make_result(vec![make_route("GET", "/users", false, vec![])]);
        let curr = make_result(vec![make_route("GET", "/users", false, vec![]), make_route("POST", "/users", true, vec![])]);
        let diff = diff_scans(&prev, &curr);
        assert_eq!(diff.added.len(), 1);
        assert_eq!(diff.added[0].path, "/users");
        assert_eq!(diff.added[0].method, "POST");
    }

    #[test]
    fn test_removed() {
        let r1 = make_route("GET", "/users", false, vec![]);
        let r2 = make_route("GET", "/posts", false, vec![]);
        let prev = make_result(vec![r1.clone(), r2.clone()]);
        let curr = make_result(vec![r1]);
        let diff = diff_scans(&prev, &curr);
        assert_eq!(diff.removed.len(), 1);
        assert_eq!(diff.removed[0].path, "/posts");
    }

    #[test]
    fn test_modified_auth() {
        let prev = make_result(vec![make_route("GET", "/users/{id}", true, vec![RouteParam { name: "id".to_string(), param_type: "string".to_string(), required: true, description: None, location: Some(ParamLocation::Path)}])]);
        let mut curr_route = make_route("GET", "/users/{id}", false, vec![RouteParam { name: "id".to_string(), param_type: "string".to_string(), required: true, description: None, location: Some(ParamLocation::Path)}]);
        // auth changed from true to false
        let curr = make_result(vec![curr_route]);
        let diff = diff_scans(&prev, &curr);
        assert_eq!(diff.modified.len(), 1);
        assert_eq!(diff.modified[0].changes[0].field, "auth_required");
        assert_eq!(diff.modified[0].changes[0].old_value, "true");
        assert_eq!(diff.modified[0].changes[0].new_value, "false");
    }

    #[test]
    fn test_modified_params() {
        let prev = make_result(vec![make_route("GET", "/users/{id}", false, vec![RouteParam { name: "id".to_string(), param_type: "string".to_string(), required: true, description: None, location: Some(ParamLocation::Path)}])]);
        let curr = make_result(vec![make_route("GET", "/users/{id}", false, vec![
            RouteParam { name: "id".to_string(), param_type: "string".to_string(), required: true, description: None, location: Some(ParamLocation::Path)},
            RouteParam { name: "includePosts".to_string(), param_type: "boolean".to_string(), required: false, description: None, location: Some(ParamLocation::Query)},
        ])]);
        let diff = diff_scans(&prev, &curr);
        assert_eq!(diff.modified.len(), 1);
        assert!(diff.modified[0].changes.iter().any(|c| c.field == "params"));
    }
}
