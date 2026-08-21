import { invoke } from "@tauri-apps/api/core";
import type { DesktopWidgetLayer, DesktopWidgetMode } from "@/types";
import { errorMessage } from "@/lib/errors";
import { useAppStore } from "@/store/app";

/** Open desktop UI according to user preference. */
export async function openDesktopWidgets(
  mode: DesktopWidgetMode,
  layer: DesktopWidgetLayer = "bottom",
): Promise<void> {
  try {
    if (mode === "classic") {
      await invoke("show_desktop_widgets", { layer });
    } else {
      await invoke("show_dashboard_strip", { layer });
    }
    useAppStore.getState().setToast(
      mode === "classic" ? "已打开经典桌面组件" : "已打开桌面仪表盘",
    );
  } catch (error) {
    useAppStore.getState().setToast(`桌面组件打开失败：${errorMessage(error, "未知错误")}`);
    throw error;
  }
}
