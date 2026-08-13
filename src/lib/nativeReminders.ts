import { privacySafeNotification } from "@/lib/privacy";
import type { Task } from "@/types";

export type NativeReminderPlan = {
  reminderId: string;
  taskId: string;
  title: string;
  body: string;
  fireAtMs: number;
};

export type MissedReminderPlan = NativeReminderPlan & {
  showSystemNotification: boolean;
};

export function buildNativeReminderPlans(
  tasks: Task[],
  defaultAhead: number,
  nowMs = Date.now(),
): NativeReminderPlan[] {
  const plans: NativeReminderPlan[] = [];
  for (const task of tasks) {
    if (
      !["pending", "in_progress", "waiting"].includes(task.status) ||
      task.deleted_at ||
      !task.due_date ||
      task.parent_id
    ) {
      continue;
    }
    const due = new Date(
      `${task.due_date}T${task.due_time ?? "23:59"}:00`,
    ).getTime();
    const reminders = task.reminder_minutes.length
      ? task.reminder_minutes
      : [task.remind_minutes ?? defaultAhead];
    for (const remind of reminders) {
      const fireAtMs = due - remind * 60 * 1000;
      if (fireAtMs <= nowMs) continue;
      plans.push({
        reminderId: `${task.id}:${task.due_date}:${task.due_time ?? "23:59"}:${remind}`,
        taskId: task.id,
        title: "任务提醒",
        body: `${task.title} 将在 ${remind} 分钟内到期`,
        fireAtMs,
      });
    }
  }
  return plans;
}

export const OS_REMINDER_LIMIT = 48;
export const OS_REMINDER_MAX_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

export type OsReminderWindow = {
  windowed: NativeReminderPlan[];
  overflow: NativeReminderPlan[];
  truncated: boolean;
};

/** Match native OS scheduler: next 48 within 90 days; the rest stay in-process. */
export function selectOsReminderWindow(
  plans: NativeReminderPlan[],
  nowMs = Date.now(),
): OsReminderWindow {
  const inHorizon = plans
    .filter(
      (item) =>
        item.fireAtMs > nowMs && item.fireAtMs <= nowMs + OS_REMINDER_MAX_AHEAD_MS,
    )
    .sort((a, b) => a.fireAtMs - b.fireAtMs);
  const beyond = plans.filter(
    (item) => item.fireAtMs > nowMs + OS_REMINDER_MAX_AHEAD_MS,
  );
  return {
    windowed: inHorizon.slice(0, OS_REMINDER_LIMIT),
    overflow: [...inHorizon.slice(OS_REMINDER_LIMIT), ...beyond],
    truncated: inHorizon.length > OS_REMINDER_LIMIT || beyond.length > 0,
  };
}

export type ReminderSyncStatus = {
  osAvailable: boolean | null;
  permissionGranted: boolean | null;
  scheduledCount: number;
  overflowCount: number;
  truncated: boolean;
  totalUpcoming: number;
  lastOkAt: number | null;
  lastError: string | null;
};

export const EMPTY_REMINDER_SYNC: ReminderSyncStatus = {
  osAvailable: null,
  permissionGranted: null,
  scheduledCount: 0,
  overflowCount: 0,
  truncated: false,
  totalUpcoming: 0,
  lastOkAt: null,
  lastError: null,
};

export function applyPrivacyToReminderPlans(
  plans: NativeReminderPlan[],
  privacyMode: boolean,
): NativeReminderPlan[] {
  return plans.map((plan) => {
    const copy = privacySafeNotification(privacyMode, plan.title, plan.body);
    return { ...plan, title: copy.title, body: copy.body };
  });
}

export function buildMissedReminderPlans(
  tasks: Task[],
  defaultAhead: number,
  lastScanMs: number,
  nowMs = Date.now(),
  systemGraceMs = 30 * 60 * 1000,
): MissedReminderPlan[] {
  if (!Number.isFinite(lastScanMs) || lastScanMs >= nowMs) return [];
  const plans: MissedReminderPlan[] = [];
  for (const task of tasks) {
    if (
      !["pending", "in_progress", "waiting"].includes(task.status) ||
      task.deleted_at ||
      !task.due_date ||
      task.parent_id
    ) continue;
    const due = new Date(`${task.due_date}T${task.due_time ?? "23:59"}:00`).getTime();
    const reminders = task.reminder_minutes.length
      ? task.reminder_minutes
      : [task.remind_minutes ?? defaultAhead];
    const missed = reminders
      .map((remind) => ({ remind, fireAtMs: due - remind * 60 * 1000 }))
      .filter((item) => item.fireAtMs > lastScanMs && item.fireAtMs <= nowMs)
      .sort((a, b) => b.fireAtMs - a.fireAtMs)[0];
    if (!missed) continue;
    plans.push({
      reminderId: `${task.id}:${task.due_date}:${task.due_time ?? "23:59"}:${missed.remind}`,
      taskId: task.id,
      title: "错过的任务提醒",
      body: `${task.title} 的提醒已错过`,
      fireAtMs: missed.fireAtMs,
      showSystemNotification: nowMs - missed.fireAtMs <= systemGraceMs,
    });
  }
  return plans;
}

/** OS already fired the nearest 48 / 90-day window; overflow still needs a local popup. */
export function missedReminderNeedsPopup(
  plan: MissedReminderPlan,
  osAvailable: boolean,
  osHandledIds: ReadonlySet<string>,
): boolean {
  if (!plan.showSystemNotification) return false;
  if (!osAvailable) return true;
  return !osHandledIds.has(plan.reminderId);
}
