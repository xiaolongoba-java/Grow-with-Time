//! Windows desktop widget host.
//!
//! The host window joins Explorer's desktop hierarchy before WebView2 is created.
//! Reparenting an already-running WebView2 is deliberately forbidden because it can
//! crash the WebView compositor. If Explorer replaces WorkerW, this process exits;
//! the main application supervisor creates a fresh host against the new desktop.

fn main() {
    #[cfg(windows)]
    if let Err(error) = windows_host::run() {
        eprintln!("widget-host: {error}");
        std::process::exit(2);
    }

    #[cfg(not(windows))]
    {
        eprintln!("widget-host is only supported on Windows");
        std::process::exit(1);
    }
}

#[cfg(windows)]
mod windows_host {
    use std::env;
    use std::borrow::Cow;
    use std::path::{Path, PathBuf};
    use std::thread;
    use std::time::Duration;

    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use tao::event::{Event, WindowEvent};
    use tao::event_loop::{ControlFlow, EventLoopBuilder};
    use tao::platform::windows::EventLoopBuilderExtWindows;
    use tao::window::{Window, WindowBuilder};
    use windows::core::{w, HSTRING};
    use windows::Win32::Foundation::{
        CloseHandle, HWND, LPARAM, POINT, RECT, WPARAM, GENERIC_READ, GENERIC_WRITE,
    };
    use windows::Win32::Storage::FileSystem::{
        CreateFileW, ReadFile, WriteFile, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_MODE, OPEN_EXISTING,
    };
    use windows::Win32::Graphics::Gdi::ScreenToClient;
    use windows::Win32::UI::HiDpi::{
        SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::ReleaseCapture;
    use windows::Win32::UI::WindowsAndMessaging::{
        FindWindowExW, FindWindowW, GetParent, GetWindowLongPtrW, GetWindowRect, IsWindow,
        PostMessageW, SendMessageTimeoutW, SendMessageW, SetParent,
        SetWindowLongPtrW, SetWindowPos, ShowWindow,
        GWL_EXSTYLE, GWL_STYLE, SMTO_NORMAL, SWP_FRAMECHANGED, SWP_NOACTIVATE,
        SWP_SHOWWINDOW, SW_SHOW, WM_CLOSE, WM_NCLBUTTONDOWN, HTCAPTION, WS_CHILD,
        WS_EX_APPWINDOW, WS_EX_NOACTIVATE, HWND_TOP, WS_EX_TOOLWINDOW, WS_POPUP,
    };
    use wry::{
        http::{header::CONTENT_TYPE, Response},
        WebViewBuilder,
    };

    #[derive(Debug)]
    enum HostEvent {
        Snapshot(String),
    }

    #[derive(Debug)]
    struct Args {
        label: String,
        url: String,
        pipe: String,
        ui_root: Option<PathBuf>,
        x: i32,
        y: i32,
        width: i32,
        height: i32,
    }

    impl Args {
        fn parse() -> Result<Self, String> {
            let mut values = env::args().skip(1);
            let mut label = None;
            let mut url = None;
            let mut pipe = None;
            let mut ui_root = None;
            let mut x = 140;
            let mut y = 90;
            let mut width = 330;
            let mut height = 420;
            while let Some(flag) = values.next() {
                let value = values
                    .next()
                    .ok_or_else(|| format!("missing value for {flag}"))?;
                match flag.as_str() {
                    "--label" => label = Some(value),
                    "--url" => url = Some(value),
                    "--pipe" => pipe = Some(value),
                    "--ui-root" => ui_root = Some(PathBuf::from(value)),
                    "--x" => x = value.parse().map_err(|_| "invalid --x")?,
                    "--y" => y = value.parse().map_err(|_| "invalid --y")?,
                    "--width" => width = value.parse().map_err(|_| "invalid --width")?,
                    "--height" => height = value.parse().map_err(|_| "invalid --height")?,
                    _ => return Err(format!("unknown argument: {flag}")),
                }
            }
            Ok(Self {
                label: label.ok_or("missing --label")?,
                url: url.ok_or("missing --url")?,
                pipe: pipe.ok_or("missing --pipe")?,
                ui_root,
                x,
                y,
                width: width.max(200),
                height: height.max(160),
            })
        }
    }

    fn hwnd(window: &Window) -> Result<HWND, String> {
        let handle = window.window_handle().map_err(|error| error.to_string())?;
        match handle.as_raw() {
            RawWindowHandle::Win32(raw) => Ok(HWND(raw.hwnd.get() as *mut _)),
            _ => Err("window does not expose a Win32 HWND".into()),
        }
    }

    fn desktop_parent() -> Option<HWND> {
        unsafe {
            let progman = FindWindowW(w!("Progman"), None).ok()?;
            if progman.0.is_null() {
                return None;
            }
            let mut result = 0usize;
            for wparam in [0xDusize, 0usize] {
                let _ = SendMessageTimeoutW(
                    progman,
                    0x052C,
                    WPARAM(wparam),
                    LPARAM(0),
                    SMTO_NORMAL,
                    1000,
                    Some(&mut result),
                );
            }

            let mut after = None;
            loop {
                let worker = match FindWindowExW(None, after, w!("WorkerW"), None) {
                    Ok(worker) if !worker.0.is_null() => worker,
                    _ => break,
                };
                if FindWindowExW(Some(worker), None, w!("SHELLDLL_DefView"), None)
                    .is_ok_and(|view| !view.0.is_null())
                {
                    // Join the same desktop host that owns SHELLDLL_DefView. A
                    // separate wallpaper WorkerW can sit underneath the actual
                    // wallpaper compositor on current Windows 11 builds.
                    return Some(worker);
                }
                after = Some(worker);
            }
            Some(progman)
        }
    }

    fn attach_before_webview(child: HWND, args: &Args) -> Result<HWND, String> {
        unsafe {
            let parent = desktop_parent().ok_or("Explorer desktop host is unavailable")?;
            let ex_style = GetWindowLongPtrW(child, GWL_EXSTYLE);
            SetWindowLongPtrW(
                child,
                GWL_EXSTYLE,
                (ex_style | WS_EX_TOOLWINDOW.0 as isize | WS_EX_NOACTIVATE.0 as isize)
                    & !(WS_EX_APPWINDOW.0 as isize),
            );
            let style = GetWindowLongPtrW(child, GWL_STYLE);
            SetWindowLongPtrW(
                child,
                GWL_STYLE,
                (style | WS_CHILD.0 as isize) & !(WS_POPUP.0 as isize),
            );
            SetParent(child, Some(parent))
                .map_err(|error| format!("attach desktop parent: {error}"))?;
            let mut point = POINT { x: args.x, y: args.y };
            if !ScreenToClient(parent, &mut point).as_bool() {
                return Err("convert widget screen position failed".into());
            }
            SetWindowPos(
                child,
                Some(HWND_TOP),
                point.x,
                point.y,
                args.width,
                args.height,
                SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED,
            )
            .map_err(|error| format!("position desktop widget: {error}"))?;
            Ok(parent)
        }
    }

    fn monitor_explorer(child: HWND, parent: HWND) {
        let child_value = child.0 as isize;
        let parent_value = parent.0 as isize;
        thread::spawn(move || loop {
            thread::sleep(Duration::from_secs(1));
            let child = HWND(child_value as *mut _);
            let parent = HWND(parent_value as *mut _);
            unsafe {
                if !IsWindow(Some(parent)).as_bool() || GetParent(child) != Ok(parent) {
                    let _ = PostMessageW(Some(child), WM_CLOSE, WPARAM(0), LPARAM(0));
                    break;
                }
            }
        });
    }

    fn pipe_request(pipe_name: &str, request: &str) -> Result<String, String> {
        let name = HSTRING::from(pipe_name);
        let pipe = unsafe {
            CreateFileW(
                &name,
                (GENERIC_READ | GENERIC_WRITE).0,
                FILE_SHARE_MODE(0),
                None,
                OPEN_EXISTING,
                FILE_ATTRIBUTE_NORMAL,
                None,
            )
        }
        .map_err(|error| format!("connect widget IPC: {error}"))?;

        let result = (|| {
            let mut bytes = request.as_bytes().to_vec();
            bytes.push(b'\n');
            let mut written = 0u32;
            unsafe { WriteFile(pipe, Some(&bytes), Some(&mut written), None) }
                .map_err(|error| format!("write widget IPC: {error}"))?;

            let mut response = Vec::new();
            let mut chunk = [0u8; 8192];
            loop {
                let mut read = 0u32;
                unsafe { ReadFile(pipe, Some(&mut chunk), Some(&mut read), None) }
                    .map_err(|error| format!("read widget IPC: {error}"))?;
                if read == 0 {
                    break;
                }
                response.extend_from_slice(&chunk[..read as usize]);
                if response.last() == Some(&b'\n') || response.len() >= 4 * 1024 * 1024 {
                    break;
                }
            }
            String::from_utf8(response)
                .map(|value| value.trim_end().to_string())
                .map_err(|error| format!("widget IPC returned invalid UTF-8: {error}"))
        })();
        unsafe {
            let _ = CloseHandle(pipe);
        }
        result
    }

    fn content_type(path: &Path) -> &'static str {
        match path.extension().and_then(|value| value.to_str()).unwrap_or("") {
            "html" => "text/html; charset=utf-8",
            "js" | "mjs" => "text/javascript; charset=utf-8",
            "css" => "text/css; charset=utf-8",
            "json" => "application/json; charset=utf-8",
            "svg" => "image/svg+xml",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            "ico" => "image/x-icon",
            "woff2" => "font/woff2",
            _ => "application/octet-stream",
        }
    }

