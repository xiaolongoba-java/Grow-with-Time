import { Lunar, LunarYear, Solar } from "lunar-typescript";
import type { Anniversary } from "@/types";
import { todayDateString } from "@/lib/dates";

export const LUNAR_MONTH_LABELS = [
  "正月",
  "二月",
  "三月",
  "四月",
  "五月",
  "六月",
  "七月",
  "八月",
  "九月",
  "十月",
  "冬月",
  "腊月",
] as const;

export const LUNAR_DAY_LABELS = [
  "初一",
  "初二",
  "初三",
  "初四",
  "初五",
  "初六",
  "初七",
  "初八",
  "初九",
  "初十",
  "十一",
  "十二",
  "十三",
  "十四",
  "十五",
  "十六",
  "十七",
  "十八",
  "十九",
  "二十",
  "廿一",
  "廿二",
  "廿三",
  "廿四",
  "廿五",
  "廿六",
  "廿七",
  "廿八",
  "廿九",
  "三十",
] as const;

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

export function solarToLunarParts(solarYmd: string): {
  year: number;
  month: number;
  day: number;
  leap: boolean;
  label: string;
} | null {
  const parsed = parseYmd(solarYmd);
  if (!parsed) return null;
  const lunar = Solar.fromYmd(parsed.y, parsed.m, parsed.d).getLunar();
  const month = Math.abs(lunar.getMonth());
  const leap = lunar.getMonth() < 0;
  return {
    year: lunar.getYear(),
    month,
    day: lunar.getDay(),
    leap,
    label: `农历${leap ? "闰" : ""}${LUNAR_MONTH_LABELS[month - 1]}${LUNAR_DAY_LABELS[lunar.getDay() - 1]}`,
  };
}

export function leapMonthOfLunarYear(year: number): number {
  try {
    return LunarYear.fromYear(year).getLeapMonth();
  } catch {
    return 0;
  }
}

/** Convert lunar Y/M/D to solar YYYY-MM-DD; fall back when leap/short month missing. */
export function lunarToSolarYmd(
  year: number,
  month: number,
  day: number,
  leap = false,
): string | null {
  const tryConvert = (m: number, d: number) => {
    try {
      return Lunar.fromYmd(year, m, d).getSolar().toYmd();
    } catch {
      return null;
    }
  };
  const signed = leap ? -Math.abs(month) : Math.abs(month);
  const direct = tryConvert(signed, day);
  if (direct) return direct;
  if (leap) {
    const nonLeap = tryConvert(Math.abs(month), day);
    if (nonLeap) return nonLeap;
  }
  if (day > 29) {
    const shorter = tryConvert(signed, day - 1);
    if (shorter) return shorter;
    if (leap) return tryConvert(Math.abs(month), day - 1);
  }
  return null;
}

export type AnniversaryLike = Pick<Anniversary, "event_date" | "recur_yearly"> &
  Partial<Pick<Anniversary, "calendar" | "lunar_month" | "lunar_day" | "lunar_leap">>;

function isLunar(item: AnniversaryLike): boolean {
  return (
    item.calendar === "lunar" &&
    item.lunar_month != null &&
    item.lunar_day != null
  );
}

export function nextAnniversaryDate(
  eventDateOrItem: string | AnniversaryLike,
  recurYearly?: boolean,
  today = todayDateString(),
): string | null {
  if (typeof eventDateOrItem === "string") {
    const parsed = parseYmd(eventDateOrItem);
    if (!parsed) return null;
    const recur = recurYearly !== false;
    if (!recur) {
      return eventDateOrItem >= today ? eventDateOrItem : null;
    }
    const thisYear = occurrenceInYear(
      Number(today.slice(0, 4)),
      parsed.m,
      parsed.d,
    );
    if (thisYear >= today) return thisYear;
    return occurrenceInYear(Number(today.slice(0, 4)) + 1, parsed.m, parsed.d);
  }

  const item = eventDateOrItem;
  const recur = item.recur_yearly === 1;
  if (!recur) {
    return item.event_date >= today ? item.event_date : null;
  }

  if (!isLunar(item)) {
    return nextAnniversaryDate(item.event_date, true, today);
  }

  const month = item.lunar_month!;
  const day = item.lunar_day!;
  const leap = item.lunar_leap === 1;
  const todayLunarYear = Solar.fromYmd(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)),
    Number(today.slice(8, 10)),
  )
    .getLunar()
    .getYear();

  for (let year = todayLunarYear; year <= todayLunarYear + 3; year += 1) {
    const solar = lunarToSolarYmd(year, month, day, leap);
    if (solar && solar >= today) return solar;
  }
  return null;
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function yearsElapsed(
  eventDateOrItem: string | AnniversaryLike,
  today = todayDateString(),
): number {
  if (typeof eventDateOrItem === "string") {
    const parsed = parseYmd(eventDateOrItem);
    if (!parsed) return 0;
    const todayY = Number(today.slice(0, 4));
    let years = todayY - parsed.y;
    const anniversaryThisYear = occurrenceInYear(todayY, parsed.m, parsed.d);
    if (today < anniversaryThisYear) years -= 1;
    return Math.max(0, years);
  }

  const item = eventDateOrItem;
  if (!isLunar(item)) {
    return yearsElapsed(item.event_date, today);
  }

  const origin = solarToLunarParts(item.event_date);
  if (!origin) return 0;
  const todayLunar = Solar.fromYmd(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)),
    Number(today.slice(8, 10)),
  ).getLunar();
  let years = todayLunar.getYear() - origin.year;
  const thisYearSolar = lunarToSolarYmd(
    todayLunar.getYear(),
    item.lunar_month!,
    item.lunar_day!,
    item.lunar_leap === 1,
  );
  if (thisYearSolar && today < thisYearSolar) years -= 1;
  return Math.max(0, years);
}

