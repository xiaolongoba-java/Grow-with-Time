//! Desktop organizer: scan and move top-level Desktop items into 日进收纳.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tauri::{AppHandle, Emitter, Manager};

use crate::shortcut_shell;

const ROOT_FOLDER: &str = "日进收纳";
const UNDO_FILE: &str = "desktop-organize-undo.json";
const SHORTCUT_DOCK_DIR: &str = "shortcut-dock";

const SKIP_NAMES: &[&str] = &[
    "desktop.ini",
    "thumbs.db",
    ".ds_store",
    "icon\r",
    ROOT_FOLDER,
];

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopItem {
    pub path: String,
    pub name: String,
    pub kind: String,
    pub is_dir: bool,
    pub modified_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_path: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopCategory {
    pub kind: String,
    pub label: String,
    pub items: Vec<DesktopItem>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopScan {
    pub desktop: String,
    pub root_folder: String,
    pub total: usize,
    pub categories: Vec<DesktopCategory>,
    pub can_undo: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedMove {
    pub from: String,
    pub to: String,
    pub name: String,
    pub kind: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizePlan {
    pub target: String,
    pub moves: Vec<PlannedMove>,
    pub skipped: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizeResult {
    pub moved: usize,
    pub failed: Vec<String>,
    pub target: String,
    pub can_undo: bool,
}

#[derive(Serialize, Deserialize)]
struct UndoJournal {
    moves: Vec<PlannedMove>,
}

fn push_desktop_candidate(dirs: &mut Vec<PathBuf>, seen: &mut HashSet<String>, path: PathBuf) {
    if !path.exists() {
        return;
    }
    let key = fs::canonicalize(&path)
        .unwrap_or(path.clone())
        .to_string_lossy()
        .to_ascii_lowercase();
    if seen.insert(key) {
        dirs.push(path);
    }
}

fn desktop_dir_candidates(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let mut dirs = Vec::new();
    let mut seen = HashSet::new();
    #[cfg(windows)]
    {
        if let Ok(output) = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "[Environment]::GetFolderPath('Desktop')",
            ])
            .output()
        {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    push_desktop_candidate(&mut dirs, &mut seen, PathBuf::from(path));
                }
            }
        }
    }
    if let Ok(path) = app.path().desktop_dir() {
        push_desktop_candidate(&mut dirs, &mut seen, path);
    }
    #[cfg(windows)]
    {
        if let Ok(user) = std::env::var("USERPROFILE") {
            let base = PathBuf::from(&user);
            for name in ["Desktop", "桌面"] {
                push_desktop_candidate(&mut dirs, &mut seen, base.join(name));
            }
        }
        if let Ok(one_drive) = std::env::var("OneDrive") {
            let base = PathBuf::from(&one_drive);
            for name in ["Desktop", "桌面"] {
                push_desktop_candidate(&mut dirs, &mut seen, base.join(name));
            }
        }
        if let Ok(public) = std::env::var("PUBLIC") {
            push_desktop_candidate(&mut dirs, &mut seen, PathBuf::from(public).join("Desktop"));
        }
    }
    if dirs.is_empty() {
        return Err("找不到桌面目录".to_string());
    }
    Ok(dirs)
}

fn desktop_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dirs = desktop_dir_candidates(app)?;
    dirs.into_iter()
        .max_by_key(|dir| {
            scan_items(dir)
                .map(|items| items.len())
                .unwrap_or(0)
        })
        .ok_or_else(|| "找不到桌面目录".to_string())
}

fn move_path(from: &Path, to: &Path) -> Result<(), String> {
    if from == to {
        return Ok(());
    }
    if !from.exists() {
        return Err("源文件不存在".into());
    }
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    #[cfg(windows)]
    {
        let from_s = from.to_string_lossy().replace('\'', "''");
        let to_s = to.to_string_lossy().replace('\'', "''");
        let script = format!(
            "$ErrorActionPreference = 'Stop'; \
             try {{ \
               Move-Item -LiteralPath '{from_s}' -Destination '{to_s}' -Force; \
               exit 0 \
             }} catch {{ \
               try {{ \
                 [System.IO.File]::Move('{from_s}', '{to_s}', $true); \
                 exit 0 \
               }} catch {{ \
                 Write-Error $_.Exception.Message; exit 1 \
               }} \
             }}"
        );
        if std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .status()
            .map_err(|error| error.to_string())?
            .success()
        {
            return Ok(());
        }
    }
    match fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(_) => {
            fs::copy(from, to).map_err(|error| error.to_string())?;
            fs::remove_file(from).map_err(|error| error.to_string())?;
            Ok(())
        }
    }
}

