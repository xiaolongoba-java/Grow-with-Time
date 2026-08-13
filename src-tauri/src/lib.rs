mod os_reminders;

use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{Menu, MenuItem};
use tauri_plugin_notification::NotificationExt;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Condvar, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const DB_URL: &str = "sqlite:app.db";
const DATABASE_BACKUP_DIR: &str = "database-backups";
const PENDING_RESTORE_FILE: &str = "pending-database-restore";

fn copy_database_files(source_dir: &Path, target_dir: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(target_dir)?;
    for name in ["app.db", "app.db-wal", "app.db-shm"] {
        let source = source_dir.join(name);
        if source.exists() {
            std::fs::copy(source, target_dir.join(name))?;
        }
    }
    Ok(())
}

fn create_startup_database_backup(app_data_dir: &Path) -> std::io::Result<()> {
    if !app_data_dir.join("app.db").exists() {
        return Ok(());
    }
    let root = app_data_dir.join(DATABASE_BACKUP_DIR);
    std::fs::create_dir_all(&root)?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    copy_database_files(app_data_dir, &root.join(format!("startup-{stamp}")))?;
    let mut snapshots = std::fs::read_dir(&root)?
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false))
        .collect::<Vec<_>>();
    snapshots.sort_by_key(|entry| std::cmp::Reverse(entry.file_name()));
    for old in snapshots.into_iter().skip(10) {
        let _ = std::fs::remove_dir_all(old.path());
    }
    Ok(())
}

fn apply_pending_database_restore(app_data_dir: &Path) -> std::io::Result<()> {
    let marker = app_data_dir.join(PENDING_RESTORE_FILE);
    if !marker.exists() {
        return Ok(());
    }
    let source = PathBuf::from(std::fs::read_to_string(&marker)?.trim());
    let backup_root = app_data_dir.join(DATABASE_BACKUP_DIR).canonicalize()?;
    let source = source.canonicalize()?;
    if !source.starts_with(&backup_root) || !source.join("app.db").exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "invalid database restore source",
        ));
    }
    create_startup_database_backup(app_data_dir)?;
    for name in ["app.db", "app.db-wal", "app.db-shm"] {
        let target = app_data_dir.join(name);
        if target.exists() {
            std::fs::remove_file(&target)?;
        }
        let backup_file = source.join(name);
        if backup_file.exists() {
            std::fs::copy(backup_file, target)?;
        }
    }
    std::fs::remove_file(marker)?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DatabaseBackupInfo {
    id: String,
    size: u64,
    created_at: u64,
}

#[tauri::command]
fn database_health(app: AppHandle) -> Result<serde_json::Value, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let database = dir.join("app.db");
    let probe = dir.join(".write-probe");
    std::fs::write(&probe, b"ok").map_err(|error| error.to_string())?;
    let _ = std::fs::remove_file(probe);
    Ok(serde_json::json!({
        "healthy": database.exists(),
        "databaseExists": database.exists(),
        "databaseSize": database.metadata().map(|item| item.len()).unwrap_or(0),
        "dataDirectory": dir.to_string_lossy(),
        "writable": true
    }))
}

#[tauri::command]
fn list_database_backups(app: AppHandle) -> Result<Vec<DatabaseBackupInfo>, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join(DATABASE_BACKUP_DIR);
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut backups = std::fs::read_dir(root)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let id = entry.file_name().to_string_lossy().to_string();
            let database = entry.path().join("app.db");
            let size = database.metadata().ok()?.len();
            let created_at = id.rsplit('-').next()?.parse().ok()?;
            Some(DatabaseBackupInfo { id, size, created_at })
        })
        .collect::<Vec<_>>();
    backups.sort_by_key(|item| std::cmp::Reverse(item.created_at));
    Ok(backups)
}

