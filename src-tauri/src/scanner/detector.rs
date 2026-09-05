use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use super::models::*;

#[derive(Debug)]
pub struct ScannerError(pub String);
impl std::fmt::Display for ScannerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { write!(f, "{}", self.0) }
}
impl std::error::Error for ScannerError {}

impl From<std::io::Error> for ScannerError {
    fn from(e: std::io::Error) -> Self { Self(e.to_string()) }
}
impl From<glob::PatternError> for ScannerError {
    fn from(e: glob::PatternError) -> Self { Self(e.to_string()) }
}
impl From<regex::Error> for ScannerError {
    fn from(e: regex::Error) -> Self { Self(e.to_string()) }
}
impl From<serde_json::Error> for ScannerError {
    fn from(e: serde_json::Error) -> Self { Self(e.to_string()) }
}

pub fn detect_framework(project_path: &str) -> Result<FrameworkDetection, ScannerError> {
    let path = Path::new(project_path);
    if !path.exists() {
        return Err(ScannerError(format!("Path does not exist: {}", project_path)));
    }

    let mut detection = FrameworkDetection {
        framework: BackendFramework::Unknown,
        language: ScannerLanguage::Unknown,
        confidence: 0.0,
        root_files: Vec::new(),
        route_files: Vec::new(),
    };

    // Ordered checks: first match wins with high confidence, fallback to generic detection via file extension ratio
    // We check existence via glob for top-level files only (non-recursive for root, recursive for some)
    let root = PathBuf::from(project_path);

    // Helper to test a single file existence
    let check_file = |name: &str| -> Option<PathBuf> {
        let p = root.join(name);
        if p.exists() { Some(p) } else { None }
    };

    // JS/TS
    if let Some(p) = check_file("package.json") {
        detection.root_files.push(p.to_string_lossy().to_string());
        let fw = detect_js_framework(&p)?;
        if fw != BackendFramework::Unknown {
            detection.framework = fw;
            detection.confidence = 0.85;
        }
    } else if let Some(p) = check_file("tsconfig.json") {
        // Check imports in src
        if has_import_pattern(&root, "express")? {
            detection.framework = BackendFramework::Express;
            detection.confidence = 0.6;
            detection.root_files.push(p.to_string_lossy().to_string());
        }
    }

    // Python
    if detection.confidence == 0.0 {
        for name in ["requirements.txt", "pyproject.toml", "setup.py", "Pipfile"] {
            if let Some(p) = check_file(name) {
                detection.root_files.push(p.to_string_lossy().to_string());
                let fw = detect_python_framework(&p, &root)?;
                if fw != BackendFramework::Unknown {
                    detection.framework = fw;
                    detection.confidence = 0.8;
                    break;
                }
            }
        }
        // Also check for python files with fastapi/flask imports if no root file matched
        if detection.confidence == 0.0 && has_python_import(&root, &["fastapi", "flask", "django"]) {
            // generic python fallback remains Unknown, but we set language python for better file patterns
            detection.framework = BackendFramework::Unknown;
            detection.language = ScannerLanguage::Python;
        }
    }

    // PHP
    if detection.confidence == 0.0 {
        if let Some(p) = check_file("composer.json") {
            detection.root_files.push(p.to_string_lossy().to_string());
            let fw = detect_php_framework(&p)?;
            if fw != BackendFramework::Unknown {
                detection.framework = fw;
                detection.confidence = 0.8;
            }
        }
    }

    // Java
    if detection.confidence == 0.0 {
        if let Some(p) = check_file("pom.xml") {
            detection.root_files.push(p.to_string_lossy().to_string());
            let fw = detect_java_framework(&p)?;
            if fw != BackendFramework::Unknown {
                detection.framework = fw;
                detection.confidence = 0.85;
            }
        } else if let Some(p) = check_file("build.gradle") {
            detection.root_files.push(p.to_string_lossy().to_string());
            let fw = detect_java_framework(&p)?;
            if fw != BackendFramework::Unknown {
                detection.framework = fw;
                detection.confidence = 0.8;
            }
        }
    }

    // C#
    if detection.confidence == 0.0 {
        // glob for *.csproj
        let mut found = Vec::new();
        for entry in WalkDir::new(&root).max_depth(3).into_iter().filter_map(|e| e.ok()) {
            let p = entry.path();
            if p.extension().map(|e| e == "csproj").unwrap_or(false) {
                found.push(p.to_path_buf());
                if found.len() >= 2 { break; }
            }
        }
        if !found.is_empty() {
            for p in &found {
                detection.root_files.push(p.to_string_lossy().to_string());
            }
            let fw = detect_csharp_framework(&found[0])?;
            if fw != BackendFramework::Unknown {
                detection.framework = fw;
                detection.confidence = 0.85;
            } else {
                detection.framework = BackendFramework::AspNetCore;
                detection.confidence = 0.6;
            }
        }
        // also .sln
        if detection.confidence == 0.0 {
            for entry in WalkDir::new(&root).max_depth(2).into_iter().filter_map(|e| e.ok()) {
                if entry.path().extension().map(|e| e == "sln").unwrap_or(false) {
                    detection.root_files.push(entry.path().to_string_lossy().to_string());
                    detection.framework = BackendFramework::AspNetCore;
                    detection.confidence = 0.6;
                    break;
                }
            }
        }
    }

    // Go
    if detection.confidence == 0.0 {
        if let Some(p) = check_file("go.mod") {
            detection.root_files.push(p.to_string_lossy().to_string());
            let fw = detect_go_framework(&p)?;
            if fw != BackendFramework::Unknown {
                detection.framework = fw;
                detection.confidence = 0.85;
            } else {
                detection.framework = BackendFramework::Gin;
                detection.confidence = 0.5;
            }
        }
    }

    // Ruby
    if detection.confidence == 0.0 {
        if let Some(p) = check_file("Gemfile") {
            detection.root_files.push(p.to_string_lossy().to_string());
            let fw = detect_ruby_framework(&p)?;
            if fw != BackendFramework::Unknown {
                detection.framework = fw;
                detection.confidence = 0.8;
            }
        } else if root.join("config/routes.rb").exists() {
            detection.root_files.push(root.join("config/routes.rb").to_string_lossy().to_string());
            detection.framework = BackendFramework::Rails;
            detection.confidence = 0.9;
        }
    }

    // Rust
    if detection.confidence == 0.0 {
        if let Some(p) = check_file("Cargo.toml") {
            detection.root_files.push(p.to_string_lossy().to_string());
            let fw = detect_rust_framework(&p)?;
            if fw != BackendFramework::Unknown {
                detection.framework = fw;
                detection.confidence = 0.85;
            }
        }
    }

    // Language inference
    if detection.language == ScannerLanguage::Unknown {
        detection.language = match detection.framework {
            BackendFramework::Express | BackendFramework::Fastify | BackendFramework::NestJS | BackendFramework::Hapi | BackendFramework::Koa => ScannerLanguage::JavaScript,
            BackendFramework::Flask | BackendFramework::FastAPI | BackendFramework::Django | BackendFramework::Tornado => ScannerLanguage::Python,
            BackendFramework::Laravel | BackendFramework::Symfony | BackendFramework::Slim | BackendFramework::CodeIgniter => ScannerLanguage::Php,
            BackendFramework::SpringBoot | BackendFramework::JAXRS | BackendFramework::SparkJava => ScannerLanguage::Java,
            BackendFramework::AspNetCore => ScannerLanguage::CSharp,
            BackendFramework::Gin | BackendFramework::Echo | BackendFramework::Fiber | BackendFramework::GorillaMux => ScannerLanguage::Go,
            BackendFramework::Rails | BackendFramework::Sinatra => ScannerLanguage::Ruby,
            BackendFramework::Actix | BackendFramework::Axum | BackendFramework::Rocket => ScannerLanguage::Rust,
            BackendFramework::Unknown => {
                // infer from file extensions present
                infer_language_from_files(&root)
            }
        };
    }

    // Find route files
    detection.route_files = find_route_files(project_path, &detection)?;

    Ok(detection)
}

