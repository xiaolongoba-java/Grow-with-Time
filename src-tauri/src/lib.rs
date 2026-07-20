use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{Menu, MenuItem};

const DB_URL: &str = "sqlite:app.db";

fn migrations() -> Vec<tauri_plugin_sql::Migration> {
    use tauri_plugin_sql::{Migration, MigrationKind};

    vec![
        Migration {
            version: 1,
            description: "create_tasks_and_settings",
            sql: r#"
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'pending',
  due_date TEXT,
  due_time TEXT,
  sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'system');
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "full_prd_schema",
            sql: r#"
ALTER TABLE tasks ADD COLUMN parent_id TEXT;
ALTER TABLE tasks ADD COLUMN repeat_rule TEXT;
ALTER TABLE tasks ADD COLUMN remind_minutes INTEGER;

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#5B8FF9',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_tags (
  task_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'file',
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS smart_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  filter_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  target_per_week INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habit_checks (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  check_date TEXT NOT NULL,
  UNIQUE(habit_id, check_date)
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('notify_ahead', '30');
INSERT OR IGNORE INTO settings (key, value) VALUES ('autostart', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('privacy_mode', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_base_url', 'https://api.openai.com/v1');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_api_key', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_model', 'gpt-4o-mini');
INSERT OR IGNORE INTO settings (key, value) VALUES ('karma', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('streak', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('last_complete_date', '');
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "memos_and_float",
            sql: r#"
CREATE TABLE IF NOT EXISTS memos (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('float_visible', 'true');
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "task_end_time",
            sql: r#"
ALTER TABLE tasks ADD COLUMN end_time TEXT;
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "memo_title",
            sql: r#"
ALTER TABLE memos ADD COLUMN title TEXT NOT NULL DEFAULT '';
"#,
            kind: MigrationKind::Up,
        },
    ]
}

#[tauri::command]
fn show_quick_add(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("quick-add") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        window
            .emit("quick-add:focus", ())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn show_float(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("float") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        window
            .emit("float:focus", ())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn hide_float(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("float") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn today_pending_count(count: i64) -> Result<i64, String> {
    Ok(count)
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "打开主窗口", true, None::<&str>)?;
    let float = MenuItem::with_id(app, "float", "桌面浮窗", true, None::<&str>)?;
    let today = MenuItem::with_id(app, "today", "今日待办", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &float, &today, &quit])?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("Grow with Time")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "float" => {
                let _ = show_float(app.clone());
            }
            "today" => {
                let _ = app.emit("tray:today", ());
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            show_quick_add,
            show_float,
            hide_float,
            today_pending_count
        ])
        .setup(|app| {
            setup_tray(app.handle())?;
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.set_title("Grow with Time");
                let _ = main.show();
                let _ = main.set_focus();
                let app_handle = app.handle().clone();
                main.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(w) = app_handle.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    }
                });
            }
            if let Some(float) = app.get_webview_window("float") {
                let app_handle = app.handle().clone();
                float.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(w) = app_handle.get_webview_window("float") {
                            let _ = w.hide();
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
