import { describe, expect, it } from "vitest";
import { isPrivacyModeEnabled, privacySafeNotification } from "./privacy";

describe("isPrivacyModeEnabled", () => {
  it("is opt-in: only explicit true enables privacy", () => {
    expect(isPrivacyModeEnabled("true")).toBe(true);
    expect(isPrivacyModeEnabled("false")).toBe(false);
    expect(isPrivacyModeEnabled(null)).toBe(false);
    expect(isPrivacyModeEnabled(undefined)).toBe(false);
    expect(isPrivacyModeEnabled("")).toBe(false);
  });
});

describe("privacySafeNotification", () => {
  it("passes through title and body when privacy mode is off", () => {
    expect(
      privacySafeNotification(false, "开会", "下午 3 点"),
    ).toEqual({ title: "开会", body: "下午 3 点" });
  });

  it("masks title and body when privacy mode is on", () => {
    expect(
      privacySafeNotification(true, "开会", "下午 3 点"),
    ).toEqual({ title: "日进·拾光", body: "你有一条提醒" });
  });

  it("still masks empty strings when privacy mode is on", () => {
    expect(privacySafeNotification(true, "", "")).toEqual({
      title: "日进·拾光",
      body: "你有一条提醒",
    });
  });
});
