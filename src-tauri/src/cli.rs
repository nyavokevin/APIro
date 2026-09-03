//! CLI entry point: `apiforge run <file.request.yaml|collection> [--var k=v ...] [--env <file>] [--concurrency N]`
//! Reuses the exact same engines as the desktop app. No login, no cloud.

use std::collections::HashMap;
use std::path::Path;

fn print_help() {
    eprintln!("apiforge — the anti-Postman CLI (Tauri, YAML authoritative)");
    eprintln!();
    eprintln!("USAGE:");
    eprintln!("  apiforge run <file.request.yaml|collection_dir> [--var key=value]... [--env <file.json>] [--concurrency N] [--output <file>] [--junit <file>]");
    eprintln!("  apiforge mock <mock_dir> --port 3001 [--mode mock|proxy|record] [--target <url>] [--state] [--name <name>]");
    eprintln!("  apiforge mock generate --spec <openapi.json|yaml> --out <mock_dir> [--name <name>]");
    eprintln!("  apiforge mcp                # MCP stdio server (mock_list_routes, mock_create_route, mock_set_state, mock_hit_log, ...)");
    eprintln!("  apiforge --version");
    eprintln!();
    eprintln!("EXAMPLES:");
    eprintln!("  apiforge run ~/APIForge/My\\ API/Login.request.yaml --var base_url=https://api.example.com");
    eprintln!("  apiforge run ~/APIForge --concurrency 4 --junit report.xml");
    eprintln!("  apiforge mock generate --spec ./swagger.json --out ./mocks");
    eprintln!("  apiforge mock ./mocks --port 3001 --mode record --target https://api.example.com");
    eprintln!("  apiforge mock ./mocks --port 3001 --state   # stateful CRUD mocks");
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("run") => run(&args[1..]),
        Some("mock") => mock_cmd(&args[1..]),
        Some("mcp") => apiforge_lib::mock::mcp::run_stdio_server(),
        Some("--version") | Some("-V") => println!("apiforge {}", env!("CARGO_PKG_VERSION")),
        Some("--help") | Some("-h") => print_help(),
        _ => {
            print_help();
            std::process::exit(1);
        }
    }
}

// ── `apiforge mock` — headless mock server + spec generation (CI-native) ──

fn mock_generate(args: &[String]) {
    let mut spec: Option<String> = None;
    let mut out: Option<String> = None;
    let mut name: Option<String> = None;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--spec" | "-s" => { spec = args.get(i + 1).cloned(); i += 2; }
            "--out" | "-o" => { out = args.get(i + 1).cloned(); i += 2; }
            "--name" => { name = args.get(i + 1).cloned(); i += 2; }
            s if spec.is_none() => { spec = Some(s.to_string()); i += 1; }
            _ => { i += 1; }
        }
    }
    let Some(spec_path) = spec else {
        eprintln!("error: --spec <openapi.json|yaml> required");
        std::process::exit(1);
    };
    let raw = match std::fs::read_to_string(&spec_path) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("error: cannot read {spec_path}: {e}");
            std::process::exit(1);
        }
    };
    let spec_val = match apiforge_lib::mock::mcp::parse_spec_value(&raw) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("error: {e}");
            std::process::exit(1);
        }
    };
    let result = apiforge_lib::mock::openapi_gen::generate_from_openapi(
        &spec_val,
        &apiforge_lib::mock::openapi_gen::GenerationOptions::default(),
    );
    for w in &result.warnings {
        eprintln!("warning: {w}");
    }
    if let Some(out_dir) = out {
        let info = apiforge_lib::mock::MockServerInfo {
            id: name.clone().unwrap_or_else(|| "generated".into()),
            name: result.spec_title.clone().unwrap_or_else(|| "Generated mocks".into()),
            port: 0,
            running: false,
            routes: result.routes.clone(),
            mode: Default::default(),
            target_url: None,
            state_enabled: false,
            mocks_dir: Some(out_dir.clone()),
            latency_ms: 0,
            graphql_enabled: false,
        };
        match apiforge_lib::mock::write_mocks_to_dir(&info, Path::new(&out_dir)) {
            Ok(files) => {
                eprintln!("wrote {} file(s) to {out_dir}:", files.len());
                for f in &files {
                    eprintln!("  {}", f.display());
                }
            }
            Err(e) => {
                eprintln!("error: cannot write mocks to {out_dir}: {e}");
                std::process::exit(1);
            }
        }
    }
    println!("generated {} route(s) from {}", result.routes.len(), spec_path);
    for r in &result.routes {
        println!(
            "  {:<7} {:<30} -> {}{}",
            r.method,
            r.path,
            r.status,
            if r.state.is_some() { "  [stateful]" } else { "" }
        );
    }
}

