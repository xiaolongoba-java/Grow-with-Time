import { describe, expect, it } from "vitest";
import { isNewerVersion, normalizeVersion } from "./versionUpdate";

describe("version update", () => {
  it("normalizes tags and prerelease suffixes", () => {
    expect(normalizeVersion("v1.7.0-beta.1")).toEqual([1, 7, 0]);
  });

  it("detects newer semantic versions", () => {
    expect(isNewerVersion("1.7.0", "1.6.1")).toBe(true);
    expect(isNewerVersion("1.6.1", "1.6.1")).toBe(false);
    expect(isNewerVersion("1.5.9", "1.6.1")).toBe(false);
    expect(isNewerVersion("2.0", "1.9.9")).toBe(true);
  });
});
