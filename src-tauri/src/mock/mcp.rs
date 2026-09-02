//! Agent-native MCP hooks — expose mock control surface as local MCP tools.
//! These are exposed as Tauri commands and can be called via `apiforge mock` CLI or via
//! a local MCP server (stdio). For now we expose the tool definitions as JSON and the
//! command handlers; a full MCP stdio transport can be added later.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

pub fn list_tools() -> Vec<McpTool> {
    vec![
        McpTool {
            name: "mock_list_routes".to_string(),
            description: "List all mock routes for a server (or all servers if no id)".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "serverId": {"type": "string", "description": "Mock server ID, optional"},
                    "port": {"type": "integer", "description": "Filter by port, optional"}
                }
            }),
        },
        McpTool {
            name: "mock_create_route".to_string(),
            description: "Create a new mock route (method, path, status, body)".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "serverId": {"type": "string"},
                    "method": {"type": "string", "enum": ["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"]},
                    "path": {"type": "string"},
                    "status": {"type": "integer"},
                    "body": {"type": "string"},
                    "delayMs": {"type": "integer"},
                    "headers": {"type": "object"}
                },
                "required": ["serverId","method","path"]
            }),
        },
        McpTool {
            name: "mock_set_state".to_string(),
            description: "Set/get state for stateful mocks (key-value scoped to server)".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "serverId": {"type": "string"},
                    "key": {"type": "string"},
                    "value": {"description": "JSON value, or null to delete"}
                },
                "required": ["serverId","key"]
            }),
        },
        McpTool {
            name: "mock_hit_log".to_string(),
            description: "Get hit log for a mock server (timestamp, method, path, status)".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "serverId": {"type": "string"},
                    "limit": {"type": "integer"}
                },
                "required": ["serverId"]
            }),
        },
        McpTool {
            name: "mock_generate_from_openapi".to_string(),
            description: "Generate mock routes from OpenAPI spec (file path or JSON)".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "specPath": {"type": "string", "description": "Path to swagger.json/openapi.yaml"},
                    "specJson": {"type": "string", "description": "Raw OpenAPI JSON"},
                    "baseUrl": {"type": "string"}
                }
            }),
        },
        McpTool {
            name: "mock_diff_spec".to_string(),
            description: "Diff old vs new OpenAPI spec to show added/changed/removed routes".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "oldSpecPath": {"type": "string"},
                    "newSpecPath": {"type": "string"}
                }
            }),
        },
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpCall {
    pub tool: String,
    pub arguments: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpResult {
    pub content: Vec<McpContent>,
    pub is_error: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpContent {
    #[serde(rename = "type")]
    pub content_type: String,
    pub text: String,
}

pub fn tool_result_text(text: impl Into<String>) -> McpResult {
    McpResult {
        content: vec![McpContent {
            content_type: "text".to_string(),
            text: text.into(),
        }],
        is_error: None,
    }
}

pub fn tool_result_error(text: impl Into<String>) -> McpResult {
    McpResult {
        content: vec![McpContent {
            content_type: "text".to_string(),
            text: text.into(),
        }],
        is_error: Some(true),
    }
}

// ── Tool execution (wires the tools to the MockRegistry) ──

use super::openapi_gen::{self, GenerationOptions};
use super::state::{MockStateConfig, StateOperation};
use super::{MockMode, MockRoute, MockRegistry, MockServerInfo, MockVariant};
use std::collections::HashMap;

/// Execute an MCP tool call against the mock registry. All tools are offline/local.
pub fn execute(registry: &MockRegistry, tool: &str, args: &Value) -> McpResult {
    match tool {
        "mock_list_routes" => list_routes_tool(registry, args),
        "mock_create_route" => create_route_tool(registry, args),
        "mock_set_state" => set_state_tool(registry, args),
        "mock_hit_log" => hit_log_tool(registry, args),
        "mock_generate_from_openapi" => generate_tool(args),
        "mock_diff_spec" => diff_tool(args),
        other => tool_result_error(format!("unknown tool: {other}")),
    }
}

fn arg_str(args: &Value, key: &str) -> Option<String> {
    args.get(key).and_then(|v| v.as_str()).map(|s| s.to_string())
}

fn list_routes_tool(registry: &MockRegistry, args: &Value) -> McpResult {
    if let Some(server_id) = arg_str(args, "serverId") {
        match registry.list_routes(&server_id) {
            Ok(routes) => {
                let summary: Vec<Value> = routes
                    .iter()
                    .map(|r| {
                        serde_json::json!({
                            "id": r.id, "method": r.method, "path": r.path,
                            "status": r.status, "variants": r.variants.len(),
                            "stateful": r.state.is_some(),
                        })
                    })
                    .collect();
                tool_result_text(serde_json::to_string_pretty(&summary).unwrap_or_else(|_| "[]".into()))
            }
            Err(e) => tool_result_error(e),
        }
    } else {
        let servers = registry.list();
        let summary: Vec<Value> = servers
            .iter()
            .map(|s| {
                serde_json::json!({
                    "id": s.id, "name": s.name, "port": s.port,
                    "running": s.running, "mode": s.mode.to_string(),
                    "routeCount": s.routes.len(),
                })
            })
            .collect();
        tool_result_text(serde_json::to_string_pretty(&summary).unwrap_or_else(|_| "[]".into()))
    }
}

fn route_from_args(args: &Value) -> Result<MockRoute, String> {
    let method = arg_str(args, "method").ok_or("missing 'method'")?.to_uppercase();
    let path = arg_str(args, "path").ok_or("missing 'path'")?;
    let status = args.get("status").and_then(|v| v.as_u64()).unwrap_or(200) as u16;
    let body = arg_str(args, "body").unwrap_or_else(|| "{}".to_string());
    let delay_ms = args.get("delayMs").and_then(|v| v.as_u64()).unwrap_or(0);
    let headers: HashMap<String, String> = args
        .get("headers")
        .and_then(|h| h.as_object())
        .map(|m| {
            m.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        })
        .unwrap_or_default();
    let state = args.get("state").and_then(|s| s.as_object()).map(|m| {
        let operation = match m.get("operation").and_then(|v| v.as_str()) {
            Some("create") => StateOperation::Create,
            Some("read") => StateOperation::Read,
            Some("list") => StateOperation::List,
            Some("update") => StateOperation::Update,
            Some("delete") => StateOperation::Delete,
            _ => StateOperation::None,
        };
        MockStateConfig {
            scope: m.get("scope").and_then(|v| v.as_str()).unwrap_or("default").to_string(),
            operation,
            key_from: m.get("keyFrom").and_then(|v| v.as_str()).unwrap_or("auto").to_string(),
        }
    });
    Ok(MockRoute {
        id: arg_str(args, "id").unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        method,
        path,
        status,
        body,
        delay_ms,
        headers,
        variants: vec![],
        state,
        delay: None,
    })
}

fn create_route_tool(registry: &MockRegistry, args: &Value) -> McpResult {
    let Some(server_id) = arg_str(args, "serverId") else {
        return tool_result_error("missing 'serverId'");
    };
    let route = match route_from_args(args) {
        Ok(r) => r,
        Err(e) => return tool_result_error(e),
    };
    match registry.create_route(&server_id, route) {
        Ok(created) => tool_result_text(format!(
            "route created: {} {} -> {} (id: {})",
            created.method, created.path, created.status, created.id
        )),
        Err(e) => tool_result_error(e),
    }
}

fn set_state_tool(registry: &MockRegistry, args: &Value) -> McpResult {
    let Some(server_id) = arg_str(args, "serverId") else {
        return tool_result_error("missing 'serverId'");
    };
    let Some(key) = arg_str(args, "key") else {
        return tool_result_error("missing 'key'");
    };
    match args.get("value") {
        None | Some(Value::Null) => {
            // No value = read the key; add delete:true to remove it.
            if args.get("delete").and_then(|d| d.as_bool()).unwrap_or(false) {
                match registry.state_set(&server_id, key.clone(), None) {
                    Ok(()) => tool_result_text(format!("state key '{key}' deleted")),
                    Err(e) => tool_result_error(e),
                }
            } else {
                match registry.state_snapshot(&server_id) {
                    Ok(snap) => match snap.get(&key) {
                        Some(v) => tool_result_text(serde_json::to_string_pretty(v).unwrap_or_default()),
                        None => tool_result_error(format!("no state key '{key}'")),
                    },
                    Err(e) => tool_result_error(e),
                }
            }
        }
        Some(v) => match registry.state_set(&server_id, key.clone(), Some(v.clone())) {
            Ok(()) => tool_result_text(format!("state key '{key}' set")),
            Err(e) => tool_result_error(e),
        },
    }
}

fn hit_log_tool(registry: &MockRegistry, args: &Value) -> McpResult {
    let Some(server_id) = arg_str(args, "serverId") else {
        return tool_result_error("missing 'serverId'");
    };
    let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(50) as usize;
    match registry.hits(&server_id) {
        Ok(hits) => {
            let take: Vec<Value> = hits
                .iter()
                .take(limit)
                .map(|h| {
                    serde_json::json!({
                        "method": h.method, "path": h.path, "status": h.status,
                        "latencyMs": h.latency_ms, "mode": h.mode,
                        "matchedRoute": h.matched_route, "timestamp": h.timestamp,
                    })
                })
                .collect();
            tool_result_text(format!(
                "{} hit(s) total, showing {}:\n{}",
                hits.len(),
                take.len(),
                serde_json::to_string_pretty(&take).unwrap_or_else(|_| "[]".into())
            ))
        }
        Err(e) => tool_result_error(e),
    }
}

/// Parse a spec payload that is either JSON or YAML text.
pub fn parse_spec_value(raw: &str) -> Result<Value, String> {
    let trimmed = raw.trim_start();
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        serde_json::from_str(raw).map_err(|e| format!("invalid JSON spec: {e}"))
    } else {
        let yaml: serde_yaml::Value =
            serde_yaml::from_str(raw).map_err(|e| format!("invalid YAML spec: {e}"))?;
        serde_json::to_value(yaml).map_err(|e| e.to_string())
    }
}

fn read_spec_arg(args: &Value) -> Result<Value, String> {
    if let Some(path) = arg_str(args, "specPath") {
        let raw = std::fs::read_to_string(&path).map_err(|e| format!("cannot read {path}: {e}"))?;
        return parse_spec_value(&raw);
    }
    if let Some(json) = arg_str(args, "specJson") {
        return parse_spec_value(&json);
    }
    Err("provide 'specPath' or 'specJson'".to_string())
}

fn generate_tool(args: &Value) -> McpResult {
    let spec = match read_spec_arg(args) {
        Ok(s) => s,
        Err(e) => return tool_result_error(e),
    };
    let opts = GenerationOptions::default();
    let result = openapi_gen::generate_from_openapi(&spec, &opts);

    // Optionally persist as *.mock.yaml files
    let mut written = Vec::new();
    if let Some(out_dir) = arg_str(args, "outDir") {
        let info = MockServerInfo {
            id: arg_str(args, "name").unwrap_or_else(|| "generated".to_string()),
            name: result.spec_title.clone().unwrap_or_else(|| "Generated mocks".into()),
            port: 0,
            running: false,
            routes: result.routes.clone(),
            mode: MockMode::Mock,
            target_url: None,
            state_enabled: false,
            mocks_dir: Some(out_dir.clone()),
            latency_ms: 0,
            graphql_enabled: false,
        };
        match super::write_mocks_to_dir(&info, std::path::Path::new(&out_dir)) {
            Ok(files) => written = files.iter().map(|p| p.to_string_lossy().to_string()).collect(),
            Err(e) => return tool_result_error(format!("write failed: {e}")),
        }
    }

    let summary = serde_json::json!({
        "specTitle": result.spec_title,
        "specVersion": result.spec_version,
        "routeCount": result.routes.len(),
        "warnings": result.warnings,
        "routes": result.routes.iter().map(|r| serde_json::json!({
            "id": r.id, "method": r.method, "path": r.path, "status": r.status,
            "stateful": r.state.is_some(),
        })).collect::<Vec<_>>(),
        "writtenFiles": written,
    });
    tool_result_text(serde_json::to_string_pretty(&summary).unwrap_or_default())
}

fn diff_tool(args: &Value) -> McpResult {
    let old = match read_spec_arg(args) {
        Ok(s) => s,
        Err(e) => return tool_result_error(format!("old spec: {e}")),
    };
    let new = if arg_str(args, "newSpecPath").is_some() || arg_str(args, "newSpecJson").is_some() {
        let mut a = args.clone();
        if let Some(p) = arg_str(args, "newSpecPath") {
            a["specPath"] = Value::String(p);
        }
        if let Some(j) = arg_str(args, "newSpecJson") {
            a["specJson"] = Value::String(j);
        }
        match read_spec_arg(&a) {
            Ok(s) => s,
            Err(e) => return tool_result_error(format!("new spec: {e}")),
        }
    } else {
        return tool_result_error("provide 'newSpecPath' or 'newSpecJson'");
    };
    let diff = openapi_gen::diff_specs(&old, &new);
    tool_result_text(format!(
        "added: {:?}\nchanged: {:?}\nremoved: {:?}",
        diff.added, diff.changed, diff.removed
    ))
}

// ── MCP stdio transport (JSON-RPC 2.0, one message per line) ──
//
// Run with `apiforge mcp` and register in Claude Code / Cursor:
//   { "command": "apiforge", "args": ["mcp"] }
//
// Implements: initialize, tools/list, tools/call over the mock tools.
pub fn run_stdio_server() {
    use std::io::{BufRead, Write};

    let registry = MockRegistry::new();
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    eprintln!("apiforge mock MCP server ready (stdio, offline)");
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.trim().is_empty() {
            continue;
        }
        let msg: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let method = msg.get("method").and_then(|m| m.as_str()).unwrap_or("").to_string();
        let id = msg.get("id").cloned();
        let response = match method.as_str() {
            "initialize" => serde_json::json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "apiforge-mock", "version": env!("CARGO_PKG_VERSION") }
                }
            }),
            "tools/list" => serde_json::json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": { "tools": list_tools() }
            }),
            "tools/call" => {
                let params = msg.get("params").cloned().unwrap_or(Value::Null);
                let name = params.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
                let arguments = params.get("arguments").cloned().unwrap_or_else(|| serde_json::json!({}));
                let result = execute(&registry, &name, &arguments);
                serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": result })
            }
            "ping" if id.is_some() => serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": {} }),
            other => {
                if id.is_none() {
                    continue; // notification — no response
                }
                serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": { "code": -32601, "message": format!("unknown method: {other}") }
                })
            }
        };
        let mut out = stdout.lock();
        let _ = writeln!(out, "{response}");
        let _ = out.flush();
    }
}
