//! APIForge library: Tauri commands exposed to the renderer, wired to the
//! shared HTTP / Git / Mock / YAML / Store engines.

pub mod collections;
pub mod commands;
pub mod flow;
pub mod git;
pub mod http;
pub mod mock;
pub mod scanner;
pub mod store;

use mock::MockRegistry;
use store::Store;

pub fn run() {
    let store = Store::open().expect("failed to open local store");
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(store)
        .manage(MockRegistry::new())
        .invoke_handler(tauri::generate_handler![
            commands::requests_execute,
            commands::requests_history,
            commands::workspace_info,
            commands::git_status,
            commands::git_diff,
            commands::mock_start,
            commands::mock_stop,
            commands::mock_hits,
            mock::mock_list,
            mock::mock_create,
            mock::mock_update,
            mock::mock_delete,
            mock::mock_clear_hits,
            mock::mock_export_hits,
            mock::mock_state_snapshot,
            mock::mock_state_set,
            mock::mock_state_clear,
            mock::mock_list_routes,
            mock::mock_create_route,
            mock::mock_update_route,
            mock::mock_delete_route,
            mock::mock_generate_from_openapi,
            mock::mock_diff_specs,
            mock::mock_mcp_list_tools,
            mock::mock_mcp_call,
            commands::yaml_read_tree,
            commands::yaml_save_tree,
            commands::yaml_replace_all,
            commands::settings_get,
            commands::settings_set,
            commands::cookies_for,
            flow::flow_analyze,
            flow::flow_export_svg,
            scanner::scanner_detect_framework,
            scanner::scanner_scan_routes,
            scanner::scanner_generate_collection,
            scanner::scanner_quick_scan,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}