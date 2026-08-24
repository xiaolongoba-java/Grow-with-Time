use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}, thread, time::{Duration, SystemTime, UNIX_EPOCH}};
use tauri::{AppHandle, Manager};

const LIBRARY_DIR: &str = "wallpapers";
const SETTINGS_FILE: &str = "wallpaper-settings.json";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperItem { id: String, name: String, path: String }

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperSettings {
    enabled: bool,
    interval_minutes: u64,
    shuffle: bool,
    current_id: Option<String>,
    last_changed_at: Option<u64>,
}

impl Default for WallpaperSettings {
    fn default() -> Self {
        Self { enabled: false, interval_minutes: 60, shuffle: true, current_id: None, last_changed_at: None }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperLibrary { items: Vec<WallpaperItem>, settings: WallpaperSettings }

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn library_dir(app: &AppHandle) -> Result<PathBuf, String> { Ok(data_dir(app)?.join(LIBRARY_DIR)) }
fn settings_path(app: &AppHandle) -> Result<PathBuf, String> { Ok(data_dir(app)?.join(SETTINGS_FILE)) }

fn read_settings(app: &AppHandle) -> WallpaperSettings {
    settings_path(app).ok().and_then(|path| fs::read(path).ok())
        .and_then(|raw| serde_json::from_slice(&raw).ok()).unwrap_or_default()
}

fn write_settings(app: &AppHandle, settings: &WallpaperSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    fs::write(path, serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

fn is_supported(path: &Path) -> bool {
    matches!(path.extension().and_then(|v| v.to_str()).unwrap_or("").to_ascii_lowercase().as_str(), "jpg" | "jpeg" | "png" | "bmp")
}

fn list_items(app: &AppHandle) -> Result<Vec<WallpaperItem>, String> {
    let dir = library_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut items = fs::read_dir(dir).map_err(|e| e.to_string())?.filter_map(Result::ok)
        .filter(|entry| entry.path().is_file() && is_supported(&entry.path()))
        .map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            WallpaperItem { id: name.clone(), name, path: entry.path().to_string_lossy().to_string() }
        }).collect::<Vec<_>>();
    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(items)
}

fn snapshot(app: &AppHandle) -> Result<WallpaperLibrary, String> {
    Ok(WallpaperLibrary { items: list_items(app)?, settings: read_settings(app) })
}

fn unique_destination(dir: &Path, name: &str) -> PathBuf {
    let source = Path::new(name);
    let stem = source.file_stem().and_then(|v| v.to_str()).unwrap_or("wallpaper");
    let ext = source.extension().and_then(|v| v.to_str()).unwrap_or("jpg");
    let direct = dir.join(format!("{stem}.{ext}"));
    if !direct.exists() { return direct; }
    for index in 2..10_000 {
        let next = dir.join(format!("{stem}-{index}.{ext}"));
        if !next.exists() { return next; }
    }
    dir.join(format!("{stem}-copy.{ext}"))
}

fn now_seconds() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() }

#[cfg(target_os = "windows")]
fn set_system_wallpaper(path: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::UI::WindowsAndMessaging::{SystemParametersInfoW, SPI_SETDESKWALLPAPER, SPIF_SENDCHANGE, SPIF_UPDATEINIFILE};
    let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    wide.push(0);
    unsafe { SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, Some(wide.as_mut_ptr().cast()), SPIF_UPDATEINIFILE | SPIF_SENDCHANGE) }
        .map_err(|e| format!("无法设置 Windows 壁纸：{e}"))
}

#[cfg(target_os = "macos")]
fn set_system_wallpaper(path: &Path) -> Result<(), String> {
    let script = format!("tell application \"System Events\" to set picture of every desktop to POSIX file {:?}", path.to_string_lossy());
    std::process::Command::new("osascript").args(["-e", &script]).status().map_err(|e| e.to_string()).and_then(|s| if s.success() { Ok(()) } else { Err("无法设置 macOS 壁纸".into()) })
}

