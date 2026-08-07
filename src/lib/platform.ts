/** Runtime platform helper (Tauri desktop). */
export type DesktopPlatform = "macos" | "windows" | "linux" | "unknown";

export function detectDesktopPlatform(): DesktopPlatform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("windows")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

export function isMacOS(): boolean {
  return detectDesktopPlatform() === "macos";
}
