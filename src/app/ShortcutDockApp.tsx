import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  listDesktopShortcuts,
  openDesktopItem,
  type DesktopItem,
} from "@/lib/desktopOrganize";

function displayName(name: string) {
  return name.replace(/\.(lnk|url|desktop)$/i, "");
}

function shortcutMark(name: string) {
  return Array.from(displayName(name).trim())[0]?.toUpperCase() ?? "↗";
}

export function ShortcutDockApp() {
  const [items, setItems] = useState<DesktopItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await listDesktopShortcuts());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取桌面快捷方式");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <section className="shortcut-dock" aria-label="桌面快捷方式停靠栏">
      <header data-tauri-drag-region>
        <span data-tauri-drag-region>快捷方式</span>
        <div>
          <button type="button" title="刷新" aria-label="刷新快捷方式" onClick={() => void refresh()}>↻</button>
          <button type="button" title="隐藏" aria-label="隐藏快捷方式停靠栏" onClick={() => void getCurrentWindow().hide()}>×</button>
        </div>
      </header>
      {error ? <p className="shortcut-dock-state is-error">{error}</p> : items.length === 0 ? (
        <p className="shortcut-dock-state">桌面上还没有快捷方式</p>
      ) : (
        <div className="shortcut-dock-items">
          {items.map((item, index) => (
            <button
              type="button"
              className="shortcut-dock-item"
              key={item.path}
              title={displayName(item.name)}
              onClick={() => void openDesktopItem(item.path)}
            >
              <span className={`shortcut-dock-icon tone-${index % 6}`}>{shortcutMark(item.name)}</span>
              <span>{displayName(item.name)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
