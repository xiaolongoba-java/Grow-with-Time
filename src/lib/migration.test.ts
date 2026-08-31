import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("database migration declarations", () => {
  it("keeps migration versions unique and contains workflow tables", () => {
    const source = readFileSync("src-tauri/src/lib.rs", "utf8").replace(
      /\r\n/g,
      "\n",
    );
    const versions = [...source.matchAll(/version:\s*(\d+)/g)].map((match) =>
      Number(match[1]),
    );
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
    expect(source).toContain("schema_contract");
    expect(source).toContain("memo_archived");
    expect(source).toContain("memo_format");
    expect(source).toContain("desktop_widget_mode");
    expect(source).toContain("desktop_widget_layer");
    expect(source).toContain("generated_from_id");
    expect(source).toContain("karma_ledger");
    expect(source).toContain("anniversaries");
    const firstMigration = source.slice(
      source.indexOf('description: "create_tasks_and_settings"'),
      source.indexOf('description: "full_prd_schema"'),
    );
    expect(firstMigration).toContain("deleted_at TEXT\n);");
    expect(firstMigration).not.toContain("reminder_minutes_json");
    expect(firstMigration).not.toContain("estimated_minutes");
    const compatibility = readFileSync("src/lib/db/client.ts", "utf8");
    expect(compatibility).toContain(
      "ALTER TABLE tasks ADD COLUMN reminder_minutes_json TEXT",
    );
    expect(compatibility).toContain(
      "ALTER TABLE tasks ADD COLUMN estimated_minutes INTEGER",
    );
    expect(compatibility).toContain(
      "ALTER TABLE tasks ADD COLUMN generated_from_id TEXT",
    );
    expect(source).toContain(
      "ALTER TABLE tasks ADD COLUMN schedule_locked INTEGER NOT NULL DEFAULT 0",
    );
    expect(source).toContain("CREATE TABLE IF NOT EXISTS task_planning_metadata");
    expect(source).toContain("ALTER TABLE goals ADD COLUMN manual_completion");
    for (const table of [
      "projects",
      "task_templates",
      "app_notifications",
      "task_events",
      "focus_sessions",
      "day_snapshots",
      "milestones",
      "goals",
      "goal_entries",
      "goal_milestones",
      "achievements",
      "daily_reflections",
      "inspirations",
      "future_letters",
      "anniversaries",
    ]) {
      expect(source).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it("keeps the released first migration immutable", () => {
    const source = readFileSync("src-tauri/src/lib.rs", "utf8").replace(
      /\r\n/g,
      "\n",
    );
    const match = source.match(
      /description:\s*"create_tasks_and_settings",\s*sql:\s*r#"\n([\s\S]*?)"#,/,
    );
    expect(match?.[1]).toBe(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'pending',
  due_date TEXT,
  due_time TEXT,
  sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'system');
`);
  });
});
