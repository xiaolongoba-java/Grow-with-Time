//! Local-only IPC for native desktop widgets.
//!
//! The main process is the sole data owner. Widget hosts request immutable JSON
//! snapshots and submit commands over a per-process Windows named pipe. No TCP
//! port, URL token or second SQLite writer is involved.

use std::collections::{HashMap, HashSet};
use std::sync::{Condvar, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use serde::Deserialize;
use tauri::{AppHandle, Emitter};
use windows::core::HSTRING;
use windows::Win32::Foundation::{CloseHandle, ERROR_PIPE_CONNECTED, HANDLE, INVALID_HANDLE_VALUE};
use windows::Win32::Storage::FileSystem::{ReadFile, WriteFile, PIPE_ACCESS_DUPLEX};
use windows::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe, PIPE_READMODE_BYTE,
    PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_UNLIMITED_INSTANCES, PIPE_WAIT,
};

const MAX_REQUEST_BYTES: usize = 1024 * 1024;
const PIPE_BUFFER_BYTES: u32 = 64 * 1024;

static SNAPSHOTS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
static PIPE_NAME: OnceLock<String> = OnceLock::new();
static READY_HOSTS: OnceLock<(Mutex<HashSet<String>>, Condvar)> = OnceLock::new();

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Request {
    Snapshot { label: String },
    Command { label: String, payload: serde_json::Value },
    Ready { label: String },
}

fn ready_hosts() -> &'static (Mutex<HashSet<String>>, Condvar) {
    READY_HOSTS.get_or_init(|| (Mutex::new(HashSet::new()), Condvar::new()))
}

pub fn clear_ready(label: &str) {
    if let Ok(mut current) = ready_hosts().0.lock() {
        current.remove(label);
    }
}

pub fn wait_ready(label: &str, timeout: Duration) -> bool {
    let (lock, changed) = ready_hosts();
    let Ok(mut current) = lock.lock() else {
        return false;
    };
    let deadline = Instant::now() + timeout;
    while !current.contains(label) {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return false;
        }
        let Ok((next, result)) = changed.wait_timeout(current, remaining) else {
            return false;
        };
        current = next;
        if result.timed_out() && !current.contains(label) {
            return false;
        }
    }
    true
}

fn snapshots() -> &'static Mutex<HashMap<String, String>> {
    SNAPSHOTS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn publish(label: String, snapshot: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&snapshot)
        .map_err(|error| format!("桌面组件快照不是有效 JSON: {error}"))?;
    snapshots()
        .lock()
        .map_err(|_| "桌面组件快照状态不可用".to_string())?
        .insert(label, snapshot);
    Ok(())
}

pub fn start(app: AppHandle) -> &'static str {
    PIPE_NAME.get_or_init(|| {
        let name = format!(r"\\.\pipe\GrowWithTime.Widget.{}", std::process::id());
        let server_name = name.clone();
        thread::spawn(move || server_loop(app, server_name));
        name
    })
}

fn server_loop(app: AppHandle, pipe_name: String) {
    loop {
        let wide_name = HSTRING::from(&pipe_name);
        let pipe = unsafe {
            CreateNamedPipeW(
                &wide_name,
                PIPE_ACCESS_DUPLEX,
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                PIPE_UNLIMITED_INSTANCES,
                PIPE_BUFFER_BYTES,
                PIPE_BUFFER_BYTES,
                1000,
                None,
            )
        };
        if pipe == INVALID_HANDLE_VALUE {
            eprintln!("widget IPC: CreateNamedPipeW failed");
            return;
        }

        let connected = unsafe { ConnectNamedPipe(pipe, None) }.is_ok()
            || windows::core::Error::from_win32().code() == ERROR_PIPE_CONNECTED.to_hresult();
        if connected {
            serve_connection(&app, pipe);
        }
        unsafe {
            let _ = DisconnectNamedPipe(pipe);
            let _ = CloseHandle(pipe);
        }
    }
}

fn serve_connection(app: &AppHandle, pipe: HANDLE) {
    let mut request_bytes = Vec::new();
    let mut chunk = [0u8; 8192];
    while request_bytes.len() < MAX_REQUEST_BYTES {
        let mut read = 0u32;
        if unsafe { ReadFile(pipe, Some(&mut chunk), Some(&mut read), None) }.is_err() || read == 0 {
            return;
        }
        request_bytes.extend_from_slice(&chunk[..read as usize]);
        if request_bytes.last() == Some(&b'\n') {
            break;
        }
    }

    let response = match serde_json::from_slice::<Request>(&request_bytes) {
        Ok(Request::Snapshot { label }) => snapshots()
            .lock()
            .ok()
            .and_then(|current| current.get(&label).cloned())
            .unwrap_or_else(|| "{}".to_string()),
        Ok(Request::Command { label, payload }) => {
            let event = serde_json::json!({ "label": label, "payload": payload });
            match app.emit("native-widget-command", event) {
                Ok(()) => r#"{"ok":true}"#.to_string(),
                Err(error) => serde_json::json!({ "ok": false, "error": error.to_string() }).to_string(),
            }
        }
        Ok(Request::Ready { label }) => {
            let (lock, changed) = ready_hosts();
            if let Ok(mut current) = lock.lock() {
                current.insert(label);
                changed.notify_all();
            }
            r#"{"ok":true}"#.to_string()
        }
        Err(error) => serde_json::json!({ "ok": false, "error": error.to_string() }).to_string(),
    };

    let mut bytes = response.into_bytes();
    bytes.push(b'\n');
    let mut written = 0u32;
    let _ = unsafe { WriteFile(pipe, Some(&bytes), Some(&mut written), None) };
}

#[cfg(test)]
mod tests {
    use super::{clear_ready, publish, ready_hosts, wait_ready};
    use std::time::Duration;

    #[test]
    fn publish_rejects_invalid_json() {
        assert!(publish("widget-invalid".into(), "{broken".into()).is_err());
    }

    #[test]
    fn readiness_is_scoped_to_widget_label() {
        let label = "widget-test-ready";
        clear_ready(label);
        assert!(!wait_ready(label, Duration::ZERO));
        let (lock, changed) = ready_hosts();
        lock.lock().unwrap().insert(label.to_string());
        changed.notify_all();
        assert!(wait_ready(label, Duration::from_millis(1)));
        clear_ready(label);
    }
}
