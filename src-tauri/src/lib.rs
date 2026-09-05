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
pub mod testing;

use mock::MockRegistry;
use store::Store;
use dashmap::DashMap;
use tokio_util::sync::CancellationToken;

pub fn run() {
    let store = Store::open().expect("failed to open local store");
    let cancel_map: DashMap<String, CancellationToken> = DashMap::new();
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(store)
        .manage(MockRegistry::new())
        .manage(cancel_map)
        .invoke_handler(tauri::generate_handler![
            commands::requests_execute,
            commands::requests_cancel,
            commands::requests_history,
            testing::engine::testing_run_rhai,
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
            scanner::diff::scanner_get_last_scan,
            scanner::diff::scanner_diff_scans,
            scanner::openapi_export::scanner_export_openapi,
            scanner::watch::scanner_watch_start,
            scanner::watch::scanner_watch_stop,
            scanner::watch::scanner_watch_is_active,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}