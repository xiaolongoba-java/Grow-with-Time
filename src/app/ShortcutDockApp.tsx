import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import {
  listDesktopShortcuts,
  openDesktopItem,
  shortcutDockHasPublicDesktop,
  type DesktopItem,
} from "@/lib/desktopOrganize";

const SCROLL_STEP = 220;

function labelFor(item: DesktopItem) {
  return item.displayName ?? item.name.replace(/\.(lnk|url|desktop)$/i, "");
}

function shortcutMark(name: string) {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "↗";
}

export function ShortcutDockApp() {
  const [items, setItems] = useState<DesktopItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [publicDesktop, setPublicDesktop] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextItems, hasPublic] = await Promise.all([
        listDesktopShortcuts(),
        shortcutDockHasPublicDesktop(),
      ]);
      setItems(nextItems);
      setPublicDesktop(hasPublic);
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
    const timer = window.setInterval(() => void refresh(), 15_000);
    let unlisten: (() => void) | undefined;
    void listen("shortcut-dock-refresh", () => void refresh()).then((fn) => {
      unlisten = fn;
    });
    return () => {
      window.clearInterval(timer);
      unlisten?.();
    };
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

  return (
    <section className="shortcut-dock" aria-label="桌面快捷方式收纳篮">
      <header data-tauri-drag-region>
        <span data-tauri-drag-region>收纳篮</span>
        <div>
          <button type="button" title="刷新" aria-label="刷新快捷方式" onClick={() => void refresh()}>↻</button>
          <button type="button" title="隐藏" aria-label="隐藏快捷方式停靠栏" onClick={() => {
            void getCurrentWindow().hide();
          }}>×</button>
        </div>
      </header>
      {error ? <p className="shortcut-dock-state is-error">{error}</p> : items.length === 0 ? (
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
              const label = labelFor(item);
              const iconSrc = item.iconPath ? convertFileSrc(item.iconPath) : null;
              return (
                <button
                  type="button"
                  className="shortcut-dock-item"
                  key={item.path}
                  title={label}
                  onClick={() => void openDesktopItem(item.path)}
                >
                  <span className={`shortcut-dock-icon ${iconSrc ? "has-image" : `tone-${index % 6}`}`}>
                    {iconSrc ? (
                      <img src={iconSrc} alt="" draggable={false} />
                    ) : (
                      shortcutMark(label)
                    )}
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
      {publicDesktop ? (
        <p className="shortcut-dock-hint">公共桌面图标无法自动移除，请用管理员账户手动删除</p>
      ) : null}
    </section>
  );
}
