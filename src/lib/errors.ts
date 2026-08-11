/** Normalize unknown thrown values (Error, Tauri IPC objects, strings). */
export function errorMessage(error: unknown, fallback = "操作失败"): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["message", "msg", "error"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  try {
    const text = JSON.stringify(error);
    if (text && text !== "{}" && text !== "null") return text;
  } catch {
    /* ignore */
  }
  return fallback;
}
