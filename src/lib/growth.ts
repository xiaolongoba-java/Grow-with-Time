import type { Goal, GoalEntry } from "@/types";

export function goalAcceptsSource(
  goal: Goal,
  source: GoalEntry["source_type"],
): boolean {
  if (goal.status !== "active") return false;
  if (source === "manual") return goal.goal_type !== "project";
  if (goal.goal_type === "quantity" || goal.goal_type === "frequency") {
    return source === "task" || source === "habit";
  }
  if (goal.goal_type === "time") return source === "focus";
  // Custom goals have no unambiguous automatic unit. Keep them manual-only so
  // completing and focusing the same task can never count twice.
  if (goal.goal_type === "custom") return false;
  return false;
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function localWeekStartKey(date = new Date()): string {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  return localDateKey(start);
}

export function calculateGoalProgress(goal: Goal): number {
  if (goal.goal_type === "frequency" && goal.weekly_target > 0) {
    return Math.max(0, Math.min(100, (goal.current_value / goal.weekly_target) * 100));
  }
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

export function currentDateStreak(
  dateKeys: string[],
  todayKey: string,
): number {
  const dates = new Set(dateKeys);
  const cursor = new Date(`${todayKey}T12:00:00`);
  if (!dates.has(todayKey)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (dates.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
