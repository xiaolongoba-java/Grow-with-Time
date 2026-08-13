import { describe, expect, it } from "vitest";
import {
  buildWeekBuckets,
  isTaskInWeek,
  mondayWeekDates,
  resolveCategoryId,
  shiftWeek,
} from "./weeklyChecklist";
import type { Tag, Task } from "@/types";

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    description: "",
    notes: "",
    priority: 3,
    status: "pending",
    due_date: null,
    due_time: null,
    end_time: null,
    sort_order: 0,
    energy_level: "medium",
    flexible: 1,
    schedule_locked: 0,
    completion_criteria: "",
    actual_minutes: 0,
    completed_at: null,
    deleted_at: null,
    parent_id: null,
    repeat_rule: null,
    remind_minutes: null,
    reminder_minutes: [],
    estimated_minutes: null,
    project_id: null,
    my_day_date: null,
    blocked_by_id: null,
    created_at: "2026-08-10T00:00:00.000Z",
    updated_at: "2026-08-10T00:00:00.000Z",
    goal_id: null,
    goal_contribution: 1,
    ...partial,
    generated_from_id: partial.generated_from_id ?? null,
  };
}

describe("weeklyChecklist", () => {
  it("builds monday-based week dates", () => {
    // 2026-08-12 is Wednesday
    expect(mondayWeekDates("2026-08-12")[0]).toBe("2026-08-10");
    expect(mondayWeekDates("2026-08-12")[6]).toBe("2026-08-16");
    expect(shiftWeek("2026-08-12", 1)).toBe("2026-08-17");
  });

  it("detects tasks by due_date / my_day / completed_at", () => {
    expect(
      isTaskInWeek(
        task({ id: "1", title: "a", due_date: "2026-08-11" }),
        "2026-08-10",
        "2026-08-16",
      ),
    ).toBe(true);
    expect(
      isTaskInWeek(
        task({ id: "2", title: "b", my_day_date: "2026-08-15" }),
        "2026-08-10",
        "2026-08-16",
      ),
    ).toBe(true);
    expect(
      isTaskInWeek(
        task({
          id: "3",
          title: "c",
          status: "completed",
          completed_at: "2026-08-14T08:00:00.000Z",
        }),
        "2026-08-10",
        "2026-08-16",
      ),
    ).toBe(true);
    expect(
      isTaskInWeek(
        task({ id: "4", title: "d", due_date: "2026-08-01" }),
        "2026-08-10",
        "2026-08-16",
      ),
    ).toBe(false);
  });

  it("resolves category from tag aliases", () => {
    const tags: Tag[] = [
      { id: "t1", name: "工作", color: "#f00", created_at: "" },
      { id: "t2", name: "health", color: "#0f0", created_at: "" },
    ];
    expect(resolveCategoryId("a", { a: ["t1"] }, tags)).toBe("work");
    expect(resolveCategoryId("b", { b: ["t2"] }, tags)).toBe("health");
    expect(resolveCategoryId("c", { c: [] }, tags)).toBe("other");
  });

  it("aggregates week buckets and stats", () => {
    const tags: Tag[] = [
      { id: "tw", name: "工作", color: "#f00", created_at: "" },
    ];
    const week = mondayWeekDates("2026-08-12");
    const { categories, stats } = buildWeekBuckets(
      [
        task({ id: "1", title: "写周报", due_date: "2026-08-11" }),
        task({
          id: "2",
          title: "开会",
          due_date: "2026-08-11",
          status: "completed",
          completed_at: "2026-08-11T10:00:00.000Z",
        }),
        task({ id: "3", title: "跑步", due_date: "2026-08-12" }),
      ],
      week,
      { "1": ["tw"], "2": ["tw"] },
      tags,
    );
    const work = categories.find((item) => item.category.id === "work")!;
    expect(work.total).toBe(2);
    expect(work.done).toBe(1);
    expect(stats.total).toBe(3);
    expect(stats.done).toBe(1);
  });
});
