import { describe, expect, it } from "vitest";
import type { Task } from "@/types";
import { buildNativeReminderPlans } from "./nativeReminders";

const task = (patch: Partial<Task>): Task =>
  ({
    id: "task-1",
    title: "发布版本",
    status: "pending",
    due_date: "2026-07-30",
    due_time: "10:00",
    parent_id: null,
    deleted_at: null,
    remind_minutes: null,
    reminder_minutes: [60, 30],
    ...patch,
  }) as Task;

const now = new Date("2026-07-29T09:00:00").getTime();

describe("native reminder lifecycle", () => {
  it("removes completed and deleted tasks from the desired queue", () => {
    expect(buildNativeReminderPlans([task({ status: "completed" })], 30, now))
      .toEqual([]);
    expect(
      buildNativeReminderPlans(
        [task({ deleted_at: "2026-07-29T09:10:00.000Z" })],
        30,
        now,
      ),
    ).toEqual([]);
  });

  it("keeps all reminder offsets and changes identity after rescheduling", () => {
    const original = buildNativeReminderPlans([task({})], 30, now);
    const moved = buildNativeReminderPlans(
      [task({ due_time: "11:00" })],
      30,
      now,
    );
    expect(original).toHaveLength(2);
    expect(original.map((item) => item.reminderId)).not.toEqual(
      moved.map((item) => item.reminderId),
    );
  });
});
