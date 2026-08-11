import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  backupPayloadHas,
  summarizeBackupRestore,
  validateBackupPayload,
} from "./backup";
import type { BackupPayload } from "@/types";

function minimalPayload(
  overrides: Partial<BackupPayload> = {},
): BackupPayload {
  return {
    version: 6,
    exportedAt: "2026-08-11T00:00:00.000Z",
    tasks: [],
    tags: [],
    taskTags: [],
    attachments: [],
    smartLists: [],
    habits: [],
    habitChecks: [],
    settings: {},
    ...overrides,
  };
}

describe("backup coverage", () => {
  it("exports and imports deep-planning records", () => {
    const source = readFileSync("src/lib/db.ts", "utf8");
    for (const table of [
      "task_events",
      "focus_sessions",
      "day_snapshots",
      "milestones",
      "goals",
      "goal_entries",
      "goal_milestones",
      "achievements",
      "timers",
      "daily_reflections",
      "inspirations",
      "future_letters",
    ]) {
      expect(source).toContain(`SELECT * FROM ${table}`);
      expect(source).toContain(`INSERT INTO ${table}`);
    }
    expect(source).toContain("reminder_minutes_json");
    expect(source).toContain("completion_criteria");
    expect(source).toContain("actual_minutes");
    expect(source).toContain("goal_contribution");
    expect(source).toContain("task.flexible ?? 1");
    expect(source).toContain("schedule_locked");
    expect(source).toContain("version: 6");
    expect(source).toContain("payload.dailyReflections");
    expect(source).toContain("payload.inspirations");
    expect(source).toContain("payload.futureLetters");
    expect(source).toContain("saveTaskPlanningMetadata(task)");
    expect(source).not.toContain("saveTaskPlanningMetadata(mapTask(task))");
    expect(source).toContain("BEGIN IMMEDIATE");
    expect(source).toContain("ROLLBACK");
    expect(source).toContain("summarizeBackupRestore");
    expect(source).toContain("backupPayloadHas");
    expect(source).toContain("validateBackupPayload");
  });
});

describe("backup pure helpers", () => {
  it("detects own keys for merge semantics", () => {
    const payload = minimalPayload();
    expect(backupPayloadHas(payload, "tasks")).toBe(true);
    expect(backupPayloadHas(payload, "goals")).toBe(false);
    expect(backupPayloadHas(payload, "timers")).toBe(false);
  });

  it("validates required fields and version", () => {
    expect(validateBackupPayload(minimalPayload()).version).toBe(6);
    expect(() => validateBackupPayload(null)).toThrow(/无效/);
    expect(() =>
      validateBackupPayload(minimalPayload({ version: 1 as never })),
    ).toThrow(/版本/);
    expect(() =>
      validateBackupPayload({
        ...minimalPayload(),
        tasks: undefined as never,
      }),
    ).toThrow(/任务或标签/);
  });

  it("summarizes preserved sections when optional collections are missing", () => {
    const summary = summarizeBackupRestore(minimalPayload());
    expect(summary).toContain("成长目标");
    expect(summary).toContain("拾光记录");
    expect(summary).toContain("循环提醒");
    expect(summary).toContain("将保留当前内容");
  });

  it("does not warn about growth when goals are present", () => {
    const summary = summarizeBackupRestore(
      minimalPayload({ goals: [], goalEntries: [], achievements: [] }),
    );
    expect(summary).toContain("成长目标：0 个");
    expect(summary).not.toMatch(/将保留当前内容：.*成长目标/);
  });

  it("round-trips JSON serialize for a minimal payload", () => {
    const original = minimalPayload({
      goals: [],
      dailyReflections: [],
      inspirations: [],
      futureLetters: [],
      timers: [],
    });
    const restored = validateBackupPayload(
      JSON.parse(JSON.stringify(original)) as unknown,
    );
    expect(restored.version).toBe(6);
    expect(backupPayloadHas(restored, "goals")).toBe(true);
    expect(backupPayloadHas(restored, "timers")).toBe(true);
  });
});
