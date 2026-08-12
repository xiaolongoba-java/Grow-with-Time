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
    desktopWidgetLayer: s.desktop_widget_layer === "top" ? "top" : "bottom",
    ai: {
      baseUrl: s.ai_base_url || "https://api.openai.com/v1",
      apiKey: s.ai_api_key || "",
      model: s.ai_model || "gpt-4o-mini",
    },
    karma: Number(s.karma ?? 0),
    streak: Number(s.streak ?? 0),
    lastCompleteDate: s.last_complete_date || null,
    onboardingComplete: s.onboarding_complete === "true",
  };
}

export async function saveAiSettings(ai: AiSettings): Promise<void> {
  await setSetting("ai_base_url", ai.baseUrl);
  await setSetting("ai_api_key", ai.apiKey);
  await setSetting("ai_model", ai.model);
}

/** Move pending dated tasks from before today to today. Idempotent; safe to call often. */
export async function rolloverOverdueTasks(): Promise<number> {
  const db = await getDb();
  const today = todayDateString();

  const rows = await db.select<{ id: string; repeat_rule: string | null }[]>(
    `SELECT id, repeat_rule FROM tasks
     WHERE status = 'pending'
       AND deleted_at IS NULL
       AND due_date IS NOT NULL
       AND due_date < $1`,
    [today],
  );

  const ids = rows
    .filter((row) => !parseRepeatRule(row.repeat_rule))
    .map((row) => row.id);

  if (ids.length === 0) return 0;

  const timestamp = nowIso();
  for (const id of ids) {
    await db.execute(
      "UPDATE tasks SET due_date = $1, updated_at = $2 WHERE id = $3",
      [today, timestamp, id],
    );
  }

  await setSetting("last_rollover_date", today);
  return ids.length;
}

export async function bumpGamification(): Promise<{
  karma: number;
  streak: number;
}> {
  const settings = await loadAppSettings();
  const today = todayDateString();
  let streak = settings.streak;
  if (settings.lastCompleteDate === today) {
    // already counted today for streak continuity only
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const y = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    streak = settings.lastCompleteDate === y ? streak + 1 : 1;
  }
  const karma = settings.karma + 10;
  await setSetting("karma", String(karma));
  await setSetting("streak", String(streak));
  await setSetting("last_complete_date", today);
  return { karma, streak };
}

