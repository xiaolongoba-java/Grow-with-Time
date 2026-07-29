import type { RepeatRule, Task, TaskDraft } from "@/types";
import { todayDateString } from "@/lib/dates";

export function parseRepeatRule(raw: string | null): RepeatRule | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RepeatRule;
  } catch {
    return null;
  }
}

export function stringifyRepeatRule(rule: RepeatRule | null): string | null {
  return rule ? JSON.stringify(rule) : null;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  const d = new Date(year, month + 1, 0, 12);
  while (d.getDay() !== weekday) {
    d.setDate(d.getDate() - 1);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function nextOccurrence(
  task: Task,
): { due_date: string; due_time: string | null } | null {
  const rule = parseRepeatRule(task.repeat_rule);
  if (!rule) return null;

  const base = task.due_date ?? todayDateString();
  const due_time = task.due_time;

  switch (rule.frequency) {
    case "daily":
      return { due_date: addDays(base, rule.interval || 1), due_time };
    case "weekly": {
      const interval = rule.interval || 1;
      if (rule.weekdays?.length) {
        let cursor = addDays(base, 1);
        for (let i = 0; i < 14 * interval; i++) {
          const d = new Date(`${cursor}T12:00:00`);
          if (rule.weekdays.includes(d.getDay())) {
            return { due_date: cursor, due_time };
          }
          cursor = addDays(cursor, 1);
        }
      }
      return { due_date: addDays(base, 7 * interval), due_time };
    }
    case "monthly": {
      const d = new Date(`${base}T12:00:00`);
      d.setMonth(d.getMonth() + (rule.interval || 1));
      if (rule.monthDay === -1) {
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12);
        return {
          due_date: `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`,
          due_time,
        };
      }
      if (rule.monthDay) {
        d.setDate(Math.min(rule.monthDay, 28));
      }
      return {
        due_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        due_time,
      };
    }
    case "custom": {
      if (rule.nthWeekday) {
        const d = new Date(`${base}T12:00:00`);
        d.setMonth(d.getMonth() + (rule.interval || 1));
        if (rule.nthWeekday.n === -1) {
          return {
            due_date: lastWeekdayOfMonth(
              d.getFullYear(),
              d.getMonth(),
              rule.nthWeekday.weekday,
            ),
            due_time,
          };
        }
      }
      return { due_date: addDays(base, 7), due_time };
    }
    default:
      return null;
  }
}

export function nextRepeatTaskDraft(task: Task): TaskDraft | null {
  const next = nextOccurrence(task);
  if (!next) return null;
  return {
    title: task.title,
    description: task.description,
    notes: task.notes,
    priority: task.priority,
    due_date: next.due_date,
    due_time: next.due_time,
    end_time: task.end_time,
    repeat_rule: task.repeat_rule,
    remind_minutes: task.remind_minutes,
    reminder_minutes: [...task.reminder_minutes],
    estimated_minutes: task.estimated_minutes,
    project_id: task.project_id,
    blocked_by_id: task.blocked_by_id,
    completion_criteria: task.completion_criteria,
    energy_level: task.energy_level,
    flexible: task.flexible,
  };
}
