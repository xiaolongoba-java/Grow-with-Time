const DB_URL = "sqlite:app.db";

export function todayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Current local time as HH:mm (minutes floored to :00/:15/:30/:45). */
export function nowTimeString(roundToQuarter = true): string {
  const now = new Date();
  let h = now.getHours();
  let m = now.getMinutes();
  if (roundToQuarter) {
    m = Math.floor(m / 15) * 15;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseTimeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Add minutes to HH:mm, clamped to same day 23:45. */
export function addMinutesToTime(time: string, delta: number): string {
  const base = parseTimeToMinutes(time) ?? 0;
  const next = Math.min(23 * 60 + 45, Math.max(0, base + delta));
  const h = Math.floor(next / 60);
  const m = Math.floor((next % 60) / 15) * 15;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Ensure end is after start; default span 60 minutes. */
export function ensureEndAfterStart(start: string, end: string | null | undefined): string {
  const startMin = parseTimeToMinutes(start) ?? 0;
  const endMin = parseTimeToMinutes(end);
  if (endMin === null || endMin <= startMin) {
    return addMinutesToTime(start, 60);
  }
  return end!;
}

export function formatTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start && !end) return "全天";
  if (start && end) return `${start}–${end}`;
  if (start) return start;
  return end ?? "全天";
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(): string {
  return crypto.randomUUID();
}

export function isOverdue(task: {
  status: string;
  due_date: string | null;
}): boolean {
  if (task.status === "completed" || !task.due_date) {
    return false;
  }
  return task.due_date < todayDateString();
}

export function formatDueDate(date: string | null): string {
  if (!date) {
    return "无日期";
  }

  const today = todayDateString();
  if (date === today) {
    return "今天";
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  if (date === tomorrowStr) {
    return "明天";
  }

  const [year, month, day] = date.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

export function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(date: string, n: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + n);
  return toDateString(d);
}

export function startOfWeek(date: string): string {
  const d = parseDate(date);
  d.setDate(d.getDate() - d.getDay());
  return toDateString(d);
}

export function formatLongDate(date: string): string {
  const d = parseDate(date);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function weekDates(anchor: string): string[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function priorityLabel(priority: number): string {
  switch (priority) {
    case 1:
      return "P1";
    case 2:
      return "P2";
    case 3:
      return "P3";
    case 4:
      return "P4";
    default:
      return "P3";
  }
}

export { DB_URL };
