import { describe, expect, it } from "vitest";
import type { Goal, GoalEntry } from "@/types";
import { activityLevel, calculateGoalProgress, longestDateStreak } from "./growth";

const goal = (start: number, current: number, target: number) =>
  ({ start_value: start, current_value: current, target_value: target }) as Goal;

describe("growth metrics", () => {
  it("calculates ascending and descending goal progress", () => {
    expect(calculateGoalProgress(goal(0, 6, 24))).toBe(25);
    expect(calculateGoalProgress(goal(80, 75, 70))).toBe(50);
    expect(calculateGoalProgress(goal(80, 68, 70))).toBe(100);
  });

  it("groups activity into bounded heat levels", () => {
    const entry = (value: number) => ({ value }) as GoalEntry;
    expect(activityLevel([])).toBe(0);
    expect(activityLevel([entry(1)])).toBe(1);
    expect(activityLevel([entry(3)])).toBe(2);
    expect(activityLevel([entry(7)])).toBe(3);
    expect(activityLevel([entry(15)])).toBe(4);
  });

  it("finds the longest streak without double-counting dates", () => {
    expect(longestDateStreak(["2026-08-01", "2026-08-02", "2026-08-02", "2026-08-04"])).toBe(2);
  });
});
