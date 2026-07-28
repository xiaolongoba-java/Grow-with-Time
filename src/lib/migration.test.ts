import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("database migration declarations", () => {
  it("keeps migration versions unique and contains workflow tables", () => {
    const source = readFileSync("src-tauri/src/lib.rs", "utf8");
    const versions = [...source.matchAll(/version:\s*(\d+)/g)].map((match) =>
      Number(match[1]),
    );
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
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
});
