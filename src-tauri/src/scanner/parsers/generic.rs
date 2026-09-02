use regex::Regex;
use super::super::models::*;

pub struct GenericParser;

impl GenericParser {
    pub fn parse(&self, file_path: &str, content: &str) -> Vec<ScannedRoute> {
        // Fallback: try multiple generic patterns
        let mut routes = Vec::new();
        // Try to detect any HTTP method string + path pattern across languages
        // 1) Express style already handled, but generic also does it
        // 2) Any line with GET/POST etc plus quoted path
        let re = Regex::new(r#"(?i)\b(get|post|put|delete|patch|head|options)\b[^'"`]*['"`](\/[^'"`]*?)['"`]"#).unwrap();
        for cap in re.captures_iter(content) {
            let method = cap.get(1).map(|m| m.as_str().to_uppercase()).unwrap_or("GET".to_string());
            let path = cap.get(2).map(|m| m.as_str()).unwrap_or("/");
            // skip obvious non-route strings like import paths
            if path.starts_with(".") || path.contains("*") || path.len() > 120 { continue; }
            if !path.starts_with('/') { continue; }
            // Must look like API path
            routes.push(ScannedRoute {
                method,
                path: path.to_string(),
                handler: extract_word_before(content, cap.get(0).unwrap().start()).unwrap_or("handler".into()),
                middlewares: Vec::new(),
                file: file_path.to_string(),
                line: content[..cap.get(0).unwrap().start()].lines().count() + 1,
                params: extract_params_generic(path),
                description: None,
                auth_required: content[..cap.get(0).unwrap().start().max(500) as usize].to_lowercase().contains("auth"),
                body_schema: None,
                response_schemas: Vec::new(),
            });
        }
        routes
    }
}

fn extract_word_before(content: &str, pos: usize) -> Option<String> {
    let head = &content[..pos];
    let re = Regex::new(r#"([a-zA-Z_][a-zA-Z0-9_]*)\s*$"#).unwrap();
    re.captures(head).and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
}

fn extract_params_generic(path: &str) -> Vec<RouteParam> {
    let mut out = Vec::new();
    let re = Regex::new(r#"[:\{]([a-zA-Z_][a-zA-Z0-9_]*)\}?"#).unwrap();
    for cap in re.captures_iter(path) {
        out.push(RouteParam {
            name: cap.get(1).unwrap().as_str().to_string(),
            param_type: "string".to_string(),
            required: true,
            description: None,
            location: Some(ParamLocation::Path),
        });
    }
    out
}
