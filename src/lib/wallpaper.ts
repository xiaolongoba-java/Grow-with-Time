import { invoke } from "@tauri-apps/api/core";

export type WallpaperItem = {
  id: string;
  name: string;
  path: string;
};

export type WallpaperSettings = {
  enabled: boolean;
  intervalMinutes: number;
  shuffle: boolean;
  currentId: string | null;
  lastChangedAt: number | null;
};

export type WallpaperLibrary = {
  items: WallpaperItem[];
  settings: WallpaperSettings;
};

export const getWallpaperLibrary = (): Promise<WallpaperLibrary> =>
  invoke("get_wallpaper_library");

export const importWallpapers = (paths: string[]): Promise<WallpaperLibrary> =>
  invoke("import_wallpapers", { paths });

export const applyWallpaper = (id: string): Promise<WallpaperLibrary> =>
  invoke("apply_wallpaper", { id });

export const removeWallpaper = (id: string): Promise<WallpaperLibrary> =>
  invoke("remove_wallpaper", { id });

export const updateWallpaperSettings = (
  enabled: boolean,
  intervalMinutes: number,
  shuffle: boolean,
): Promise<WallpaperLibrary> =>
  invoke("update_wallpaper_settings", { enabled, intervalMinutes, shuffle });
