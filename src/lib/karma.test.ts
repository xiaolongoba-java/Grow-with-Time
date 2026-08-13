import { describe, expect, it } from "vitest";
import { mergeLegacyStreakDates, recomputeStreak } from "./karma";

describe("recomputeStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(recomputeStreak(["2026-08-11", "2026-08-12", "2026-08-13"], "2026-08-13")).toEqual({
      streak: 3,
      lastCompleteDate: "2026-08-13",
    });
  });

  it("keeps a streak that last completed yesterday", () => {
    expect(recomputeStreak(["2026-08-12"], "2026-08-13")).toEqual({
      streak: 1,
      lastCompleteDate: "2026-08-12",
    });
  });

  it("resets when the last complete day is older", () => {
    expect(recomputeStreak(["2026-08-01", "2026-08-02"], "2026-08-13")).toEqual({
      streak: 0,
      lastCompleteDate: "2026-08-02",
    });
  });
});

it("preserves a legacy streak while new ledger dates extend it", () => {
  const dates = mergeLegacyStreakDates(["2026-08-13"], 3, "2026-08-12");
  expect(recomputeStreak(dates, "2026-08-13").streak).toBe(4);
});
