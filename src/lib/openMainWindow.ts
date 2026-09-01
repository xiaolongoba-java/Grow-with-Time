import { invoke } from "@tauri-apps/api/core";
import type { NavId } from "@/types";

/** Show the main window and optionally navigate to a view. */
export async function runWidgetAction(
  action: Promise<unknown>,
  fallback: string,
): Promise<boolean> {
  try {
    await action;
    return true;
  } catch (cause) {
    notifyWidgetError(cause, fallback);
    return false;
  }
}

export function notifyWidgetError(cause: unknown, fallback: string): void {
  const message = cause instanceof Error ? cause.message : String(cause || fallback);
  console.error(fallback, cause);
  if (typeof window !== "undefined") window.alert(message || fallback);
}

export function openMainWindow(nav?: NavId): Promise<boolean> {
  return runWidgetAction(
    invoke("open_main_window", { nav: nav ?? null }),
    "打开主程序失败",
  );
}
