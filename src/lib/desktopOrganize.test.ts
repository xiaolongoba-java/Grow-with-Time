import { describe, expect, it } from "vitest";
import { formatDesktopModified, KIND_META } from "./desktopOrganize";

describe("desktop organize helpers", () => {
  it("keeps a label for every organizer category", () => {
    expect(Object.keys(KIND_META)).toEqual([
      "folder",
      "document",
      "image",
      "archive",
      "shortcut",
      "other",
    ]);
  });

  it("formats today's modification time", () => {
    const now = new Date();
    now.setHours(14, 32, 0, 0);
    const label = formatDesktopModified(String(Math.floor(now.getTime() / 1000)));
    expect(label).toMatch(/^今天 14:32 修改$/);
  });
});
