import { describe, expect, it } from "vitest";
import {
  anniversaryHeadline,
  listUpcomingAnniversaries,
  lunarToSolarYmd,
  nextAnniversaryDate,
  occurrenceInYear,
  solarToLunarParts,
  sortAnniversaries,
  yearsElapsed,
} from "./anniversaries";
import type { Anniversary } from "@/types";

function anni(
  partial: Partial<Anniversary> & Pick<Anniversary, "id" | "title" | "event_date">,
): Anniversary {
  return {
    calendar: "solar",
    lunar_month: null,
    lunar_day: null,
    lunar_leap: 0,
    recur_yearly: 1,
    note: "",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("anniversaries helpers", () => {
  it("clamps Feb 29 in non-leap years", () => {
    expect(occurrenceInYear(2025, 2, 29)).toBe("2025-02-28");
    expect(occurrenceInYear(2024, 2, 29)).toBe("2024-02-29");
  });

  it("finds the next yearly occurrence", () => {
    expect(nextAnniversaryDate("2020-08-15", true, "2026-08-10")).toBe(
      "2026-08-15",
    );
    expect(nextAnniversaryDate("2020-08-15", true, "2026-08-15")).toBe(
      "2026-08-15",
    );
    expect(nextAnniversaryDate("2020-08-15", true, "2026-08-16")).toBe(
      "2027-08-15",
    );
  });

  it("returns null for past one-shot dates", () => {
    expect(nextAnniversaryDate("2020-01-01", false, "2026-08-12")).toBeNull();
    expect(nextAnniversaryDate("2030-01-01", false, "2026-08-12")).toBe(
      "2030-01-01",
    );
  });

  it("counts elapsed years and builds headlines", () => {
    expect(yearsElapsed("2020-08-12", "2026-08-10")).toBe(5);
    expect(yearsElapsed("2020-08-12", "2026-08-12")).toBe(6);
    expect(anniversaryHeadline({ event_date: "2020-08-12", recur_yearly: 1 }, "2026-08-10").label).toContain(
      "第 6 年",
    );
    expect(anniversaryHeadline({ event_date: "2020-08-12", recur_yearly: 1 }, "2026-08-12").label).toContain(
      "今天",
    );
  });

  it("sorts by soonest upcoming date", () => {
    const sorted = sortAnniversaries(
      [
        anni({ id: "a", title: "远", event_date: "2010-12-01" }),
        anni({ id: "b", title: "近", event_date: "2015-08-13" }),
        anni({ id: "c", title: "过期单次", event_date: "2020-01-01", recur_yearly: 0 }),
      ],
      "2026-08-12",
    );
    expect(sorted.map((item) => item.id)).toEqual(["b", "a", "c"]);
  });

  it("converts lunar mid-autumn and finds next solar day", () => {
    expect(lunarToSolarYmd(2026, 8, 15)).toBe("2026-09-25");
    const parts = solarToLunarParts("2026-09-25");
    expect(parts?.month).toBe(8);
    expect(parts?.day).toBe(15);
    const next = nextAnniversaryDate(
      anni({
        id: "mid",
        title: "中秋",
        event_date: "2025-10-06",
        calendar: "lunar",
        lunar_month: 8,
        lunar_day: 15,
        lunar_leap: 0,
      }),
      undefined,
      "2026-08-12",
    );
    expect(next).toBe("2026-09-25");
  });

  it("falls back when leap month is absent that year", () => {
    expect(lunarToSolarYmd(2023, 2, 1, true)).toBe("2023-03-22");
    expect(lunarToSolarYmd(2024, 2, 1, true)).toBe("2024-03-10");
  });

  it("lists upcoming anniversaries within a window", () => {
    const list = listUpcomingAnniversaries(
      [
        anni({ id: "far", title: "远", event_date: "2010-12-01" }),
        anni({ id: "near", title: "近", event_date: "2015-08-20" }),
        anni({ id: "today", title: "今天", event_date: "2018-08-12" }),
      ],
      "2026-08-12",
      30,
      4,
    );
    expect(list.map((row) => row.item.id)).toEqual(["today", "near"]);
    expect(list[0].daysLeft).toBe(0);
  });
});