fn load_vars_from_env_file(path: &str) -> HashMap<String, String> {
    let raw = match std::fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("warning: cannot read env file {path}: {e}");
            return HashMap::new();
        }
    };
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
        let mut map = HashMap::new();
        if let Some(obj) = val.get("variables").and_then(|v| v.as_array()) {
            for item in obj {
                if let (Some(k), Some(v)) = (item.get("key").and_then(|k| k.as_str()), item.get("value").and_then(|v| v.as_str())) {
                    map.insert(k.to_string(), v.to_string());
                }
            }
        } else if let Some(obj) = val.as_object() {
            for (k, v) in obj {
                if let Some(s) = v.as_str() {
                    map.insert(k.clone(), s.to_string());
                }
            }
        }
        return map;
    }
    HashMap::new()
}

fn collect_requests_from_path(path: &str) -> Vec<(String, apiforge_lib::http::RequestInput)> {
    let p = Path::new(path);
    if p.is_file() {
        let raw = std::fs::read_to_string(p).unwrap_or_default();
        if let Ok(req) = serde_yaml::from_str::<apiforge_lib::http::RequestInput>(&raw) {
            return vec![(path.to_string(), req)];
        }
        // Try collection Node file?
        return vec![];
    }
    // Directory: walk *.request.yaml
    let mut out = Vec::new();
    if let Ok(nodes) = apiforge_lib::collections::read_tree(p) {
        fn walk(nodes: &[apiforge_lib::collections::Node], prefix: &str, out: &mut Vec<(String, apiforge_lib::http::RequestInput)>) {
            for n in nodes {
                match n {
                    apiforge_lib::collections::Node::Folder { name, children } => {
                        let pfx = if prefix.is_empty() { name.clone() } else { format!("{}/{}", prefix, name) };
                        walk(children, &pfx, out);
                    }
                    apiforge_lib::collections::Node::Request { name, request } => {
                        let req = apiforge_lib::http::RequestInput {
                            method: request.method.clone(),
                            url: request.url.clone(),
                            headers: request.headers.iter().map(|h| apiforge_lib::http::KeyValuePair { key: h.key.clone(), value: h.value.clone(), enabled: h.enabled }).collect(),
                            params: request.params.iter().map(|p| apiforge_lib::http::KeyValuePair { key: p.key.clone(), value: p.value.clone(), enabled: p.enabled }).collect(),
                            body_type: request.body_type.clone(),
                            body: request.body.clone(),
                            timeout_ms: Some(30_000),
                            follow_redirects: Some(true),
                        };
                        let label = if prefix.is_empty() { name.clone() } else { format!("{}/{}", prefix, name) };
                        out.push((label, req));
                    }
                }
            }
        }
        walk(&nodes, "", &mut out);
    }
    out
}