fn infer_language_from_files(root: &Path) -> ScannerLanguage {
    let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for entry in WalkDir::new(root).max_depth(3).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension().and_then(|s| s.to_str()) {
                *counts.entry(ext.to_string()).or_insert(0) += 1;
            }
        }
    }
    if *counts.get("js").unwrap_or(&0) + *counts.get("ts").unwrap_or(&0) > 3 { return ScannerLanguage::JavaScript; }
    if *counts.get("py").unwrap_or(&0) > 2 { return ScannerLanguage::Python; }
    if *counts.get("php").unwrap_or(&0) > 2 { return ScannerLanguage::Php; }
    if *counts.get("java").unwrap_or(&0) > 2 { return ScannerLanguage::Java; }
    if *counts.get("cs").unwrap_or(&0) > 2 { return ScannerLanguage::CSharp; }
    if *counts.get("go").unwrap_or(&0) > 2 { return ScannerLanguage::Go; }
    if *counts.get("rb").unwrap_or(&0) > 1 { return ScannerLanguage::Ruby; }
    if *counts.get("rs").unwrap_or(&0) > 1 { return ScannerLanguage::Rust; }
    ScannerLanguage::Unknown
}

fn has_import_pattern(root: &Path, keyword: &str) -> Result<bool, ScannerError> {
    for entry in WalkDir::new(root).max_depth(3).into_iter().filter_map(|e| e.ok()) {
        let p = entry.path();
        if p.extension().map(|e| e == "js" || e == "ts" || e == "mjs").unwrap_or(false) {
            if let Ok(content) = fs::read_to_string(p) {
                if content.contains(keyword) {
                    return Ok(true);
                }
            }
        }
    }
    Ok(false)
}

