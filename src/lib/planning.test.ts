import { describe, expect, it } from "vitest";
import {
  findTimeConflictIds,
  parseReminderMinutes,
  pendingEstimatedMinutes,
  suggestDaySchedule,
} from "./planning";
import type { Task } from "@/types";

const task = (patch: Partial<Task>): Task =>
  ({
    id: crypto.randomUUID(),
    status: "pending",
    due_time: null,
    end_time: null,
    estimated_minutes: null,
    ...patch,
  }) as Task;

describe("planning helpers", () => {
  it("normalizes multiple reminder values", () => {
    expect(parseReminderMinutes("10, 30，10 60")).toEqual([60, 30, 10]);
  });

  it("sums pending estimates only", () => {
    expect(
      pendingEstimatedMinutes([
        task({ estimated_minutes: 30 }),
        task({ estimated_minutes: 45 }),
        task({ status: "completed", estimated_minutes: 90 }),
      ]),
    ).toBe(75);
  });

  it("finds overlapping tasks but not adjacent tasks", () => {
    const first = task({ id: "a", due_time: "09:00", end_time: "10:00" });
    const overlap = task({ id: "b", due_time: "09:30", end_time: "10:30" });
    const adjacent = task({ id: "c", due_time: "10:30", end_time: "11:00" });
    expect([...findTimeConflictIds([first, overlap, adjacent])].sort()).toEqual([
      "a",
      "b",
    ]);
  });

  it("schedules flexible tasks around fixed events", () => {
    const fixed = task({
      id: "fixed",
      flexible: 0,
      due_time: "09:30",
      end_time: "10:30",
    });
    const flexible = task({
      id: "flex",
      flexible: 1,
      estimated_minutes: 60,
      priority: 1,
      energy_level: "high",
    });
    expect(suggestDaySchedule([fixed, flexible], 9 * 60, 12 * 60)).toEqual([
      { taskId: "flex", start: "10:30", end: "11:30" },
    ]);
  });
});
