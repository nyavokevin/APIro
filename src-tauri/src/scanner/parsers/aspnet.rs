use regex::Regex;
use crate::scanner::models::*;

pub struct AspNetCoreParser;

impl AspNetCoreParser {
    pub fn parse(&self, file_path: &str, content: &str) -> Vec<ScannedRoute> {
        let mut routes = Vec::new();
        let ctrl_route = extract_controller_route(content);
        let ctrl_name = extract_controller_name(content);

        let re = Regex::new(r#"\[(?:Http)?(Get|Post|Put|Delete|Patch|Head|Options)(?:\s*\(\s*['"`]([^'"`]*)['"`]\s*\))?\]"#).unwrap();
        for cap in re.captures_iter(content) {
            let method = cap.get(1).unwrap().as_str().to_uppercase();
            let path = cap.get(2).map(|m| m.as_str()).unwrap_or("");
            let full = build_path(&ctrl_route, &ctrl_name, path);
            let start = cap.get(0).unwrap().start();
            let end = cap.get(0).unwrap().end();
            let handler = extract_method(content, end).unwrap_or("unknown".to_string());
            let auth = content[..start].contains("[Authorize]");
            routes.push(ScannedRoute {
                method,
                path: full.clone(),
                handler,
                middlewares: Vec::new(),
                file: file_path.to_string(),
                line: content[..start].lines().count() + 1,
                params: extract_params(&full, content, end),
                description: extract_xml_doc(content, start),
                auth_required: auth,
                body_schema: extract_body(content, end),
                response_schemas: Vec::new(),
            });
        }
        routes
    }
}

fn extract_controller_route(content: &str) -> String {
    let re = Regex::new(r#"\[Route\s*\(\s*['"`]([^'"`]+)['"`]"#).unwrap();
    re.captures(content).and_then(|c| c.get(1).map(|m| m.as_str().to_string())).unwrap_or_default()
}
fn extract_controller_name(content: &str) -> String {
    let re = Regex::new(r#"class\s+([A-Za-z0-9_]+)Controller"#).unwrap();
    re.captures(content).and_then(|c| c.get(1).map(|m| m.as_str().to_string())).unwrap_or_default()
}
fn build_path(ctrl_route: &str, ctrl_name: &str, method_route: &str) -> String {
    let mut p = ctrl_route.replace("[controller]", &ctrl_name.to_lowercase());
    if p.is_empty() { p = format!("api/{}", ctrl_name.to_lowercase()); }
    if !method_route.is_empty() {
        p = format!("{}/{}", p.trim_end_matches('/'), method_route.trim_start_matches('/'));
    }
    if !p.starts_with('/') { format!("/{}", p) } else { p }
}
fn extract_method(content: &str, after: usize) -> Option<String> {
    let tail = &content[after..];
    let slice = crate::scanner::models::safe_truncate(tail, 2000);
    let re = Regex::new(r#"\b(?:public|private|protected)?\s*(?:async\s+)?(?:[A-Za-z0-9_<>\[\]]+\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\("#).unwrap();
    re.captures(slice).and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
}
fn extract_params(path: &str, content: &str, after: usize) -> Vec<RouteParam> {
    let mut out = Vec::new();
    let re = Regex::new(r#"\{([A-Za-z_][A-Za-z0-9_]*)(?::[^}]*)?\}"#).unwrap();
    for cap in re.captures_iter(path) {
        out.push(RouteParam { name: cap.get(1).unwrap().as_str().to_string(), param_type: "string".to_string(), required: true, description: None, location: Some(ParamLocation::Path)});
    }
    let tail = &content[after..];
    let slice = crate::scanner::models::safe_truncate(tail, 2000);
    let re2 = Regex::new(r#"\[(?:FromQuery|FromRoute|FromBody)[^\]]*\]\s*([A-Za-z0-9_<>\[\]]+)\s+([A-Za-z_][A-Za-z0-9_]*)"#).unwrap();
    for cap in re2.captures_iter(slice) {
        out.push(RouteParam { name: cap.get(2).unwrap().as_str().to_string(), param_type: cap.get(1).unwrap().as_str().to_string(), required: true, description: None, location: Some(ParamLocation::Query)});
    }
    out
}
fn extract_xml_doc(content: &str, before: usize) -> Option<String> {
    let head = crate::scanner::models::safe_window_before(content, before, 1500);
    let lines: Vec<&str> = head.lines().rev().take(10).collect();
    let mut in_sum = false;
    let mut out = Vec::new();
    for line in lines {
        let t = line.trim();
        if t.contains("<summary>") { in_sum = true; }
        else if t.contains("</summary>") { break; }
        else if in_sum && t.starts_with("///") {
            let txt = t.trim_start_matches("///").trim();
            if !txt.is_empty() { out.push(txt.to_string()); }
        }
    }
    if out.is_empty() { None } else { out.reverse(); Some(out.join(" ")) }
}
fn extract_body(content: &str, after: usize) -> Option<String> {
    let tail = &content[after..];
    let slice = crate::scanner::models::safe_truncate(tail, 2000);
    let re = Regex::new(r#"\[FromBody\]\s*([A-Za-z0-9_]+)"#).unwrap();
    re.captures(slice).and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
}