fn undo_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join(UNDO_FILE))
}

fn shortcut_dock_storage(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join(SHORTCUT_DOCK_DIR);
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn is_dir_writable(dir: &Path) -> bool {
    let probe = dir.join(format!(".rijin-write-{}", std::process::id()));
    match fs::write(&probe, b"1") {
        Ok(()) => {
            let _ = fs::remove_file(probe);
            true
        }
        Err(_) => false,
    }
}

fn copy_path(from: &Path, to: &Path) -> Result<(), String> {
    if from == to {
        return Ok(());
    }
    if !from.exists() {
        return Err("源文件不存在".into());
    }
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::copy(from, to).map_err(|error| error.to_string())?;
    Ok(())
}

fn has_undo(app: &AppHandle) -> bool {
    undo_path(app)
        .ok()
        .and_then(|path| fs::read(path).ok())
        .and_then(|raw| serde_json::from_slice::<UndoJournal>(&raw).ok())
        .is_some_and(|journal| !journal.moves.is_empty())
}

fn should_skip(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    SKIP_NAMES.iter().any(|item| *item == lower.as_str()) || name.starts_with('.')
}

pub fn classify(name: &str, is_dir: bool) -> &'static str {
    if is_dir {
        return "folder";
    }
    let ext = Path::new(name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "lnk" | "url" | "desktop" => "shortcut",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "heic" | "svg" | "ico" => "image",
        "zip" | "rar" | "7z" | "tar" | "gz" | "tgz" | "bz2" | "xz" => "archive",
        "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "pdf" | "txt" | "md" | "rtf"
        | "csv" | "pages" | "numbers" | "key" => "document",
        _ => "other",
    }
}

fn category_folder(kind: &str) -> &'static str {
    match kind {
        "folder" => "文件夹",
        "document" => "文档",
        "image" => "图片",
        "archive" => "压缩包",
        "shortcut" => "快捷方式",
        _ => "其他",
    }
}

fn category_label(kind: &str) -> &'static str {
    category_folder(kind)
}

fn format_modified(time: SystemTime) -> Option<String> {
    let secs = time.duration_since(SystemTime::UNIX_EPOCH).ok()?.as_secs();
    Some(secs.to_string())
}

