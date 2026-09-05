use serde_json::{json, Value};
use super::models::SourceScanResult;

pub fn generate_openapi(scan_result: &SourceScanResult) -> Value {
    let mut paths = serde_json::Map::new();

    for route in &scan_result.routes {
        let path_entry = paths.entry(route.path.clone()).or_insert_with(|| Value::Object(serde_json::Map::new()));
        if let Value::Object(map) = path_entry {
            let method_lower = route.method.to_lowercase();
            let mut operation = serde_json::Map::new();

            if !route.handler.is_empty() && route.handler != "anonymous" && route.handler != "chained" {
                operation.insert("summary".to_string(), Value::String(route.handler.clone()));
            } else {
                operation.insert("summary".to_string(), Value::String(format!("{} {}", route.method, route.path)));
            }
            if let Some(desc) = &route.description {
                if !desc.is_empty() {
                    operation.insert("description".to_string(), Value::String(desc.clone()));
                }
            }
            let mut tags = Vec::new();
            // Extract folder-like tag from path
            let segs: Vec<&str> = route.path.split('/').filter(|s| !s.is_empty() && !s.starts_with('{') && !s.starts_with(':')).collect();
            if let Some(first) = segs.first() {
                if !first.starts_with('v') && *first != "api" {
                    tags.push(Value::String(first.to_string()));
                } else if segs.len() > 1 {
                    tags.push(Value::String(segs[1].to_string()));
                }
            }
            if !tags.is_empty() {
                operation.insert("tags".to_string(), Value::Array(tags));
            }

            // Parameters
            let mut params = Vec::new();
            for p in &route.params {
                let loc = match p.location {
                    Some(super::models::ParamLocation::Path) => "path",
                    Some(super::models::ParamLocation::Query) => "query",
                    Some(super::models::ParamLocation::Header) => "header",
                    Some(super::models::ParamLocation::Cookie) => "cookie",
                    _ => {
                        // Infer from path if param name appears in path
                        if route.path.contains(&format!("{{{}}}", p.name)) || route.path.contains(&format!(":{}", p.name)) {
                            "path"
                        } else {
                            "query"
                        }
                    }
                };
                let mut param_obj = serde_json::Map::new();
                param_obj.insert("name".to_string(), Value::String(p.name.clone()));
                param_obj.insert("in".to_string(), Value::String(loc.to_string()));
                param_obj.insert("required".to_string(), Value::Bool(p.required || loc == "path"));
                let mut schema = serde_json::Map::new();
                let type_str = match p.param_type.to_lowercase().as_str() {
                    "int" | "integer" | "number" => "integer",
                    "float" | "double" => "number",
                    "bool" | "boolean" => "boolean",
                    _ => "string",
                };
                schema.insert("type".to_string(), Value::String(type_str.to_string()));
                if let Some(desc) = &p.description {
                    if !desc.is_empty() {
                        param_obj.insert("description".to_string(), Value::String(desc.clone()));
                    }
                }
                param_obj.insert("schema".to_string(), Value::Object(schema));
                params.push(Value::Object(param_obj));
            }
            if !params.is_empty() {
                operation.insert("parameters".to_string(), Value::Array(params));
            }

            // Request body for POST/PUT/PATCH
            if ["post", "put", "patch"].contains(&method_lower.as_str()) {
                if let Some(schema_str) = &route.body_schema {
                    if !schema_str.is_empty() {
                        let mut content = serde_json::Map::new();
                        let mut json_media = serde_json::Map::new();
                        // Try to parse body_schema as JSON example
                        let example: Value = serde_json::from_str(schema_str).unwrap_or(json!({"example": schema_str}));
                        json_media.insert("schema".to_string(), json!({"type": "object"}));
                        json_media.insert("example".to_string(), example);
                        content.insert("application/json".to_string(), Value::Object(json_media));
                        let mut body = serde_json::Map::new();
                        body.insert("content".to_string(), Value::Object(content));
                        operation.insert("requestBody".to_string(), Value::Object(body));
                    }
                } else if route.params.iter().any(|p| matches!(p.location, Some(super::models::ParamLocation::Body))) {
                    let mut content = serde_json::Map::new();
                    content.insert("application/json".to_string(), json!({"schema": {"type": "object"}}));
                    let mut body = serde_json::Map::new();
                    body.insert("content".to_string(), Value::Object(content));
                    operation.insert("requestBody".to_string(), Value::Object(body));
                }
            }

            if route.auth_required {
                operation.insert("security".to_string(), json!([{"bearerAuth": []}]));
            }

            let mut responses = serde_json::Map::new();
            responses.insert("200".to_string(), json!({"description": "Successful response"}));
            if !route.response_schemas.is_empty() {
                // Add additional responses if available
            }
            operation.insert("responses".to_string(), Value::Object(responses));

            map.insert(method_lower, Value::Object(operation));
        }
    }

    let title = format!("{} API", scan_result.framework);
    let version = "1.0.0".to_string();

    let mut info = serde_json::Map::new();
    info.insert("title".to_string(), Value::String(title));
    info.insert("version".to_string(), Value::String(version));
    info.insert("description".to_string(), Value::String(format!("Auto-generated from {} {} codebase. {} routes found in {} files. Confidence: {}%", scan_result.language, scan_result.framework, scan_result.total_routes, scan_result.total_files, (scan_result.confidence * 100.0).round())));

    let mut root = serde_json::Map::new();
    root.insert("openapi".to_string(), Value::String("3.1.0".to_string()));
    root.insert("info".to_string(), Value::Object(info));
    root.insert("paths".to_string(), Value::Object(paths));

    if scan_result.routes.iter().any(|r| r.auth_required) {
        let mut sec = serde_json::Map::new();
        sec.insert("bearerAuth".to_string(), json!({"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}));
        let mut comps = serde_json::Map::new();
        comps.insert("securitySchemes".to_string(), Value::Object(sec));
        root.insert("components".to_string(), Value::Object(comps));
    }

    Value::Object(root)
}

#[tauri::command]
pub fn scanner_export_openapi(scan_result: SourceScanResult, output_path: Option<String>) -> Result<String, String> {
    let openapi = generate_openapi(&scan_result);
    let json_str = serde_json::to_string_pretty(&openapi).map_err(|e| e.to_string())?;

    if let Some(out) = output_path {
        let p = std::path::PathBuf::from(out.clone());
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&p, &json_str).map_err(|e| e.to_string())?;
        return Ok(p.to_string_lossy().to_string());
    }

    // Default: write to ~/APIForge/<framework>-openapi.json
    if let Some(home) = dirs::home_dir() {
        let dir = home.join("APIForge");
        let _ = std::fs::create_dir_all(&dir);
        let file = dir.join(format!("{}-openapi.json", scan_result.framework.to_string().to_lowercase().replace(' ', "-")));
        if let Ok(_) = std::fs::write(&file, &json_str) {
            return Ok(file.to_string_lossy().to_string());
        }
    }
    // Fallback: return JSON string directly if file write fails
    Ok(json_str)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::models::{BackendFramework, ScannerLanguage, ScannedRoute, RouteParam, ParamLocation, SourceScanResult};

    fn make_route(method: &str, path: &str, auth: bool) -> ScannedRoute {
        ScannedRoute {
            method: method.to_string(),
            path: path.to_string(),
            handler: "handler".to_string(),
            middlewares: vec![],
            file: "test.js".to_string(),
            line: 1,
            params: vec![RouteParam { name: "id".to_string(), param_type: "string".to_string(), required: true, description: None, location: Some(ParamLocation::Path) }],
            description: None,
            auth_required: auth,
            body_schema: None,
            response_schemas: vec![],
        }
    }

    #[test]
    fn test_generate_openapi_basic() {
        let scan = SourceScanResult {
            framework: BackendFramework::Express,
            language: ScannerLanguage::JavaScript,
            confidence: 0.85,
            total_files: 2,
            total_routes: 2,
            routes: vec![make_route("GET", "/users/{id}", true), make_route("POST", "/users", false)],
            warnings: vec![],
        };
        let openapi = generate_openapi(&scan);
        assert_eq!(openapi["openapi"], "3.1.0");
        assert!(openapi["paths"]["/users/{id}"]["get"].is_object());
        assert!(openapi["paths"]["/users"]["post"].is_object());
        // Auth should add security
        assert!(openapi["paths"]["/users/{id}"]["get"]["security"].is_array());
    }

    #[test]
    fn test_roundtrip_paths() {
        let scan = SourceScanResult {
            framework: BackendFramework::Express,
            language: ScannerLanguage::JavaScript,
            confidence: 0.85,
            total_files: 1,
            total_routes: 1,
            routes: vec![ScannedRoute {
                method: "GET".to_string(),
                path: "/api/v1/users/{id}".to_string(),
                handler: "getUser".to_string(),
                middlewares: vec![],
                file: "a.js".to_string(),
                line: 10,
                params: vec![],
                description: None,
                auth_required: false,
                body_schema: None,
                response_schemas: vec![],
            }],
            warnings: vec![],
        };
        let openapi = generate_openapi(&scan);
        let paths = openapi["paths"].as_object().unwrap();
        assert!(paths.contains_key("/api/v1/users/{id}"));
    }
}
