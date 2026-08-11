import { describe, expect, it } from "vitest";
import { privacySafeNotification } from "./privacy";

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
