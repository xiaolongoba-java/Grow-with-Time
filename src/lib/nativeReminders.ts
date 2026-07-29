import type { Task } from "@/types";

export type NativeReminderPlan = {
  reminderId: string;
  taskId: string;
  title: string;
  body: string;
  fireAtMs: number;
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
