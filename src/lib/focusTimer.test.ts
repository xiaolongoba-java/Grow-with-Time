import { describe, expect, it } from "vitest";
import {
  focusEndsAtFromRemaining,
  remainingFocusSeconds,
} from "./focusTimer";

describe("focusTimer absolute time", () => {
  it("derives remaining seconds from endsAt", () => {
    const now = 1_000_000;
    expect(remainingFocusSeconds(now + 90_500, now)).toBe(91);
    expect(remainingFocusSeconds(now - 1, now)).toBe(0);
    expect(remainingFocusSeconds(null, now)).toBe(0);
  });

  it("builds endsAt from remaining seconds", () => {
    const now = 5_000_000;
    expect(focusEndsAtFromRemaining(25 * 60, now)).toBe(now + 1_500_000);
    expect(focusEndsAtFromRemaining(-3, now)).toBe(now);
  });

  it("accounts for sleep gaps without ticking once per second", () => {
    const now = 10_000_000;
    const endsAt = focusEndsAtFromRemaining(25 * 60, now);
    // Wake 20 minutes later — remaining should drop by ~1200s, not by 1.
    expect(remainingFocusSeconds(endsAt, now + 20 * 60 * 1000)).toBe(5 * 60);
  });
});
