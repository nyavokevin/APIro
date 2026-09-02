//! OpenAPI → Mock YAML generator — spec-driven, faker-based.
//! One file per route, git-diffable, with example responses per schema type.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::{MockRoute, MockVariant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationOptions {
    #[serde(default = "default_base_url")]
    pub base_url: String,
    #[serde(default)]
    pub generate_variants: bool,
    #[serde(default)]
    pub status_codes: Vec<u16>,
}

fn default_base_url() -> String {
    "http://localhost:3000".to_string()
}

impl Default for GenerationOptions {
    fn default() -> Self {
        Self {
            base_url: default_base_url(),
            generate_variants: true,
            status_codes: vec![200, 201, 400, 404, 500],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationResult {
    pub routes: Vec<MockRoute>,
    pub warnings: Vec<String>,
    pub spec_title: Option<String>,
    pub spec_version: Option<String>,
}

/// Generate mock routes from an OpenAPI spec (swagger.json / openapi.yaml already parsed to Value)
pub fn generate_from_openapi(spec: &Value, opts: &GenerationOptions) -> GenerationResult {
    let mut warnings = Vec::new();
    let mut routes = Vec::new();

    let title = spec
        .get("info")
        .and_then(|i| i.get("title"))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string());
    let version = spec
        .get("info")
        .and_then(|i| i.get("version"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let paths = match spec.get("paths").and_then(|p| p.as_object()) {
        Some(m) => m,
        None => {
            warnings.push("No 'paths' found in spec".to_string());
            return GenerationResult {
                routes,
                warnings,
                spec_title: title,
                spec_version: version,
            };
        }
    };

    for (path, item) in paths {
        let Some(obj) = item.as_object() else { continue };
        // Collect global parameters
        let _global_params = obj.get("parameters");

        for method in ["get", "post", "put", "patch", "delete", "head", "options", "trace"] {
            let Some(op) = obj.get(method) else { continue };
            let Some(op_obj) = op.as_object() else { continue };

            let summary = op_obj
                .get("summary")
                .and_then(|s| s.as_str())
                .or_else(|| op_obj.get("operationId").and_then(|s| s.as_str()))
                .unwrap_or(method)
                .to_string();
            let operation_id = op_obj
                .get("operationId")
                .and_then(|s| s.as_str())
                .unwrap_or(&summary)
                .to_string();

            let status = infer_status_for_method(method);
            let body = generate_response_body(op_obj, path, method, spec);

            let mut variants = Vec::new();
            if opts.generate_variants {
                variants = generate_variants(op_obj, path, method, spec);
            }

            let route = MockRoute {
                id: format!("{}-{}-{}", method.to_uppercase(), sanitize_path(path), uuid::Uuid::new_v4().simple().to_string()[..6].to_string()),
                method: method.to_uppercase(),
                path: path.clone(),
                status,
                body,
                delay_ms: 0,
                headers: {
                    let mut h = HashMap::new();
                    h.insert("Content-Type".to_string(), "application/json".to_string());
                    h
                },
                variants,
                state: infer_state_config(path, method),
                delay: None,
            };

            // Avoid duplicates
            if !routes.iter().any(|r: &MockRoute| r.method == route.method && r.path == route.path) {
                routes.push(route);
            } else {
                warnings.push(format!("Duplicate route skipped: {} {}", method.to_uppercase(), path));
            }

            let _ = operation_id; // keep for future use
        }
    }

    warnings.extend(diff_warnings(spec, &routes));

    GenerationResult {
        routes,
        warnings,
        spec_title: title,
        spec_version: version,
    }
}

fn sanitize_path(p: &str) -> String {
    p.chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn infer_status_for_method(method: &str) -> u16 {
    match method {
        "post" => 201,
        "delete" => 204,
        _ => 200,
    }
}

fn generate_response_body(op: &serde_json::Map<String, Value>, path: &str, method: &str, spec: &Value) -> String {
    // Try to find example from spec: responses -> 200 -> content -> application/json -> example / schema
    if let Some(responses) = op.get("responses").and_then(|r| r.as_object()) {
        for code in ["200", "201", "default"] {
            if let Some(resp) = responses.get(code) {
                if let Some(content) = resp.get("content").and_then(|c| c.as_object()) {
                    if let Some(json_content) = content.get("application/json") {
                        if let Some(example) = json_content.get("example") {
                            return serde_json::to_string_pretty(example).unwrap_or_else(|_| "{}".to_string());
                        }
                        if let Some(examples) = json_content.get("examples").and_then(|e| e.as_object()) {
                            if let Some(first) = examples.values().next() {
                                if let Some(val) = first.get("value") {
                                    return serde_json::to_string_pretty(val).unwrap_or_else(|_| "{}".to_string());
                                }
                            }
                        }
                        if let Some(schema) = json_content.get("schema") {
                            let generated = generate_from_schema(schema, spec, path, method, 0);
                            return serde_json::to_string_pretty(&generated).unwrap_or_else(|_| "{}".to_string());
                        }
                    }
                }
                // For swagger 2.0: schema directly
                if let Some(schema) = resp.get("schema") {
                    let generated = generate_from_schema(schema, spec, path, method, 0);
                    return serde_json::to_string_pretty(&generated).unwrap_or_else(|_| "{}".to_string());
                }
            }
        }
        // Try to infer from requestBody schema (for POST)
        if let Some(req_body) = op.get("requestBody") {
            if let Some(content) = req_body.get("content").and_then(|c| c.as_object()) {
                if let Some(schema) = content.get("application/json").and_then(|j| j.get("schema")) {
                    let generated = generate_from_schema(schema, spec, path, method, 0);
                    return serde_json::to_string_pretty(&generated).unwrap_or_else(|_| "{}".to_string());
                }
            }
        }
    }

    // Fallback: generate from path/method heuristics
    let fallback = generate_fallback_body(path, method);
    serde_json::to_string_pretty(&fallback).unwrap_or_else(|_| "{}".to_string())
}

fn generate_from_schema(schema: &Value, spec: &Value, path: &str, method: &str, depth: usize) -> Value {
    if depth > 5 {
        return json!({});
    }
    // Resolve $ref
    if let Some(ref_str) = schema.get("$ref").and_then(|r| r.as_str()) {
        if let Some(resolved) = resolve_ref(ref_str, spec) {
            return generate_from_schema(&resolved, spec, path, method, depth + 1);
        }
    }

    // Handle enum -> pick first
    if let Some(enum_vals) = schema.get("enum").and_then(|e| e.as_array()) {
        if let Some(first) = enum_vals.first() {
            return first.clone();
        }
    }

    // Handle example
    if let Some(ex) = schema.get("example") {
        return ex.clone();
    }

    let schema_type = schema.get("type").and_then(|t| t.as_str()).unwrap_or("object");

    match schema_type {
        "string" => {
            let format = schema.get("format").and_then(|f| f.as_str()).unwrap_or("");
            // Try to infer from property name if available via parent
            generate_string_for_format(format, path)
        }
        "integer" | "number" => {
            if let (Some(min), Some(max)) = (schema.get("minimum").and_then(|v| v.as_i64()), schema.get("maximum").and_then(|v| v.as_i64())) {
                json!((min + max) / 2)
            } else {
                json!(42)
            }
        }
        "boolean" => json!(true),
        "array" => {
            if let Some(items) = schema.get("items") {
                let item_val = generate_from_schema(items, spec, path, method, depth + 1);
                json!([item_val])
            } else {
                json!([])
            }
        }
        "object" => {
            let mut obj = serde_json::Map::new();
            if let Some(props) = schema.get("properties").and_then(|p| p.as_object()) {
                for (key, prop_schema) in props {
                    obj.insert(key.clone(), generate_from_schema(prop_schema, spec, key, method, depth + 1));
                }
                // Also include required handling
                if obj.is_empty() {
                    // Fallback to path-based
                    return generate_fallback_body(path, method);
                }
            } else if let Some(additional) = schema.get("additionalProperties") {
                if additional.as_bool() == Some(true) {
                    obj.insert("key".to_string(), json!("value"));
                }
            } else {
                return generate_fallback_body(path, method);
            }
            Value::Object(obj)
        }
        _ => {
            // Try anyOf/oneOf
            if let Some(any_of) = schema.get("anyOf").and_then(|a| a.as_array()).and_then(|arr| arr.first()) {
                return generate_from_schema(any_of, spec, path, method, depth + 1);
            }
            if let Some(one_of) = schema.get("oneOf").and_then(|o| o.as_array()).and_then(|arr| arr.first()) {
                return generate_from_schema(one_of, spec, path, method, depth + 1);
            }
            json!({})
        }
    }
}

fn resolve_ref(ref_str: &str, spec: &Value) -> Option<Value> {
    // ref_str like "#/components/schemas/User" or "#/definitions/User"
    let parts: Vec<&str> = ref_str.trim_start_matches('#').trim_start_matches('/').split('/').collect();
    let mut cur = spec;
    for part in parts {
        let decoded = part.replace("~1", "/").replace("~0", "~");
        cur = cur.get(&decoded)?;
    }
    Some(cur.clone())
}

fn generate_string_for_format(format: &str, field_name: &str) -> Value {
    let lower = field_name.to_lowercase();
    // Reuse seed logic heuristics
    if lower.contains("email") {
        json!(format!("user{}@example.com", rand_suffix(3)))
    } else if lower.contains("uuid") || lower.contains("guid") || lower == "id" {
        json!(uuid::Uuid::new_v4().to_string())
    } else if lower.contains("name") {
        json!("John Doe")
    } else if lower.contains("date") || lower.contains("time") || format == "date" || format == "date-time" {
        json!(chrono::Utc::now().to_rfc3339())
    } else if lower.contains("url") || lower.contains("uri") {
        json!("https://example.com/resource")
    } else if lower.contains("price") || lower.contains("amount") || lower.contains("cost") {
        json!(format!("{:.2}", 19.99 + (rand_u32() % 100) as f64))
    } else if lower.contains("phone") {
        json!("+1-555-0100")
    } else if lower.contains("address") {
        json!("123 Main St, New York, NY 10001")
    } else if format == "email" {
        json!("test@example.com")
    } else if format == "uuid" {
        json!(uuid::Uuid::new_v4().to_string())
    } else if format == "uri" {
        json!("https://example.com")
    } else {
        json!(format!("example_{}", rand_suffix(4)))
    }
}

fn rand_suffix(n: usize) -> String {
    const CHARS: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut s = String::new();
    for _ in 0..n {
        let idx = (uuid::Uuid::new_v4().as_u128() as usize) % CHARS.len();
        s.push(CHARS[idx] as char);
    }
    s
}

fn rand_u32() -> u32 {
    uuid::Uuid::new_v4().as_u128() as u32
}

fn generate_fallback_body(path: &str, method: &str) -> Value {
    // Infer from path segments
    if path.contains("/users") {
        if method == "get" && path.contains("{") {
            json!({"id": uuid::Uuid::new_v4().to_string(), "name": "Alice", "email": "alice@example.com", "role": "user"})
        } else if method == "get" {
            json!([{"id": uuid::Uuid::new_v4().to_string(), "name": "Alice"}, {"id": uuid::Uuid::new_v4().to_string(), "name": "Bob"}])
        } else if method == "post" {
            json!({"id": uuid::Uuid::new_v4().to_string(), "name": "New User", "email": "new@example.com"})
        } else {
            json!({"message": "ok"})
        }
    } else if path.contains("/products") {
        json!({"id": format!("SKU-{}", rand_suffix(6).to_uppercase()), "name": "Sample Product", "price": 29.99, "inStock": true})
    } else if path.contains("/orders") {
        json!({"id": uuid::Uuid::new_v4().to_string(), "status": "pending", "total": 99.99})
    } else if path.contains("/auth") {
        json!({"token": format!("eyJhbGciOiJIUzI1NiJ9.{}", rand_suffix(10)), "expires_in": 3600})
    } else {
        json!({"message": "mock response", "timestamp": chrono::Utc::now().to_rfc3339()})
    }
}

fn generate_variants(op: &serde_json::Map<String, Value>, path: &str, method: &str, spec: &Value) -> Vec<MockVariant> {
    let mut variants = Vec::new();

    // Success variant already covered as main route, but add explicit
    // Validation error
    variants.push(MockVariant {
        name: "validation-error".to_string(),
        status: 400,
        body: serde_json::to_string_pretty(&json!({"error": "validation failed", "details": "Invalid input"})).unwrap(),
        headers: HashMap::new(),
        trigger: Some("header:x-mock-variant=validation-error".to_string()),
    });

    // Server error
    variants.push(MockVariant {
        name: "server-error".to_string(),
        status: 500,
        body: serde_json::to_string_pretty(&json!({"error": "internal server error"})).unwrap(),
        headers: HashMap::new(),
        trigger: Some("header:x-mock-variant=server-error".to_string()),
    });

    // Empty list for GET list endpoints
    if method == "get" && !path.contains('{') && !path.contains(':') {
        variants.push(MockVariant {
            name: "empty-list".to_string(),
            status: 200,
            body: "[]".to_string(),
            headers: HashMap::new(),
            trigger: Some("query:empty=true".to_string()),
        });
    }

    // Auth error if op has security
    if op.contains_key("security") {
        variants.push(MockVariant {
            name: "unauthorized".to_string(),
            status: 401,
            body: serde_json::to_string_pretty(&json!({"error": "unauthorized"})).unwrap(),
            headers: HashMap::new(),
            trigger: Some("header:authorization=missing".to_string()),
        });
    }

    // Try to add variant from spec's 4xx/5xx examples if present
    if let Some(responses) = op.get("responses").and_then(|r| r.as_object()) {
        for (code, resp) in responses {
            if code.starts_with('4') || code.starts_with('5') {
                if let Some(content) = resp.get("content").and_then(|c| c.as_object()) {
                    if let Some(json_content) = content.get("application/json") {
                        if let Some(example) = json_content.get("example") {
                            variants.push(MockVariant {
                                name: format!("spec-{}", code),
                                status: code.parse().unwrap_or(400),
                                body: serde_json::to_string_pretty(example).unwrap(),
                                headers: HashMap::new(),
                                trigger: Some(format!("header:x-mock-status={}", code)),
                            });
                        }
                    }
                }
            }
        }
    }

    variants
}

fn diff_warnings(spec: &Value, routes: &[MockRoute]) -> Vec<String> {
    // Placeholder for diff logic: compare spec paths vs existing routes (caller provides existing)
    // For now, just return empty; diff is handled in the caller that has existing mocks
    let _ = (spec, routes);
    Vec::new()
}

pub fn diff_specs(old_spec: &Value, new_spec: &Value) -> DiffResult {
    let old_paths = old_spec.get("paths").and_then(|p| p.as_object()).map(|m| m.keys().cloned().collect::<std::collections::HashSet<_>>()).unwrap_or_default();
    let new_paths = new_spec.get("paths").and_then(|p| p.as_object()).map(|m| m.keys().cloned().collect::<std::collections::HashSet<_>>()).unwrap_or_default();

    let mut added = Vec::new();
    let mut removed = Vec::new();
    let mut changed = Vec::new();

    for p in new_paths.difference(&old_paths) {
        added.push(p.clone());
    }
    for p in old_paths.difference(&new_paths) {
        removed.push(p.clone());
    }
    for p in new_paths.intersection(&old_paths) {
        let old_item = old_spec.get("paths").and_then(|ps| ps.get(p));
        let new_item = new_spec.get("paths").and_then(|ps| ps.get(p));
        if old_item != new_item {
            changed.push(p.clone());
        }
    }

    DiffResult { added, removed, changed }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResult {
    pub added: Vec<String>,
    pub removed: Vec<String>,
    pub changed: Vec<String>,
}

fn infer_state_config(path: &str, method: &str) -> Option<crate::mock::state::MockStateConfig> {
    // Simple heuristics for stateful mocks: POST /users -> Create on "users", GET /users/{id} -> Read, DELETE -> Delete
    let scope = extract_scope(path)?;
    let operation = match method {
        "post" => crate::mock::state::StateOperation::Create,
        "get" if path.contains('{') || path.contains(':') => crate::mock::state::StateOperation::Read,
        "get" => crate::mock::state::StateOperation::List,
        "put" | "patch" => crate::mock::state::StateOperation::Update,
        "delete" => crate::mock::state::StateOperation::Delete,
        _ => crate::mock::state::StateOperation::None,
    };
    if operation == crate::mock::state::StateOperation::None {
        return None;
    }
    Some(crate::mock::state::MockStateConfig {
        scope,
        operation,
        key_from: "auto".to_string(),
    })
}

fn extract_scope(path: &str) -> Option<String> {
    // /api/v1/users/{id} -> "users"
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty() && !s.starts_with('{') && !s.starts_with(':') && *s != "api" && !s.starts_with('v')).collect();
    let first = segments.first()?;
    // Skip if it's like "auth" with no id param? Still use it
    Some(first.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn generates_from_simple_openapi() {
        let spec = json!({
            "openapi": "3.0.0",
            "info": {"title": "Test", "version": "1.0"},
            "paths": {
                "/users": {
                    "get": {"summary": "List users", "responses": {"200": {"description": "ok"}}},
                    "post": {"summary": "Create user", "requestBody": {"content": {"application/json": {"schema": {"type": "object", "properties": {"name": {"type": "string"}, "email": {"type": "string", "format": "email"}}}}}}, "responses": {"201": {"description": "created"}}}
                },
                "/users/{id}": {
                    "get": {"summary": "Get user", "responses": {"200": {"description": "ok"}}}
                }
            }
        });
        let result = generate_from_openapi(&spec, &GenerationOptions::default());
        assert!(result.routes.len() >= 3);
        assert!(result.routes.iter().any(|r| r.path == "/users" && r.method == "GET"));
        assert!(result.routes.iter().any(|r| r.path == "/users" && r.method == "POST"));
        // Check stateful inference
        assert!(result.routes.iter().find(|r| r.path == "/users" && r.method == "POST").unwrap().state.is_some());
    }

    #[test]
    fn generates_realistic_body() {
        let spec = json!({
            "openapi": "3.0.0",
            "paths": {
                "/test": {
                    "get": {
                        "responses": {
                            "200": {
                                "content": {
                                    "application/json": {
                                        "schema": {
                                            "type": "object",
                                            "properties": {
                                                "email": {"type": "string", "format": "email"},
                                                "uuid": {"type": "string", "format": "uuid"}
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
        let result = generate_from_openapi(&spec, &GenerationOptions::default());
        let body = &result.routes[0].body;
        assert!(body.contains("example.com") || body.contains("email"));
    }
}
