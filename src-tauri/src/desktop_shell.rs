//! Keep desktop widgets on screen after Win+D.
//!
//! WebView2 cannot safely reparent to WorkerW in Tauri (process crash). Win+D also
//! hides normal top-level windows by design. We detect "show desktop" via foreground
//! window checks and restore pinned widgets with Win32 show/position calls.

use tauri::{AppHandle, WebviewWindow};

#[cfg(windows)]
use std::sync::{Mutex, OnceLock};
#[cfg(windows)]
use std::time::{Duration, Instant};
#[cfg(windows)]
use tauri::Manager;
#[cfg(windows)]
use windows::core::w;
#[cfg(windows)]
use windows::Win32::Foundation::HWND;
#[cfg(windows)]
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, FindWindowExW, FindWindowW, GetClassNameW, GetForegroundWindow,
    GetMessageW, GetWindowLongPtrW, IsIconic, IsWindowVisible, SetWindowLongPtrW,
    SetWindowPos, ShowWindow, TranslateMessage, EVENT_SYSTEM_FOREGROUND, GWL_EXSTYLE, MSG,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_RESTORE, SW_SHOW,
    WS_EX_APPWINDOW, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
};

#[cfg(windows)]
static DESKTOP_PINNED_WIDGETS: OnceLock<Mutex<Vec<String>>> = OnceLock::new();

#[cfg(windows)]
static GUARD_APP: OnceLock<AppHandle> = OnceLock::new();

#[cfg(windows)]
static LAST_RESTORE: OnceLock<Mutex<Instant>> = OnceLock::new();

#[cfg(windows)]
const RESTORE_COOLDOWN: Duration = Duration::from_millis(120);

#[cfg(windows)]
fn pinned_widgets() -> &'static Mutex<Vec<String>> {
    DESKTOP_PINNED_WIDGETS.get_or_init(|| Mutex::new(Vec::new()))
}

#[cfg(windows)]
fn restore_gate() -> &'static Mutex<Instant> {
    LAST_RESTORE.get_or_init(|| Mutex::new(Instant::now() - RESTORE_COOLDOWN))
}

pub fn mark_widget_desktop_pinned(label: &str, pinned: bool) {
    #[cfg(windows)]
    {
        let Ok(mut labels) = pinned_widgets().lock() else {
            return;
        };
        labels.retain(|entry| entry != label);
        if pinned {
            labels.push(label.to_string());
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (label, pinned);
    }
}

#[cfg(windows)]
fn window_class(hwnd: HWND) -> Option<String> {
    unsafe {
        if hwnd.0.is_null() {
            return None;
        }
        let mut buf = [0u16; 256];
        let len = GetClassNameW(hwnd, &mut buf);
        if len == 0 {
            return None;
        }
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }
}

#[cfg(windows)]
fn is_desktop_window(hwnd: HWND) -> bool {
    match window_class(hwnd).as_deref() {
        Some("Progman") => true,
        Some("WorkerW") => unsafe {
            FindWindowExW(Some(hwnd), None, w!("SHELLDLL_DefView"), None)
                .map(|defview| !defview.0.is_null())
                .unwrap_or(false)
        },
        Some("SHELLDLL_DefView") => true,
        _ => false,
    }
}

/// Return the top-level shell window that owns SHELLDLL_DefView (the desktop icons).
/// Placing a widget immediately behind this window keeps it above the wallpaper while
/// letting desktop icons remain clickable and visually in front.
#[cfg(windows)]
fn desktop_icon_host() -> Option<HWND> {
    unsafe {
        if let Ok(progman) = FindWindowW(w!("Progman"), None) {
            if !progman.0.is_null()
                && FindWindowExW(Some(progman), None, w!("SHELLDLL_DefView"), None)
                    .is_ok_and(|view| !view.0.is_null())
            {
                return Some(progman);
            }
        }

        let mut after: Option<HWND> = None;
        loop {
            let Ok(worker) = FindWindowExW(None, after, w!("WorkerW"), None) else {
                break;
            };
            if worker.0.is_null() {
                break;
            }
            if FindWindowExW(Some(worker), None, w!("SHELLDLL_DefView"), None)
                .is_ok_and(|view| !view.0.is_null())
            {
                return Some(worker);
            }
            after = Some(worker);
        }
    }
    None
}

#[cfg(windows)]
fn apply_desktop_widget_style(hwnd: HWND) {
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let style = (style | WS_EX_TOOLWINDOW.0 as isize | WS_EX_NOACTIVATE.0 as isize)
            & !(WS_EX_APPWINDOW.0 as isize);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, style);
    }
}

