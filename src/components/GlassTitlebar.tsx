import { useEffect, useState } from "react";
import { isMacOS } from "@/lib/platform";

/** In-app drag strip. macOS keeps traffic lights; Windows uses custom controls. */
export function GlassTitlebar() {
  const [maximized, setMaximized] = useState(false);
  const mac = isMacOS();

  useEffect(() => {
    if (mac) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const next = await win.isMaximized();
        if (!disposed) setMaximized(next);
        unlisten = await win.onResized(async () => {
          const value = await win.isMaximized();
          if (!disposed) setMaximized(value);
        });
      } catch {
        // ignore outside Tauri
      }
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [mac]);

  const run = async (action: "minimize" | "toggle" | "close") => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      if (action === "minimize") await win.minimize();
      if (action === "close") await win.close();
      if (action === "toggle") {
        if (await win.isMaximized()) await win.unmaximize();
        else await win.maximize();
      }
    } catch {
      // ignore outside Tauri
    }
  };

  return (
    <header
      className={`glass-titlebar ${mac ? "glass-titlebar-mac" : "glass-titlebar-win"}`}
      data-tauri-drag-region
    >
      <div className="glass-titlebar-brand" data-tauri-drag-region>
        <span className="glass-titlebar-mark" aria-hidden />
        <strong data-tauri-drag-region>日进·拾光</strong>
        <small data-tauri-drag-region>Grow with Time</small>
      </div>
      {mac ? null : (
        <div className="glass-titlebar-controls">
          <button type="button" aria-label="最小化" onClick={() => void run("minimize")}>
            ─
          </button>
          <button
            type="button"
            aria-label={maximized ? "还原" : "最大化"}
            onClick={() => void run("toggle")}
          >
            {maximized ? "❐" : "□"}
          </button>
          <button
            type="button"
            className="glass-titlebar-close"
            aria-label="关闭"
            onClick={() => void run("close")}
          >
            ×
          </button>
        </div>
      )}
    </header>
  );
}
