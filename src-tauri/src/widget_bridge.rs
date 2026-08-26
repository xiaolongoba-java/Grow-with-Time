//! Local HTTP bridge so native desktop widget hosts can read/write app data.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;

use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

pub const BRIDGE_PORT: u16 = 19876;

static DATA_VERSION: AtomicU64 = AtomicU64::new(1);
static DB_PATH: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
static UI_ROOT: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
static BRIDGE_APP: OnceLock<AppHandle> = OnceLock::new();
static BRIDGE_TOKEN: OnceLock<String> = OnceLock::new();

pub fn bridge_token() -> &'static str {
    BRIDGE_TOKEN.get_or_init(|| uuid::Uuid::new_v4().simple().to_string())
}

fn db_path_store() -> &'static Mutex<Option<PathBuf>> {
    DB_PATH.get_or_init(|| Mutex::new(None))
}

fn ui_root_store() -> &'static Mutex<Option<PathBuf>> {
    UI_ROOT.get_or_init(|| Mutex::new(None))
}

pub fn bump_widget_data_version() {
    DATA_VERSION.fetch_add(1, Ordering::SeqCst);
}

pub fn start_widget_bridge(app: AppHandle, db_path: PathBuf, ui_root: Option<PathBuf>) {
    let _ = BRIDGE_APP.set(app);
    if let Ok(mut slot) = db_path_store().lock() {
        *slot = Some(db_path);
    }
    if let Ok(mut slot) = ui_root_store().lock() {
        *slot = ui_root;
    }

    thread::spawn(|| {
        let address = format!("127.0.0.1:{BRIDGE_PORT}");
        let server = match Server::http(&address) {
            Ok(server) => server,
            Err(error) => {
                eprintln!("widget bridge failed to start on {address}: {error}");
                return;
            }
        };
        for request in server.incoming_requests() {
            respond(request);
        }
    });
}

fn db_path() -> Option<PathBuf> {
    db_path_store().lock().ok()?.clone()
}

fn ui_root() -> Option<PathBuf> {
    ui_root_store().lock().ok()?.clone()
}

fn open_db() -> Result<Connection, String> {
    let path = db_path().ok_or_else(|| "数据库路径未初始化".to_string())?;
    Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE,
    )
    .map_err(|error| error.to_string())
}

fn cors_response(status: StatusCode, body: String, content_type: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string(body)
        .with_status_code(status)
        .with_header(Header::from_bytes("Content-Type", content_type).unwrap())
        .with_header(Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap())
        .with_header(Header::from_bytes("Access-Control-Allow-Methods", "GET, POST, OPTIONS").unwrap())
        .with_header(Header::from_bytes("Access-Control-Allow-Headers", "Content-Type, X-Widget-Token").unwrap())
}

fn json_response(status: StatusCode, value: Value) -> Response<std::io::Cursor<Vec<u8>>> {
    cors_response(status, value.to_string(), "application/json; charset=utf-8")
}

fn read_json_body(request: &mut Request) -> Result<Value, String> {
    let mut body = String::new();
    request
        .as_reader()
        .read_to_string(&mut body)
        .map_err(|error| error.to_string())?;
    if body.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(&body).map_err(|error| error.to_string())
}

fn query_rows(conn: &Connection, sql: &str) -> Result<Vec<Value>, String> {
    let mut stmt = conn.prepare(sql).map_err(|error| error.to_string())?;
    let columns = stmt.column_count();
    let names: Vec<String> = (0..columns)
        .map(|index| stmt.column_name(index).unwrap_or("").to_string())
        .collect();
    let mut rows = stmt.query([]).map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let mut object = serde_json::Map::new();
        for (index, name) in names.iter().enumerate() {
            let value: rusqlite::types::Value = row.get(index).map_err(|error| error.to_string())?;
            object.insert(name.clone(), sqlite_value_to_json(value));
        }
        out.push(Value::Object(object));
    }
    Ok(out)
}

fn sqlite_value_to_json(value: rusqlite::types::Value) -> Value {
    match value {
        rusqlite::types::Value::Null => Value::Null,
        rusqlite::types::Value::Integer(v) => json!(v),
        rusqlite::types::Value::Real(v) => json!(v),
        rusqlite::types::Value::Text(v) => Value::String(v),
        rusqlite::types::Value::Blob(v) => json!(v),
    }
}

