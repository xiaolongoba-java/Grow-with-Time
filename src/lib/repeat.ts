import type { RepeatRule, Task, TaskDraft } from "@/types";
import { addDays, startOfWeek, todayDateString } from "@/lib/dates";

export const WEEKDAY_OPTIONS = [
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
  { value: 0, label: "日" },
] as const;

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

export function weekdayFromDate(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00`).getDay();
}

export function formatYmd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Next date on or after `fromDate` that matches one of `weekdays` (0=Sun). */
export function nextDateMatchingWeekdays(
  fromDate: string,
  weekdays: number[],
): string {
  if (!weekdays.length) return fromDate;
  const set = new Set(weekdays);
  const cursor = new Date(`${fromDate}T12:00:00`);
  for (let i = 0; i < 8; i++) {
    if (set.has(cursor.getDay())) return formatYmd(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
  return fromDate;
}

export function toggleWeekday(weekdays: number[], day: number): number[] {
  const set = new Set(weekdays);
  if (set.has(day)) {
    if (set.size <= 1) return weekdays;
    set.delete(day);
  } else {
    set.add(day);
  }
  return [...set].sort((a, b) => {
    const rank = (n: number) => (n === 0 ? 7 : n);
    return rank(a) - rank(b);
  });
}

export function describeRepeatRule(rule: RepeatRule | null): string {
  if (!rule) return "不重复";
  if (rule.frequency === "daily") return "每天";
  if (rule.frequency === "weekly") {
    if (rule.weekdays?.length) {
      const labels = WEEKDAY_OPTIONS.filter((d) =>
        rule.weekdays!.includes(d.value),
      ).map((d) => d.label);
      return labels.length ? `每周${labels.join("")}` : "每周";
    }
    return "每周";
  }
  if (rule.frequency === "monthly") return "每月";
  if (rule.frequency === "custom") return "每月最后周五";
  return "不重复";
}

export function weeklyRuleFromDate(dateStr: string): RepeatRule {
  return {
    frequency: "weekly",
    interval: 1,
    weekdays: [weekdayFromDate(dateStr)],
  };
}

export function monthlyRuleFromDate(dateStr: string): RepeatRule {
  const day = Number(dateStr.slice(8, 10));
  return {
    frequency: "monthly",
    interval: 1,
    monthDay: Number.isFinite(day) ? day : undefined,
  };
}

/** Shift by calendar months, then clamp to the target month's last day. */
export function addCalendarMonths(
  dateStr: string,
  months: number,
  dayOfMonth?: number,
): string {
  const source = new Date(`${dateStr}T12:00:00`);
  const totalMonths = source.getFullYear() * 12 + source.getMonth() + months;
  const year = Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const desired =
    dayOfMonth === -1 ? lastDay : (dayOfMonth ?? source.getDate());
  const day = Math.min(Math.max(1, desired), lastDay);
  return formatYmd(new Date(year, month, day, 12));
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  const d = new Date(year, month + 1, 0, 12);
  while (d.getDay() !== weekday) {
    d.setDate(d.getDate() - 1);
  }
  return formatYmd(d);
}

/**
 * Same week: next selected weekday after `base`.
 * After the week ends, skip `interval - 1` full weeks, then take the first selected weekday.
 */
export function nextWeeklyWeekdays(
  base: string,
  interval: number,
  weekdays: number[],
): string {
  const selected = new Set(weekdays);
  const weekStart = startOfWeek(base);
  const weekEnd = addDays(weekStart, 6);
  let cursor = addDays(base, 1);
  while (cursor <= weekEnd) {
    if (selected.has(weekdayFromDate(cursor))) return cursor;
    cursor = addDays(cursor, 1);
  }
  const nextWeekStart = addDays(weekStart, 7 * Math.max(1, interval));
  for (let i = 0; i < 7; i++) {
    const day = addDays(nextWeekStart, i);
    if (selected.has(weekdayFromDate(day))) return day;
  }
  return nextWeekStart;
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
        return {
          due_date: nextWeeklyWeekdays(base, interval, rule.weekdays),
          due_time,
        };
      }
      return { due_date: addDays(base, 7 * interval), due_time };
    }
    case "monthly": {
      const interval = rule.interval || 1;
      const dayOfMonth = rule.monthDay ?? Number(base.slice(8, 10));
      return {
        due_date: addCalendarMonths(base, interval, dayOfMonth),
        due_time,
      };
    }
    case "custom": {
      if (rule.nthWeekday) {
        const shifted = addCalendarMonths(base, rule.interval || 1);
        const cursor = new Date(`${shifted}T12:00:00`);
        if (rule.nthWeekday.n === -1) {
          return {
            due_date: lastWeekdayOfMonth(
              cursor.getFullYear(),
              cursor.getMonth(),
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
  const rule = parseRepeatRule(task.repeat_rule);
  let repeatRule = task.repeat_rule;
  if (rule?.frequency === "monthly" && rule.monthDay == null && task.due_date) {
    repeatRule = stringifyRepeatRule(monthlyRuleFromDate(task.due_date));
  }
  return {
    title: task.title,
    description: task.description,
    notes: task.notes,
    priority: task.priority,
    due_date: next.due_date,
    due_time: next.due_time,
    end_time: task.end_time,
    repeat_rule: repeatRule,
    remind_minutes: task.remind_minutes,
    reminder_minutes: [...task.reminder_minutes],
    estimated_minutes: task.estimated_minutes,
    project_id: task.project_id,
    blocked_by_id: task.blocked_by_id,
    completion_criteria: task.completion_criteria,
    energy_level: task.energy_level,
    flexible: task.flexible,
    schedule_locked: task.schedule_locked,
    goal_id: task.goal_id,
    goal_contribution: task.goal_contribution,
    generated_from_id: task.id,
  };
}

export function isRecyclableGeneratedTask(
  generated: Pick<
    Task,
    | "title"
    | "status"
    | "deleted_at"
    | "due_date"
    | "due_time"
    | "repeat_rule"
    | "actual_minutes"
    | "notes"
    | "description"
  >,
  source: Pick<Task, "title" | "notes" | "description" | "repeat_rule">,
  expectedDue: { due_date: string; due_time: string | null },
): boolean {
  if (generated.deleted_at) return false;
  if (generated.status === "completed" || generated.status === "cancelled") {
    return false;
  }
  if ((generated.actual_minutes ?? 0) > 0) return false;
  if (generated.title !== source.title) return false;
  if ((generated.notes ?? "") !== (source.notes ?? "")) return false;
  if ((generated.description ?? "") !== (source.description ?? "")) return false;
  if (generated.due_date !== expectedDue.due_date) return false;
  if ((generated.due_time ?? null) !== (expectedDue.due_time ?? null)) return false;
  return true;
}
