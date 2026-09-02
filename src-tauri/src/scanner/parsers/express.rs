use regex::Regex;
use crate::scanner::models::*;

pub struct ExpressParser;

impl ExpressParser {
    pub fn parse(&self, file_path: &str, content: &str) -> Vec<ScannedRoute> {
        let mut routes = Vec::new();
        let base_path = extract_base_path(content);

        // app/router.METHOD('path', ...)
        let re = Regex::new(r#"(?m)(?:(?:app|router)\.(get|post|put|delete|patch|head|options|all))\s*\(\s*['"`]([^'"`]+)['"`]"#).unwrap();
        for cap in re.captures_iter(content) {
            let method = cap.get(1).map(|m| m.as_str().to_uppercase()).unwrap_or("GET".to_string());
            let method = if method == "ALL" { "GET".to_string() } else { method };
            let path = cap.get(2).map(|m| m.as_str()).unwrap_or("/");
            let full_path = if base_path.is_empty() {
                path.to_string()
            } else {
                format!("{}{}", base_path.trim_end_matches('/'), path)
            };
            let start = cap.get(0).unwrap().start();
            let end = cap.get(0).unwrap().end();
            let handler = extract_handler_name(content, end).unwrap_or("anonymous".to_string());
            let mws = extract_middlewares(content, start);
            routes.push(ScannedRoute {
                method,
                path: full_path.clone(),
                handler,
                middlewares: mws.clone(),
                file: file_path.to_string(),
                line: content[..start].lines().count() + 1,
                params: extract_params(&full_path),
                description: extract_jsdoc(content, start),
                auth_required: detect_auth_middleware(&mws) || content[..start].to_lowercase().contains("authenticate"),
                body_schema: None,
                response_schemas: Vec::new(),
            });
        }

        // Also handle router.route('/path').get(...).post(...)
        // We capture .route('path') then look ahead for .get/.post etc
        let route_re = Regex::new(r#"\.route\s*\(\s*['"`]([^'"`]+)['"`]\s*\)"#).unwrap();
        for cap in route_re.captures_iter(content) {
            let base = cap.get(1).map(|m| m.as_str()).unwrap_or("/");
            let after = &content[cap.get(0).unwrap().end()..];
            // look for chained .get( .post( etc within next 300 chars
            let chain_re = Regex::new(r#"\.(get|post|put|delete|patch|head|options)\s*\("#).unwrap();
            let slice = crate::scanner::models::safe_truncate(after, 600);
            for c2 in chain_re.captures_iter(slice) {
                let m = c2.get(1).unwrap().as_str().to_uppercase();
                routes.push(ScannedRoute {
                    method: m,
                    path: base.to_string(),
                    handler: "chained".to_string(),
                    middlewares: Vec::new(),
                    file: file_path.to_string(),
                    line: content[..cap.get(0).unwrap().start()].lines().count() + 1,
                    params: extract_params(base),
                    description: None,
                    auth_required: false,
                    body_schema: None,
                    response_schemas: Vec::new(),
                });
            }
        }

        // Also handle app.use('/prefix', router) — we don't expand router here, but capture as route with ANY
        // Useful for prefix accumulation. Already handled via base_path fallback.
        routes
    }
}

fn extract_base_path(content: &str) -> String {
    let re = Regex::new(r#"Router\s*\(\s*\{[^}]*prefix\s*:\s*['"`]([^'"`]+)['"`]"#).unwrap();
    if let Some(cap) = re.captures(content) {
        return cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
    }
    // Also detect express.Router() used with app.use('/api', router) — we can't statically resolve, return empty
    String::new()
}

fn extract_handler_name(content: &str, after_pos: usize) -> Option<String> {
    let tail = &content[after_pos..];
    let tail_slice = crate::scanner::models::safe_truncate(tail, 800);
    // after app.get('/x', handler, (req,res)=>)
    // Capture next identifier after comma
    let re = Regex::new(r#"\s*,\s*(?:async\s+)?(?:function\s+)?([a-zA-Z_$][a-zA-Z0-9_$\.]*)"#).unwrap();
    if let Some(cap) = re.captures(tail_slice) {
        let name = cap.get(1).unwrap().as_str();
        // skip arrow functions: if name is 'req' or 'res' and next char is =>, ignore
        if name == "req" || name == "res" || name == "next" {
            return None;
        }
        return Some(name.to_string());
    }
    None
}

fn extract_middlewares(content: &str, before_pos: usize) -> Vec<String> {
    let head = crate::scanner::models::safe_window_before(content, before_pos, 600);
    let re = Regex::new(r#"([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*(?:app|router)\.(?:get|post|put|delete|patch)"#).unwrap();
    // Simplify: look for middleware names before route
    let mut out = Vec::new();
    // Heuristic: if content before contains authenticate, auth, jwt, protect
    for kw in ["authenticate", "auth", "jwt", "passport", "protect", "requireAuth"] {
        if head.to_lowercase().contains(kw) {
            out.push(kw.to_string());
        }
    }
    out
}

fn extract_params(path: &str) -> Vec<RouteParam> {
    let re = Regex::new(r#":([a-zA-Z_][a-zA-Z0-9_]*)"#).unwrap();
    re.captures_iter(path).map(|c| RouteParam {
        name: c.get(1).unwrap().as_str().to_string(),
        param_type: "string".to_string(),
        required: true,
        description: None,
        location: Some(ParamLocation::Path),
    }).collect()
}

fn extract_jsdoc(content: &str, before_pos: usize) -> Option<String> {
    let head = crate::scanner::models::safe_window_before(content, before_pos, 1500);
    let lines: Vec<&str> = head.lines().rev().take(12).collect();
    let mut doc = Vec::new();
    let mut in_doc = false;
    for line in lines {
        let t = line.trim();
        if t.starts_with("/**") {
            in_doc = true;
            let rest = t.trim_start_matches("/**").trim();
            if !rest.is_empty() { doc.push(rest.to_string()); }
            break;
        } else if in_doc || t.starts_with('*') {
            in_doc = true;
            let rest = t.trim_start_matches('*').trim();
            if !rest.is_empty() && !rest.starts_with('@') { doc.push(rest.to_string()); }
        } else if !t.is_empty() && !in_doc {
            // stop if we hit code
            if t.contains("function") || t.contains("=>") { break; }
        }
    }
    if doc.is_empty() { None } else { doc.reverse(); Some(doc.join(" ")) }
}

fn detect_auth_middleware(mws: &[String]) -> bool {
    let kws = ["auth", "authenticate", "jwt", "bearer", "passport", "requireAuth", "protect"];
    mws.iter().any(|m| kws.iter().any(|k| m.to_lowercase().contains(k)))
}
