import { invoke } from "@tauri-apps/api/core";
import type { DesktopWidgetMode } from "@/types";

/** Open desktop UI according to user preference. */
export async function openDesktopWidgets(mode: DesktopWidgetMode): Promise<void> {
  if (mode === "classic") {
    await invoke("show_desktop_widgets");
    return;
  }
  await invoke("show_dashboard_strip");
}
