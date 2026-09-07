import { describe, expect, it } from "vitest";
import { monthRange, parseAmountToCents } from "@/lib/db/ledger";
import { readFileSync } from "node:fs";

describe("ledger amount", () => {
  it("converts decimal text without floating point rounding", () => {
    expect(parseAmountToCents("12.3")).toBe(1230);
    expect(parseAmountToCents("0.01")).toBe(1);
    expect(parseAmountToCents("99999999.99")).toBe(9_999_999_999);
  });

  it("rejects zero, negatives, scientific notation and excessive digits", () => {
    for (const value of ["0", "-1", "1e3", "1.234", "100000000", ".5", "01"]) {
      expect(parseAmountToCents(value)).toBeNull();
    }
  });
});

describe("ledger month range", () => {
  it("crosses year boundaries", () => {
    expect(monthRange("2026-12")).toEqual(["2026-12-01", "2027-01-01"]);
  });
  it("validates future dates and category kind on both write paths", () => {
    const source = readFileSync("src/lib/db/ledger.ts", "utf8");
    expect(source.match(/记账日期不能晚于今天/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source.match(/category\[0\]\.kind !== draft\.kind/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
