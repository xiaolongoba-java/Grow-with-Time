import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  listDesktopShortcuts,
  getDesktopShortcutIcon,
  openShortcutFromDock,
  type DesktopItem,
} from "@/lib/desktopOrganize";

const shortcutIconCache = new Map<string, string | null>();
const SCROLL_STEP = 220;

function displayName(name: string) {
  return name.replace(/\.(lnk|url|desktop)$/i, "");
}

function shortcutMark(name: string) {
  return Array.from(displayName(name).trim())[0]?.toUpperCase() ?? "↗";
}

export function ShortcutDockApp() {
  const [items, setItems] = useState<DesktopItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [icons, setIcons] = useState<Record<string, string | null>>({});
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

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

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(maxScroll > 4 && el.scrollLeft < maxScroll - 4);
  }, []);

  const scrollBy = useCallback((delta: number) => {
    scrollerRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    updateScrollState();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      observer.disconnect();
    };
  }, [items, updateScrollState]);

  const hide = () => void getCurrentWindow().hide();

  const beginDrag = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    void getCurrentWindow().startDragging();
  };

  return (
    <section
      className="shortcut-dock"
      aria-label="桌面快捷方式收纳篮"
      onMouseDown={beginDrag}
    >
      <header data-tauri-drag-region>
        <span data-tauri-drag-region>收纳篮</span>
        <div>
          <button type="button" title="刷新" aria-label="刷新快捷方式" onClick={() => void refresh()}>
            ↻
          </button>
          <button type="button" title="隐藏" aria-label="隐藏收纳篮" onClick={hide}>
            ×
          </button>
        </div>
      </header>
      {error ? (
        <p className="shortcut-dock-state is-error">{error}</p>
      ) : items.length === 0 ? (
        <p className="shortcut-dock-state">桌面上还没有快捷方式</p>
      ) : (
        <div className="shortcut-dock-scroll">
          <button
            type="button"
            className="shortcut-dock-scroll-btn is-prev"
            aria-label="向左滑动"
            title="向左滑动"
            disabled={!canScrollLeft}
            onClick={() => scrollBy(-SCROLL_STEP)}
          >
            ‹
          </button>
          <div className="shortcut-dock-items" ref={scrollerRef}>
            {items.map((item, index) => {
              const label = displayName(item.name);
              const iconSrc = icons[item.path];
              return (
                <button
                  type="button"
                  className="shortcut-dock-item"
                  key={item.path}
                  title={label}
                  onClick={() => void openShortcutFromDock(item.path)}
                >
                  <span className={`shortcut-dock-icon ${iconSrc ? "has-image" : `tone-${index % 6}`}`}>
                    {iconSrc ? <img src={iconSrc} alt="" draggable={false} /> : shortcutMark(label)}
                  </span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="shortcut-dock-scroll-btn is-next"
            aria-label="向右滑动"
            title="向右滑动"
            disabled={!canScrollRight}
            onClick={() => scrollBy(SCROLL_STEP)}
          >
            ›
          </button>
        </div>
      )}
    </section>
  );
}
