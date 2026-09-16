import type { Goal, GoalEntry, HabitCheck, Task } from "@/types";

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

export function activityCountLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

/**
 * Build a unit-neutral activity calendar. Goal values cannot be added together
 * (minutes, kilograms and counts are different units), so the overview counts
 * distinct actions instead. Linked task/habit entries are deduplicated against
 * their source records.
 */
export function buildGrowthActivityDays(
  tasks: Task[],
  habitChecks: HabitCheck[],
  entries: GoalEntry[],
): Map<string, number> {
  const days = new Map<string, number>();
  const sourceKeys = new Set<string>();
  const add = (date: string, sourceKey: string) => {
    if (!date || sourceKeys.has(sourceKey)) return;
    sourceKeys.add(sourceKey);
    days.set(date, (days.get(date) ?? 0) + 1);
  };

  for (const task of tasks) {
    if (task.parent_id || task.deleted_at || task.status !== "completed" || !task.completed_at) continue;
    const stamp = Date.parse(task.completed_at);
    if (!Number.isNaN(stamp)) add(localDateKey(new Date(stamp)), `task:${task.id}`);
  }
  for (const check of habitChecks) {
    add(check.check_date, `habit:${check.habit_id}:${check.check_date}`);
  }
  for (const entry of entries) {
    const sourceKey = entry.source_id
      ? `${entry.source_type}:${entry.source_id}`
      : `entry:${entry.id}`;
    add(entry.entry_date, sourceKey);
  }
  return days;
}

export function normalizeGoalContribution(goal: Goal, value: number): number {
  if (goal.goal_type === "quantity" && goal.target_value < goal.start_value) {
    return -Math.abs(value);
  }
  return value;
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
