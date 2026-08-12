import type { RepeatRule, Task, TaskDraft } from "@/types";
import { todayDateString } from "@/lib/dates";

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

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return formatYmd(d);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  const d = new Date(year, month + 1, 0, 12);
  while (d.getDay() !== weekday) {
    d.setDate(d.getDate() - 1);
  }
  return formatYmd(d);
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
          due_date: formatYmd(last),
          due_time,
        };
      }
      if (rule.monthDay) {
        d.setDate(Math.min(rule.monthDay, 28));
      }
      return {
        due_date: formatYmd(d),
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
    schedule_locked: task.schedule_locked,
    goal_id: task.goal_id,
    goal_contribution: task.goal_contribution,
  };
}
