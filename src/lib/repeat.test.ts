import { describe, expect, it } from "vitest";
import {
  nextOccurrence,
  nextRepeatTaskDraft,
  parseRepeatRule,
  stringifyRepeatRule,
} from "./repeat";
import type { Task } from "@/types";

const task = (repeat_rule: string, due_date = "2026-07-28") =>
  ({
    id: "task",
    title: "test",
    due_date,
    due_time: "09:00",
    repeat_rule,
  }) as Task;

describe("repeat rules", () => {
  it("round trips a rule", () => {
    const rule = { frequency: "daily" as const, interval: 2 };
    expect(parseRepeatRule(stringifyRepeatRule(rule))).toEqual(rule);
  });

  it("calculates daily and weekly occurrences", () => {
    expect(
      nextOccurrence(task('{"frequency":"daily","interval":2}'))?.due_date,
    ).toBe("2026-07-30");
    expect(
      nextOccurrence(task('{"frequency":"weekly","interval":1}'))?.due_date,
    ).toBe("2026-08-04");
    expect(
      nextOccurrence(
        task('{"frequency":"weekly","interval":1,"weekdays":[3]}', "2026-08-12"),
      )?.due_date,
    ).toBe("2026-08-19");
  });

  it("supports the last weekday of a month", () => {
    const result = nextOccurrence(
      task(
        '{"frequency":"custom","interval":1,"nthWeekday":{"n":-1,"weekday":5}}',
      ),
    );
    expect(result?.due_date).toBe("2026-08-28");
  });

  it("preserves planning fields for the next repeated task", () => {
    const source = {
      ...task('{"frequency":"daily","interval":1}'),
      description: "details",
      notes: "notes",
      priority: 1,
      end_time: "10:00",
      remind_minutes: 10,
      reminder_minutes: [60, 30, 10],
      estimated_minutes: 45,
      project_id: "project-1",
      blocked_by_id: "blocker-1",
      completion_criteria: "reviewed",
      energy_level: "high",
      flexible: 0,
      goal_id: "goal-1",
      goal_contribution: 2,
    } as Task;
    expect(nextRepeatTaskDraft(source)).toMatchObject({
      due_date: "2026-07-29",
      reminder_minutes: [60, 30, 10],
      estimated_minutes: 45,
      project_id: "project-1",
      blocked_by_id: "blocker-1",
      completion_criteria: "reviewed",
      energy_level: "high",
      flexible: 0,
      goal_id: "goal-1",
      goal_contribution: 2,
    });
  });
});
