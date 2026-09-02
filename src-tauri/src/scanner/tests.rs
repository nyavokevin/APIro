#[cfg(test)]
mod scanner_tests {
    use crate::scanner::detector;
    use crate::scanner::models::{BackendFramework, ScannerLanguage};
    use crate::scanner::{scanner_scan_routes, scanner_generate_collection};
    use std::path::PathBuf;

    fn sample_root(name: &str) -> String {
        let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        p.pop(); // from src-tauri to apiforge
        p.push("tools");
        p.push("scanner-samples");
        p.push(name);
        p.to_string_lossy().to_string()
    }

    #[test]
    fn detect_express() {
        let det = detector::detect_framework(&sample_root("express-sample")).unwrap();
        assert_eq!(det.framework, BackendFramework::Express, "expected Express got {:?}", det.framework);
        assert_eq!(det.language, ScannerLanguage::JavaScript);
    }

    #[test]
    fn detect_fastapi() {
        let det = detector::detect_framework(&sample_root("fastapi-sample")).unwrap();
        assert_eq!(det.framework, BackendFramework::FastAPI);
    }

    #[test]
    fn detect_laravel() {
        let det = detector::detect_framework(&sample_root("laravel-sample")).unwrap();
        assert_eq!(det.framework, BackendFramework::Laravel);
    }

    #[test]
    fn detect_spring() {
        let det = detector::detect_framework(&sample_root("spring-sample")).unwrap();
        assert_eq!(det.framework, BackendFramework::SpringBoot);
    }

    #[test]
    fn detect_aspnet() {
        let det = detector::detect_framework(&sample_root("aspnet-sample")).unwrap();
        assert_eq!(det.framework, BackendFramework::AspNetCore);
    }

    #[test]
    fn detect_gin() {
        let det = detector::detect_framework(&sample_root("gin-sample")).unwrap();
        assert_eq!(det.framework, BackendFramework::Gin);
    }

    #[test]
    fn scan_express_sample() {
        let res = scanner_scan_routes(sample_root("express-sample"), None).unwrap();
        assert!(res.total_routes >= 7, "express sample routes {:?}, expected >=7", res.routes);
        let keys: std::collections::HashSet<String> = res.routes.iter().map(|r| format!("{} {}", r.method, r.path)).collect();
        assert!(keys.contains("POST /login") || keys.contains("POST /auth/login"), "keys {:?}", keys);
    }

    #[test]
    fn scan_fastapi_sample() {
        let res = scanner_scan_routes(sample_root("fastapi-sample"), None).unwrap();
        assert!(res.total_routes >= 3, "fastapi routes {:?}", res.routes);
    }

    #[test]
    fn scan_laravel_sample() {
        let res = scanner_scan_routes(sample_root("laravel-sample"), None).unwrap();
        assert!(res.total_routes >= 3);
    }

    #[test]
    fn scan_spring_sample() {
        let res = scanner_scan_routes(sample_root("spring-sample"), None).unwrap();
        assert!(res.total_routes >= 3, "spring routes {:?}", res.routes);
        assert!(res.routes.iter().any(|r| r.path.contains("/api/v1/users")), "routes {:?}", res.routes);
    }

    #[test]
    fn scan_aspnet_sample() {
        let res = scanner_scan_routes(sample_root("aspnet-sample"), None).unwrap();
        assert!(res.total_routes >= 3);
    }

    #[test]
    fn scan_gin_sample() {
        let res = scanner_scan_routes(sample_root("gin-sample"), None).unwrap();
        assert!(res.total_routes >= 3);
        let keys: std::collections::HashSet<String> = res.routes.iter().map(|r| format!("{} {}", r.method, r.path)).collect();
        assert!(keys.iter().any(|k| k.contains("/users")), "keys {:?}", keys);
    }

    #[test]
    fn generate_collection() {
        let scan = scanner_scan_routes(sample_root("express-sample"), None).unwrap();
        let out = scanner_generate_collection(scan, "http://localhost:3000".to_string(), None, None, None).unwrap();
        assert!(!out.is_empty());
        let p = PathBuf::from(&out);
        assert!(p.exists(), "output path should exist {:?}", p);
    }

    #[test]
    fn scan_emoji_no_panic() {
        // File with emoji at 3000-byte boundary should not panic (previous bug: sliced inside ✅)
        let res = scanner_scan_routes(sample_root("emoji-test"), None).unwrap();
        // Should parse at least the two routes despite the emoji filler
        assert!(res.total_routes >= 2, "emoji test routes {:?}", res.routes);
        // Ensure handler names are extracted without panic
        assert!(res.routes.iter().any(|r| r.path == "/test"), "should find /test");
    }
}
