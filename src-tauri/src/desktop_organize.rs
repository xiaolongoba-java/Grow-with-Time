//! Desktop organizer: scan and move top-level Desktop items into 日进收纳.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tauri::{AppHandle, Manager};

const ROOT_FOLDER: &str = "日进收纳";
const UNDO_FILE: &str = "desktop-organize-undo.json";

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

fn desktop_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .desktop_dir()
        .map_err(|_| "找不到桌面目录".to_string())
}

fn undo_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join(UNDO_FILE))
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

#[tauri::command]
pub fn preview_desktop_organize(app: AppHandle) -> Result<OrganizePlan, String> {
    let desktop = desktop_dir(&app)?;
    let items = scan_items(&desktop)?;
    Ok(build_plan(&desktop, &items))
}

#[tauri::command]
pub fn apply_desktop_organize(app: AppHandle) -> Result<OrganizeResult, String> {
    let desktop = desktop_dir(&app)?;
    let items = scan_items(&desktop)?;
    let plan = build_plan(&desktop, &items);
    if plan.moves.is_empty() {
        return Ok(OrganizeResult {
            moved: 0,
            failed: Vec::new(),
            target: plan.target,
            can_undo: has_undo(&app),
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
    for item in plan.moves {
        let from = PathBuf::from(&item.from);
        let to = PathBuf::from(&item.to);
        if let Some(parent) = to.parent() {
            let _ = fs::create_dir_all(parent);
        }
        match fs::rename(&from, &to) {
            Ok(()) => done.push(item),
            Err(error) => failed.push(format!("{}：{}", item.name, error)),
        }
    }
    let moved = done.len();
    if !done.is_empty() {
        write_undo(&app, done)?;
    }
    Ok(OrganizeResult {
        moved,
        failed,
        target: plan.target,
        can_undo: has_undo(&app),
    })
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
