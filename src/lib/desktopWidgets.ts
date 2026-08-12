import { invoke } from "@tauri-apps/api/core";
import type { DesktopWidgetLayer, DesktopWidgetMode } from "@/types";

/** Open desktop UI according to user preference. */
export async function openDesktopWidgets(
  mode: DesktopWidgetMode,
  layer: DesktopWidgetLayer = "bottom",
): Promise<void> {
  if (mode === "classic") {
    await invoke("show_desktop_widgets", { layer });
    return;
  }
  await invoke("show_dashboard_strip", { layer });
}