fn unique_dest(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let path = Path::new(name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(name);
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    for index in 2..10_000 {
        let next = dir.join(format!("{stem} ({index}){ext}"));
        if !next.exists() {
            return next;
        }
    }
    dir.join(format!("{stem}-copy{ext}"))
}

fn scan_items(desktop: &Path) -> Result<Vec<DesktopItem>, String> {
    let mut items = Vec::new();
    let entries = fs::read_dir(desktop).map_err(|error| error.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if should_skip(&name) {
            continue;
        }
        let path = entry.path();
        let is_dir = path.is_dir();
        let modified_at = fs::metadata(&path)
            .ok()
            .and_then(|meta| meta.modified().ok())
            .and_then(format_modified);
        items.push(DesktopItem {
            path: path.to_string_lossy().to_string(),
            name,
            kind: classify(&entry.file_name().to_string_lossy(), is_dir).to_string(),
            is_dir,
            modified_at,
            display_name: None,
            icon_path: None,
        });
    }
    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(items)
}

fn grouped(items: Vec<DesktopItem>) -> Vec<DesktopCategory> {
    const ORDER: [&str; 6] = [
        "folder",
        "document",
        "image",
        "archive",
        "shortcut",
        "other",
    ];
    ORDER
        .into_iter()
        .filter_map(|kind| {
            let grouped_items: Vec<DesktopItem> = items
                .iter()
                .filter(|item| item.kind == kind)
                .cloned()
                .collect();
            if grouped_items.is_empty() {
                return None;
            }
            Some(DesktopCategory {
                kind: kind.to_string(),
                label: category_label(kind).to_string(),
                items: grouped_items,
            })
        })
        .collect()
}

fn build_plan(desktop: &Path, items: &[DesktopItem]) -> OrganizePlan {
    let root = desktop.join(ROOT_FOLDER);
    let mut moves = Vec::new();
    let mut skipped = Vec::new();
    for item in items {
        if should_skip(&item.name) {
            skipped.push(item.name.clone());
            continue;
        }
        let folder = root.join(category_folder(&item.kind));
        let dest = unique_dest(&folder, &item.name);
        if Path::new(&item.path) == dest {
            skipped.push(item.name.clone());
            continue;
        }
        moves.push(PlannedMove {
            from: item.path.clone(),
            to: dest.to_string_lossy().to_string(),
            name: item.name.clone(),
            kind: item.kind.clone(),
        });
    }
    OrganizePlan {
        target: root.to_string_lossy().to_string(),
        moves,
        skipped,
    }
}

fn write_undo(app: &AppHandle, moves: Vec<PlannedMove>) -> Result<(), String> {
    let path = undo_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(
        path,
        serde_json::to_vec(&UndoJournal { moves }).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

fn open_os_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path.to_string_lossy()])
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(windows)]
fn refresh_shell_desktop(paths: &[PathBuf]) {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNE_UPDATEDIR, SHCNF_IDLIST, SHCNF_PATHW};
    unsafe {
        let _ = SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None);
        for path in paths {
            let wide: Vec<u16> = path.as_os_str().encode_wide().chain([0]).collect();
            let _ = SHChangeNotify(
                SHCNE_UPDATEDIR,
                SHCNF_PATHW,
                Some(wide.as_ptr() as _),
                None,
            );
        }
    }
}

#[cfg(not(windows))]
fn refresh_shell_desktop(_paths: &[PathBuf]) {}

#[tauri::command]
pub fn scan_desktop(app: AppHandle) -> Result<DesktopScan, String> {
    let desktop = desktop_dir(&app)?;
    let items = scan_items(&desktop)?;
    let total = items.len();
    Ok(DesktopScan {
        desktop: desktop.to_string_lossy().to_string(),
        root_folder: ROOT_FOLDER.to_string(),
        total,
        categories: grouped(items),
        can_undo: has_undo(&app),
    })
}

fn shortcut_items_in_dir(app: &AppHandle, desktop: &Path) -> Result<Vec<DesktopItem>, String> {
    let organized = desktop.join(ROOT_FOLDER).join(category_folder("shortcut"));
    let mut items = Vec::new();
    if organized.exists() {
        items.extend(
            scan_items(&organized)?
                .into_iter()
                .filter(|item| item.kind == "shortcut"),
        );
    }
    for item in &mut items {
        let (display_name, icon_path) =
            shortcut_shell::apply_fast_shortcut_meta(app, &item.path, &item.name);
        item.display_name = display_name;
        item.icon_path = icon_path;
    }
    Ok(items)
}

fn shortcut_items_from_storage(app: &AppHandle) -> Result<Vec<DesktopItem>, String> {
    let storage = shortcut_dock_storage(app)?;
    let mut items = scan_items(&storage)?
        .into_iter()
        .filter(|item| item.kind == "shortcut")
        .collect::<Vec<_>>();
    for item in &mut items {
        let (display_name, icon_path) =
            shortcut_shell::apply_fast_shortcut_meta(app, &item.path, &item.name);
        item.display_name = display_name;
        item.icon_path = icon_path;
    }
    Ok(items)
}

pub fn warm_shortcut_metadata(app: AppHandle) {
    let Ok(items) = list_desktop_shortcuts(app.clone()) else {
        return;
    };
    for item in items {
        let (display_name, icon_path) =
            shortcut_shell::enrich_shortcut_item(&app, &item.path, &item.name);
        let _ = (display_name, icon_path);
    }
    let _ = app.emit("shortcut-dock-refresh", ());
}

