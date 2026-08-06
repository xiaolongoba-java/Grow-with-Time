import type { Task, TaskUpdate } from "@/types";
import { parseTimeToMinutes } from "@/lib/dates";

export function parseReminderMinutes(input: string): number[] {
  return [...new Set(
    input
      .split(/[,，\s]+/)
      .map(Number)
      .filter((value) => Number.isFinite(value) && value >= 0),
  )].sort((a, b) => b - a);
}

export function pendingEstimatedMinutes(tasks: Task[]): number {
  return tasks
    .filter(
      (task) =>
        task.status !== "completed" && task.status !== "cancelled",
    )
    .reduce((sum, task) => sum + (task.estimated_minutes ?? 0), 0);
}

export function buildDeferredDateUpdate(
  scope: "myday" | "due",
  date: string,
): TaskUpdate {
  return scope === "myday"
    ? { my_day_date: date }
    : { due_date: date };
}

export function findTimeConflictIds(tasks: Task[]): Set<string> {
  const planned = tasks
    .filter(
      (task) =>
        task.status !== "completed" &&
        task.status !== "cancelled" &&
        task.due_time,
    )
    .map((task) => {
      const start = parseTimeToMinutes(task.due_time) ?? 0;
      return {
        task,
        start,
        end:
          parseTimeToMinutes(task.end_time) ??
          start + (task.estimated_minutes ?? 60),
      };
    });
  const conflicts = new Set<string>();
  for (let i = 0; i < planned.length; i++) {
    for (let j = i + 1; j < planned.length; j++) {
      const a = planned[i];
      const b = planned[j];
      if (a.start < b.end && b.start < a.end) {
        conflicts.add(a.task.id);
        conflicts.add(b.task.id);
      }
    }
  }
  return conflicts;
}

export type ScheduleSuggestion = {
  taskId: string;
  start: string;
  end: string;
};

function minutesToTime(minutes: number): string {
  const bounded = Math.max(0, Math.min(23 * 60 + 59, minutes));
  return `${String(Math.floor(bounded / 60)).padStart(2, "0")}:${String(
    bounded % 60,
  ).padStart(2, "0")}`;
}

export type AvailableTimeSlot = {
  start: string;
  end: string;
};

/** Find the first free block on a date, aligned to 15-minute boundaries. */
export function findFirstAvailableTimeSlot(
  tasks: Task[],
  date: string,
  duration = 60,
  notBefore = 9 * 60,
  dayEnd = 23 * 60 + 45,
): AvailableTimeSlot | null {
  const span = Math.max(15, Math.ceil(duration / 15) * 15);
  const occupied = tasks
    .filter(
      (task) =>
        (task.due_date === date || task.my_day_date === date) &&
        task.status !== "completed" &&
        task.status !== "cancelled" &&
        task.due_time,
    )
    .map((task) => {
      const start = parseTimeToMinutes(task.due_time) ?? 0;
      return {
        start,
        end: Math.max(
          start + 15,
          parseTimeToMinutes(task.end_time) ??
            start + (task.estimated_minutes ?? 60),
        ),
      };
    })
    .sort((a, b) => a.start - b.start);

  let cursor = Math.max(0, Math.ceil(notBefore / 15) * 15);
  for (const slot of occupied) {
    if (cursor + span <= slot.start) {
      return { start: minutesToTime(cursor), end: minutesToTime(cursor + span) };
    }
    if (cursor < slot.end) cursor = Math.ceil(slot.end / 15) * 15;
  }
  return cursor + span <= dayEnd
    ? { start: minutesToTime(cursor), end: minutesToTime(cursor + span) }
    : null;
}

export function suggestDaySchedule(
  tasks: Task[],
  workStart = 9 * 60,
  workEnd = 18 * 60,
): ScheduleSuggestion[] {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const occupied = tasks
    .filter(
      (task) =>
        task.status !== "completed" &&
        task.status !== "cancelled" &&
        !task.flexible &&
        task.due_time != null,
    )
    .map((task) => {
      const start = parseTimeToMinutes(task.due_time) ?? workStart;
      return {
        start,
        end:
          parseTimeToMinutes(task.end_time) ??
          start + (task.estimated_minutes ?? 60),
      };
    })
    .sort((a, b) => a.start - b.start);

  const candidates = tasks
    .filter((task) => {
      if (
        task.status === "completed" ||
        task.status === "cancelled" ||
        !task.flexible
      ) {
        return false;
      }
      if (!task.blocked_by_id) return true;
      return taskMap.get(task.blocked_by_id)?.status === "completed";
    })
    .sort(
      (a, b) =>
        (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
        a.priority - b.priority ||
        ({ high: 0, medium: 1, low: 2 }[a.energy_level] -
          { high: 0, medium: 1, low: 2 }[b.energy_level]),
    );

  const suggestions: ScheduleSuggestion[] = [];
  for (const task of candidates) {
    const duration = Math.max(15, task.estimated_minutes ?? 30);
    let cursor = workStart;
    while (cursor + duration <= workEnd) {
      const collision = occupied.find(
        (slot) => cursor < slot.end && slot.start < cursor + duration,
      );
      if (collision) {
        cursor = Math.ceil(collision.end / 15) * 15;
        continue;
      }
      const end = cursor + duration;
      suggestions.push({
        taskId: task.id,
        start: minutesToTime(cursor),
        end: minutesToTime(end),
      });
      occupied.push({ start: cursor, end });
      occupied.sort((a, b) => a.start - b.start);
      break;
    }
  }
  return suggestions;
}
