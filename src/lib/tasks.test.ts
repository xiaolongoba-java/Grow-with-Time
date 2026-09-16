import { describe, expect, it } from "vitest";
import { filterTasksByStatus, filterTasksByView, isInboxTask } from "./tasks";
import type { Task } from "@/types";

function task(id: string, dueDate: string | null, status: Task["status"] = "pending") {
  return {
    id,
    title: id,
    due_date: dueDate,
    status,
    parent_id: null,
    deleted_at: null,
    sort_order: 0,
    updated_at: "2026-09-10T00:00:00.000Z",
    completed_at: null,
  } as Task;
}

describe("task view semantics", () => {
  it("treats inbox as the complete unfinished lifecycle queue", () => {
    const result = filterTasksByView([
      task("scheduled", "2026-09-12"),
      task("unscheduled", null),
      task("completed", "2026-09-10", "completed"),
    ], "inbox");
    expect(result.map((item) => item.id)).toEqual(["scheduled", "unscheduled"]);
  });

  it("keeps the next generated repeat dormant until its due date", () => {
    const generated = {
      ...task("repeat-next", "2026-09-30"),
      repeat_rule: '{"frequency":"weekly","interval":1}',
      generated_from_id: "repeat-previous",
    };
    expect(isInboxTask(generated, "2026-09-10")).toBe(false);
    expect(isInboxTask(generated, "2026-09-30")).toBe(true);
    expect(isInboxTask(task("normal-future", "2026-09-30"), "2026-09-10")).toBe(true);
  });

  it("filters the unified all-task collection by lifecycle status", () => {
    const tasks = [
      task("pending", null),
      task("working", null, "in_progress"),
      task("done", null, "completed"),
      task("cancelled", null, "cancelled"),
    ];

    expect(filterTasksByStatus(tasks, "all").map((item) => item.id)).toEqual([
      "pending",
      "working",
      "done",
      "cancelled",
    ]);
    expect(filterTasksByStatus(tasks, "active").map((item) => item.id)).toEqual([
      "pending",
      "working",
    ]);
    expect(filterTasksByStatus(tasks, "completed").map((item) => item.id)).toEqual([
      "done",
    ]);
  });
});
