import { describe, expect, it } from "vitest";
import { formatLedgerMoney, monthRange, parseAmountToCents } from "@/lib/db/ledger";
import { readFileSync } from "node:fs";

describe("ledger amount", () => {
  it("converts decimal text without floating point rounding", () => {
    expect(parseAmountToCents("12.3")).toBe(1230);
    expect(parseAmountToCents("0.01")).toBe(1);
    expect(parseAmountToCents("99999999.99")).toBe(9_999_999_999);
  });

  it("masks money with dots instead of a CSS blur", () => {
    expect(formatLedgerMoney(12345, true)).toBe("¥ ••••");
    expect(formatLedgerMoney(0, false)).toBe("¥0.00");
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
  it("hides the sidebar collapse control while the entry overlay is open", () => {
    const css = readFileSync("src/styles/parts/global-11-ledger.css", "utf8");
    expect(css).toContain("body:has(.ledger-overlay) .nav-edge-collapse");
  });

  it("opens the entry form as 事由 then amount then category", () => {
    const source = readFileSync("src/components/LedgerView.tsx", "utf8");
    expect(source.indexOf("事由")).toBeGreaterThan(0);
    expect(source.indexOf("事由")).toBeLessThan(source.indexOf(">金额<"));
    expect(source.indexOf(">金额<")).toBeLessThan(source.indexOf("<legend>分类</legend>"));
  });

  it("validates future dates and category kind on both write paths", () => {
    const source = readFileSync("src/lib/db/ledger.ts", "utf8");
    expect(source.match(/记账日期不能晚于今天/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source.match(/category\[0\]\.kind !== draft\.kind/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
