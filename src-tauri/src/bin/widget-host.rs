//! Native desktop widget shell. The Tao window is attached to Explorer's wallpaper
//! WorkerW *before* WebView2 is created, so Win+D does not minimize the widget.

fn main() {
    #[cfg(windows)]
    widget_host_windows::run();
    #[cfg(not(windows))]
    {
        eprintln!("widget-host is only supported on Windows");
        std::process::exit(1);
    }
}

#[cfg(windows)]
mod widget_host_windows {
    use std::time::Duration;

    use clap::Parser;
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use tao::event::{Event, WindowEvent};
    use tao::event_loop::{ControlFlow, EventLoopBuilder};
    use tao::platform::windows::EventLoopBuilderExtWindows;
    use tao::window::{Window, WindowBuilder};
    use windows::core::w;
    use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
    use windows::Win32::UI::HiDpi::{
        SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        FindWindowExW, FindWindowW, GetWindowLongPtrW, SendMessageTimeoutW, SetParent,
        SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_EXSTYLE, GWL_STYLE,
        SMTO_NORMAL, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_SHOWWINDOW, SW_SHOW,
        WS_CHILD, WS_EX_APPWINDOW, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_POPUP,
    };
    use wry::WebViewBuilder;

    #[derive(Parser, Debug)]
    #[command(name = "widget-host")]
    struct Args {
        #[arg(long)]
        label: String,
        #[arg(long)]
        url: String,
        #[arg(long, default_value_t = 140)]
        x: i32,
        #[arg(long, default_value_t = 90)]
        y: i32,
        #[arg(long, default_value_t = 330)]
        width: i32,
        #[arg(long, default_value_t = 420)]
        height: i32,
    }

    fn hwnd_from_window(window: &Window) -> Option<HWND> {
        let handle = window.window_handle().ok()?;
        match handle.as_raw() {
            RawWindowHandle::Win32(raw) => Some(HWND(raw.hwnd.get() as *mut _)),
            _ => None,
        }
    }

    fn wallpaper_worker() -> Option<HWND> {
        unsafe {
            let progman = FindWindowW(w!("Progman"), None).ok()?;
            if progman.0.is_null() {
                return None;
            }
            // Ask Explorer to create the WorkerW wallpaper host when it is absent.
            let mut result = 0usize;
            let _ = SendMessageTimeoutW(
                progman,
                0x052C,
                WPARAM(0xD),
                LPARAM(0),
                SMTO_NORMAL,
                1000,
                Some(&mut result),
            );
            let _ = SendMessageTimeoutW(
                progman,
                0x052C,
                WPARAM(0xD),
                LPARAM(1),
                SMTO_NORMAL,
                1000,
                Some(&mut result),
            );

            let mut after: Option<HWND> = None;
            loop {
                let worker = match FindWindowExW(None, after, w!("WorkerW"), None) {
                    Ok(worker) if !worker.0.is_null() => worker,
                    _ => break,
                };
                if FindWindowExW(Some(worker), None, w!("SHELLDLL_DefView"), None)
                    .is_ok_and(|view| !view.0.is_null())
                {
                    if let Ok(wallpaper) = FindWindowExW(None, Some(worker), w!("WorkerW"), None) {
                        if !wallpaper.0.is_null() {
                            return Some(wallpaper);
                        }
                    }
                    // Windows 11 may not create a second WorkerW. Parenting to the
                    // icon host still makes the widget part of the desktop hierarchy.
                    return Some(worker);
                }
                after = Some(worker);
            }
            // Older Explorer layouts keep the desktop under Progman.
            Some(progman)
        }
    }

    fn attach_to_desktop(hwnd: HWND, x: i32, y: i32, width: i32, height: i32) -> bool {
        unsafe {
            let Some(worker) = wallpaper_worker() else { return false };
            let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let ex_style = (ex_style
                | WS_EX_TOOLWINDOW.0 as isize
                | WS_EX_NOACTIVATE.0 as isize)
                & !(WS_EX_APPWINDOW.0 as isize);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style);
            let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
            let style = (style | WS_CHILD.0 as isize) & !(WS_POPUP.0 as isize);
            SetWindowLongPtrW(hwnd, GWL_STYLE, style);
            if let Err(error) = SetParent(hwnd, Some(worker)) {
                eprintln!("SetParent WorkerW failed: {error}");
                return false;
            }
            let _ = SetWindowPos(
                hwnd,
                None,
                x,
                y,
                width.max(200),
                height.max(160),
                SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED,
            );
            let _ = ShowWindow(hwnd, SW_SHOW);
            true
        }
    }

    pub fn run() {
        let args = Args::parse();

        // Explorer's desktop host is Per-Monitor V2. SetParent rejects a cross-process
        // parent change when the DPI awareness contexts do not match.
        unsafe {
            let _ = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        }

        let event_loop = EventLoopBuilder::new().with_any_thread(true).build();
        let window = WindowBuilder::new()
            .with_title(&args.label)
            .with_decorations(false)
            .with_transparent(true)
            .with_inner_size(tao::dpi::LogicalSize::new(
                args.width.max(200) as f64,
                args.height.max(160) as f64,
            ))
            .with_position(tao::dpi::LogicalPosition::new(args.x as f64, args.y as f64))
            .with_visible(false)
            .build(&event_loop)
            .expect("create widget window");

        let hwnd = hwnd_from_window(&window).expect("resolve widget HWND");
        if !attach_to_desktop(hwnd, args.x, args.y, args.width, args.height) {
            panic!("attach widget to Windows desktop WorkerW");
        }

        let _webview = WebViewBuilder::new()
            .with_url(&args.url)
            .with_transparent(true)
            .with_devtools(cfg!(debug_assertions))
            .build(&window)
            .expect("create webview");

        std::thread::sleep(Duration::from_millis(80));
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOW);
        }

        let geometry = (args.x, args.y, args.width, args.height);
        event_loop.run(move |event, _, control_flow| {
            *control_flow = ControlFlow::Wait;

            match &event {
                Event::WindowEvent {
                    event:
                        WindowEvent::Focused(true)
                        | WindowEvent::Moved(_)
                        | WindowEvent::Resized(_),
                    window_id,
                    ..
                } if *window_id == window.id() => {
                    unsafe {
                        let _ = SetWindowPos(
                            hwnd,
                            None,
                            geometry.0,
                            geometry.1,
                            geometry.2,
                            geometry.3,
                            SWP_NOACTIVATE | SWP_SHOWWINDOW,
                        );
                    }
                }
                Event::WindowEvent {
                    event: WindowEvent::CloseRequested,
                    window_id,
                    ..
                } if *window_id == window.id() => {
                    *control_flow = ControlFlow::Exit;
                }
                _ => {}
            }
        });
    }
}
