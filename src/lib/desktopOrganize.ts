import { invoke } from "@tauri-apps/api/core";

export type DesktopKind =
  | "folder"
  | "document"
  | "image"
  | "archive"
  | "shortcut"
  | "other";

export type DesktopItem = {
  path: string;
  name: string;
  kind: DesktopKind;
  isDir: boolean;
  modifiedAt: string | null;
};

export type DesktopCategory = {
  kind: DesktopKind;
  label: string;
  items: DesktopItem[];
};

export type DesktopScan = {
  desktop: string;
  rootFolder: string;
  total: number;
  categories: DesktopCategory[];
  canUndo: boolean;
};

export type PlannedMove = {
  from: string;
  to: string;
  name: string;
  kind: DesktopKind;
};

export type OrganizePlan = {
  target: string;
  moves: PlannedMove[];
  skipped: string[];
};

export type OrganizeResult = {
  moved: number;
  failed: string[];
  target: string;
  canUndo: boolean;
};

export const KIND_META: Record<
  DesktopKind,
  { label: string; glyph: string }
> = {
  folder: { label: "文件夹", glyph: "📁" },
  document: { label: "文档", glyph: "📄" },
  image: { label: "图片", glyph: "🖼" },
  archive: { label: "压缩包", glyph: "🗜" },
  shortcut: { label: "快捷方式", glyph: "↗" },
  other: { label: "其他", glyph: "•" },
};

export function formatDesktopModified(unixSeconds: string | null): string {
  if (!unixSeconds) return "修改时间未知";
  const date = new Date(Number(unixSeconds) * 1000);
  if (!Number.isFinite(date.getTime())) return "修改时间未知";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (sameDay) return `今天 ${time} 修改`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time} 修改`;
}

export function scanDesktop(): Promise<DesktopScan> {
  return invoke("scan_desktop");
}

export function previewDesktopOrganize(): Promise<OrganizePlan> {
  return invoke("preview_desktop_organize");
}

export function applyDesktopOrganize(): Promise<OrganizeResult> {
  return invoke("apply_desktop_organize");
}

export function undoDesktopOrganize(): Promise<OrganizeResult> {
  return invoke("undo_desktop_organize");
}

export function openDesktopItem(path: string): Promise<void> {
  return invoke("open_desktop_item", { path });
}

export function listDesktopShortcuts(): Promise<DesktopItem[]> {
  return invoke("list_desktop_shortcuts");
}

export function toggleShortcutDock(): Promise<boolean> {
  return invoke("toggle_shortcut_dock");
}
