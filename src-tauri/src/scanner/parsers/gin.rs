use regex::Regex;
use crate::scanner::models::*;

pub struct GinParser;

impl GinParser {
    pub fn parse(&self, file_path: &str, content: &str) -> Vec<ScannedRoute> {
        let mut routes = Vec::new();
        let groups = extract_groups(content);

        let re = Regex::new(r#"(?:r|router|api|v\d+|group)\.(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|Any)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([A-Za-z_][A-Za-z0-9_]*)"#).unwrap();
        for cap in re.captures_iter(content) {
            let method = cap.get(1).unwrap().as_str().to_uppercase();
            let method = if method == "ANY" { "GET".to_string() } else { method };
            let path = cap.get(2).unwrap().as_str();
            let handler = cap.get(3).unwrap().as_str();
            let start = cap.get(0).unwrap().start();
            let prefix = closest_prefix(content, start, &groups);
            let full = if prefix.is_empty() { path.to_string() } else { format!("{}{}", prefix.trim_end_matches('/'), path) };
            let auth = content[..start].to_lowercase().contains("auth") || content[..start].to_lowercase().contains("jwt");
            routes.push(ScannedRoute {
                method,
                path: full.clone(),
                handler: handler.to_string(),
                middlewares: Vec::new(),
                file: file_path.to_string(),
                line: content[..start].lines().count() + 1,
                params: extract_params(&full),
                description: extract_doc(content, start),
                auth_required: auth,
                body_schema: None,
                response_schemas: Vec::new(),
            });
        }
        routes
    }
}

fn extract_groups(content: &str) -> Vec<(usize, String)> {
    let mut out = Vec::new();
    let re = Regex::new(r#"(?:r|router|api)\s*:=\s*(?:r|router|api)\.Group\s*\(\s*['"`]([^'"`]+)['"`]\s*\)"#).unwrap();
    for cap in re.captures_iter(content) {
        out.push((cap.get(0).unwrap().start(), cap.get(1).unwrap().as_str().to_string()));
    }
    out
}
fn closest_prefix(content: &str, pos: usize, groups: &[(usize, String)]) -> String {
    let mut best = String::new();
    let mut best_dist = usize::MAX;
    for (gpos, pref) in groups {
        if *gpos < pos {
            let d = pos - gpos;
            if d < best_dist {
                best_dist = d;
                best = pref.clone();
            }
        }
    }
    // Also try to infer via r.Group directly near pos: look back for Group("prefix") within 800 chars
    if best.is_empty() {
        let head = crate::scanner::models::safe_window_before(content, pos, 1200);
        let re = Regex::new(r#"Group\s*\(\s*['"`]([^'"`]+)['"`]"#).unwrap();
        if let Some(cap) = re.captures_iter(head).last() {
            return cap.get(1).unwrap().as_str().to_string();
        }
    }
    best
}
fn extract_params(path: &str) -> Vec<RouteParam> {
    let re = Regex::new(r#":([A-Za-z_][A-Za-z0-9_]*)"#).unwrap();
    re.captures_iter(path).map(|c| RouteParam {
        name: c.get(1).unwrap().as_str().to_string(),
        param_type: "string".to_string(),
        required: true,
        description: None,
        location: Some(ParamLocation::Path),
    }).collect()
}
fn extract_doc(content: &str, before: usize) -> Option<String> {
    let head = crate::scanner::models::safe_window_before(content, before, 800);
    for line in head.lines().rev().take(5) {
        let t = line.trim();
        if t.starts_with("//") { return Some(t.trim_start_matches("//").trim().to_string()); }
        if !t.is_empty() { break; }
    }
    None
}
