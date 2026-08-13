import { addDays } from "@/lib/dates";

/** Consecutive-day streak ending today or yesterday; otherwise 0. */
export function recomputeStreak(
  entryDates: string[],
  today: string,
): { streak: number; lastCompleteDate: string | null } {
  const unique = [...new Set(entryDates.filter(Boolean))].sort();
  if (!unique.length) return { streak: 0, lastCompleteDate: null };
  const lastCompleteDate = unique[unique.length - 1];
  const yesterday = addDays(today, -1);
  if (lastCompleteDate !== today && lastCompleteDate !== yesterday) {
    return { streak: 0, lastCompleteDate };
  }
  const set = new Set(unique);
  let streak = 0;
  let cursor = lastCompleteDate;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return { streak, lastCompleteDate };
}

export function mergeLegacyStreakDates(
  entryDates: string[],
  legacyStreak: number,
  legacyLastDate: string | null,
): string[] {
  const merged = [...entryDates];
  if (!legacyLastDate || legacyStreak <= 0) return merged;
  for (let offset = 0; offset < legacyStreak; offset += 1) {
    merged.push(addDays(legacyLastDate, -offset));
  }
  return merged;
}
