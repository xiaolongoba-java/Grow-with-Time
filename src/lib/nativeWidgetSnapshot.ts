import { invoke } from "@tauri-apps/api/core";
import { fetchMemos } from "@/lib/db/memos";
import { fetchAnniversaries, fetchDailyReflections, fetchInspirations } from "@/lib/db/moments";
import { fetchHabitChecks, fetchHabits } from "@/lib/db/taxonomy";
import { fetchTimers } from "@/lib/db/timers";
import { listDesktopShortcuts, shortcutDockHasPublicDesktop } from "@/lib/desktopOrganize";
import type { Task } from "@/types";

const NATIVE_WIDGET_LABELS = [
  "widget-calendar",
  "widget-today",
  "widget-memo",
  "widget-dashboard",
  "widget-shortcuts",
] as const;

export async function publishNativeWidgetSnapshots(tasks: Task[]): Promise<void> {
  const [memos, anniversaries, habits, checks, timers, inspirations, reflections, shortcuts, hasPublicDesktop] =
    await Promise.all([
      fetchMemos(),
      fetchAnniversaries(),
      fetchHabits(),
      fetchHabitChecks(),
      fetchTimers(),
      fetchInspirations(false),
      fetchDailyReflections(),
      listDesktopShortcuts().catch(() => []),
      shortcutDockHasPublicDesktop().catch(() => false),
    ]);
  const snapshot = JSON.stringify({
    tasks,
    memos,
    anniversaries,
    habits,
    checks,
    timers,
    inspirations,
    reflections,
    shortcuts,
    hasPublicDesktop,
    publishedAt: Date.now(),
  });
  await Promise.all(
    NATIVE_WIDGET_LABELS.map((label) =>
      invoke("publish_native_widget_snapshot", { label, snapshot }),
    ),
  );
}