fn run(args: &[String]) {
    let mut path: Option<String> = None;
    let mut vars: HashMap<String, String> = HashMap::new();
    let mut env_file: Option<String> = None;
    let mut concurrency: usize = 1;
    let mut output: Option<String> = None;
    let mut junit: Option<String> = None;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--var" => {
                if i + 1 < args.len() {
                    if let Some((k, v)) = args[i + 1].split_once('=') {
                        vars.insert(k.to_string(), v.to_string());
                    }
                    i += 2;
                } else { i += 1; }
            }
            "--env" => {
                if i + 1 < args.len() { env_file = Some(args[i+1].clone()); i += 2; } else { i += 1; }
            }
            "--concurrency" => {
                if i + 1 < args.len() { concurrency = args[i+1].parse().unwrap_or(1); i += 2; } else { i += 1; }
            }
            "--output" => {
                if i + 1 < args.len() { output = Some(args[i+1].clone()); i += 2; } else { i += 1; }
            }
            "--junit" => {
                if i + 1 < args.len() { junit = Some(args[i+1].clone()); i += 2; } else { i += 1; }
            }
            s if s.starts_with("--") => { eprintln!("warning: unknown flag {s}"); i += 1; }
            s if path.is_none() => { path = Some(s.to_string()); i += 1; }
            _ => { i += 1; }
        }
    }

    let path = path.unwrap_or_else(|| {
        eprintln!("error: expected a .request.yaml file or collection dir");
        std::process::exit(1);
    });

    if let Some(ef) = env_file {
        for (k, v) in load_vars_from_env_file(&ef) {
            vars.entry(k).or_insert(v);
        }
    }

    let requests = collect_requests_from_path(&path);
    if requests.is_empty() {
        eprintln!("error: no requests found at {path} (expected *.request.yaml)");
        std::process::exit(1);
    }

    eprintln!("apiforge run: {} request(s) from {}", requests.len(), path);
    if concurrency > 1 && requests.len() > 1 {
        eprintln!("concurrency {concurrency} requested — running sequentially (parallel coming via tokio tasks)");
    }

    let runtime = tokio::runtime::Runtime::new().expect("tokio runtime");
    let mut results: Vec<(String, apiforge_lib::http::ApiResponse)> = Vec::new();
    let mut failed = 0usize;

    for (label, req) in requests {
        let resp = runtime.block_on(apiforge_lib::http::execute(&req, &vars, None));
        let status = resp.status_code;
        let ok = (200..300).contains(&status) && resp.error.is_none();
        if !ok { failed += 1; }
        println!("{} {} {} -> {} {} ({}ms)", if ok { "✓" } else { "✗" }, label, req.method, status, resp.status_text, resp.response_time);
        if let Some(err) = &resp.error {
            eprintln!("  error: {err}");
        } else if !resp.body.is_empty() {
            // Truncate body for CLI
            let body = if resp.body.len() > 2000 { format!("{}…", &resp.body[..2000]) } else { resp.body.clone() };
            println!("  body: {}", body.replace('\n', " "));
        }
        results.push((label, resp));
    }

    if let Some(out_path) = output {

        let json = serde_json::to_string_pretty(&results.iter().map(|(label, r)| {
            serde_json::json!({
                "name": label,
                "status": r.status_code,
                "statusText": r.status_text,
                "time": r.response_time,
                "size": r.size,
                "error": r.error,
            })
        }).collect::<Vec<_>>()).unwrap_or_else(|_| "[]".to_string());
        let _ = std::fs::write(&out_path, json);
        eprintln!("results written to {out_path}");
    }
    if let Some(junit_path) = junit {
        let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?><testsuite>\n");
        for (label, r) in &results {
            let ok = (200..300).contains(&r.status_code) && r.error.is_none();
            xml.push_str(&format!("  <testcase name=\"{}\" time=\"{}\">\n", label.replace('"', "'"), r.response_time as f64 / 1000.0));
            if !ok {
                xml.push_str(&format!("    <failure message=\"{} {}\">{}</failure>\n", r.status_code, r.status_text, r.error.as_deref().unwrap_or(&r.body).replace('&', "&amp;").replace('<', "&lt;")));
            }
            xml.push_str("  </testcase>\n");
        }
        xml.push_str("</testsuite>\n");
        let _ = std::fs::write(&junit_path, xml);
        eprintln!("junit written to {junit_path}");
    }

    if failed > 0 {
        eprintln!("{failed} request(s) failed");
        std::process::exit(1);
    }
}

