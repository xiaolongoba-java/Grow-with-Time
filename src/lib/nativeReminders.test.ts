import { describe, expect, it } from "vitest";
import type { Task } from "@/types";
import {
  buildMissedReminderPlans,
  buildNativeReminderPlans,
} from "./nativeReminders";

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

  it("removes every previously scheduled reminder after completion", () => {
    const before = buildNativeReminderPlans([task({})], 30, now);
    const after = buildNativeReminderPlans(
      [task({ status: "completed", completed_at: "2026-07-29T09:30:00.000Z" })],
      30,
      now,
    );
    expect(before.map((item) => item.reminderId)).toHaveLength(2);
    expect(after).toEqual([]);
  });

  it("replaces old reminder identities when date or time changes", () => {
    const before = buildNativeReminderPlans([task({})], 30, now);
    const after = buildNativeReminderPlans(
      [task({ due_date: "2026-07-31", due_time: "08:30" })],
      30,
      now,
    );
    const beforeIds = new Set(before.map((item) => item.reminderId));
    expect(after.every((item) => !beforeIds.has(item.reminderId))).toBe(true);
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

  it("recovers only reminders missed while the app was closed", () => {
    const closedAt = new Date("2026-07-30T09:20:00").getTime();
    const reopenedAt = new Date("2026-07-30T09:35:00").getTime();
    const plans = buildMissedReminderPlans(
      [task({ reminder_minutes: [30] })],
      30,
      closedAt,
      reopenedAt,
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].showSystemNotification).toBe(true);
  });

  it("keeps older missed reminders in the center without a system popup", () => {
    const closedAt = new Date("2026-07-30T08:00:00").getTime();
    const reopenedAt = new Date("2026-07-30T09:45:01").getTime();
    const plans = buildMissedReminderPlans(
      [task({ reminder_minutes: [60] })],
      30,
      closedAt,
      reopenedAt,
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].showSystemNotification).toBe(false);
  });

  it("does not recover completed tasks", () => {
    expect(
      buildMissedReminderPlans(
        [task({ status: "completed", reminder_minutes: [30] })],
        30,
        new Date("2026-07-30T09:00:00").getTime(),
        new Date("2026-07-30T09:45:00").getTime(),
      ),
    ).toEqual([]);
  });
});
