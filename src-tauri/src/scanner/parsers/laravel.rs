use regex::Regex;
use crate::scanner::models::*;

pub struct LaravelParser;

impl LaravelParser {
    pub fn parse(&self, file_path: &str, content: &str) -> Vec<ScannedRoute> {
        let mut routes = Vec::new();
        let prefix = extract_prefix(content);

        let re = Regex::new(r#"Route::(get|post|put|patch|delete|options|head|any|match)\s*\(\s*['"`]([^'"`]+)['"`]"#).unwrap();
        for cap in re.captures_iter(content) {
            let raw_method = cap.get(1).unwrap().as_str();
            let method = if raw_method.eq_ignore_ascii_case("any") { "GET".to_string() } else { raw_method.to_uppercase() };
            let path = cap.get(2).unwrap().as_str();
            let full = if prefix.is_empty() { path.to_string() } else { format!("{}/{}", prefix.trim_end_matches('/'), path.trim_start_matches('/')) };
            let start = cap.get(0).unwrap().start();
            // Extract handler after path: , [Controller::class, 'method'] or , 'Closure'
            let handler = extract_handler(&content[cap.get(0).unwrap().end()..]);
            routes.push(ScannedRoute {
                method,
                path: full.clone(),
                handler,
                middlewares: extract_middlewares(content, start),
                file: file_path.to_string(),
                line: content[..start].lines().count() + 1,
                params: extract_params(&full),
                description: None,
                auth_required: content[..start].to_lowercase().contains("auth") || content[start..].contains("middleware"),
                body_schema: None,
                response_schemas: Vec::new(),
            });
        }

        let res_re = Regex::new(r#"Route::(?:resource|apiResource)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([A-Za-z0-9_\\:]+)"#).unwrap();
        for cap in res_re.captures_iter(content) {
            let resource = cap.get(1).unwrap().as_str();
            let controller = cap.get(2).unwrap().as_str();
            let base = if prefix.is_empty() { format!("/{}", resource) } else { format!("{}/{}", prefix.trim_end_matches('/'), resource) };
            let items = vec![
                ("GET", base.clone(), "index"),
                ("GET", format!("{}/create", base), "create"),
                ("POST", base.clone(), "store"),
                ("GET", format!("{}/{{id}}", base), "show"),
                ("GET", format!("{}/{{id}}/edit", base), "edit"),
                ("PUT", format!("{}/{{id}}", base), "update"),
                ("PATCH", format!("{}/{{id}}", base), "update"),
                ("DELETE", format!("{}/{{id}}", base), "destroy"),
            ];
            for (m, p, act) in items {
                routes.push(ScannedRoute {
                    method: m.to_string(),
                    path: p.clone(),
                    handler: format!("{}@{}", controller, act),
                    middlewares: Vec::new(),
                    file: file_path.to_string(),
                    line: content[..cap.get(0).unwrap().start()].lines().count() + 1,
                    params: if p.contains("{id}") { vec![RouteParam { name: "id".to_string(), param_type: "int".to_string(), required: true, description: None, location: Some(ParamLocation::Path)}] } else { Vec::new() },
                    description: None,
                    auth_required: false,
                    body_schema: None,
                    response_schemas: Vec::new(),
                });
            }
        }

        routes
    }
}

fn extract_prefix(content: &str) -> String {
    let re = Regex::new(r#"Route::group\s*\(\s*\[\s*['"]prefix['"]\s*=>\s*['"`]([^'"`]+)['"`]"#).unwrap();
    re.captures(content).and_then(|c| c.get(1).map(|m| m.as_str().to_string())).unwrap_or_default()
}

fn extract_middlewares(content: &str, before: usize) -> Vec<String> {
    let head = crate::scanner::models::safe_window_before(content, before, 800);
    let re = Regex::new(r#"middleware\s*\(\s*['"`]([^'"`]+)['"`]"#).unwrap();
    re.captures_iter(head).filter_map(|c| c.get(1).map(|m| m.as_str().to_string())).collect()
}

fn extract_handler(tail: &str) -> String {
    let slice = crate::scanner::models::safe_truncate(tail, 600);
    // [Controller::class, 'method']
    let re1 = Regex::new(r#"\[\s*[A-Za-z0-9_\\]+::class\s*,\s*['"`]([^'"`]+)['"`]\s*\]"#).unwrap();
    if let Some(c) = re1.captures(slice) { return c.get(1).unwrap().as_str().to_string(); }
    // Controller::class alone
    let re2 = Regex::new(r#"([A-Za-z0-9_\\]+)::class"#).unwrap();
    if let Some(c) = re2.captures(slice) { return c.get(1).unwrap().as_str().to_string(); }
    // 'SomeController@method'
    let re3 = Regex::new(r#"['"`]([A-Za-z0-9_@\\]+)['"`]"#).unwrap();
    if let Some(c) = re3.captures(slice) { return c.get(1).unwrap().as_str().to_string(); }
    "closure".to_string()
}

fn extract_params(path: &str) -> Vec<RouteParam> {
    let re = Regex::new(r#"\{([a-zA-Z_][a-zA-Z0-9_]*)\??\}"#).unwrap();
    re.captures_iter(path).map(|c| RouteParam {
        name: c.get(1).unwrap().as_str().to_string(),
        param_type: "string".to_string(),
        required: !c.get(0).unwrap().as_str().contains('?'),
        description: None,
        location: Some(ParamLocation::Path),
    }).collect()
}
