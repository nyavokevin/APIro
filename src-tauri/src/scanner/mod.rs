pub mod detector;
pub mod diff;
pub mod generator;
pub mod models;
pub mod openapi_export;
pub mod parsers;
pub mod watch;
#[cfg(test)]
mod tests;

use std::collections::HashSet;
use std::fs;
use models::*;

#[tauri::command]
pub fn scanner_detect_framework(project_path: String) -> Result<FrameworkDetection, String> {
    detector::detect_framework(&project_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn scanner_scan_routes(
    project_path: String,
    options: Option<SourceScanOptions>,
) -> Result<SourceScanResult, String> {
    let opts = options.unwrap_or_default();
    let mut detection = detector::detect_framework(&project_path).map_err(|e| e.to_string())?;

    // Override framework if caller forced it (Phase 4)
    if let Some(forced) = opts.forced_framework.clone() {
        detection.framework = forced;
        detection.confidence = 1.0;
    }

    // Choose parser based on framework, fallback to language
    let parser = select_parser(&detection);

    let max_files = opts.max_files.unwrap_or(2000);
    let files_to_scan: Vec<String> = detection.route_files.into_iter().take(max_files).collect();

    let mut all_routes = Vec::new();
    let mut warnings: Vec<ScanWarning> = Vec::new();

    for file_path in &files_to_scan {
        // Skip test files if not included
        if !opts.include_tests.unwrap_or(false) && is_test_file(file_path) {
            continue;
        }
        match fs::read_to_string(file_path) {
            Ok(content) => {
                let routes = parser.parse(file_path, &content);
                all_routes.extend(routes);
            }
            Err(e) => warnings.push(ScanWarning { severity: "warn".to_string(), file: Some(file_path.clone()), message: format!("Could not read: {}", e) }),
        }
    }

    // If no routes found and we used a specific parser, try generic as fallback to increase recall
    if all_routes.is_empty() && !files_to_scan.is_empty() {
        let generic = parsers::generic::GenericParser;
        for file_path in &files_to_scan {
            if let Ok(content) = fs::read_to_string(file_path) {
                let routes = generic.parse(file_path, &content);
                all_routes.extend(routes);
            }
        }
        if !all_routes.is_empty() {
            warnings.push(ScanWarning { severity: "info".to_string(), file: None, message: "Used generic parser as fallback".to_string() });
        }
    }

    let unique = deduplicate_routes(all_routes);
    let total_files = files_to_scan.len();
    let total_routes = unique.len();

    let result = SourceScanResult {
        framework: detection.framework.clone(),
        language: detection.language.clone(),
        confidence: detection.confidence,
        total_files,
        total_routes,
        routes: unique,
        warnings,
    };
    // Persist to history (best-effort, never fail scan)
    let _ = diff::save_scan_history(&project_path, &result);
    Ok(result)
}

#[tauri::command]
pub fn scanner_generate_collection(
    scan_result: SourceScanResult,
    base_url: String,
    api_version: Option<String>,
    output_path: Option<String>,
    collection_name: Option<String>,
) -> Result<String, String> {
    let mut node = generator::generate_collection(&scan_result, &base_url, api_version.as_deref())?;

    // Allow caller to override collection folder name (e.g. user-typed name)
    if let Some(custom) = collection_name {
        let trimmed = custom.trim().to_string();
        if !trimmed.is_empty() {
            if let crate::collections::Node::Folder { name, .. } = &mut node {
                *name = trimmed;
            }
        }
    }

    if let Some(out) = output_path {
        let p = std::path::PathBuf::from(out.clone());
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if p.is_dir() || !p.extension().map(|e| e == "yaml" || e == "yml").unwrap_or(false) {
            crate::collections::write_tree(&node, &p).map_err(|e| e.to_string())?;
            return Ok(p.to_string_lossy().to_string());
        } else {
            let yaml = serde_yaml::to_string(&node).map_err(|e| e.to_string())?;
            fs::write(&p, yaml).map_err(|e| e.to_string())?;
            return Ok(p.to_string_lossy().to_string());
        }
    }

    // No output path: save as top-level collection in workspace (e.g. ~/APIForge/<collection_name>/)
    let ws = crate::commands::default_workspace();
    crate::collections::write_tree(&node, &ws).map_err(|e| e.to_string())?;
    if let crate::collections::Node::Folder { name, .. } = &node {
        Ok(ws.join(sanitize(name)).to_string_lossy().to_string())
    } else {
        Ok(ws.to_string_lossy().to_string())
    }
}

#[tauri::command]
pub fn scanner_quick_scan(
    project_path: String,
    base_url: String,
    collection_name: Option<String>,
) -> Result<String, String> {
    let result = scanner_scan_routes(project_path, None)?;
    scanner_generate_collection(result, base_url, None, None, collection_name)
}

fn select_parser(detection: &FrameworkDetection) -> parsers::AnyParser {
    use parsers::AnyParser;
    match detection.framework {
        BackendFramework::Express => AnyParser::Express(parsers::express::ExpressParser),
        BackendFramework::Fastify => AnyParser::Express(parsers::express::ExpressParser), // reuse express regex
        BackendFramework::NestJS => AnyParser::Express(parsers::express::ExpressParser),
        BackendFramework::Hapi => AnyParser::Express(parsers::express::ExpressParser),
        BackendFramework::Koa => AnyParser::Express(parsers::express::ExpressParser),
        BackendFramework::Flask => AnyParser::FastAPI(parsers::fastapi::FastAPIParser),
        BackendFramework::FastAPI => AnyParser::FastAPI(parsers::fastapi::FastAPIParser),
        BackendFramework::Django => AnyParser::FastAPI(parsers::fastapi::FastAPIParser),
        BackendFramework::Tornado => AnyParser::FastAPI(parsers::fastapi::FastAPIParser),
        BackendFramework::Laravel => AnyParser::Laravel(parsers::laravel::LaravelParser),
        BackendFramework::Symfony => AnyParser::Laravel(parsers::laravel::LaravelParser),
        BackendFramework::Slim => AnyParser::Laravel(parsers::laravel::LaravelParser),
        BackendFramework::CodeIgniter => AnyParser::Laravel(parsers::laravel::LaravelParser),
        BackendFramework::SpringBoot => AnyParser::Spring(parsers::spring::SpringBootParser),
        BackendFramework::JAXRS => AnyParser::Spring(parsers::spring::SpringBootParser),
        BackendFramework::SparkJava => AnyParser::Spring(parsers::spring::SpringBootParser),
        BackendFramework::AspNetCore => AnyParser::AspNet(parsers::aspnet::AspNetCoreParser),
        BackendFramework::Gin => AnyParser::Gin(parsers::gin::GinParser),
        BackendFramework::Echo => AnyParser::Gin(parsers::gin::GinParser),
        BackendFramework::Fiber => AnyParser::Gin(parsers::gin::GinParser),
        BackendFramework::GorillaMux => AnyParser::Gin(parsers::gin::GinParser),
        BackendFramework::Rails => AnyParser::Gin(parsers::gin::GinParser), // fallback generic for rails (TODO)
        BackendFramework::Sinatra => AnyParser::Gin(parsers::gin::GinParser),
        BackendFramework::Actix => AnyParser::Gin(parsers::gin::GinParser), // fallback
        BackendFramework::Axum => AnyParser::Gin(parsers::gin::GinParser),
        BackendFramework::Rocket => AnyParser::Gin(parsers::gin::GinParser),
        BackendFramework::Unknown => {
            match detection.language {
                ScannerLanguage::JavaScript => AnyParser::Express(parsers::express::ExpressParser),
                ScannerLanguage::Python => AnyParser::FastAPI(parsers::fastapi::FastAPIParser),
                ScannerLanguage::Php => AnyParser::Laravel(parsers::laravel::LaravelParser),
                ScannerLanguage::Java => AnyParser::Spring(parsers::spring::SpringBootParser),
                ScannerLanguage::CSharp => AnyParser::AspNet(parsers::aspnet::AspNetCoreParser),
                ScannerLanguage::Go => AnyParser::Gin(parsers::gin::GinParser),
                _ => AnyParser::Generic(parsers::generic::GenericParser),
            }
        }
    }
}

fn is_test_file(path: &str) -> bool {
    let lower = path.to_lowercase().replace('\\', "/");
    lower.contains("__tests__/") || lower.contains("/test/") || lower.contains(".test.") || lower.contains(".spec.") || lower.contains("/tests/")
}

fn deduplicate_routes(routes: Vec<ScannedRoute>) -> Vec<ScannedRoute> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for r in routes {
        let key = format!("{}:{}", r.method, r.path);
        if seen.insert(key) {
            out.push(r);
        }
    }
    out.sort_by(|a,b| a.path.cmp(&b.path).then(a.method.cmp(&b.method)));
    out
}

fn sanitize(name: &str) -> String {
    name.chars().map(|c| if c.is_alphanumeric() || c=='-' || c=='_' || c==' '{c} else {'_'}).collect()
}