fn serve_static(path: &str) -> Option<Response<std::io::Cursor<Vec<u8>>>> {
    let root = ui_root()?;
    let relative = path.trim_start_matches("/ui");
    let relative = relative.strip_prefix('/').unwrap_or(relative);
    let target = if relative.is_empty() || relative == "index.html" {
        root.join("index.html")
    } else {
        root.join(relative)
    };
    if !target.starts_with(&root) {
        return None;
    }
    let bytes = std::fs::read(&target).ok()?;
    let content_type = if target.extension()?.to_str()? == "js" {
        "application/javascript; charset=utf-8"
    } else if target.extension()?.to_str()? == "css" {
        "text/css; charset=utf-8"
    } else if target.extension()?.to_str()? == "svg" {
        "image/svg+xml"
    } else if target.extension()?.to_str()? == "png" {
        "image/png"
    } else if target.extension()?.to_str()? == "woff2" {
        "font/woff2"
    } else {
        "text/html; charset=utf-8"
    };
    Some(
        Response::from_data(bytes)
            .with_header(Header::from_bytes("Content-Type", content_type).unwrap())
            .with_header(Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap()),
    )
}

fn respond(mut request: Request) {
    if request.method() == &Method::Options {
        let _ = request.respond(cors_response(StatusCode(204), String::new(), "text/plain"));
        return;
    }

    let url = request.url().to_string();
    let path = url.split('?').next().unwrap_or("/");

    if path.starts_with("/api/widgets/") && !request_is_authorized(&request, &url) {
        let _ = request.respond(json_response(
            StatusCode(401),
            json!({ "error": "unauthorized widget bridge request" }),
        ));
        return;
    }

    if request.method() == &Method::Get && path == "/api/widgets/version" {
        let _ = request.respond(json_response(
            StatusCode(200),
            json!({ "version": DATA_VERSION.load(Ordering::SeqCst) }),
        ));
        return;
    }

    if request.method() == &Method::Get && path == "/api/widgets/shortcuts" {
        let response = BRIDGE_APP
            .get()
            .cloned()
            .ok_or_else(|| "应用尚未初始化".to_string())
            .and_then(crate::desktop_organize::list_desktop_shortcuts);
        let _ = request.respond(match response {
            Ok(items) => json_response(StatusCode(200), json!({ "items": items })),
            Err(error) => json_response(StatusCode(500), json!({ "error": error })),
        });
        return;
    }

    if request.method() == &Method::Get && path.starts_with("/api/widgets/shortcut-icon/") {
        let name = path.trim_start_matches("/api/widgets/shortcut-icon/");
        let valid = name.len() == 20
            && name.ends_with(".png")
            && name[..16].chars().all(|ch| ch.is_ascii_hexdigit());
        let response = if valid {
            BRIDGE_APP
                .get()
                .and_then(|app| app.path().app_data_dir().ok())
                .map(|root| root.join("shortcut-icons").join(name))
                .filter(|file| file.is_file())
                .and_then(|file| std::fs::read(file).ok())
                .map(|bytes| {
                    Response::from_data(bytes)
                        .with_header(Header::from_bytes("Content-Type", "image/png").unwrap())
                        .with_header(Header::from_bytes("Cache-Control", "private, max-age=86400").unwrap())
                })
        } else {
            None
        };
        let _ = request.respond(response.unwrap_or_else(|| {
            cors_response(StatusCode(404), "icon not found".into(), "text/plain")
        }));
        return;
    }

    if request.method() == &Method::Get && path == "/api/widgets/shortcuts/public-desktop" {
        let response = BRIDGE_APP
            .get()
            .cloned()
            .ok_or_else(|| "应用尚未初始化".to_string())
            .and_then(crate::desktop_organize::shortcut_dock_has_public_desktop);
        let _ = request.respond(match response {
            Ok(value) => json_response(StatusCode(200), json!({ "value": value })),
            Err(error) => json_response(StatusCode(500), json!({ "error": error })),
        });
        return;
    }

    if request.method() == &Method::Post && path == "/api/widgets/shortcuts/open" {
        let response: Result<Value, String> = (|| {
            let body = read_json_body(&mut request)?;
            let target = body
                .get("path")
                .and_then(Value::as_str)
                .ok_or_else(|| "缺少快捷方式路径".to_string())?;
            let app = BRIDGE_APP
                .get()
                .cloned()
                .ok_or_else(|| "应用尚未初始化".to_string())?;
            let allowed = crate::desktop_organize::list_desktop_shortcuts(app)?
                .into_iter()
                .any(|item| item.path.eq_ignore_ascii_case(target));
            if !allowed {
                return Err("快捷方式已移动或不属于收纳篮".into());
            }
            crate::desktop_organize::open_desktop_item(target.to_string())?;
            Ok(json!({ "ok": true }))
        })();
        let _ = request.respond(match response {
            Ok(value) => json_response(StatusCode(200), value),
            Err(error) => json_response(StatusCode(400), json!({ "error": error })),
        });
        return;
    }

    if request.method() == &Method::Get && path == "/api/widgets/tasks" {
        let response: Result<Value, String> = (|| {
            let conn = open_db()?;
            // Repair the legacy status written by early native-widget builds.
            let _ = conn.execute("UPDATE tasks SET status='completed' WHERE status='done'", []);
            let rows = query_rows(
                &conn,
                "SELECT tasks.*, task_planning_metadata.reminder_minutes_json AS reminder_minutes_json,
                 task_planning_metadata.estimated_minutes AS estimated_minutes
                 FROM tasks
                 LEFT JOIN task_planning_metadata ON task_planning_metadata.task_id = tasks.id
                 WHERE tasks.deleted_at IS NULL
                 ORDER BY tasks.sort_order ASC, tasks.created_at DESC",
            )?;
            Ok(json!({ "tasks": rows }))
        })();
        let _ = request.respond(match response {
            Ok(value) => json_response(StatusCode(200), value),
            Err(error) => json_response(StatusCode(500), json!({ "error": error })),
        });
        return;
    }

    if request.method() == &Method::Get && path == "/api/widgets/dashboard" {
        let response: Result<Value, String> = (|| {
            let conn = open_db()?;
            Ok(json!({
                "habits": query_rows(&conn, "SELECT * FROM habits ORDER BY created_at DESC")?,
                "checks": query_rows(&conn, "SELECT * FROM habit_checks")?,
                "timers": query_rows(&conn, "SELECT * FROM timers ORDER BY running DESC, updated_at DESC")?,
                "inspirations": query_rows(&conn, "SELECT * FROM inspirations WHERE status != 'archived' ORDER BY created_at DESC")?,
                "reflections": query_rows(&conn, "SELECT * FROM daily_reflections ORDER BY reflection_date DESC")?
            }))
        })();
        let _ = request.respond(match response {
            Ok(value) => json_response(StatusCode(200), value),
            Err(error) => json_response(StatusCode(500), json!({ "error": error })),
        });
        return;
    }

    if request.method() == &Method::Get && path == "/api/widgets/memos" {
        let response: Result<Value, String> = (|| {
            let conn = open_db()?;
            let rows = query_rows(
                &conn,
                "SELECT * FROM memos WHERE archived = 0 ORDER BY pinned DESC, updated_at DESC",
            )?;
            Ok(json!({ "memos": rows }))
        })();
        let _ = request.respond(match response {
            Ok(value) => json_response(StatusCode(200), value),
            Err(error) => json_response(StatusCode(500), json!({ "error": error })),
        });
        return;
    }

    if request.method() == &Method::Get && path == "/api/widgets/anniversaries" {
        let response: Result<Value, String> = (|| {
            let conn = open_db()?;
            let rows = query_rows(
                &conn,
                "SELECT * FROM anniversaries ORDER BY event_date ASC",
            )?;
            Ok(json!({ "anniversaries": rows }))
        })();
        let _ = request.respond(match response {
            Ok(value) => json_response(StatusCode(200), value),
            Err(error) => json_response(StatusCode(500), json!({ "error": error })),
        });
        return;
    }

    if request.method() == &Method::Post && path == "/api/widgets/tasks/toggle" {
        let response: Result<Value, String> = (|| {
            let body = read_json_body(&mut request)?;
            let id = body
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| "缺少 id".to_string())?;
            BRIDGE_APP
                .get()
                .ok_or_else(|| "应用桥接尚未初始化".to_string())?
                .emit_to("main", "widget:toggle-task", json!({ "id": id }))
                .map_err(|error| error.to_string())?;
            Ok(json!({ "ok": true, "accepted": true }))
        })();
        let _ = request.respond(match response {
            Ok(value) => json_response(StatusCode(200), value),
            Err(error) => json_response(StatusCode(500), json!({ "error": error })),
        });
        return;
    }

    if request.method() == &Method::Post && path == "/api/widgets/habits/toggle" {
        let response: Result<Value, String> = (|| {
            let body = read_json_body(&mut request)?;
            let habit_id = body.get("habit_id").and_then(Value::as_str)
                .ok_or_else(|| "缺少 habit_id".to_string())?;
            let check_date = body.get("check_date").and_then(Value::as_str)
                .ok_or_else(|| "缺少 check_date".to_string())?;
            BRIDGE_APP
                .get()
                .ok_or_else(|| "应用桥接尚未初始化".to_string())?
                .emit_to(
                    "main",
                    "widget:toggle-habit",
                    json!({ "habit_id": habit_id, "check_date": check_date }),
                )
                .map_err(|error| error.to_string())?;
            Ok(json!({ "ok": true, "accepted": true }))
        })();
        let _ = request.respond(match response {
            Ok(value) => json_response(StatusCode(200), value),
            Err(error) => json_response(StatusCode(500), json!({ "error": error })),
        });
        return;
    }

    if request.method() == &Method::Post && path == "/api/widgets/tasks/create" {
        let response: Result<Value, String> = (|| {
            let body = read_json_body(&mut request)?;
            let title = body
                .get("title")
                .and_then(Value::as_str)
                .ok_or_else(|| "缺少 title".to_string())?
                .trim()
                .to_string();
            if title.is_empty() {
                return Err("标题不能为空".to_string());
            }
            let due_date = body
                .get("due_date")
                .and_then(Value::as_str)
                .unwrap_or("");
            let conn = open_db()?;
            let id = uuid_like();
            let now = now_iso();
            conn.execute(
                "INSERT INTO tasks (id, title, description, notes, priority, status, due_date, due_time, end_time, sort_order, created_at, updated_at, completed_at, deleted_at, parent_id, repeat_rule, remind_minutes, project_id, my_day_date, blocked_by_id, completion_criteria, energy_level, flexible, schedule_locked, actual_minutes, goal_id, goal_contribution, generated_from_id)
                 VALUES (?1, ?2, '', '', 3, 'pending', ?3, NULL, NULL, ?4, ?5, ?5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '', 'medium', 1, 0, 0, NULL, 1, NULL)",
                (id.as_str(), title.as_str(), due_date, now_millis(), now.as_str()),
            )
            .map_err(|error| error.to_string())?;
            bump_widget_data_version();
            Ok(json!({ "ok": true, "id": id }))
        })();
        let _ = request.respond(match response {
            Ok(value) => json_response(StatusCode(200), value),
            Err(error) => json_response(StatusCode(500), json!({ "error": error })),
        });
        return;
    }

    if request.method() == &Method::Post && path == "/api/widgets/memos/upsert" {
        let response: Result<Value, String> = (|| {
            let body = read_json_body(&mut request)?;
            let id = body.get("id").and_then(Value::as_str);
            let content = body.get("content").and_then(Value::as_str).map(str::trim);
            let title = body.get("title").and_then(Value::as_str).map(str::trim);
            let pinned = body.get("pinned").and_then(Value::as_i64);
            let archived = body.get("archived").and_then(Value::as_i64);
            let conn = open_db()?;
            let now = now_iso();
            if let Some(existing) = id {
                conn.execute(
                    "UPDATE memos SET title = COALESCE(?1, title), content = COALESCE(?2, content), pinned = COALESCE(?3, pinned), archived = COALESCE(?4, archived), updated_at = ?5 WHERE id = ?6",
                    (title, content, pinned, archived, now.as_str(), existing),
                )
                .map_err(|error| error.to_string())?;
            } else {
                let new_id = uuid_like();
                conn.execute(
                    "INSERT INTO memos (id, title, content, format, pinned, archived, created_at, updated_at) VALUES (?1, ?2, ?3, 'markdown', 0, ?4, ?5, ?5)",
                    (new_id.as_str(), title.unwrap_or("无标题备忘"), content.unwrap_or(""), archived.unwrap_or(0), now.as_str()),
                )
                .map_err(|error| error.to_string())?;
            }
            bump_widget_data_version();
            Ok(json!({ "ok": true }))
        })();
        let _ = request.respond(match response {
            Ok(value) => json_response(StatusCode(200), value),
            Err(error) => json_response(StatusCode(500), json!({ "error": error })),
        });
        return;
    }

    if request.method() == &Method::Get && path.starts_with("/ui") {
        if let Some(response) = serve_static(path) {
            let _ = request.respond(response);
            return;
        }
    }

    let _ = request.respond(json_response(
        StatusCode(404),
        json!({ "error": "not found" }),
    ));
}

fn request_is_authorized(request: &Request, url: &str) -> bool {
    let header_token = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("X-Widget-Token"))
        .map(|header| header.value.as_str());
    if header_token == Some(bridge_token()) {
        return true;
    }
    url.split_once('?')
        .map(|(_, query)| {
            query.split('&').any(|item| {
                item.split_once('=')
                    .map(|(key, value)| key == "bridgeToken" && value == bridge_token())
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn now_iso() -> String {
    chrono::Local::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn uuid_like() -> String {
    format!(
        "{:x}{:x}-{:x}-{:x}-{:x}-{:x}",
        rand_bits(),
        rand_bits(),
        rand_bits() & 0xffff,
        rand_bits() & 0x0fff | 0x4000,
        rand_bits() & 0x3fff | 0x8000,
        (0u128..=2)
            .map(|_| rand_bits() as u128)
            .fold(0u128, |acc, v| (acc << 16) | v)
    )
}

fn rand_bits() -> u32 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    std::time::SystemTime::now().hash(&mut hasher);
    (hasher.finish() & 0xffff) as u32
}