fn has_python_import(root: &Path, keywords: &[&str]) -> bool {
    for entry in WalkDir::new(root).max_depth(3).into_iter().filter_map(|e| e.ok()) {
        let p = entry.path();
        if p.extension().map(|e| e == "py").unwrap_or(false) {
            if let Ok(content) = fs::read_to_string(p) {
                for kw in keywords {
                    if content.contains(&format!("import {}", kw)) || content.contains(&format!("from {}", kw)) {
                        return true;
                    }
                }
            }
        }
    }
    false
}

fn detect_js_framework(p: &Path) -> Result<BackendFramework, ScannerError> {
    let content = fs::read_to_string(p)?;
    let json: serde_json::Value = serde_json::from_str(&content).unwrap_or(serde_json::Value::Null);
    let deps = json.get("dependencies").and_then(|v| v.as_object())
        .or_else(|| json.get("devDependencies").and_then(|v| v.as_object()));
    if let Some(deps) = deps {
        if deps.contains_key("express") { return Ok(BackendFramework::Express); }
        if deps.contains_key("fastify") { return Ok(BackendFramework::Fastify); }
        if deps.contains_key("@nestjs/core") { return Ok(BackendFramework::NestJS); }
        if deps.contains_key("hapi") || deps.contains_key("@hapi/hapi") { return Ok(BackendFramework::Hapi); }
        if deps.contains_key("koa") { return Ok(BackendFramework::Koa); }
    }
    if has_import_pattern(p.parent().unwrap_or(Path::new(".")), "express")? {
        return Ok(BackendFramework::Express);
    }
    Ok(BackendFramework::Unknown)
}

fn detect_python_framework(p: &Path, root: &Path) -> Result<BackendFramework, ScannerError> {
    let content = fs::read_to_string(p)?;
    let lower = content.to_lowercase();
    if lower.contains("fastapi") { return Ok(BackendFramework::FastAPI); }
    if lower.contains("flask") { return Ok(BackendFramework::Flask); }
    if lower.contains("django") { return Ok(BackendFramework::Django); }
    if lower.contains("tornado") { return Ok(BackendFramework::Tornado); }
    // Inspect .py files if requirements ambiguous
    if has_python_import(root, &["fastapi"]) { return Ok(BackendFramework::FastAPI); }
    if has_python_import(root, &["flask"]) { return Ok(BackendFramework::Flask); }
    if has_python_import(root, &["django"]) { return Ok(BackendFramework::Django); }
    Ok(BackendFramework::Unknown)
}

