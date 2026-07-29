import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("backup coverage", () => {
  it("exports and imports deep-planning records", () => {
    const source = readFileSync("src/lib/db.ts", "utf8");
    for (const table of [
      "task_events",
      "focus_sessions",
      "day_snapshots",
      "milestones",
    ]) {
      expect(source).toContain(`SELECT * FROM ${table}`);
      expect(source).toContain(`INSERT INTO ${table}`);
    }
    expect(source).toContain("reminder_minutes_json");
    expect(source).toContain("completion_criteria");
    expect(source).toContain("actual_minutes");
  });
});