#[cfg(windows)]
fn place_behind_desktop_icons(hwnd: HWND) {
    unsafe {
        apply_desktop_widget_style(hwnd);
        if let Some(icon_host) = desktop_icon_host() {
            let _ = SetWindowPos(
                hwnd,
                Some(icon_host),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
        }
    }
}

/// Apply the safe desktop Z-order without reparenting WebView2 into WorkerW.
pub fn place_widget_on_desktop(window: &WebviewWindow) {
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        place_behind_desktop_icons(hwnd);
    }
    #[cfg(not(windows))]
    let _ = window;
}

#[cfg(windows)]
fn is_show_desktop_active() -> bool {
    unsafe {
        let foreground = GetForegroundWindow();
        if is_desktop_window(foreground) {
            return true;
        }

        if let Ok(progman) = FindWindowW(w!("Progman"), None) {
            if !progman.0.is_null() {
                if let Ok(defview) =
                    FindWindowExW(Some(progman), None, w!("SHELLDLL_DefView"), None)
                {
                    if !defview.0.is_null() && foreground == defview {
                        return true;
                    }
                }
            }
        }

        false
    }
}

#[cfg(windows)]
fn force_show_widget(window: &WebviewWindow) {
    let _ = window.set_always_on_top(false);
    let _ = window.unminimize();
    let _ = window.show();

    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            if IsIconic(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            } else {
                let _ = ShowWindow(hwnd, SW_SHOW);
            }
            place_behind_desktop_icons(hwnd);
        }
    }
}

#[cfg(windows)]
fn widget_needs_restore(window: &WebviewWindow) -> bool {
    let Ok(hwnd) = window.hwnd() else {
        return true;
    };
    unsafe {
        if IsIconic(hwnd).as_bool() {
            return true;
        }
        if !IsWindowVisible(hwnd).as_bool() {
            return true;
        }
    }
    // Win+D can leave IsWindowVisible true while the shell covers the window.
    is_show_desktop_active()
}

#[cfg(windows)]
fn restore_pinned_widgets(app: &AppHandle) {
    let Ok(mut gate) = restore_gate().lock() else {
        return;
    };
    if gate.elapsed() < RESTORE_COOLDOWN {
        return;
    }
    *gate = Instant::now();
    drop(gate);

    let Ok(labels) = pinned_widgets().lock().map(|entries| entries.clone()) else {
        return;
    };
    if labels.is_empty() {
        return;
    }

    let on_desktop = is_show_desktop_active();
    for label in labels {
        let Some(window) = app.get_webview_window(&label) else {
            continue;
        };
        if on_desktop || widget_needs_restore(&window) {
            force_show_widget(&window);
        }
    }
}

#[cfg(windows)]
fn schedule_restore() {
    let Some(app) = GUARD_APP.get().cloned() else {
        return;
    };
    let restore = app.clone();
    let _ = app.run_on_main_thread(move || {
        restore_pinned_widgets(&restore);
    });
}

#[cfg(windows)]
unsafe extern "system" fn desktop_foreground_proc(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    _id_object: i32,
    _id_child: i32,
    _id_event_thread: u32,
    _event_time: u32,
) {
    if event != EVENT_SYSTEM_FOREGROUND {
        return;
    }
    if is_desktop_window(hwnd) || is_show_desktop_active() {
        schedule_restore();
    }
}

#[cfg(windows)]
fn guard_poll_loop() {
    loop {
        std::thread::sleep(Duration::from_millis(350));
        let has_pinned = pinned_widgets()
            .lock()
            .map(|labels| !labels.is_empty())
            .unwrap_or(false);
        if !has_pinned {
            continue;
        }
        if is_show_desktop_active() {
            schedule_restore();
        }
    }
}

#[cfg(windows)]
pub fn start_desktop_widget_guard(app: AppHandle) {
    let _ = GUARD_APP.set(app.clone());
    std::thread::spawn(guard_poll_loop);
    std::thread::spawn(move || {
        unsafe {
            let hook = SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                None,
                Some(desktop_foreground_proc),
                0,
                0,
                windows::Win32::UI::WindowsAndMessaging::WINEVENT_OUTOFCONTEXT,
            );
            if hook.is_invalid() {
                eprintln!("desktop widget guard: SetWinEventHook failed");
                return;
            }

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            let _ = UnhookWinEvent(hook);
        }
    });
}

#[cfg(not(windows))]
pub fn start_desktop_widget_guard(_app: AppHandle) {}
