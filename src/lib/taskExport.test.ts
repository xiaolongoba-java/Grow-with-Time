import { describe, expect, it } from "vitest";
import type { Task } from "@/types";
import { buildTaskExportCsv, taskExportRange, tasksInExportRange } from "./taskExport";

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
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
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
    completion_criteria: "",
    energy_level: "medium",
    flexible: 1,
    schedule_locked: 0,
    actual_minutes: 0,
    goal_id: null,
    goal_contribution: 1,
    generated_from_id: null,
    ...partial,
  };
}

describe("task export ranges", () => {
  it("uses Monday–Sunday for weekly export", () => {
    expect(taskExportRange("week", "2026-09-23")).toEqual({
      period: "week",
      start: "2026-09-21",
      end: "2026-09-27",
      label: "2026-09-21 ～ 2026-09-27",
    });
  });

  it("covers the calendar month and quarter", () => {
    expect(taskExportRange("month", "2026-09-23")).toMatchObject({
      start: "2026-09-01",
      end: "2026-09-30",
      label: "2026年9月",
    });
    expect(taskExportRange("quarter", "2026-09-23")).toMatchObject({
      start: "2026-07-01",
      end: "2026-09-30",
      label: "2026年Q3",
    });
  });

  it("includes due, my-day and completed tasks inside the range", () => {
    const range = taskExportRange("week", "2026-09-23");
    const rows = tasksInExportRange(
      [
        task({ id: "a", title: "due", due_date: "2026-09-22" }),
        task({ id: "b", title: "plan", my_day_date: "2026-09-24" }),
        task({ id: "c", title: "done", completed_at: "2026-09-25T08:00:00.000Z", status: "completed" }),
        task({ id: "d", title: "out", due_date: "2026-09-01" }),
        task({ id: "e", title: "child", parent_id: "a", due_date: "2026-09-22" }),
      ],
      range,
    );
    expect(rows.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("writes a csv with the period label", () => {
    const range = taskExportRange("month", "2026-09-23");
    const csv = buildTaskExportCsv(
      [task({ id: "a", title: "写周报", due_date: "2026-09-10" })],
      range,
      { a: ["t1"] },
      [{ id: "t1", name: "工作" }],
    );
    expect(csv).toContain("# 2026年9月");
    expect(csv).toContain("写周报");
    expect(csv).toContain("工作");
  });
});
