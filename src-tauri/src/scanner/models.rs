use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BackendFramework {
    Express,
    Fastify,
    NestJS,
    Hapi,
    Koa,
    Flask,
    FastAPI,
    Django,
    Tornado,
    Laravel,
    Symfony,
    Slim,
    CodeIgniter,
    SpringBoot,
    #[serde(rename = "JAXRS")]
    JAXRS,
    SparkJava,
    AspNetCore,
    Gin,
    Echo,
    Fiber,
    GorillaMux,
    Rails,
    Sinatra,
    Actix,
    Axum,
    Rocket,
    Unknown,
}

impl std::fmt::Display for BackendFramework {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Express => "Express",
            Self::Fastify => "Fastify",
            Self::NestJS => "NestJS",
            Self::Hapi => "Hapi",
            Self::Koa => "Koa",
            Self::Flask => "Flask",
            Self::FastAPI => "FastAPI",
            Self::Django => "Django",
            Self::Tornado => "Tornado",
            Self::Laravel => "Laravel",
            Self::Symfony => "Symfony",
            Self::Slim => "Slim",
            Self::CodeIgniter => "CodeIgniter",
            Self::SpringBoot => "Spring Boot",
            Self::JAXRS => "JAX-RS",
            Self::SparkJava => "Spark Java",
            Self::AspNetCore => "ASP.NET Core",
            Self::Gin => "Gin",
            Self::Echo => "Echo",
            Self::Fiber => "Fiber",
            Self::GorillaMux => "Gorilla Mux",
            Self::Rails => "Rails",
            Self::Sinatra => "Sinatra",
            Self::Actix => "Actix",
            Self::Axum => "Axum",
            Self::Rocket => "Rocket",
            Self::Unknown => "Unknown",
        };
        write!(f, "{}", s)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ScannerLanguage {
    #[serde(rename = "javascript")]
    JavaScript,
    #[serde(rename = "python")]
    Python,
    #[serde(rename = "php")]
    Php,
    #[serde(rename = "java")]
    Java,
    #[serde(rename = "csharp")]
    CSharp,
    #[serde(rename = "go")]
    Go,
    #[serde(rename = "ruby")]
    Ruby,
    #[serde(rename = "rust")]
    Rust,
    #[serde(rename = "unknown")]
    Unknown,
}

impl std::fmt::Display for ScannerLanguage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::JavaScript => "javascript",
            Self::Python => "python",
            Self::Php => "php",
            Self::Java => "java",
            Self::CSharp => "csharp",
            Self::Go => "go",
            Self::Ruby => "ruby",
            Self::Rust => "rust",
            Self::Unknown => "unknown",
        };
        write!(f, "{}", s)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameworkDetection {
    pub framework: BackendFramework,
    pub language: ScannerLanguage,
    pub confidence: f64,
    pub root_files: Vec<String>,
    pub route_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ParamLocation {
    Path,
    Query,
    Body,
    Header,
    Cookie,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteParam {
    pub name: String,
    pub param_type: String,
    pub required: bool,
    pub description: Option<String>,
    pub location: Option<ParamLocation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedRoute {
    pub method: String,
    pub path: String,
    pub handler: String,
    pub middlewares: Vec<String>,
    pub file: String,
    pub line: usize,
    pub params: Vec<RouteParam>,
    pub description: Option<String>,
    pub auth_required: bool,
    pub body_schema: Option<String>,
    pub response_schemas: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceScanResult {
    pub framework: BackendFramework,
    pub language: ScannerLanguage,
    pub confidence: f64,
    pub total_files: usize,
    pub total_routes: usize,
    pub routes: Vec<ScannedRoute>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SourceScanOptions {
    #[serde(default)]
    pub include_comments: Option<bool>,
    #[serde(default)]
    pub include_tests: Option<bool>,
    #[serde(default)]
    pub max_files: Option<usize>,
}

impl SourceScanResult {
    pub fn framework_name(&self) -> String { self.framework.to_string() }
}

pub fn safe_truncate(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        s
    } else {
        let mut end = max_bytes;
        while end > 0 && !s.is_char_boundary(end) {
            end -= 1;
        }
        &s[..end]
    }
}

pub fn safe_slice_from(s: &str, from: usize, max_len: usize) -> &str {
    if from >= s.len() {
        return "";
    }
    let tail = &s[from..];
    safe_truncate(tail, max_len)
}

pub fn safe_window_before(s: &str, pos: usize, max_len: usize) -> &str {
    let start = pos.saturating_sub(max_len);
    // advance to next char boundary if start is inside a char
    let mut s_start = start;
    while s_start < pos && !s.is_char_boundary(s_start) {
        s_start += 1;
    }
    if s_start >= pos {
        return "";
    }
    // pos is from regex, should be char boundary, but ensure
    let mut end = pos;
    while end > s_start && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[s_start..end]
}
