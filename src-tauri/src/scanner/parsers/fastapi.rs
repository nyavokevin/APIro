use regex::Regex;
use crate::scanner::models::*;

pub struct FastAPIParser;

impl FastAPIParser {
    pub fn parse(&self, file_path: &str, content: &str) -> Vec<ScannedRoute> {
        let mut routes = Vec::new();
        let re = Regex::new(r#"@(?:app|router)\.(get|post|put|delete|patch|head|options)\s*\(\s*['"`]([^'"`]+)['"`]"#).unwrap();
        for cap in re.captures_iter(content) {
            let method = cap.get(1).unwrap().as_str().to_uppercase();
            let path = cap.get(2).unwrap().as_str();
            let start = cap.get(0).unwrap().start();
            let end = cap.get(0).unwrap().end();
            let func = extract_func_name(content, end).unwrap_or("anonymous".to_string());
            let body_schema = extract_pydantic_model(content, end);
            let resp = extract_response_model(&content[start..end]);
            let auth = content[start..end].contains("Depends") || content[start..end].contains("Security");
            routes.push(ScannedRoute {
                method,
                path: path.to_string(),
                handler: func,
                middlewares: Vec::new(),
                file: file_path.to_string(),
                line: content[..start].lines().count() + 1,
                params: extract_python_params(path, content, end),
                description: extract_python_docstring(content, end),
                auth_required: auth,
                body_schema,
                response_schemas: resp.into_iter().collect(),
            });
        }
        // api_route with methods=
        let re2 = Regex::new(r#"@(?:app|router)\.api_route\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*methods\s*=\s*\[([^\]]+)\]"#).unwrap();
        for cap in re2.captures_iter(content) {
            let path = cap.get(1).unwrap().as_str();
            let methods_raw = cap.get(2).unwrap().as_str();
            let start = cap.get(0).unwrap().start();
            let end = cap.get(0).unwrap().end();
            let func = extract_func_name(content, end).unwrap_or("anonymous".to_string());
            for m in methods_raw.split(',') {
                let method = m.trim().trim_matches('"').trim_matches('\'').trim().to_uppercase();
                if method.is_empty() { continue; }
                routes.push(ScannedRoute {
                    method,
                    path: path.to_string(),
                    handler: func.clone(),
                    middlewares: Vec::new(),
                    file: file_path.to_string(),
                    line: content[..start].lines().count() + 1,
                    params: extract_python_params(path, content, end),
                    description: extract_python_docstring(content, end),
                    auth_required: content[start..end].contains("Depends"),
                    body_schema: None,
                    response_schemas: Vec::new(),
                });
            }
        }
        routes
    }
}

fn extract_func_name(content: &str, after: usize) -> Option<String> {
    let tail = &content[after..];
    let slice = crate::scanner::models::safe_truncate(tail, 2000);
    let re = Regex::new(r#"\n(?:\s*@.*\n)*\s*async\s+def\s+([a-zA-Z_][a-zA-Z0-9_]*)|\n(?:\s*@.*\n)*\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)"#).unwrap();
    if let Some(cap) = re.captures(slice) {
        return cap.get(1).or(cap.get(2)).map(|m| m.as_str().to_string());
    }
    None
}

fn extract_python_params(path: &str, content: &str, after: usize) -> Vec<RouteParam> {
    let mut params = Vec::new();
    let re = Regex::new(r#"\{([a-zA-Z_][a-zA-Z0-9_]*)\}"#).unwrap();
    for cap in re.captures_iter(path) {
        params.push(RouteParam {
            name: cap.get(1).unwrap().as_str().to_string(),
            param_type: "string".to_string(),
            required: true,
            description: None,
            location: Some(ParamLocation::Path),
        });
    }
    let tail = &content[after..];
    let slice = crate::scanner::models::safe_truncate(tail, 2800);
    // Direct search for `name: type = Query(...)` to handle nested parens like Query(1, ge=1)
    let qre = Regex::new(r#"([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([^=\n,()]+?)\s*=\s*Query\s*\(([^)]*)\)"#).unwrap();
    for q in qre.captures_iter(slice) {
        // Ensure we are within function signature (before docstring start)
        params.push(RouteParam {
            name: q.get(1).unwrap().as_str().to_string(),
            param_type: q.get(2).unwrap().as_str().trim().to_string(),
            required: !q.get(3).unwrap().as_str().contains("None"),
            description: None,
            location: Some(ParamLocation::Query),
        });
        if params.len() > 20 { break; }
    }
    params
}

fn extract_pydantic_model(content: &str, after: usize) -> Option<String> {
    let tail = &content[after..];
    let slice = crate::scanner::models::safe_truncate(tail, 2000);
    let re = Regex::new(r#"([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([A-Z][a-zA-Z0-9_]*)\s*=\s*Body"#).unwrap();
    re.captures(slice).map(|c| c.get(2).unwrap().as_str().to_string())
}

fn extract_response_model(deco: &str) -> Option<String> {
    let re = Regex::new(r#"response_model\s*=\s*([A-Z][a-zA-Z0-9_]*)"#).unwrap();
    re.captures(deco).map(|c| c.get(1).unwrap().as_str().to_string())
}

fn extract_python_docstring(content: &str, after: usize) -> Option<String> {
    let tail = &content[after..];
    let slice = crate::scanner::models::safe_truncate(tail, 3000);
    let re = Regex::new(r#"(?:async\s+)?def\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)\s*(?:->[^:]+)?\s*:\s*\n\s*['"]{3}([^'"]{3,}?)['"]{3}"#).unwrap();
    re.captures(slice).map(|c| c.get(1).unwrap().as_str().trim().lines().next().unwrap_or("").to_string())
}