export function formatAnniversaryAnchor(item: AnniversaryLike): string {
  if (isLunar(item)) {
    const month = item.lunar_month!;
    const day = item.lunar_day!;
    const leap = item.lunar_leap === 1;
    return `农历${leap ? "闰" : ""}${LUNAR_MONTH_LABELS[month - 1] ?? `${month}月`}${LUNAR_DAY_LABELS[day - 1] ?? `${day}日`}`;
  }
  return `公历 ${item.event_date}`;
}

export function anniversaryHeadline(
  item: AnniversaryLike,
  today = todayDateString(),
): { nextDate: string | null; daysLeft: number | null; years: number; label: string } {
  const recur = item.recur_yearly === 1;
  const nextDate = nextAnniversaryDate(item, undefined, today);
  const years = yearsElapsed(item, today);

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

/** Upcoming anniversaries within N days, already sorted soonest-first. */
export function listUpcomingAnniversaries(
  items: Anniversary[],
  today = todayDateString(),
  withinDays = 30,
  limit = 4,
): Array<{ item: Anniversary; daysLeft: number; label: string; nextDate: string }> {
  return sortAnniversaries(items, today)
    .map((item) => {
      const head = anniversaryHeadline(item, today);
      if (head.daysLeft === null || head.nextDate === null) return null;
      if (head.daysLeft > withinDays) return null;
      return {
        item,
        daysLeft: head.daysLeft,
        label: head.label,
        nextDate: head.nextDate,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .slice(0, limit);
}

/** Solar YYYY-MM-DD keys for anniversary occurrences falling in a month. */
export function anniversaryDatesInMonth(
  items: Anniversary[],
  year: number,
  monthIndex: number,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const start = formatYmd(year, monthIndex + 1, 1);
  const endDay = new Date(year, monthIndex + 1, 0).getDate();
  const end = formatYmd(year, monthIndex + 1, endDay);

  const add = (date: string, title: string) => {
    if (date < start || date > end) return;
    const titles = map.get(date) ?? [];
    if (!titles.includes(title)) titles.push(title);
    map.set(date, titles);
  };

  for (const item of items) {
    const lunar =
      item.calendar === "lunar" &&
      item.lunar_month != null &&
      item.lunar_day != null;

    if (!item.recur_yearly) {
      add(item.event_date, item.title);
      continue;
    }

    if (!lunar) {
      const parsed = parseYmd(item.event_date);
      if (!parsed) continue;
      add(occurrenceInYear(year, parsed.m, parsed.d), item.title);
      continue;
    }

    for (const lunarYear of [year - 1, year, year + 1]) {
      const solar = lunarToSolarYmd(
        lunarYear,
        item.lunar_month!,
        item.lunar_day!,
        item.lunar_leap === 1,
      );
      if (solar) add(solar, item.title);
    }
  }
  return map;
}

export function normalizeAnniversaryRow(
  row: Anniversary & Partial<Anniversary>,
): Anniversary {
  const calendar = row.calendar === "lunar" ? "lunar" : "solar";
  return {
    ...row,
    calendar,
    lunar_month: row.lunar_month ?? null,
    lunar_day: row.lunar_day ?? null,
    lunar_leap: row.lunar_leap ? 1 : 0,
  };
}
