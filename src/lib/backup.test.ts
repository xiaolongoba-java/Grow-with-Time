import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import {
  backupHasLegacyKarma,
  backupPayloadHas,
  inspectBackupPayload,
  sanitizeBackupPayload,
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
    const source = readdirSync("src/lib/db")
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readFileSync(`src/lib/db/${name}`, "utf8"))
      .join("\n");
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
      "anniversaries",
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
    expect(source).toContain("version: 7");
    expect(source).not.toContain("karmaLedger");
    expect(source).toContain("DELETE FROM karma_ledger");
    expect(source).toContain("DELETE FROM settings WHERE key");
    expect(source).toContain("payload.dailyReflections");
    expect(source).toContain("payload.inspirations");
    expect(source).toContain("payload.futureLetters");
    expect(source).toContain("saveTaskPlanningMetadata(task)");
    expect(source).not.toContain("saveTaskPlanningMetadata(mapTask(task))");
    expect(source).toContain("txQueue");
    expect(source).toContain("withTransaction");
    expect(source).toContain("sanitizeBackupPayload");
    expect(source).toContain("delete settings.ai_api_key");
    const barrel = readFileSync("src/lib/db.ts", "utf8");
    expect(barrel).toContain("summarizeBackupRestore");
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

  it("warns when a legacy backup still carries karma data", () => {
    expect(
      backupHasLegacyKarma(
        minimalPayload({
          settings: { karma: "42" },
        }),
      ),
    ).toBe(true);
    const summary = summarizeBackupRestore(
      minimalPayload({
        settings: { karma: "42", streak: "3" },
      }),
    );
    expect(summary).toContain("游戏化积分");
    expect(summary).toContain("不会还原");
  });

  it("does not warn about growth when goals are present", () => {
    const summary = summarizeBackupRestore(
      minimalPayload({ goals: [], goalEntries: [], achievements: [] }),
    );
    expect(summary).toContain("成长目标：0 个");
    expect(summary).not.toMatch(/将保留当前内容：.*成长目标/);
  });

  it("reports duplicate ids and dangling references", () => {
    expect(() =>
      validateBackupPayload(
        minimalPayload({
          tasks: [
            {
              id: "a",
              title: "one",
              description: "",
              notes: "",
              priority: 3,
              status: "pending",
              due_date: "2026-08-01",
              due_time: null,
              end_time: null,
              sort_order: 1,
              created_at: "2026-08-01T00:00:00.000Z",
              updated_at: "2026-08-01T00:00:00.000Z",
              completed_at: null,
              deleted_at: null,
              parent_id: "missing-parent",
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
            },
            {
              id: "a",
              title: "dup",
              description: "",
              notes: "",
              priority: 3,
              status: "pending",
              due_date: "2026-08-01",
              due_time: null,
              end_time: null,
              sort_order: 1,
              created_at: "2026-08-01T00:00:00.000Z",
              updated_at: "2026-08-01T00:00:00.000Z",
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
            },
          ] as never,
        }),
      ),
    ).toThrow(/重复 id/);
    const report = inspectBackupPayload(
      minimalPayload({
        tasks: [
          {
            id: "child",
            title: "child",
            description: "",
            notes: "",
            priority: 3,
            status: "pending",
            due_date: "2026-08-01",
            due_time: null,
            end_time: null,
            sort_order: 1,
            created_at: "2026-08-01T00:00:00.000Z",
            updated_at: "2026-08-01T00:00:00.000Z",
            completed_at: null,
            deleted_at: null,
            parent_id: "missing-parent",
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
          },
        ] as never,
      }),
    );
    expect(report.warnings.some((item) => item.includes("父任务不存在"))).toBe(true);
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

  it("drops dangling task-tag links instead of importing them", () => {
    const task = {
      id: "task-1",
      title: "keep",
      description: "",
      notes: "",
      priority: 3 as const,
      status: "pending" as const,
      due_date: "2026-08-01",
      due_time: null,
      end_time: null,
      sort_order: 1,
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
      completed_at: null,
      deleted_at: null,
      parent_id: "missing-parent",
      repeat_rule: null,
      remind_minutes: null,
      reminder_minutes: [],
      estimated_minutes: null,
      project_id: "missing-project",
      my_day_date: null,
      blocked_by_id: "missing-blocker",
      completion_criteria: "",
      energy_level: "medium" as const,
      flexible: 1,
      schedule_locked: 0,
      actual_minutes: 0,
      goal_id: null,
      goal_contribution: 1,
      generated_from_id: "missing-source",
    };
    const payload = minimalPayload({
      tasks: [task] as never,
      tags: [
        {
          id: "tag-1",
          name: "work",
          color: "#000",
          created_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      taskTags: [
        { task_id: "task-1", tag_id: "tag-1" },
        { task_id: "ghost", tag_id: "tag-1" },
        { task_id: "task-1", tag_id: "ghost-tag" },
      ],
      attachments: [
        {
          id: "att-1",
          task_id: "ghost",
          kind: "file",
          name: "x",
          path: "/tmp/x",
          created_at: "2026-08-01T00:00:00.000Z",
        },
      ] as never,
      projects: [],
    });
    const report = inspectBackupPayload(payload);
    expect(report.warnings.some((item) => item.includes("恢复时将跳过"))).toBe(true);
    expect(report.warnings.some((item) => item.includes("前置任务不存在"))).toBe(true);
    const sanitized = sanitizeBackupPayload(payload);
    expect(sanitized.taskTags).toEqual([{ task_id: "task-1", tag_id: "tag-1" }]);
    expect(sanitized.attachments).toEqual([]);
    expect(sanitized.tasks[0].parent_id).toBeNull();
    expect(sanitized.tasks[0].generated_from_id).toBeNull();
    expect(sanitized.tasks[0].project_id).toBeNull();
    expect(sanitized.tasks[0].blocked_by_id).toBeNull();
  });
});
