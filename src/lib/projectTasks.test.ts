import { describe, expect, it } from "vitest";
import type { Task } from "@/types";
import { projectTasks } from "./tasks";

function task(overrides: Partial<Task>): Task {
  return {
    id: "task",
    title: "任务",
    description: "",
    notes: "",
    priority: 3,
    status: "pending",
    due_date: null,
    due_time: null,
    end_time: null,
    sort_order: 0,
    created_at: "2026-09-03T00:00:00.000Z",
    updated_at: "2026-09-03T00:00:00.000Z",
    completed_at: null,
    deleted_at: null,
    parent_id: null,
    repeat_rule: null,
    remind_minutes: null,
    reminder_minutes: [],
    estimated_minutes: null,
    project_id: "project-1",
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
    ...overrides,
  };
}

describe("projectTasks", () => {
  it("keeps finite project tasks and hides recurring tasks and their occurrences", () => {
    const finite = task({ id: "finite" });
    const recurring = task({ id: "recurring", repeat_rule: '{"frequency":"daily","interval":1}' });
    const generated = task({ id: "generated", repeat_rule: recurring.repeat_rule, generated_from_id: recurring.id });
    expect(projectTasks([finite, recurring, generated], "project-1")).toEqual([finite]);
  });

  it("excludes deleted tasks, subtasks, and tasks from other projects", () => {
    const visible = task({ id: "visible" });
    const deleted = task({ id: "deleted", deleted_at: "2026-09-03T01:00:00.000Z" });
    const child = task({ id: "child", parent_id: visible.id });
    const other = task({ id: "other", project_id: "project-2" });
    expect(projectTasks([visible, deleted, child, other], "project-1")).toEqual([visible]);
  });
});