fn detect_php_framework(p: &Path) -> Result<BackendFramework, ScannerError> {
    let content = fs::read_to_string(p)?;
    if content.contains("laravel/framework") { return Ok(BackendFramework::Laravel); }
    if content.contains("symfony") { return Ok(BackendFramework::Symfony); }
    if content.contains("slim/slim") { return Ok(BackendFramework::Slim); }
    if content.contains("codeigniter") { return Ok(BackendFramework::CodeIgniter); }
    Ok(BackendFramework::Unknown)
}

fn detect_java_framework(p: &Path) -> Result<BackendFramework, ScannerError> {
    let content = fs::read_to_string(p)?;
    if content.contains("spring-boot") { return Ok(BackendFramework::SpringBoot); }
    if content.contains("jax-rs") || content.contains("javax.ws.rs") { return Ok(BackendFramework::JAXRS); }
    if content.contains("sparkjava") { return Ok(BackendFramework::SparkJava); }
    Ok(BackendFramework::Unknown)
}

fn detect_csharp_framework(p: &Path) -> Result<BackendFramework, ScannerError> {
    let content = fs::read_to_string(p)?;
    if content.contains("Microsoft.AspNetCore") { return Ok(BackendFramework::AspNetCore); }
    Ok(BackendFramework::Unknown)
}

fn detect_go_framework(p: &Path) -> Result<BackendFramework, ScannerError> {
    let content = fs::read_to_string(p)?;
    if content.contains("github.com/gin-gonic/gin") { return Ok(BackendFramework::Gin); }
    if content.contains("github.com/labstack/echo") { return Ok(BackendFramework::Echo); }
    if content.contains("github.com/gofiber/fiber") { return Ok(BackendFramework::Fiber); }
    if content.contains("github.com/gorilla/mux") { return Ok(BackendFramework::GorillaMux); }
    Ok(BackendFramework::Unknown)
}

fn detect_ruby_framework(p: &Path) -> Result<BackendFramework, ScannerError> {
    let content = fs::read_to_string(p)?;
    if content.contains("rails") { return Ok(BackendFramework::Rails); }
    if content.contains("sinatra") { return Ok(BackendFramework::Sinatra); }
    Ok(BackendFramework::Unknown)
}

fn detect_rust_framework(p: &Path) -> Result<BackendFramework, ScannerError> {
    let content = fs::read_to_string(p)?;
    if content.contains("actix-web") { return Ok(BackendFramework::Actix); }
    if content.contains("axum") { return Ok(BackendFramework::Axum); }
    if content.contains("rocket") { return Ok(BackendFramework::Rocket); }
    Ok(BackendFramework::Unknown)
}

