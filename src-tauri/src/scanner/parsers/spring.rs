use regex::Regex;
use crate::scanner::models::*;

pub struct SpringBootParser;

impl SpringBootParser {
    pub fn parse(&self, file_path: &str, content: &str) -> Vec<ScannedRoute> {
        let mut routes = Vec::new();
        let class_mapping = extract_class_mapping(content);

        let re = Regex::new(r#"@(?:Get|Post|Put|Delete|Patch|Request)Mapping(?:\s*\(\s*(?:value\s*=\s*)?['"`]([^'"`]+)['"`][^)]*\))?"#).unwrap();
        for cap in re.captures_iter(content) {
            let ann = cap.get(0).unwrap().as_str();
            let path = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            let method = if ann.contains("GetMapping") { "GET" } else if ann.contains("PostMapping") { "POST" } else if ann.contains("PutMapping") { "PUT" } else if ann.contains("DeleteMapping") { "DELETE" } else if ann.contains("PatchMapping") { "PATCH" } else { "GET" };
            let norm = path;
            let full = if norm.is_empty() {
                if class_mapping.is_empty() { "/".to_string() } else { class_mapping.clone() }
            } else if class_mapping.is_empty() { norm.to_string() } else { format!("{}{}", class_mapping.trim_end_matches('/'), if norm.starts_with('/') { norm.to_string() } else { format!("/{}", norm) }) };
            let start = cap.get(0).unwrap().start();
            let end = cap.get(0).unwrap().end();
            let handler = extract_method_name(content, end).unwrap_or("unknown".to_string());
            let auth = ann.contains("Secured") || content.contains("@PreAuthorize");
            routes.push(ScannedRoute {
                method: method.to_string(),
                path: full.clone(),
                handler,
                middlewares: Vec::new(),
                file: file_path.to_string(),
                line: content[..start].lines().count() + 1,
                params: extract_params(&full, content, end),
                description: extract_javadoc(content, start),
                auth_required: auth,
                body_schema: extract_body(content, end),
                response_schemas: extract_response(content, end),
            });
        }

        // @RequestMapping with method param
        let re2 = Regex::new(r#"@RequestMapping\s*\([^)]*value\s*=\s*['"`]([^'"`]+)['"`][^)]*method\s*=\s*RequestMethod\.([A-Z]+)"#).unwrap();
        for cap in re2.captures_iter(content) {
            let path = cap.get(1).unwrap().as_str();
            let method = cap.get(2).unwrap().as_str();
            let full = if class_mapping.is_empty() { path.to_string() } else { format!("{}{}", class_mapping.trim_end_matches('/'), path) };
            let start = cap.get(0).unwrap().start();
            let end = cap.get(0).unwrap().end();
            routes.push(ScannedRoute {
                method: method.to_string(),
                path: full.clone(),
                handler: extract_method_name(content, end).unwrap_or("unknown".to_string()),
                middlewares: Vec::new(),
                file: file_path.to_string(),
                line: content[..start].lines().count() + 1,
                params: extract_params(&full, content, end),
                description: extract_javadoc(content, start),
                auth_required: false,
                body_schema: None,
                response_schemas: Vec::new(),
            });
        }

        routes
    }
}

fn extract_class_mapping(content: &str) -> String {
    let re = Regex::new(r#"@RequestMapping\s*\(\s*(?:value\s*=\s*)?['"`]([^'"`]+)['"`]"#).unwrap();
    // Take first occurrence before any method mapping
    re.captures(content).map(|c| c.get(1).unwrap().as_str().to_string()).unwrap_or_default()
}

fn extract_method_name(content: &str, after: usize) -> Option<String> {
    let tail = &content[after..];
    let slice = crate::scanner::models::safe_truncate(tail, 2000);
    let re = Regex::new(r#"\s*(?:public|private|protected)?\s*(?:[A-Z][a-zA-Z0-9_<>\[\]]*\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\("#).unwrap();
    re.captures(slice).and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
}

fn extract_params(path: &str, content: &str, after: usize) -> Vec<RouteParam> {
    let mut out = Vec::new();
    let re = Regex::new(r#"\{([a-zA-Z_][a-zA-Z0-9_]*)\}"#).unwrap();
    for cap in re.captures_iter(path) {
        out.push(RouteParam { name: cap.get(1).unwrap().as_str().to_string(), param_type: "string".to_string(), required: true, description: None, location: Some(ParamLocation::Path)});
    }
    let tail = &content[after..];
    let slice = crate::scanner::models::safe_truncate(tail, 2500);
    let re2 = Regex::new(r#"@(?:RequestParam|PathVariable)\s*(?:\(\s*['"`]([^'"`]+)['"`]\s*\))?\s*([A-Z][a-zA-Z0-9_<>\[\]]*)\s+([a-zA-Z_][a-zA-Z0-9_]*)"#).unwrap();
    for cap in re2.captures_iter(slice) {
        out.push(RouteParam {
            name: cap.get(3).unwrap().as_str().to_string(),
            param_type: cap.get(2).unwrap().as_str().to_string(),
            required: true,
            description: cap.get(1).map(|m| m.as_str().to_string()),
            location: Some(ParamLocation::Query),
        });
        if out.len() > 20 { break; }
    }
    out
}

fn extract_javadoc(content: &str, before: usize) -> Option<String> {
    let head = crate::scanner::models::safe_window_before(content, before, 2000);
    let lines: Vec<&str> = head.lines().rev().take(15).collect();
    let mut doc = Vec::new();
    let mut in_doc = false;
    for line in lines {
        let t = line.trim();
        if t.starts_with("/**") { in_doc = true; break; }
        else if t.starts_with('*') && !t.starts_with("*/") {
            in_doc = true;
            let txt = t.trim_start_matches('*').trim();
            if !txt.starts_with('@') && !txt.is_empty() { doc.push(txt.to_string()); }
        } else if !t.is_empty() && in_doc { break; }
    }
    if doc.is_empty() { None } else { doc.reverse(); Some(doc.join(" ")) }
}

fn extract_body(content: &str, after: usize) -> Option<String> {
    let tail = &content[after..];
    let slice = crate::scanner::models::safe_truncate(tail, 2000);
    let re = Regex::new(r#"@RequestBody[^)]*\)\s*([A-Z][a-zA-Z0-9_]*)"#).unwrap();
    re.captures(slice).and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
}

fn extract_response(content: &str, after: usize) -> Vec<String> {
    let tail = &content[after..];
    let slice = crate::scanner::models::safe_truncate(tail, 2000);
    let re = Regex::new(r#"ResponseEntity<([A-Za-z0-9_<>\.]+)>"#).unwrap();
    re.captures_iter(slice).filter_map(|c| c.get(1).map(|m| m.as_str().to_string())).collect()
}
