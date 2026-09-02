use std::collections::HashMap;
use crate::scanner::models::*;

pub fn generate_collection(
    scan_result: &SourceScanResult,
    base_url: &str,
    api_version: Option<&str>,
) -> Result<crate::collections::Node, String> {
    // Group routes by folder name
    let mut folders_map: HashMap<String, Vec<ScannedRoute>> = HashMap::new();
    for route in &scan_result.routes {
        let folder = extract_folder_name(&route.path);
        folders_map.entry(folder).or_default().push(route.clone());
    }

    let mut folders: Vec<crate::collections::Node> = Vec::new();
    let mut keys: Vec<String> = folders_map.keys().cloned().collect();
    keys.sort();

    for key in keys {
        let mut routes = folders_map.remove(&key).unwrap();
        routes.sort_by(|a,b| a.path.cmp(&b.path));
        let children: Vec<crate::collections::Node> = routes.into_iter().map(|r| route_to_node(&r, base_url, api_version)).collect();
        folders.push(crate::collections::Node::Folder { name: key, children });
    }

    let name = format!("{} API", scan_result.framework);
    let desc = format!(
        "Auto-generated from {} {} codebase. {} routes found in {} files.",
        format_language(&scan_result.language),
        scan_result.framework,
        scan_result.total_routes,
        scan_result.total_files,
    );

    // Attach description via folder name includes info? Collection::Folder doesn't have description, so wrap in top-level folder
    // We'll create a top-level folder with name and children = folders. The description is not persisted in collections.rs Node yet,
    // but we embed it as request comment via first dummy? Instead we just use name.
    let _ = desc;
    Ok(crate::collections::Node::Folder { name, children: folders })
}

fn route_to_node(route: &ScannedRoute, base_url: &str, api_version: Option<&str>) -> crate::collections::Node {
    let url = if let Some(ver) = api_version {
        format!("{}/{}{}", base_url.trim_end_matches('/'), ver.trim_matches('/'), route.path)
    } else {
        format!("{}{}", base_url.trim_end_matches('/'), route.path)
    };

    let mut headers = Vec::new();
    if route.auth_required {
        headers.push(crate::collections::YamlPair { key: "Authorization".to_string(), value: "Bearer {{authToken}}".to_string(), enabled: true });
    }

    // params handling: we don't have QueryParam in collections.rs, but we can store as YamlPair params
    let mut params = Vec::new();
    for p in &route.params {
        // Only include non-path params as query params examples? We'll add all as examples for generator
        // Path params are already in URL; still add as param for visibility if location != Path
        let is_path = p.location.as_ref().map(|l| matches!(l, ParamLocation::Path)).unwrap_or(false);
        if is_path { continue; }
        let example = generate_example_value(&p.param_type);
        params.push(crate::collections::YamlPair { key: p.name.clone(), value: example, enabled: true });
    }
    // If route has {id} style path params but no params entries, generate dummy
    if route.path.contains('{') && params.is_empty() {
        // keep path as is, user will replace {id}
    }

    let body = if matches!(route.method.as_str(), "POST" | "PUT" | "PATCH") {
        generate_body(route)
    } else {
        String::new()
    };

    let body_type = if body.is_empty() { "none".to_string() } else { "json".to_string() };

    let name = if route.handler.is_empty() || route.handler == "anonymous" {
        format!("{} {}", route.method, route.path)
    } else {
        route.handler.clone()
    };

    let request = crate::collections::RequestYaml {
        name: name.clone(),
        method: route.method.clone(),
        url,
        headers,
        params,
        body_type,
        body,
    };

    crate::collections::Node::Request { name, request }
}

fn generate_body(route: &ScannedRoute) -> String {
    if let Some(schema) = &route.body_schema {
        // Generate based on schema name if known
        return format!("{{\n  \"{}_{}_example\": \"value\"\n}}", schema.to_lowercase(), "field");
    }
    // If route has body params, build json
    let body_params: Vec<&RouteParam> = route.params.iter().filter(|p| matches!(p.location, Some(ParamLocation::Body))).collect();
    if !body_params.is_empty() {
        let mut map = serde_json::Map::new();
        for p in body_params {
            map.insert(p.name.clone(), serde_json::Value::String(generate_example_value(&p.param_type)));
        }
        return serde_json::to_string_pretty(&map).unwrap_or("{}".to_string());
    }
    // Default placeholder
    if route.path.contains("login") || route.path.contains("auth") {
        return "{\n  \"email\": \"user@example.com\",\n  \"password\": \"secret123\"\n}".to_string();
    }
    "{}".to_string()
}

fn generate_example_value(t: &str) -> String {
    match t.to_lowercase().as_str() {
        "int" | "integer" | "number" | "i32" | "i64" => "42".to_string(),
        "float" | "double" | "decimal" | "f32" | "f64" => "3.14".to_string(),
        "bool" | "boolean" => "true".to_string(),
        "uuid" | "guid" => "{{$randomUUID}}".to_string(),
        "email" => "user@example.com".to_string(),
        "date" | "datetime" | "timestamp" => "{{$isoTimestamp}}".to_string(),
        _ => "example".to_string(),
    }
}

fn extract_folder_name(path: &str) -> String {
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty() && !s.starts_with('{') && !s.starts_with(':') && !s.starts_with('<')).collect();
    if segments.is_empty() { return "Root".to_string(); }
    let skip = segments.iter().position(|s| !s.starts_with('v') && s.parse::<f64>().is_err() && *s != "api").unwrap_or(0);
    let name = segments.get(skip).unwrap_or(&segments[0]);
    let mut chars = name.chars();
    match chars.next() {
        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
        None => name.to_string(),
    }
}

fn format_language(lang: &ScannerLanguage) -> String {
    match lang {
        ScannerLanguage::JavaScript => "JavaScript".to_string(),
        ScannerLanguage::Python => "Python".to_string(),
        ScannerLanguage::Php => "PHP".to_string(),
        ScannerLanguage::Java => "Java".to_string(),
        ScannerLanguage::CSharp => "C#".to_string(),
        ScannerLanguage::Go => "Go".to_string(),
        ScannerLanguage::Ruby => "Ruby".to_string(),
        ScannerLanguage::Rust => "Rust".to_string(),
        ScannerLanguage::Unknown => "Unknown".to_string(),
    }
}
