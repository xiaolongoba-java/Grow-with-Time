import { invoke } from "@tauri-apps/api/core";
import type { DesktopWidgetLayer, DesktopWidgetMode } from "@/types";
import { errorMessage } from "@/lib/errors";
import { useAppStore } from "@/store/app";

/** Show desktop UI according to user preference (does not hide if already open). */
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

/** Toggle desktop widgets on/off for the sidebar / icon rail entry. */
export async function toggleDesktopWidgets(
  mode: DesktopWidgetMode,
  layer: DesktopWidgetLayer = "bottom",
): Promise<void> {
  try {
    const visible = await invoke<boolean>("toggle_desktop_widgets", { mode, layer });
    useAppStore.getState().setToast(
      visible
        ? mode === "classic"
          ? "已打开经典桌面组件"
          : "已打开桌面仪表盘"
        : "已关闭桌面组件",
    );
  } catch (error) {
    useAppStore.getState().setToast(`桌面组件操作失败：${errorMessage(error, "未知错误")}`);
    throw error;
  }
}
