import { describe, expect, it } from "vitest";
import { extractReleaseNotes, normalizeInstallerName } from "./sync-gitee-release.mjs";

describe("normalizeInstallerName", () => {
  it("rewrites Tauri spaces to GitHub/README dots", () => {
    expect(normalizeInstallerName("Grow with Time_1.6.4_x64-setup.exe")).toBe(
      "Grow.with.Time_1.6.4_x64-setup.exe",
    );
    expect(normalizeInstallerName("Grow with Time_1.6.4_aarch64.dmg")).toBe(
      "Grow.with.Time_1.6.4_aarch64.dmg",
    );
  });

  it("leaves already-dotted GitHub names unchanged", () => {
    expect(normalizeInstallerName("Grow.with.Time_1.6.4_x64-setup.exe")).toBe(
      "Grow.with.Time_1.6.4_x64-setup.exe",
    );
  });
});

describe("extractReleaseNotes", () => {
  it("stops before the download table heading", () => {
    const readme = [
      "#### v1.6.4 修复观流账本界面穿透",
      "",
      "本版本修复背景色。",
      "",
      "### v1.6.4",
      "",
      "| 平台 | 文件 |",
      "|------|------|",
      "",
      "#### v1.6.3 观流账本",
      "",
      "上一版说明。",
      "",
    ].join("\n");
    const notes = extractReleaseNotes("1.6.4", readme);
    expect(notes).toContain("本版本修复背景色。");
    expect(notes).not.toContain("### v1.6.4");
    expect(notes).not.toContain("| 平台");
    expect(notes).not.toContain("上一版说明");
  });
});
