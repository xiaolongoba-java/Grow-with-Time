//! Lifecycle manager for the Windows desktop widget host.
//!
//! A host is owned by exactly one widget label. All state-changing operations go
//! through this registry so tray toggles, widget close actions and app shutdown
//! cannot leave orphan processes behind.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::os::windows::io::AsRawHandle;

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use windows::Win32::Foundation::HANDLE;
use windows::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
    JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

static HOSTS: OnceLock<Mutex<HashMap<String, Child>>> = OnceLock::new();
static HOST_JOB: OnceLock<isize> = OnceLock::new();

struct HostSpec {
    label: String,
    executable: PathBuf,
    url: String,
    pipe_name: String,
    ui_root: Option<String>,
    x: String,
    y: String,
    width: String,
    height: String,
}

fn hosts() -> &'static Mutex<HashMap<String, Child>> {
    HOSTS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn host_job() -> Result<HANDLE, String> {
    if let Some(raw) = HOST_JOB.get() {
        return Ok(HANDLE(*raw as *mut _));
    }
    let handle = unsafe { CreateJobObjectW(None, None) }
        .map_err(|error| format!("创建桌面组件作业失败: {error}"))?;
    let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    unsafe {
        SetInformationJobObject(
            handle,
            JobObjectExtendedLimitInformation,
            (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    }
    .map_err(|error| format!("配置桌面组件作业失败: {error}"))?;
    let _ = HOST_JOB.set(handle.0 as isize);
    Ok(handle)
}

fn assign_to_host_job(child: &Child) -> Result<(), String> {
    let process = HANDLE(child.as_raw_handle());
    unsafe { AssignProcessToJobObject(host_job()?, process) }
        .map_err(|error| format!("绑定桌面组件生命周期失败: {error}"))
}

fn executable_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource) = app.path().resource_dir() {
        candidates.push(resource.join("widget-host.exe"));
        candidates.push(resource.join("binaries").join("widget-host.exe"));
    }
    if let Ok(current) = std::env::current_exe() {
        if let Some(parent) = current.parent() {
            candidates.push(parent.join("widget-host.exe"));
            // Cargo puts the main executable in target/debug while direct bin
            // builds may be resolved from target/debug/deps during tests.
            if parent.file_name().is_some_and(|name| name == "deps") {
                if let Some(target_dir) = parent.parent() {
                    candidates.push(target_dir.join("widget-host.exe"));
                }
            }
        }
    }
    candidates
}

fn resolve_executable(app: &AppHandle) -> Result<PathBuf, String> {
    executable_candidates(app)
        .into_iter()
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| "找不到原生桌面组件宿主 widget-host.exe".to_string())
}

fn widget_slug(label: &str) -> &str {
    label.strip_prefix("widget-").unwrap_or(label)
}

pub fn widget_launch(app: &AppHandle, label: &str) -> Result<(String, Option<String>), String> {
    let widget = widget_slug(label);
    if cfg!(debug_assertions) {
        return Ok((format!("http://localhost:1420/?widget={widget}"), None));
    }
    let resource = app.path().resource_dir().map_err(|error| error.to_string())?;
    let index = [
        resource.join("dist").join("index.html"),
        resource.join("_up_").join("dist").join("index.html"),
        resource.join("index.html"),
    ]
    .into_iter()
    .find(|candidate| candidate.is_file())
    .ok_or_else(|| "原生桌面组件 UI 文件缺失，请重新安装应用".to_string())?;
    let root = index.parent().ok_or("组件 UI 目录无效")?;
    Ok((
        format!("gwt://localhost/?widget={widget}"),
        Some(root.to_string_lossy().into_owned()),
    ))
}

fn reap_finished_locked(hosts: &mut HashMap<String, Child>) {
    hosts.retain(|_, child| match child.try_wait() {
        Ok(Some(_)) => false,
        Ok(None) => true,
        Err(_) => false,
    });
}

pub fn is_running(label: &str) -> bool {
    let Ok(mut current) = hosts().lock() else {
        return false;
    };
    reap_finished_locked(&mut current);
    current.contains_key(label)
}

pub fn stop(label: &str) {
    let child = hosts().lock().ok().and_then(|mut current| current.remove(label));
    if let Some(mut child) = child {
        let _ = child.kill();
        let _ = child.wait();
    }
}

pub fn stop_all() {
    let children = hosts()
        .lock()
        .map(|mut current| current.drain().map(|(_, child)| child).collect::<Vec<_>>())
        .unwrap_or_default();
    for mut child in children {
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn spawn_spec(spec: &HostSpec) -> Result<Child, String> {
    let mut args = vec![
        "--label".to_string(), spec.label.clone(),
        "--url".to_string(), spec.url.clone(),
        "--pipe".to_string(), spec.pipe_name.clone(),
        "--x".to_string(), spec.x.clone(),
        "--y".to_string(), spec.y.clone(),
        "--width".to_string(), spec.width.clone(),
        "--height".to_string(), spec.height.clone(),
    ];
    if let Some(root) = &spec.ui_root {
        args.extend(["--ui-root".to_string(), root.clone()]);
    }
    let mut child = Command::new(&spec.executable)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("启动原生桌面组件失败: {error}"))?;
    if let Err(error) = assign_to_host_job(&child) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    Ok(child)
}

fn physical_geometry(window: &WebviewWindow) -> Result<(PhysicalPosition<i32>, PhysicalSize<u32>), String> {
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    Ok((position, size))
}

pub fn start(
    app: &AppHandle,
    label: &str,
    url: &str,
    pipe_name: &str,
    ui_root: Option<&str>,
    source_window: &WebviewWindow,
) -> Result<(), String> {
    stop(label);
    let executable = resolve_executable(app)?;
    let (position, size) = physical_geometry(source_window)?;
    let x = position.x.to_string();
    let y = position.y.to_string();
    let width = size.width.to_string();
    let height = size.height.to_string();
    let spec = HostSpec {
        label: label.to_string(), executable, url: url.to_string(),
        pipe_name: pipe_name.to_string(), ui_root: ui_root.map(str::to_string), x, y, width, height,
    };
    let child = spawn_spec(&spec)?;
    let mut current = hosts()
        .lock()
        .map_err(|_| "桌面组件进程状态不可用".to_string())?;
    reap_finished_locked(&mut current);
    current.insert(label.to_string(), child);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::reap_finished_locked;
    use std::collections::HashMap;

    #[test]
    fn reap_is_safe_for_empty_registry() {
        let mut hosts = HashMap::new();
        reap_finished_locked(&mut hosts);
        assert!(hosts.is_empty());
    }
}
