import { describe, expect, it } from "vitest";
import type { Task } from "@/types";
import {
  buildMorningPlan,
  buildTodayPlanPicker,
  listProjectMorningTasks,
  listRepeatingMorningTasks,
} from "./morningPlan";

const task = (patch: Partial<Task>): Task =>
  ({
    id: patch.id ?? crypto.randomUUID(),
    title: "任务",
    status: "pending",
    priority: 3,
    due_date: null,
    my_day_date: null,
    parent_id: null,
    deleted_at: null,
    project_id: null,
    repeat_rule: null,
    ...patch,
  }) as Task;

describe("buildMorningPlan", () => {
  it("preselects carryover, overdue and due-today tasks", () => {
    const plan = buildMorningPlan(
      [
        task({ id: "a", title: "昨天留下", my_day_date: "2026-08-17" }),
        task({ id: "g", title: "更早留下", my_day_date: "2026-08-10" }),
        task({ id: "b", title: "逾期", due_date: "2026-08-16" }),
        task({ id: "c", title: "今天到期", due_date: "2026-08-18" }),
        task({ id: "d", title: "待办箱紧急", due_date: null, priority: 1 }),
        task({ id: "e", title: "已在今天", my_day_date: "2026-08-18" }),
        task({ id: "f", title: "明天", due_date: "2026-08-19" }),
      ],
      "2026-08-18",
    );
    expect(plan.map((item) => item.id).sort()).toEqual(["a", "b", "c", "d", "g"]);
    expect(plan.filter((item) => item.reason === "carryover").map((item) => item.id).sort()).toEqual([
      "a",
      "g",
    ]);
    expect(plan.find((item) => item.id === "a")?.selectedByDefault).toBe(true);
    expect(plan.find((item) => item.id === "d")?.selectedByDefault).toBe(false);
  });

  it("includes remaining project, repeating and inbox tasks for the today picker", () => {
    const daily = JSON.stringify({ frequency: "daily", interval: 1 });
    const items = buildTodayPlanPicker(
      [
        task({ id: "p3", title: "普通待办", priority: 3 }),
        task({ id: "r1", title: "晨跑", repeat_rule: daily, due_date: "2026-08-20" }),
        task({ id: "p1", title: "写方案", project_id: "work", due_date: "2026-08-20" }),
        task({ id: "in", title: "已在今天", my_day_date: "2026-08-18" }),
      ],
      "2026-08-18",
    );
    expect(items.map((item) => item.id).sort()).toEqual(["p1", "p3", "r1"]);
  });

  it("skips completed and child tasks", () => {
    const plan = buildMorningPlan(
      [
        task({ id: "done", due_date: "2026-08-18", status: "completed" }),
        task({ id: "child", due_date: "2026-08-18", parent_id: "done" }),
      ],
      "2026-08-18",
    );
    expect(plan).toEqual([]);
  });
});

describe("morning pick lists", () => {
  const daily = JSON.stringify({ frequency: "daily", interval: 1 });

  it("lists repeating tasks that are not already in today", () => {
    const items = listRepeatingMorningTasks(
      [
        task({ id: "r1", title: "晨跑", repeat_rule: daily, due_date: "2026-08-20" }),
        task({ id: "r2", title: "已排今天", repeat_rule: daily, my_day_date: "2026-08-18" }),
        task({ id: "plain", title: "普通" }),
      ],
      "2026-08-18",
    );
    expect(items.map((item) => item.id)).toEqual(["r1"]);
    expect(items[0]?.reason).toBe("repeating");
    expect(items[0]?.selectedByDefault).toBe(false);
  });

  it("lists a project's remaining tasks", () => {
    const items = listProjectMorningTasks(
      [
        task({ id: "p1", title: "写方案", project_id: "work", due_date: "2026-08-20" }),
        task({ id: "p2", title: "别的项目", project_id: "home" }),
        task({ id: "p3", title: "已在今天", project_id: "work", my_day_date: "2026-08-18" }),
      ],
      "2026-08-18",
      "work",
    );
    expect(items.map((item) => item.id)).toEqual(["p1"]);
    expect(items[0]?.reason).toBe("project");
  });
});
