// APIForge desktop entry point. All logic lives in the library crate so the
// CLI binary (src/cli.rs) can share the same HTTP / YAML / Git engines.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    apiforge_lib::run()
}