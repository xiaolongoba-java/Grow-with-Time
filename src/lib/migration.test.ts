import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("database migration declarations", () => {
  it("keeps migration versions unique and contains workflow tables", () => {
    const source = readFileSync("src-tauri/src/lib.rs", "utf8");
    const versions = [...source.matchAll(/version:\s*(\d+)/g)].map((match) =>
      Number(match[1]),
    );
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(source).toContain("schema_contract");
    const firstMigration = source.slice(
      source.indexOf('description: "create_tasks_and_settings"'),
      source.indexOf('description: "full_prd_schema"'),
    );
    expect(firstMigration).toContain("deleted_at TEXT\n);");
    expect(firstMigration).not.toContain("reminder_minutes_json");
    expect(firstMigration).not.toContain("estimated_minutes");
    const compatibility = readFileSync("src/lib/db.ts", "utf8");
    expect(compatibility).toContain(
      "ALTER TABLE tasks ADD COLUMN reminder_minutes_json TEXT",
    );
    expect(compatibility).toContain(
      "ALTER TABLE tasks ADD COLUMN estimated_minutes INTEGER",
    );
    for (const table of [
      "projects",
      "task_templates",
      "app_notifications",
      "task_events",
      "focus_sessions",
      "day_snapshots",
      "milestones",
    ]) {
      expect(source).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it("keeps the released first migration immutable", () => {
    const source = readFileSync("src-tauri/src/lib.rs", "utf8");
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
