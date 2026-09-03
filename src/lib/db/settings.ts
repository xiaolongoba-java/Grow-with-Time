import type { AiSettings, AppSettings, ThemeMode } from "@/types";
import { nowIso, todayDateString } from "@/lib/dates";
import { isPrivacyModeEnabled } from "@/lib/privacy";
import { parseRepeatRule } from "@/lib/repeat";
import { getDb } from "./client";

/* Settings */
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = $1 LIMIT 1",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.select<{ key: string; value: string }[]>(
    "SELECT key, value FROM settings",
  );
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

const THEME_MODES: ThemeMode[] = ["light", "dawn", "glass", "dark", "system"];

function parseThemeMode(value: string | null | undefined): ThemeMode {
  if (value && (THEME_MODES as string[]).includes(value)) return value as ThemeMode;
  return "system";
}

export async function getThemeSetting(): Promise<ThemeMode> {
  return parseThemeMode(await getSetting("theme"));
}

export async function setThemeSetting(theme: ThemeMode): Promise<void> {
  await setSetting("theme", theme);
}

export async function loadAppSettings(): Promise<AppSettings> {
  const s = await getAllSettings();
  return {
    theme: parseThemeMode(s.theme),
    notifyAhead: Number(s.notify_ahead ?? 30),
    autostart: s.autostart === "true",
    privacyMode: isPrivacyModeEnabled(s.privacy_mode),
    autoBackup: s.auto_backup !== "false",
    autoBackupLastOk: s.auto_backup_last_ok || null,
    autoBackupLastError: s.auto_backup_last_error || null,
    autoBackupFailStreak: Number(s.auto_backup_fail_streak ?? 0),
    desktopWidgetMode: s.desktop_widget_mode === "classic" ? "classic" : "dashboard",
    desktopWidgetLayer: s.desktop_widget_layer === "bottom" ? "bottom" : "top",
    ai: {
      baseUrl: s.ai_base_url || "https://api.openai.com/v1",
      apiKey: s.ai_api_key || "",
      model: s.ai_model || "gpt-4o-mini",
    },
    onboardingComplete: s.onboarding_complete === "true",
  };
}

export async function saveAiSettings(ai: AiSettings): Promise<void> {
  await setSetting("ai_base_url", ai.baseUrl);
  await setSetting("ai_api_key", ai.apiKey);
  await setSetting("ai_model", ai.model);
}

/** Move overdue pending tasks onto today's plan without rewriting the deadline. */
export async function rolloverOverdueTasks(): Promise<number> {
  const db = await getDb();
  const today = todayDateString();

  const rows = await db.select<{
    id: string;
    repeat_rule: string | null;
    my_day_date: string | null;
  }[]>(
    `SELECT id, repeat_rule, my_day_date FROM tasks
     WHERE status IN ('pending', 'in_progress', 'waiting')
       AND deleted_at IS NULL
       AND parent_id IS NULL
       AND due_date IS NOT NULL
       AND due_date < $1`,
    [today],
  );

  const ids = rows
    .filter((row) => !parseRepeatRule(row.repeat_rule))
    .filter((row) => row.my_day_date !== today)
    .map((row) => row.id);

  if (ids.length === 0) return 0;

  const timestamp = nowIso();
  for (const id of ids) {
    await db.execute(
      "UPDATE tasks SET my_day_date = $1, updated_at = $2 WHERE id = $3",
      [today, timestamp, id],
    );
  }

  await setSetting("last_rollover_date", today);
  return ids.length;
}

const ACTIVE_FOCUS_KEY = "active_focus";

export type ActiveFocusState = {
  sessionId: string;
  taskId: string | null;
  endsAt: number;
  plannedSec: number;
  lastHeartbeatAt?: number;
  hiddenAt?: number | null;
};

export async function saveActiveFocus(state: ActiveFocusState | null): Promise<void> {
  await setSetting(ACTIVE_FOCUS_KEY, state ? JSON.stringify(state) : "");
}

export async function loadActiveFocus(): Promise<ActiveFocusState | null> {
  const raw = await getSetting(ACTIVE_FOCUS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ActiveFocusState;
    if (!parsed?.sessionId || !Number.isFinite(parsed.endsAt)) return null;
    if (parsed.lastHeartbeatAt != null && !Number.isFinite(parsed.lastHeartbeatAt)) {
      delete parsed.lastHeartbeatAt;
    }
    if (parsed.hiddenAt != null && !Number.isFinite(parsed.hiddenAt)) {
      parsed.hiddenAt = null;
    }
    return parsed;
  } catch {
    return null;
  }
}
