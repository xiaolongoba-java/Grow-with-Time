import type { Goal, GoalEntry } from "@/types";

export function calculateGoalProgress(goal: Goal): number {
  const ascending = goal.target_value >= goal.start_value;
  const span = Math.max(0.0001, Math.abs(goal.target_value - goal.start_value));
  const moved = ascending
    ? goal.current_value - goal.start_value
    : goal.start_value - goal.current_value;
  return Math.max(0, Math.min(100, (moved / span) * 100));
}

export function activityLevel(entries: GoalEntry[]): 0 | 1 | 2 | 3 | 4 {
  const value = entries.reduce((sum, entry) => sum + Math.abs(Number(entry.value)), 0);
  if (value <= 0) return 0;
  if (value < 2) return 1;
  if (value < 5) return 2;
  if (value < 10) return 3;
  return 4;
}

export function longestDateStreak(dateKeys: string[]): number {
  const unique = [...new Set(dateKeys)].sort();
  let longest = 0;
  let current = 0;
  let previous: Date | null = null;
  for (const key of unique) {
    const date = new Date(`${key}T00:00:00`);
    current =
      previous && (date.getTime() - previous.getTime()) / 86400000 === 1
        ? current + 1
        : 1;
    longest = Math.max(longest, current);
    previous = date;
  }
  return longest;
}