#[tauri::command]
fn schedule_database_restore(app: AppHandle, backup_id: String) -> Result<(), String> {
    if !backup_id.starts_with("startup-")
        || backup_id.contains('/')
        || backup_id.contains('\\')
    {
        return Err("无效的备份编号".into());
    }
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let backup = dir.join(DATABASE_BACKUP_DIR).join(&backup_id);
    if !backup.join("app.db").exists() {
        return Err("备份文件不存在".into());
    }
    std::fs::write(dir.join(PENDING_RESTORE_FILE), backup.to_string_lossy().as_bytes())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_data_directory(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(dir)
        .spawn()
        .map_err(|error| error.to_string())?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(dir)
        .spawn()
        .map_err(|error| error.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(dir)
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn restart_app(app: AppHandle) {
    app.restart();
}

fn show_startup_error(message: &str) {
    eprintln!("{message}");
    #[cfg(target_os = "windows")]
    {
        let script = "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show($env:GWT_STARTUP_ERROR, 'Grow with Time 启动失败', 'OK', 'Error') | Out-Null";
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .env("GWT_STARTUP_ERROR", message)
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let script =
            "display dialog (system attribute \"GWT_STARTUP_ERROR\") with title \"Grow with Time 启动失败\" buttons {\"好\"} default button \"好\" with icon stop";
        let _ = std::process::Command::new("osascript")
            .args(["-e", script])
            .env("GWT_STARTUP_ERROR", message)
            .spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("zenity")
            .args(["--error", "--title=Grow with Time 启动失败", "--text", message])
            .spawn();
    }
}

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
        Migration {
            version: 6,
            description: "timers_reminders",
            sql: r#"
CREATE TABLE IF NOT EXISTS timers (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  interval_sec INTEGER NOT NULL,
  remaining_sec INTEGER NOT NULL,
  running INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  task_id TEXT,
  ends_at TEXT,
  last_fired_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "planning_projects_templates_notifications",
            sql: r#"
ALTER TABLE tasks ADD COLUMN project_id TEXT;
ALTER TABLE tasks ADD COLUMN my_day_date TEXT;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#7D9BE8',
  due_date TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  task_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_notifications (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  kind TEXT NOT NULL DEFAULT 'reminder',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  scheduled_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  snoozed_until TEXT,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_backup', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('onboarding_complete', 'false');
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "execution_history_and_deep_planning",
            sql: r#"
ALTER TABLE tasks ADD COLUMN blocked_by_id TEXT;
ALTER TABLE tasks ADD COLUMN completion_criteria TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN energy_level TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE tasks ADD COLUMN flexible INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tasks ADD COLUMN actual_minutes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE projects ADD COLUMN goal TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN success_criteria TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_events_task
  ON task_events(task_id, created_at DESC);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  interruption_reason TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_task
  ON focus_sessions(task_id, started_at DESC);

CREATE TABLE IF NOT EXISTS day_snapshots (
  id TEXT PRIMARY KEY,
  plan_date TEXT NOT NULL UNIQUE,
  morning_json TEXT NOT NULL DEFAULT '[]',
  evening_json TEXT,
  planned_minutes INTEGER NOT NULL DEFAULT 0,
  completed_minutes INTEGER NOT NULL DEFAULT 0,
  reflection TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  due_date TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "formalize_planning_schema",
            sql: r#"
CREATE INDEX IF NOT EXISTS idx_tasks_project_status
  ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_status
  ON tasks(due_date, status);
INSERT OR REPLACE INTO settings (key, value)
  VALUES ('schema_contract', '9');
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "growth_goals_achievements",
            sql: r#"
ALTER TABLE tasks ADD COLUMN goal_id TEXT;
ALTER TABLE tasks ADD COLUMN goal_contribution REAL NOT NULL DEFAULT 1;
ALTER TABLE habits ADD COLUMN goal_id TEXT;
ALTER TABLE habits ADD COLUMN goal_contribution REAL NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'target',
  color TEXT NOT NULL DEFAULT '#2F6FED',
  goal_type TEXT NOT NULL DEFAULT 'quantity',
  start_date TEXT NOT NULL,
  target_date TEXT,
  start_value REAL NOT NULL DEFAULT 0,
  target_value REAL NOT NULL DEFAULT 1,
  current_value REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '次',
  status TEXT NOT NULL DEFAULT 'active',
  motivation TEXT NOT NULL DEFAULT '',
  project_id TEXT,
  weekly_target REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goal_entries (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 1,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_goal_entries_source
  ON goal_entries(goal_id, source_type, source_id)
  WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_goal_entries_date
  ON goal_entries(entry_date, goal_id);

CREATE TABLE IF NOT EXISTS goal_milestones (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  target_value REAL NOT NULL DEFAULT 0,
  target_date TEXT,
  completed_at TEXT,
  sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  goal_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  achieved_at TEXT NOT NULL,
  image_path TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_achievements_source
  ON achievements(source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_goal_status
  ON tasks(goal_id, status);
INSERT OR REPLACE INTO settings (key, value)
  VALUES ('schema_contract', '10');
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "persistent_schedule_lock",
            sql: r#"
ALTER TABLE tasks ADD COLUMN schedule_locked INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_tasks_schedule_locked
  ON tasks(schedule_locked, due_date, status);
INSERT OR REPLACE INTO settings (key, value)
  VALUES ('schema_contract', '11');
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "canonical_task_planning_and_manual_goal_completion",
            sql: r#"
CREATE TABLE IF NOT EXISTS task_planning_metadata (
  task_id TEXT PRIMARY KEY,
  reminder_minutes_json TEXT NOT NULL DEFAULT '[]',
  estimated_minutes INTEGER
);
ALTER TABLE goals ADD COLUMN manual_completion INTEGER NOT NULL DEFAULT 0;
INSERT OR REPLACE INTO settings (key, value)
  VALUES ('schema_contract', '12');
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "moments_reflections_inspirations_and_future_letters",
            sql: r#"
CREATE TABLE IF NOT EXISTS daily_reflections (
  id TEXT PRIMARY KEY,
  reflection_date TEXT NOT NULL UNIQUE,
  harvest TEXT NOT NULL DEFAULT '',
  highlight TEXT NOT NULL DEFAULT '',
  mood TEXT NOT NULL DEFAULT '',
  tomorrow_note TEXT NOT NULL DEFAULT '',
  auto_summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inspirations (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  destination TEXT NOT NULL DEFAULT 'inbox',
  status TEXT NOT NULL DEFAULT 'inbox',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inspirations_status_created
  ON inspirations(status, created_at DESC);
CREATE TABLE IF NOT EXISTS future_letters (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  deliver_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  delivered_at TEXT,
  opened_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_future_letters_delivery
  ON future_letters(status, deliver_at);
INSERT OR REPLACE INTO settings (key, value)
  VALUES ('schema_contract', '13');
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "desktop_widget_mode_default",
            sql: r#"
INSERT OR IGNORE INTO settings (key, value) VALUES ('desktop_widget_mode', 'dashboard');
INSERT OR REPLACE INTO settings (key, value)
  VALUES ('schema_contract', '14');
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "anniversaries",
            sql: r#"
CREATE TABLE IF NOT EXISTS anniversaries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  recur_yearly INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_anniversaries_event_date
  ON anniversaries(event_date);
INSERT OR REPLACE INTO settings (key, value)
  VALUES ('schema_contract', '15');
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "anniversary_lunar_calendar",
            sql: r#"
ALTER TABLE anniversaries ADD COLUMN calendar TEXT NOT NULL DEFAULT 'solar';
ALTER TABLE anniversaries ADD COLUMN lunar_month INTEGER;
ALTER TABLE anniversaries ADD COLUMN lunar_day INTEGER;
ALTER TABLE anniversaries ADD COLUMN lunar_leap INTEGER NOT NULL DEFAULT 0;
INSERT OR REPLACE INTO settings (key, value)
  VALUES ('schema_contract', '16');
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "desktop_widget_layer_default",
            sql: r#"
INSERT OR IGNORE INTO settings (key, value) VALUES ('desktop_widget_layer', 'bottom');
INSERT OR REPLACE INTO settings (key, value)
  VALUES ('schema_contract', '17');
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "repeat_generated_from_id",
            sql: r#"
ALTER TABLE tasks ADD COLUMN generated_from_id TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_generated_from
  ON tasks(generated_from_id);
INSERT OR REPLACE INTO settings (key, value)
  VALUES ('schema_contract', '18');
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "karma_ledger",
            sql: r#"
CREATE TABLE IF NOT EXISTS karma_ledger (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  action TEXT NOT NULL,
  points INTEGER NOT NULL,
  entry_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(source_type, source_id, action)
);
INSERT OR REPLACE INTO settings (key, value)
  VALUES ('schema_contract', '19');
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
fn show_inspiration(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("inspiration") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        window.emit("inspiration:focus", ()).map_err(|e| e.to_string())?;
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

/// Minimize main window and open the float timer tab (used when a reminder starts).
#[tauri::command]
fn start_timer_ui(app: AppHandle) -> Result<(), String> {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.minimize();
    }
    if let Some(window) = app.get_webview_window("float") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        window
            .emit("float:timer", ())
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

fn pin_desktop_widget(window: &tauri::WebviewWindow, layer: &str) -> Result<(), String> {
    let pin_bottom = layer != "top";
    if pin_bottom {
        let _ = window.set_always_on_top(false);
        window
            .set_always_on_bottom(true)
            .map_err(|e| e.to_string())?;
    } else {
        let _ = window.set_always_on_bottom(false);
        window.set_always_on_top(true).map_err(|e| e.to_string())?;
    }
    window.show().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn show_desktop_widgets(app: AppHandle, layer: Option<String>) -> Result<(), String> {
    let layer = layer.unwrap_or_else(|| "bottom".into());
    for label in ["widget-calendar", "widget-today", "widget-memo"] {
        if let Some(window) = app.get_webview_window(label) {
            pin_desktop_widget(&window, &layer)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn show_dashboard_strip(app: AppHandle, layer: Option<String>) -> Result<(), String> {
    let layer = layer.unwrap_or_else(|| "bottom".into());
    if let Some(window) = app.get_webview_window("widget-dashboard") {
        pin_desktop_widget(&window, &layer)?;
    }
    Ok(())
}

#[tauri::command]
fn today_pending_count(count: i64) -> Result<i64, String> {
    Ok(count)
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeReminder {
    reminder_id: String,
    task_id: String,
    title: String,
    body: String,
    fire_at_ms: u64,
}

#[derive(Default)]
struct ReminderScheduler {
    reminders: Mutex<HashMap<String, NativeReminder>>,
    changed: Condvar,
}

fn start_notification_scheduler(app: AppHandle, scheduler: Arc<ReminderScheduler>) {
    std::thread::spawn(move || {
        loop {
            let reminder = {
                let mut guard = scheduler.reminders.lock().unwrap_or_else(|e| e.into_inner());
                loop {
                    let next = guard
                        .values()
                        .min_by_key(|item| item.fire_at_ms)
                        .cloned();
                    let Some(next) = next else {
                        guard = scheduler
                            .changed
                            .wait(guard)
                            .unwrap_or_else(|e| e.into_inner());
                        continue;
                    };
                    let now_ms = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;
                    if next.fire_at_ms > now_ms {
                        let wait = Duration::from_millis(next.fire_at_ms - now_ms);
                        let result = scheduler
                            .changed
                            .wait_timeout(guard, wait)
                            .unwrap_or_else(|e| e.into_inner());
                        guard = result.0;
                        continue;
                    }
                    guard.remove(&next.reminder_id);
                    break next;
                }
            };

        let _ = app
            .notification()
            .builder()
            .title(&reminder.title)
            .body(&reminder.body)
            .show();
        let _ = app.emit(
            "native-reminder-fired",
            serde_json::json!({
                "id": reminder.reminder_id,
                "taskId": reminder.task_id,
                "title": reminder.title,
                "body": reminder.body,
                "firedAt": reminder.fire_at_ms
            }),
        );
        }
    });
}

#[tauri::command]
fn schedule_native_notification(
    scheduled: tauri::State<'_, Arc<ReminderScheduler>>,
    reminder_id: String,
    task_id: String,
    title: String,
    body: String,
    fire_at_ms: u64,
) -> Result<(), String> {
    let mut guard = scheduled.reminders.lock().map_err(|e| e.to_string())?;
    guard.insert(
        reminder_id.clone(),
        NativeReminder {
            reminder_id,
            task_id,
            title,
            body,
            fire_at_ms,
        },
    );
    drop(guard);
    scheduled.changed.notify_all();
    Ok(())
}

#[tauri::command]
fn cancel_native_notification(
    scheduled: tauri::State<'_, Arc<ReminderScheduler>>,
    reminder_id: String,
) -> Result<(), String> {
    scheduled
        .reminders
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&reminder_id);
    scheduled.changed.notify_all();
    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OsReminderSyncResult {
    ok: bool,
    scheduled_count: usize,
    overflow_count: usize,
    truncated: bool,
    error: Option<String>,
    hosted_ids: Vec<String>,
}

#[tauri::command]
fn sync_native_notifications(
    scheduled: tauri::State<'_, Arc<ReminderScheduler>>,
    reminders: Vec<NativeReminder>,
) -> Result<OsReminderSyncResult, String> {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let mapped: Vec<os_reminders::OsReminder> = reminders
        .iter()
        .map(|item| os_reminders::OsReminder {
            id: item.reminder_id.clone(),
            title: item.title.clone(),
            body: item.body.clone(),
            fire_at_ms: item.fire_at_ms,
        })
        .collect();
    let window = os_reminders::select_window(&mapped, now_ms);
    let os_error = os_reminders::sync(&window.windowed).err();
    let os_ok = os_error.is_none();
    let windowed_ids: std::collections::HashSet<String> =
        window.windowed.iter().map(|item| item.id.clone()).collect();

    let mut guard = scheduled.reminders.lock().map_err(|e| e.to_string())?;
    guard.clear();
    let in_process: Vec<NativeReminder> = if os_ok {
        reminders
            .into_iter()
            .filter(|item| item.fire_at_ms > now_ms && !windowed_ids.contains(&item.reminder_id))
            .collect()
    } else {
        reminders
            .into_iter()
            .filter(|item| item.fire_at_ms > now_ms)
            .collect()
    };
    guard.extend(
        in_process
            .into_iter()
            .map(|item| (item.reminder_id.clone(), item)),
    );
    drop(guard);
    scheduled.changed.notify_all();
    Ok(OsReminderSyncResult {
        ok: os_ok,
        scheduled_count: if os_ok { window.windowed.len() } else { 0 },
        overflow_count: if os_ok {
            window.overflow.len()
        } else {
            mapped.iter().filter(|item| item.fire_at_ms > now_ms).count()
        },
        truncated: os_ok && window.truncated,
        error: os_error,
        hosted_ids: if os_ok {
            window.windowed.iter().map(|item| item.id.clone()).collect()
        } else {
            Vec::new()
        },
    })
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let quit = MenuItem::with_id(app, "quit", "退出应用", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "打开主窗口", true, None::<&str>)?;
    let float = MenuItem::with_id(app, "float", "桌面浮窗", true, None::<&str>)?;
    let dashboard = MenuItem::with_id(app, "dashboard", "桌面仪表盘", true, None::<&str>)?;
    let widgets = MenuItem::with_id(app, "widgets", "经典桌面组件", true, None::<&str>)?;
    let today = MenuItem::with_id(app, "today", "今日待办", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &float, &dashboard, &widgets, &today, &quit])?;

    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("日进·拾光");
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    } else {
        eprintln!("tray: missing default window icon; continuing without tray icon image");
    }
    let _tray = builder
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
            "dashboard" => {
                let _ = show_dashboard_strip(app.clone(), Some("bottom".into()));
            }
            "widgets" => {
                let _ = show_desktop_widgets(app.clone(), Some("bottom".into()));
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
        .manage(Arc::new(ReminderScheduler::default()))
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("app-data")
                .setup(|app, _api| {
                    let app_data_dir = app.path().app_data_dir()?;
                    std::fs::create_dir_all(&app_data_dir)?;
                    apply_pending_database_restore(&app_data_dir)?;
                    create_startup_database_backup(&app_data_dir)?;
                    Ok(())
                })
                .build(),
        )
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
            show_inspiration,
            show_float,
            start_timer_ui,
            hide_float,
            show_desktop_widgets,
            show_dashboard_strip,
            today_pending_count,
            schedule_native_notification,
            cancel_native_notification,
            sync_native_notifications,
            database_health,
            list_database_backups,
            schedule_database_restore,
            open_data_directory,
            restart_app
        ])
        .setup(|app| {
            let scheduler = Arc::clone(app.state::<Arc<ReminderScheduler>>().inner());
            start_notification_scheduler(app.handle().clone(), scheduler);
            setup_tray(app.handle())?;
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.set_title("日进·拾光 · Grow with Time");
                let _ = main.show();
                let _ = main.set_focus();
                let app_handle = app.handle().clone();
                main.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(w) = app_handle.get_webview_window("main") {
                            let _ = w.hide();
                            let _ = app_handle.emit("main:hidden-to-tray", ());
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
            for label in [
                "quick-add",
                "inspiration",
                "widget-dashboard",
                "widget-calendar",
                "widget-today",
                "widget-memo",
            ] {
                if let Some(window) = app.get_webview_window(label) {
                    let app_handle = app.handle().clone();
                    let window_label = label.to_string();
                    window.on_window_event(move |event| {
                        if let WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            if let Some(w) = app_handle.get_webview_window(&window_label) {
                                let _ = w.hide();
                            }
                        }
                    });
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| {
            let message = format!(
                "Grow with Time 无法启动。\n\n{}\n\n你的任务数据仍保存在本机，请不要删除应用数据目录。",
                error
            );
            show_startup_error(&message);
        });
}
