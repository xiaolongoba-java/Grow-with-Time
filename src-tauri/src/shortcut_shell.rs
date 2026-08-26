//! Windows shell helpers for shortcut display names and icons.

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const ICON_DIR: &str = "shortcut-icons";

fn icon_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(ICON_DIR);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn cache_key(path: &Path) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    path.to_string_lossy().to_ascii_lowercase().hash(&mut hasher);
    if let Ok(meta) = std::fs::metadata(path) {
        if let Ok(modified) = meta.modified() {
            modified.hash(&mut hasher);
        }
    }
    format!("{:016x}.png", hasher.finish())
}

#[cfg(windows)]
fn run_powershell(script: &str) -> Result<String, String> {
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if err.is_empty() {
            "PowerShell 命令失败".into()
        } else {
            err
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(windows)]
pub fn shell_display_name(path: &Path) -> Option<String> {
    let literal = path.to_string_lossy().replace('\'', "''");
    let script = format!(
        "$item = (New-Object -ComObject Shell.Application).NameSpace((Split-Path -LiteralPath '{literal}')).ParseName((Split-Path -Leaf -LiteralPath '{literal}')); if ($item) {{ $item.Name }}"
    );
    run_powershell(&script).ok().filter(|s| !s.is_empty())
}

#[cfg(not(windows))]
pub fn shell_display_name(_path: &Path) -> Option<String> {
    None
}

#[cfg(windows)]
pub fn extract_icon(app: &AppHandle, path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let cache_dir = icon_cache_dir(app)?;
    let cache_file = cache_dir.join(cache_key(path));
    if cache_file.exists() {
        return Ok(Some(cache_file.to_string_lossy().to_string()));
    }
    let literal = path.to_string_lossy().replace('\'', "''");
    let out = cache_file.to_string_lossy().replace('\'', "''");
    let script = format!(
        "Add-Type -AssemblyName System.Drawing; \
         $p = (Resolve-Path -LiteralPath '{literal}').Path; \
         $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($p); \
         if (-not $icon) {{ exit 1 }}; \
         $bmp = $icon.ToBitmap(); \
         $bmp.Save('{out}', [System.Drawing.Imaging.ImageFormat]::Png); \
         $icon.Dispose(); $bmp.Dispose()"
    );
    run_powershell(&script)?;
    if cache_file.exists() {
        Ok(Some(cache_file.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

#[cfg(not(windows))]
pub fn extract_icon(_app: &AppHandle, _path: &Path) -> Result<Option<String>, String> {
    Ok(None)
}

pub fn basic_display_name(name: &str) -> String {
    name.replace(".lnk", "")
        .replace(".url", "")
        .replace(".desktop", "")
}

pub fn cached_icon_path(app: &AppHandle, path: &Path) -> Option<String> {
    let cache_dir = icon_cache_dir(app).ok()?;
    let cache_file = cache_dir.join(cache_key(path));
    if cache_file.exists() {
        Some(cache_file.to_string_lossy().to_string())
    } else {
        None
    }
}

pub fn enrich_shortcut_item(
    app: &AppHandle,
    path: &str,
    name: &str,
) -> (Option<String>, Option<String>) {
    let path_buf = PathBuf::from(path);
    let display = shell_display_name(&path_buf);
    let icon = extract_icon(app, &path_buf).ok().flatten();
    let display = display.or_else(|| Some(basic_display_name(name)));
    (display, icon)
}

pub fn apply_fast_shortcut_meta(app: &AppHandle, path: &str, name: &str) -> (Option<String>, Option<String>) {
    let path_buf = PathBuf::from(path);
    (
        Some(basic_display_name(name)),
        cached_icon_path(app, &path_buf),
    )
}
