const BRIDGE = "http://127.0.0.1:19876";

function bridgeToken(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("bridgeToken") ?? "";
}

export function isNativeWidgetHost(): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement.dataset.nativeHost === "1") return true;
  return new URLSearchParams(window.location.search).get("nativeHost") === "1";
}

export function nativeWidgetKind(): string | null {
  return new URLSearchParams(window.location.search).get("widget");
}

async function bridgeGet<T>(path: string): Promise<T> {
  const response = await fetch(`${BRIDGE}${path}`, {
    headers: { "X-Widget-Token": bridgeToken() },
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

async function bridgePost(path: string, body: unknown): Promise<void> {
  const before = await bridgeDataVersion();
  const response = await fetch(`${BRIDGE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Widget-Token": bridgeToken(),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if ((await bridgeDataVersion()) > before) return;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  throw new Error("桌面组件操作超时，请确认主程序仍在运行");
}

export async function bridgeDataVersion(): Promise<number> {
  const payload = await bridgeGet<{ version: number }>("/api/widgets/version");
  return payload.version;
}

export async function bridgeFetchTasks(): Promise<Record<string, unknown>[]> {
  const payload = await bridgeGet<{ tasks: Record<string, unknown>[] }>("/api/widgets/tasks");
  return payload.tasks;
}

export async function bridgeFetchMemos(): Promise<Record<string, unknown>[]> {
  const payload = await bridgeGet<{ memos: Record<string, unknown>[] }>("/api/widgets/memos");
  return payload.memos;
}

export async function bridgeFetchAnniversaries(): Promise<Record<string, unknown>[]> {
  const payload = await bridgeGet<{ anniversaries: Record<string, unknown>[] }>(
    "/api/widgets/anniversaries",
  );
  return payload.anniversaries;
}

export type BridgeDashboardData = {
  habits: Record<string, unknown>[];
  checks: Record<string, unknown>[];
  timers: Record<string, unknown>[];
  inspirations: Record<string, unknown>[];
  reflections: Record<string, unknown>[];
};

export function bridgeFetchDashboard(): Promise<BridgeDashboardData> {
  return bridgeGet<BridgeDashboardData>("/api/widgets/dashboard");
}

export async function bridgeToggleHabit(habitId: string, checkDate: string): Promise<void> {
  await bridgePost("/api/widgets/habits/toggle", {
    habit_id: habitId,
    check_date: checkDate,
  });
}

export async function bridgeFetchShortcuts(): Promise<Record<string, unknown>[]> {
  const payload = await bridgeGet<{ items: Record<string, unknown>[] }>(
    "/api/widgets/shortcuts",
  );
  return payload.items;
}

export async function bridgeShortcutHasPublicDesktop(): Promise<boolean> {
  const payload = await bridgeGet<{ value: boolean }>(
    "/api/widgets/shortcuts/public-desktop",
  );
  return payload.value;
}

export async function bridgeOpenShortcut(path: string): Promise<void> {
  await bridgePost("/api/widgets/shortcuts/open", { path });
}

export function bridgeShortcutIconUrl(iconPath: string): string | null {
  const name = iconPath.split(/[\\/]/).pop() ?? "";
  if (!/^[0-9a-f]{16}\.png$/i.test(name)) return null;
  return `${BRIDGE}/api/widgets/shortcut-icon/${name}?bridgeToken=${encodeURIComponent(bridgeToken())}`;
}

export async function bridgeToggleTask(id: string): Promise<void> {
  await bridgePost("/api/widgets/tasks/toggle", { id });
}

export async function bridgeCreateTask(title: string, dueDate: string): Promise<void> {
  await bridgePost("/api/widgets/tasks/create", { title, due_date: dueDate });
}

export async function bridgeUpsertMemo(payload: {
  id?: string;
  title?: string;
  content?: string;
  pinned?: number;
  archived?: number;
}): Promise<void> {
  await bridgePost("/api/widgets/memos/upsert", payload);
}
