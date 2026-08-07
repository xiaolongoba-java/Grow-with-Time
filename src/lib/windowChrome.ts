import type { ThemeMode } from "@/types";
import { isMacOS } from "@/lib/platform";

type NativeTheme = "light" | "dark" | null;

function resolveNativeTheme(theme: ThemeMode): NativeTheme {
  if (theme === "system") return null;
  if (theme === "dark" || theme === "glass") return "dark";
  return "light";
}

/** Sync OS chrome with the in-app theme. Windows and macOS diverge on titlebar. */
export async function syncWindowChrome(theme: ThemeMode): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const { setTheme } = await import("@tauri-apps/api/app");
    const win = getCurrentWindow();
    await setTheme(resolveNativeTheme(theme));
    await win.setBackgroundColor([0, 0, 0, 0]);
    await win.clearEffects();

    if (isMacOS()) {
      // macOS: native traffic lights + overlay titlebar; keep soft window shadow
      await win.setDecorations(true);
      await win.setTitleBarStyle("overlay");
      await win.setShadow(true);
    } else {
      // Windows: custom chrome, no acrylic/rect shadow so CSS corners stay clean
      await win.setDecorations(false);
      await win.setShadow(false);
    }
  } catch {
    // Browser / non-Tauri preview — ignore.
  }
}