#[tauri::command]
pub fn shortcut_dock_has_public_desktop(app: AppHandle) -> Result<bool, String> {
    for desktop in desktop_dir_candidates(&app)? {
        if !is_dir_writable(&desktop) {
            let has_shortcuts = scan_items(&desktop)?
                .into_iter()
                .any(|item| item.kind == "shortcut");
            if has_shortcuts {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

#[tauri::command]
pub fn list_desktop_shortcuts(app: AppHandle) -> Result<Vec<DesktopItem>, String> {
    let mut items = shortcut_items_from_storage(&app)?;
    let mut seen: HashSet<String> = items
        .iter()
        .map(|item| item.name.to_ascii_lowercase())
        .collect();
    for desktop in desktop_dir_candidates(&app)? {
        for item in shortcut_items_in_dir(&app, &desktop)? {
            let key = item.name.to_ascii_lowercase();
            if seen.insert(key) {
                items.push(item);
            }
        }
    }
    items.sort_by(|a, b| {
        a.display_name
            .as_deref()
            .unwrap_or(&a.name)
            .to_lowercase()
            .cmp(
                &b.display_name
                    .as_deref()
                    .unwrap_or(&b.name)
                    .to_lowercase(),
            )
    });
    items.dedup_by(|a, b| a.path.eq_ignore_ascii_case(&b.path));
    Ok(items)
}

fn execute_plan(app: &AppHandle, plan: &OrganizePlan) -> Result<OrganizeResult, String> {
    if plan.moves.is_empty() {
        return Ok(OrganizeResult {
            moved: 0,
            failed: Vec::new(),
            target: plan.target.clone(),
            can_undo: has_undo(app),
        });
    }
    let root = PathBuf::from(&plan.target);
    for kind in [
        "folder",
        "document",
        "image",
        "archive",
        "shortcut",
        "other",
    ] {
        fs::create_dir_all(root.join(category_folder(kind))).map_err(|error| error.to_string())?;
    }
    let mut done = Vec::new();
    let mut failed = Vec::new();
    for item in &plan.moves {
        let from = PathBuf::from(&item.from);
        let to = PathBuf::from(&item.to);
        match move_path(&from, &to) {
            Ok(()) => done.push(item.clone()),
            Err(error) => failed.push(format!("{}：{}", item.name, error)),
        }
    }
    let moved = done.len();
    if !done.is_empty() {
        write_undo(app, done)?;
        if let Ok(desktop) = desktop_dir(app) {
            refresh_shell_desktop(&[desktop]);
        }
    }
    Ok(OrganizeResult {
        moved,
        failed,
        target: plan.target.clone(),
        can_undo: has_undo(app),
    })
}

#[tauri::command]
pub fn collect_desktop_shortcuts(app: AppHandle) -> Result<OrganizeResult, String> {
    let mut total_moved = 0;
    let mut failed = Vec::new();
    let mut done = Vec::new();
    let storage = shortcut_dock_storage(&app)?;
    let mut target = storage.to_string_lossy().to_string();
    let mut refreshed = Vec::new();
    let mut collected_names: HashSet<String> = scan_items(&storage)
        .unwrap_or_default()
        .into_iter()
        .map(|item| item.name.to_ascii_lowercase())
        .collect();

    for desktop in desktop_dir_candidates(&app)? {
        let shortcuts: Vec<DesktopItem> = scan_items(&desktop)?
            .into_iter()
            .filter(|item| item.kind == "shortcut")
            .filter(|item| !collected_names.contains(&item.name.to_ascii_lowercase()))
            .collect();
        if shortcuts.is_empty() {
            continue;
        }

        if is_dir_writable(&desktop) {
            let plan = build_plan(&desktop, &shortcuts);
            target = plan.target.clone();
            if plan.moves.is_empty() {
                continue;
            }
            let root = PathBuf::from(&plan.target);
            if fs::create_dir_all(root.join(category_folder("shortcut"))).is_err() {
                continue;
            }
            for item in plan.moves {
                let from = PathBuf::from(&item.from);
                let to = PathBuf::from(&item.to);
                match move_path(&from, &to) {
                    Ok(()) => {
                        total_moved += 1;
                        done.push(item.clone());
                        collected_names.insert(item.name.to_ascii_lowercase());
                    }
                    Err(error) => {
                        let dest = unique_dest(&storage, &item.name);
                        match copy_path(&from, &dest) {
                            Ok(()) => {
                                total_moved += 1;
                                collected_names.insert(item.name.to_ascii_lowercase());
                            }
                            Err(copy_error) => {
                                failed.push(format!(
                                    "{}：移动失败（{}），复制也失败（{}）",
                                    item.name, error, copy_error
                                ));
                            }
                        }
                    }
                }
            }
            refreshed.push(desktop);
        } else {
            for item in shortcuts {
                let from = PathBuf::from(&item.path);
                let dest = unique_dest(&storage, &item.name);
                if dest.exists() {
                    collected_names.insert(item.name.to_ascii_lowercase());
                    continue;
                }
                match copy_path(&from, &dest) {
                    Ok(()) => {
                        total_moved += 1;
                        collected_names.insert(item.name.to_ascii_lowercase());
                    }
                    Err(error) => failed.push(format!("{}：{}", item.name, error)),
                }
            }
            failed.push(format!(
                "「{}」为公共桌面，快捷方式已复制到收纳篮，原图标需管理员权限才能移除",
                desktop.to_string_lossy()
            ));
        }
    }

    if !done.is_empty() {
        write_undo(&app, done)?;
    }
    if !refreshed.is_empty() {
        refresh_shell_desktop(&refreshed);
    }
    Ok(OrganizeResult {
        moved: total_moved,
        failed,
        target,
        can_undo: has_undo(&app),
    })
}

#[tauri::command]
pub fn preview_desktop_organize(app: AppHandle) -> Result<OrganizePlan, String> {
    let desktop = desktop_dir(&app)?;
    let items = scan_items(&desktop)?;
    Ok(build_plan(&desktop, &items))
}

pub fn run_desktop_organize(app: &AppHandle) -> Result<OrganizeResult, String> {
    let desktop = desktop_dir(app)?;
    let items = scan_items(&desktop)?;
    let plan = build_plan(&desktop, &items);
    execute_plan(app, &plan)
}

#[tauri::command]
pub fn undo_desktop_organize(app: AppHandle) -> Result<OrganizeResult, String> {
    let path = undo_path(&app)?;
    let raw = fs::read(&path).map_err(|_| "没有可撤销的整理记录".to_string())?;
    let journal: UndoJournal =
        serde_json::from_slice(&raw).map_err(|_| "整理记录已损坏".to_string())?;
    let mut moved = 0;
    let mut failed = Vec::new();
    for item in journal.moves.iter().rev() {
        let from = PathBuf::from(&item.to);
        let to = PathBuf::from(&item.from);
        if !from.exists() {
            failed.push(format!("{}：整理后的位置已不存在", item.name));
            continue;
        }
        if to.exists() {
            failed.push(format!("{}：桌面上已有同名项，未还原", item.name));
            continue;
        }
        match fs::rename(&from, &to) {
            Ok(()) => moved += 1,
            Err(error) => failed.push(format!("{}：{}", item.name, error)),
        }
    }
    let _ = fs::remove_file(path);
    Ok(OrganizeResult {
        moved,
        failed,
        target: desktop_dir(&app)?.to_string_lossy().to_string(),
        can_undo: false,
    })
}

#[tauri::command]
pub fn open_desktop_item(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err("文件已不在原位置".into());
    }
    open_os_path(&target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_common_desktop_types() {
        assert_eq!(classify("工作资料", true), "folder");
        assert_eq!(classify("需求文档.docx", false), "document");
        assert_eq!(classify("壁纸.PNG", false), "image");
        assert_eq!(classify("备份.zip", false), "archive");
        assert_eq!(classify("Figma.lnk", false), "shortcut");
        assert_eq!(classify("readme", false), "other");
    }

    #[test]
    fn skips_system_and_root_folder() {
        assert!(should_skip("desktop.ini"));
        assert!(should_skip(".hidden"));
        assert!(should_skip(ROOT_FOLDER));
        assert!(!should_skip("工作资料"));
    }
}