fn load_apiforgeignore_patterns(project_path: &str) -> Vec<String> {
    let ignore_path = Path::new(project_path).join(".apiforgeignore");
    let content = match fs::read_to_string(&ignore_path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    content
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(|s| s.to_string())
        .collect()
}

fn is_ignored_by_apiforgeignore(file_path: &str, patterns: &[String], project_path: &str) -> bool {
    if patterns.is_empty() {
        return false;
    }
    // Compute relative path from project_path
    let rel = if file_path.starts_with(project_path) {
        let rel = &file_path[project_path.len()..];
        rel.trim_start_matches(|c| c == '/' || c == '\\')
    } else {
        file_path
    };
    let rel = rel.replace('\\', "/");
    for pat in patterns {
        let pat = pat.trim();
        if pat.is_empty() {
            continue;
        }
        // Directory pattern e.g. "legacy/" should match "legacy/**"
        let effective = if pat.ends_with('/') {
            format!("{}**", pat)
        } else {
            pat.to_string()
        };
        // Try glob pattern matching
        if let Ok(glob_pat) = glob::Pattern::new(&effective) {
            if glob_pat.matches(&rel) || glob_pat.matches_path(Path::new(&rel)) {
                return true;
            }
            // Also try matching with **/ prefix for patterns without slash
            if !effective.contains('/') {
                if let Ok(p2) = glob::Pattern::new(&format!("**/{}", effective)) {
                    if p2.matches(&rel) {
                        return true;
                    }
                }
            }
        }
        // Fallback substring check for simple cases
        if rel.contains(pat.trim_start_matches("**/").trim_start_matches("*/").trim()) && !pat.contains('*') {
            // Only for non-glob simple patterns
            let simple = pat.trim_matches('/').trim_matches('*');
            if !simple.is_empty() && (rel == simple || rel.starts_with(&format!("{}/", simple)) || rel.contains(&format!("/{}", simple))) {
                return true;
            }
        }
    }
    false
}

fn find_route_files(project_path: &str, detection: &FrameworkDetection) -> Result<Vec<String>, ScannerError> {
    let patterns: Vec<&str> = match detection.framework {
        BackendFramework::Express | BackendFramework::Fastify | BackendFramework::NestJS | BackendFramework::Hapi | BackendFramework::Koa => {
            vec!["**/*.js", "**/*.ts", "**/*.mjs"]
        }
        BackendFramework::Flask | BackendFramework::FastAPI | BackendFramework::Django | BackendFramework::Tornado => {
            vec!["**/*.py"]
        }
        BackendFramework::Laravel | BackendFramework::Symfony | BackendFramework::Slim | BackendFramework::CodeIgniter => {
            vec!["**/*.php"]
        }
        BackendFramework::SpringBoot | BackendFramework::JAXRS | BackendFramework::SparkJava => {
            vec!["**/*.java"]
        }
        BackendFramework::AspNetCore => {
            vec!["**/*.cs"]
        }
        BackendFramework::Gin | BackendFramework::Echo | BackendFramework::Fiber | BackendFramework::GorillaMux => {
            vec!["**/*.go"]
        }
        BackendFramework::Rails | BackendFramework::Sinatra => {
            vec!["**/*.rb"]
        }
        BackendFramework::Actix | BackendFramework::Axum | BackendFramework::Rocket => {
            vec!["**/*.rs"]
        }
        BackendFramework::Unknown => {
            match detection.language {
                ScannerLanguage::JavaScript => vec!["**/*.js", "**/*.ts"],
                ScannerLanguage::Python => vec!["**/*.py"],
                ScannerLanguage::Php => vec!["**/*.php"],
                ScannerLanguage::Java => vec!["**/*.java"],
                ScannerLanguage::CSharp => vec!["**/*.cs"],
                ScannerLanguage::Go => vec!["**/*.go"],
                ScannerLanguage::Ruby => vec!["**/*.rb"],
                ScannerLanguage::Rust => vec!["**/*.rs"],
                ScannerLanguage::Unknown => vec!["**/*route*", "**/*controller*", "**/*handler*"],
            }
        }
    };

    let ignore_patterns = load_apiforgeignore_patterns(project_path);
    let mut files = Vec::new();
    for pat in patterns {
        let full = format!("{}/{}", project_path, pat);
        for entry in glob::glob(&full).map_err(|e| ScannerError(e.to_string()))? {
            if let Ok(p) = entry {
                if p.is_file() {
                    // Filter out unwanted dirs
                    let s = p.to_string_lossy().to_string().replace('\\', "/");
                    if s.contains("node_modules/") || s.contains("vendor/") || s.contains(".git/") || s.contains("dist/") || s.contains("build/") || s.contains("target/") || s.contains(".next/") {
                        continue;
                    }
                    if is_ignored_by_apiforgeignore(&s, &ignore_patterns, project_path) {
                        continue;
                    }
                    files.push(p.to_string_lossy().to_string());
                }
            }
        }
    }

    // Deduplicate
    files.sort();
    files.dedup();

    // Also walk to catch framework-specific route files not matched by glob on Windows
    // e.g., routes/api.php etc are already covered by **/*.php, but for Unknown we add extra
    if files.is_empty() {
        for entry in WalkDir::new(project_path).into_iter().filter_map(|e| e.ok()) {
            let p = entry.path();
            if p.is_file() {
                let s = p.to_string_lossy().to_string().replace('\\', "/");
                if is_ignored_by_apiforgeignore(&s, &ignore_patterns, project_path) {
                    continue;
                }
                if (s.contains("route") || s.contains("controller") || s.contains("handler")) && !s.contains("node_modules") {
                    files.push(s);
                }
            }
        }
    }

    Ok(files)
}