fn mock_cmd(args: &[String]) {
    if args.first().map(String::as_str) == Some("generate") {
        mock_generate(&args[1..]);
        return;
    }
    let mut file: Option<String> = None;
    let mut port: u16 = 3001;
    let mut mode = "mock".to_string();
    let mut target: Option<String> = None;
    let mut state_enabled = false;
    let mut name: Option<String> = None;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--file" | "-f" => { file = args.get(i + 1).cloned(); i += 2; }
            "--port" | "-p" => { port = args.get(i + 1).and_then(|s| s.parse().ok()).unwrap_or(3001); i += 2; }
            "--mode" | "-m" => { mode = args.get(i + 1).cloned().unwrap_or_else(|| "mock".into()); i += 2; }
            "--target" | "-t" => { target = args.get(i + 1).cloned(); i += 2; }
            "--state" => { state_enabled = true; i += 1; }
            "--name" => { name = args.get(i + 1).cloned(); i += 2; }
            s if file.is_none() => { file = Some(s.to_string()); i += 1; }
            _ => { i += 1; }
        }
    }
    let Some(dir) = file else {
        eprintln!("error: mock dir required (apiforge mock <dir> --port 3001)");
        std::process::exit(1);
    };
    let dirp = Path::new(&dir);
    let mut info = apiforge_lib::mock::read_server_meta(dirp).unwrap_or_else(|| apiforge_lib::mock::MockServerInfo {
        id: format!("cli-{port}"),
        name: name.clone().unwrap_or_else(|| "cli-mock".into()),
        port,
        running: false,
        routes: vec![],
        mode: Default::default(),
        target_url: None,
        state_enabled: false,
        mocks_dir: Some(dir.clone()),
        latency_ms: 0,
        graphql_enabled: false,
    });
    info.routes = apiforge_lib::mock::read_mocks_from_dir(dirp).unwrap_or_default();
    info.port = port;
    info.mocks_dir = Some(dir.clone());
    info.state_enabled = state_enabled || info.state_enabled;
    info.mode = match mode.as_str() {
        "proxy" => apiforge_lib::mock::MockMode::Proxy,
        "record" => apiforge_lib::mock::MockMode::Record,
        _ => apiforge_lib::mock::MockMode::Mock,
    };
    if info.routes.is_empty() {
        if info.mode == apiforge_lib::mock::MockMode::Record {
            eprintln!("note: starting record mode with 0 routes — new routes will be recorded from --target into {dir}");
        } else {
            eprintln!("error: no *.mock.yaml routes found in {dir}");
            eprintln!("hint: generate them with `apiforge mock generate --spec <openapi.json> --out {dir}`, or use --mode record to capture from a live API");
            std::process::exit(1);
        }
    }
    if info.mode != apiforge_lib::mock::MockMode::Mock && info.target_url.is_none() && target.is_none() {
        eprintln!("error: --target <url> is required for proxy/record mode");
        std::process::exit(1);
    }
    info.target_url = target;
    if let Some(n) = name {
        info.name = n;
    }
    info.running = false;

    let registry = apiforge_lib::mock::MockRegistry::new();
    let t0 = std::time::Instant::now();
    if let Err(e) = registry.start(info.clone()) {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
    eprintln!(
        "apiforge mock: {} route(s) on http://127.0.0.1:{} — started in {}ms (mode: {}, id: {})",
        info.routes.len(),
        port,
        t0.elapsed().as_millis(),
        mode,
        info.id
    );
    eprintln!("press Ctrl+C to stop");
    let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
    rt.block_on(async {
        tokio::signal::ctrl_c().await.ok();
    });
    let hit_count = registry.hits(&info.id).map(|h| h.len()).unwrap_or(0);
    let _ = registry.stop(&info.id);
    eprintln!("apiforge mock stopped — {hit_count} hit(s) this session");
}
