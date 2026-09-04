import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  listDesktopShortcuts,
  getDesktopShortcutIcon,
  openShortcutFromDock,
  type DesktopItem,
} from "@/lib/desktopOrganize";

const shortcutIconCache = new Map<string, string | null>();

function displayName(name: string) {
  return name.replace(/\.(lnk|url|desktop)$/i, "");
}

function ShortcutIcon({ name }: { name: string }) {
  const value = displayName(name).toLowerCase();
  let body: ReactNode;
  if (/chrome|edge|firefox|浏览器|browser/.test(value)) {
    body = (
      <>
        <circle cx="12" cy="12" r="8.2" />
        <path d="M4.4 9h15.2M8.2 4.8c2.2 2.1 2.2 12.3 0 14.4M15.8 4.8c-2.2 2.1-2.2 12.3 0 14.4" />
      </>
    );
  } else if (/code|visual studio|idea|webstorm|pycharm|开发/.test(value)) {
    body = (
      <>
        <path d="m9 7-5 5 5 5M15 7l5 5-5 5M14 4l-4 16" />
      </>
    );
  } else if (/word|excel|powerpoint|office|wps|文档|表格/.test(value)) {
    body = (
      <>
        <path d="M6 3.5h8l4 4V20H6z" />
        <path d="M14 3.5v4h4M9 12h6M9 15h6" />
      </>
    );
  } else {
    body = (
      <>
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <path d="M8 9h8M8 12h8M8 15h5" />
      </>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {body}
    </svg>
  );
}

export function ShortcutDockApp() {
  const [items, setItems] = useState<DesktopItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [icons, setIcons] = useState<Record<string, string | null>>({});

  const refresh = useCallback(async () => {
    try {
      const nextItems = await listDesktopShortcuts();
      setItems(nextItems);
      const entries = await Promise.all(
        nextItems.map(async (item) => {
          if (!shortcutIconCache.has(item.path)) {
            shortcutIconCache.set(
              item.path,
              await getDesktopShortcutIcon(item.path).catch(() => null),
            );
          }
          return [item.path, shortcutIconCache.get(item.path) ?? null] as const;
        }),
      );
      setIcons(Object.fromEntries(entries));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取桌面快捷方式");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const orderedItems = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );

  const hide = () => void getCurrentWindow().hide();

  const beginDrag = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    void getCurrentWindow().startDragging();
  };

  return (
    <section
      className="shortcut-dock"
      aria-label="快捷方式面板"
      onMouseDown={beginDrag}
    >
      <div className="shortcut-dock-head" data-tauri-drag-region>
        <strong data-tauri-drag-region>快捷启动</strong>
        <span data-tauri-drag-region>
          {error ? "读取失败" : `${orderedItems.length} 项`}
        </span>
      </div>
      {error ? (
        <p className="shortcut-dock-state is-error">{error}</p>
      ) : orderedItems.length === 0 ? (
        <p className="shortcut-dock-state">桌面上还没有快捷方式</p>
      ) : (
        <div className="shortcut-dock-items">
          {orderedItems.map((item) => (
            <button
              type="button"
              className="shortcut-launch"
              key={item.path}
              title={displayName(item.name)}
              onClick={() => void openShortcutFromDock(item.path)}
            >
              <span className="shortcut-dock-icon">
                {icons[item.path] ? (
                  <img src={icons[item.path] ?? undefined} alt="" />
                ) : (
                  <ShortcutIcon name={item.name} />
                )}
              </span>
              <span>{displayName(item.name)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="shortcut-dock-actions">
        <button type="button" title="刷新" aria-label="刷新快捷方式" onClick={() => void refresh()}>
          ↻
        </button>
        <button type="button" title="收起" aria-label="收起快捷方式面板" onClick={hide}>
          ×
        </button>
      </div>
    </section>
  );
}