#[cfg(target_os = "linux")]
fn set_system_wallpaper(path: &Path) -> Result<(), String> {
    let uri = format!("file://{}", path.to_string_lossy());
    std::process::Command::new("gsettings").args(["set", "org.gnome.desktop.background", "picture-uri", &uri]).status().map_err(|e| e.to_string()).and_then(|s| if s.success() { Ok(()) } else { Err("当前桌面环境暂不支持自动设置壁纸".into()) })
}

fn apply_by_id(app: &AppHandle, id: &str) -> Result<(), String> {
    let item = list_items(app)?.into_iter().find(|item| item.id == id).ok_or_else(|| "壁纸已不在图库中".to_string())?;
    set_system_wallpaper(Path::new(&item.path))?;
    let mut settings = read_settings(app);
    settings.current_id = Some(item.id);
    settings.last_changed_at = Some(now_seconds());
    write_settings(app, &settings)
}

fn rotate_if_due(app: &AppHandle) -> Result<(), String> {
    let settings = read_settings(app);
    if !settings.enabled { return Ok(()); }
    let items = list_items(app)?;
    if items.is_empty() { return Ok(()); }
    let due = settings.last_changed_at.map(|last| now_seconds().saturating_sub(last) >= settings.interval_minutes.max(1) * 60).unwrap_or(true);
    if !due { return Ok(()); }
    let current = settings.current_id.as_deref();
    let index = if settings.shuffle && items.len() > 1 {
        let mut candidate = now_seconds() as usize % items.len();
        if items.get(candidate).map(|item| item.id.as_str()) == current { candidate = (candidate + 1) % items.len(); }
        candidate
    } else {
        current.and_then(|id| items.iter().position(|item| item.id == id)).map(|i| (i + 1) % items.len()).unwrap_or(0)
    };
    apply_by_id(app, &items[index].id)
}

pub fn start_wallpaper_scheduler(app: AppHandle) {
    thread::spawn(move || loop {
        let _ = rotate_if_due(&app);
        thread::sleep(Duration::from_secs(30));
    });
}

#[tauri::command]
pub fn get_wallpaper_library(app: AppHandle) -> Result<WallpaperLibrary, String> { snapshot(&app) }

#[tauri::command]
pub fn import_wallpapers(app: AppHandle, paths: Vec<String>) -> Result<WallpaperLibrary, String> {
    let dir = library_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for raw in paths {
        let source = PathBuf::from(raw);
        if !source.is_file() || !is_supported(&source) { continue; }
        let name = source.file_name().and_then(|v| v.to_str()).unwrap_or("wallpaper.jpg");
        fs::copy(&source, unique_destination(&dir, name)).map_err(|e| format!("导入 {name} 失败：{e}"))?;
    }
    snapshot(&app)
}

#[tauri::command]
pub fn apply_wallpaper(app: AppHandle, id: String) -> Result<WallpaperLibrary, String> { apply_by_id(&app, &id)?; snapshot(&app) }

#[tauri::command]
pub fn remove_wallpaper(app: AppHandle, id: String) -> Result<WallpaperLibrary, String> {
    let target = library_dir(&app)?.join(&id);
    if !target.starts_with(library_dir(&app)?) { return Err("无效的壁纸路径".into()); }
    if target.exists() { fs::remove_file(target).map_err(|e| e.to_string())?; }
    let mut settings = read_settings(&app);
    if settings.current_id.as_deref() == Some(&id) { settings.current_id = None; }
    write_settings(&app, &settings)?;
    snapshot(&app)
}

#[tauri::command]
pub fn update_wallpaper_settings(app: AppHandle, enabled: bool, interval_minutes: u64, shuffle: bool) -> Result<WallpaperLibrary, String> {
    let mut settings = read_settings(&app);
    settings.enabled = enabled;
    settings.interval_minutes = interval_minutes.clamp(1, 43_200);
    settings.shuffle = shuffle;
    write_settings(&app, &settings)?;
    if enabled && settings.current_id.is_none() { rotate_if_due(&app)?; }
    snapshot(&app)
}
