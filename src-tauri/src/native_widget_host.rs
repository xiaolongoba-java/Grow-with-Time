//! Spawn and manage native widget-host processes on Windows.

#[cfg(windows)]
use std::collections::HashMap;
#[cfg(windows)]
use std::process::{Child, Command, Stdio};
#[cfg(windows)]
use std::sync::{Mutex, OnceLock};

#[cfg(windows)]
use tauri::{AppHandle, Manager, WebviewWindow};

#[cfg(windows)]
use crate::widget_bridge::{bridge_token, BRIDGE_PORT};

#[cfg(windows)]
static HOSTS: OnceLock<Mutex<HashMap<String, Child>>> = OnceLock::new();

#[cfg(windows)]
fn hosts() -> &'static Mutex<HashMap<String, Child>> {
    HOSTS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(windows)]
fn widget_host_exe(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    if let Ok(resource) = app.path().resource_dir() {
        let bundled = resource.join("widget-host.exe");
        if bundled.exists() {
            return Ok(bundled);
        }
    }
    let current = std::env::current_exe().map_err(|error| error.to_string())?;
    let sibling = current
        .parent()
        .ok_or_else(|| "无法定位 widget-host.exe".to_string())?
        .join("widget-host.exe");
    if sibling.exists() {
        return Ok(sibling);
    }
    Err("找不到 widget-host.exe，请先编译 widget-host 目标".into())
}

#[cfg(windows)]
pub fn widget_page_url(app: &AppHandle, widget: &str) -> Result<String, String> {
    if cfg!(debug_assertions) {
        return Ok(format!(
            "http://localhost:1420/?nativeHost=1&widget={widget}&bridgeToken={}"
            , bridge_token()
        ));
    }
    let _ = app;
    Ok(format!(
        "http://127.0.0.1:{BRIDGE_PORT}/ui/?nativeHost=1&widget={widget}&bridgeToken={}"
        , bridge_token()
    ))
}

#[cfg(windows)]
pub fn is_native_widget_running(label: &str) -> bool {
    hosts()
        .lock()
        .map(|map| map.contains_key(label))
        .unwrap_or(false)
}

#[cfg(not(windows))]
pub fn is_native_widget_running(_label: &str) -> bool {
    false
}

#[cfg(windows)]
pub fn stop_native_widget(label: &str) {
    let Ok(mut map) = hosts().lock() else {
        return;
    };
    if let Some(mut child) = map.remove(label) {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[cfg(windows)]
pub fn stop_all_native_widgets() {
    let Ok(mut map) = hosts().lock() else {
        return;
    };
    for (_, mut child) in map.drain() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[cfg(windows)]
pub fn spawn_native_widget(
    app: &AppHandle,
    label: &str,
    widget: &str,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<(), String> {
    stop_native_widget(label);
    let exe = widget_host_exe(app)?;
    let url = widget_page_url(app, widget)?;
    let child = Command::new(exe)
        .arg("--label")
        .arg(label)
        .arg("--url")
        .arg(url)
        .arg("--x")
        .arg(x.to_string())
        .arg("--y")
        .arg(y.to_string())
        .arg("--width")
        .arg(width.to_string())
        .arg("--height")
        .arg(height.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("启动 widget-host 失败: {error}"))?;
    let Ok(mut map) = hosts().lock() else {
        return Err("widget host 状态锁失败".into());
    };
    map.insert(label.to_string(), child);
    Ok(())
}

#[cfg(windows)]
pub fn spawn_native_widget_from_window(
    app: &AppHandle,
    label: &str,
    widget: &str,
    window: &WebviewWindow,
) -> Result<(), String> {
    let pos = window
        .outer_position()
        .unwrap_or(tauri::PhysicalPosition::new(140, 90));
    let size = window
        .outer_size()
        .unwrap_or(tauri::PhysicalSize::new(330, 420));
    let _ = window.hide();
    spawn_native_widget(
        app,
        label,
        widget,
        pos.x,
        pos.y,
        size.width as i32,
        size.height as i32,
    )
}

#[cfg(not(windows))]
pub fn stop_native_widget(_label: &str) {}

#[cfg(not(windows))]
pub fn stop_all_native_widgets() {}

#[cfg(not(windows))]
pub fn spawn_native_widget_from_window(
    _app: &AppHandle,
    _label: &str,
    _widget: &str,
    _window: &WebviewWindow,
) -> Result<(), String> {
    Ok(())
}
