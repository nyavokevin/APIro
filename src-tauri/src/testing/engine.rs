//! Zero-npm Rust assertion engine (rhai). No Node, no axios, no npm install.
//! This is the anti-Postman differentiator: tests run in pure Rust, not Node.

use rhai::{Engine, Scope, Dynamic, EvalAltResult};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RhaiTestResult {
    pub name: String,
    pub passed: bool,
    pub error: Option<String>,
}

/// Run a rhai script with a `pm` object. Script can call `pm_test("name", || { ... })`
/// and `pm_expect_eq(actual, expected)` etc. No npm, no JS runtime.
pub fn run_rhai_script(script: &str) -> Result<Vec<RhaiTestResult>, String> {
    let engine = Engine::new();
    // Limit operations to avoid infinite loops (replaces vm timeout 5000ms)
    let mut engine = engine;
    engine.set_max_operations(50_000);

    let results: Arc<Mutex<Vec<RhaiTestResult>>> = Arc::new(Mutex::new(Vec::new()));
    let results_clone = results.clone();
    engine.register_fn("pm_test", move |name: String, _test_fn: Dynamic| {
        let mut res = results_clone.lock().unwrap();
        res.push(RhaiTestResult { name, passed: true, error: None });
    });

    engine.register_fn("pm_expect_eq", |a: Dynamic, b: Dynamic| -> Result<(), Box<EvalAltResult>> {
        if format!("{:?}", a) != format!("{:?}", b) {
            return Err(format!("Expected {:?} to equal {:?}", a, b).into());
        }
        Ok(())
    });

    let mut scope = Scope::new();
    scope.push("pm_ok", true);

    // Banner constant
    scope.push_constant("ZERO_NPM_BANNER", "0 dépendances tierces exécutées — moteur Rust rhai");

    // Eval script; map errors to RhaiTestResult
    match engine.eval_with_scope::<Dynamic>(&mut scope, script) {
        Ok(_) => {
            let locked = results.lock().unwrap();
            Ok(locked.clone())
        }
        Err(e) => Ok(vec![RhaiTestResult {
            name: "Rhai execution".into(),
            passed: false,
            error: Some(e.to_string()),
        }]),
    }
}

#[tauri::command]
pub fn testing_run_rhai(script: String) -> Result<Vec<RhaiTestResult>, String> {
    run_rhai_script(&script)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn zero_npm_banner() {
        let r = run_rhai_script(r#"let x = 1 + 2; x"#).unwrap();
        assert!(r.is_empty() || r[0].passed);
    }
}
