import type { Anniversary } from "@/types";
import { todayDateString } from "@/lib/dates";

function parseYmd(date: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function formatYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Clamp month/day into a valid date for the given year (Feb 29 → Feb 28). */
export function occurrenceInYear(
  year: number,
  month: number,
  day: number,
): string {
  let d = day;
  if (month === 2 && day === 29 && !isLeapYear(year)) d = 28;
  const maxDay = new Date(year, month, 0).getDate();
  d = Math.min(d, maxDay);
  return formatYmd(year, month, d);
}

export function nextAnniversaryDate(
  eventDate: string,
  recurYearly: boolean,
  today = todayDateString(),
): string | null {
  const parsed = parseYmd(eventDate);
  if (!parsed) return null;
  if (!recurYearly) {
    return eventDate >= today ? eventDate : null;
  }
  const thisYear = occurrenceInYear(
    Number(today.slice(0, 4)),
    parsed.m,
    parsed.d,
  );
  if (thisYear >= today) return thisYear;
  return occurrenceInYear(Number(today.slice(0, 4)) + 1, parsed.m, parsed.d);
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function yearsElapsed(
  eventDate: string,
  today = todayDateString(),
): number {
  const parsed = parseYmd(eventDate);
  if (!parsed) return 0;
  const todayY = Number(today.slice(0, 4));
  let years = todayY - parsed.y;
  const anniversaryThisYear = occurrenceInYear(todayY, parsed.m, parsed.d);
  if (today < anniversaryThisYear) years -= 1;
  return Math.max(0, years);
}

export function anniversaryHeadline(
  item: Pick<Anniversary, "event_date" | "recur_yearly">,
  today = todayDateString(),
): { nextDate: string | null; daysLeft: number | null; years: number; label: string } {
  const recur = item.recur_yearly === 1;
  const nextDate = nextAnniversaryDate(item.event_date, recur, today);
  const years = yearsElapsed(item.event_date, today);

  if (!nextDate) {
    const ago = daysBetween(item.event_date, today);
    return {
      nextDate: null,
      daysLeft: null,
      years,
      label: ago <= 0 ? "就是今天" : `已过 ${ago} 天`,
    };
  }

  const daysLeft = daysBetween(today, nextDate);
  if (daysLeft === 0) {
    return {
      nextDate,
      daysLeft: 0,
      years,
      label: recur && years > 0 ? `今天 · 第 ${years} 年` : "就是今天",
    };
  }
  if (recur && years >= 0 && item.event_date < today) {
    return {
      nextDate,
      daysLeft,
      years,
      label: `还有 ${daysLeft} 天 · 第 ${years + 1} 年将近`,
    };
  }
  return {
    nextDate,
    daysLeft,
    years,
    label: `还有 ${daysLeft} 天`,
  };
}

export function sortAnniversaries(
  items: Anniversary[],
  today = todayDateString(),
): Anniversary[] {
  return [...items].sort((a, b) => {
    const ha = anniversaryHeadline(a, today);
    const hb = anniversaryHeadline(b, today);
    const da = ha.daysLeft ?? Number.POSITIVE_INFINITY;
    const db = hb.daysLeft ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.title.localeCompare(b.title, "zh");
  });
}
