import { describe, expect, it } from "vitest";
import { nextOccurrence, parseRepeatRule, stringifyRepeatRule } from "./repeat";
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
  });

  it("supports the last weekday of a month", () => {
    const result = nextOccurrence(
      task(
        '{"frequency":"custom","interval":1,"nthWeekday":{"n":-1,"weekday":5}}',
      ),
    );
    expect(result?.due_date).toBe("2026-08-28");
  });
});