    fn asset_response(root: &Path, request_path: &str) -> Response<Cow<'static, [u8]>> {
        let relative = request_path.trim_start_matches('/');
        let relative = if relative.is_empty() { "index.html" } else { relative };
        if relative.split('/').any(|part| part == "..") {
            return Response::builder().status(403).body(Cow::Borrowed(&b"forbidden"[..])).unwrap();
        }
        let Ok(root) = root.canonicalize() else {
            return Response::builder().status(500).body(Cow::Borrowed(&b"ui root missing"[..])).unwrap();
        };
        let Ok(path) = root.join(relative).canonicalize() else {
            return Response::builder().status(404).body(Cow::Borrowed(&b"not found"[..])).unwrap();
        };
        if !path.starts_with(&root) {
            return Response::builder().status(403).body(Cow::Borrowed(&b"forbidden"[..])).unwrap();
        }
        match std::fs::read(&path) {
            Ok(bytes) => Response::builder()
                .header(CONTENT_TYPE, content_type(&path))
                .body(Cow::Owned(bytes))
                .unwrap(),
            Err(_) => Response::builder().status(404).body(Cow::Borrowed(&b"not found"[..])).unwrap(),
        }
    }

    pub fn run() -> Result<(), String> {
        let args = Args::parse()?;
        unsafe {
            SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        }

        let event_loop = EventLoopBuilder::<HostEvent>::with_user_event()
            .with_any_thread(true)
            .build();
        let proxy = event_loop.create_proxy();
        let window = WindowBuilder::new()
            .with_title(&args.label)
            .with_decorations(false)
            .with_transparent(true)
            .with_inner_size(tao::dpi::LogicalSize::new(args.width as f64, args.height as f64))
            .with_position(tao::dpi::LogicalPosition::new(args.x as f64, args.y as f64))
            .with_visible(false)
            .build(&event_loop)
            .map_err(|error| format!("create host window: {error}"))?;

        let child = hwnd(&window)?;
        let parent = attach_before_webview(child, &args)?;
        let command_pipe = args.pipe.clone();
        let command_label = args.label.clone();
        let command_child = child.0 as isize;
        let mut webview_builder = WebViewBuilder::new()
            .with_url(&args.url)
            .with_transparent(true)
            .with_devtools(cfg!(debug_assertions))
            .with_initialization_script(r#"
                window.__GWT_NATIVE_WIDGET__=true;
                window.__GWT_NATIVE_SNAPSHOT__={};
                document.addEventListener('mousedown',(event)=>{
                  if(event.button!==0)return;
                  const target=event.target;
                  if(!(target instanceof Element))return;
                  const region=target.closest('[data-tauri-drag-region]');
                  if(!region||target.closest('button,input,textarea,select,a,[role="button"]'))return;
                  window.ipc.postMessage(JSON.stringify({__host:'drag'}));
                  event.preventDefault();
                },true);
            "#)
            .with_ipc_handler(move |request| {
                let body = request.body().trim();
                if body.is_empty() {
                    return;
                }
                if serde_json::from_str::<serde_json::Value>(body)
                    .ok()
                    .and_then(|value| value.get("__host").and_then(|kind| kind.as_str()).map(str::to_string))
                    .as_deref() == Some("drag")
                {
                    let child = HWND(command_child as *mut _);
                    unsafe {
                        let _ = ReleaseCapture();
                        let _ = SendMessageW(child, WM_NCLBUTTONDOWN, Some(WPARAM(HTCAPTION as usize)), Some(LPARAM(0)));
                    }
                    return;
                }
                let envelope = serde_json::json!({
                    "type": "command",
                    "label": command_label,
                    "payload": serde_json::from_str::<serde_json::Value>(body)
                        .unwrap_or_else(|_| serde_json::Value::String(body.to_string())),
                });
                let pipe = command_pipe.clone();
                thread::spawn(move || {
                    let _ = pipe_request(&pipe, &envelope.to_string());
                });
            });
        if let Some(root) = args.ui_root.clone() {
            webview_builder = webview_builder.with_custom_protocol(
                "gwt".to_string(),
                move |_id, request| asset_response(&root, request.uri().path()),
            );
        }
        let _webview = webview_builder.build(&window)
            .map_err(|error| format!("create WebView2: {error}"))?;
        unsafe {
            let _ = ShowWindow(child, SW_SHOW);
        }
        let ready = serde_json::json!({ "type": "ready", "label": args.label });
        pipe_request(&args.pipe, &ready.to_string())?;
        monitor_explorer(child, parent);

        let snapshot_pipe = args.pipe.clone();
        let snapshot_label = args.label.clone();
        thread::spawn(move || loop {
            let request = serde_json::json!({ "type": "snapshot", "label": snapshot_label });
            if let Ok(snapshot) = pipe_request(&snapshot_pipe, &request.to_string()) {
                let _ = proxy.send_event(HostEvent::Snapshot(snapshot));
            }
            thread::sleep(Duration::from_secs(2));
        });

        event_loop.run(move |event, _, control_flow| {
            *control_flow = ControlFlow::Wait;
            match event {
                Event::UserEvent(HostEvent::Snapshot(snapshot)) => {
                    let encoded = serde_json::to_string(&snapshot).unwrap_or_else(|_| "\"{}\"".into());
                    let script = format!(
                        "window.__GWT_NATIVE_SNAPSHOT__=JSON.parse({encoded});window.dispatchEvent(new CustomEvent('gwt-native-snapshot'));"
                    );
                    let _ = _webview.evaluate_script(&script);
                }
                Event::WindowEvent {
                    event: WindowEvent::CloseRequested,
                    window_id,
                    ..
                } if window_id == window.id() => {
                    *control_flow = ControlFlow::Exit;
                }
                Event::WindowEvent {
                    event: WindowEvent::Moved(_),
                    window_id,
                    ..
                } if window_id == window.id() => {
                    let mut rect = RECT::default();
                    if unsafe { GetWindowRect(child, &mut rect) }.is_ok() {
                        let request = serde_json::json!({
                            "type": "command",
                            "label": args.label,
                            "payload": {
                                "action": "native_position",
                                "x": rect.left,
                                "y": rect.top
                            }
                        });
                        let pipe = args.pipe.clone();
                        thread::spawn(move || {
                            let _ = pipe_request(&pipe, &request.to_string());
                        });
                    }
                }
                _ => {}
            }
        });
    }
}
