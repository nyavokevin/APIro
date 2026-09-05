use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use notify::{RecursiveMode, Watcher};
use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use tauri::{AppHandle, Emitter};

type WatcherMap = Arc<Mutex<HashMap<String, notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>>>>;

// Global watchers: project_path -> debouncer handle
static WATCHERS: OnceLock<WatcherMap> = OnceLock::new();
fn watchers() -> WatcherMap {
    WATCHERS.get_or_init(|| Arc::new(Mutex::new(HashMap::new()))).clone()
}

#[tauri::command]
pub fn scanner_watch_start(app: AppHandle, project_path: String) -> Result<String, String> {
    let watch_map = watchers();
    let mut map = watch_map.lock().map_err(|e| e.to_string())?;
    if map.contains_key(&project_path) {
        return Ok("Already watching".to_string());
    }

    // Discover route files to watch (reuse detector)
    let detection = crate::scanner::detector::detect_framework(&project_path).map_err(|e| e.to_string())?;
    let files = detection.route_files;
    if files.is_empty() {
        return Err("No route files to watch".to_string());
    }

    // Collect dirs to watch (unique parent dirs)
    let mut dirs = std::collections::HashSet::new();
    for f in &files {
        if let Some(parent) = Path::new(f).parent() {
            dirs.insert(parent.to_path_buf());
        }
    }
    // Also watch project root for new files
    dirs.insert(Path::new(&project_path).to_path_buf());

    let project_clone = project_path.clone();
    let app_clone = app.clone();

    let mut debouncer = new_debouncer(Duration::from_millis(500), move |res: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
        match res {
            Ok(events) => {
                let relevant = !events.is_empty();
                if relevant {
                    // Trigger incremental re-scan in background
                    let pp = project_clone.clone();
                    let ah = app_clone.clone();
                    std::thread::spawn(move || {
                        // Small debounce
                        std::thread::sleep(Duration::from_millis(300));
                        match crate::scanner::scanner_scan_routes(pp.clone(), None) {
                            Ok(result) => {
                                // Save history is done inside scan
                                // Emit event to frontend
                                let _ = ah.emit("scanner:watch-update", &result);
                            }
                            Err(e) => {
                                let _ = ah.emit("scanner:watch-error", e.to_string());
                            }
                        }
                    });
                }
            }
            Err(e) => {
                let _ = app_clone.emit("scanner:watch-error", format!("watch error: {:?}", e));
            }
        }
    }).map_err(|e| e.to_string())?;

    for dir in dirs {
        if dir.exists() {
            debouncer.watcher().watch(&dir, RecursiveMode::Recursive).map_err(|e| e.to_string())?;
        }
    }

    map.insert(project_path.clone(), debouncer);

    Ok(format!("Watching {} dirs", project_path))
}

#[tauri::command]
pub fn scanner_watch_stop(project_path: String) -> Result<String, String> {
    let watch_map = watchers();
    let mut map = watch_map.lock().map_err(|e| e.to_string())?;
    if map.remove(&project_path).is_some() {
        Ok("Stopped".to_string())
    } else {
        Err("Not watching".to_string())
    }
}

#[tauri::command]
pub fn scanner_watch_is_active(project_path: String) -> Result<bool, String> {
    let watch_map = watchers();
    let map = watch_map.lock().map_err(|e| e.to_string())?;
    Ok(map.contains_key(&project_path))
}
