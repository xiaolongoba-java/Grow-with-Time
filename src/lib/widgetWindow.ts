import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { availableMonitors } from "@tauri-apps/api/window";
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";

/** Restore a saved widget position only if it still sits on a real monitor. */
export async function restoreWidgetPosition(
  window: WebviewWindow,
  storageKey: string,
): Promise<void> {
  let saved: { x: number; y: number } | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as
      | { x: number; y: number }
      | null;
  } catch {
    saved = null;
  }
  if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return;

  try {
    const monitors = await availableMonitors();
    if (monitors.length) {
      const visible = monitors.some((monitor) => {
        const left = monitor.position.x;
        const top = monitor.position.y;
        const right = left + monitor.size.width;
        const bottom = top + monitor.size.height;
        return (
          saved!.x >= left - 80 &&
          saved!.y >= top - 80 &&
          saved!.x < right - 80 &&
          saved!.y < bottom - 80
        );
      });
      if (!visible) {
        localStorage.removeItem(storageKey);
        return;
      }
    }
  } catch {
    // Fall through and apply the saved coordinates.
  }

  try {
    await window.setPosition(new PhysicalPosition(saved.x, saved.y));
  } catch {
    // Ignore invalid legacy window positions.
  }
}
