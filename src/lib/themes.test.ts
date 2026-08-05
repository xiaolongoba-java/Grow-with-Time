import { describe, expect, it } from "vitest";
import { contrastRatio, themeMeta } from "@/lib/themes";

describe("theme readability", () => {
  it.each(Object.entries(themeMeta))("keeps %s primary text at WCAG AA contrast", (_theme, palette) => {
    expect(contrastRatio(palette.text, palette.surface)).toBeGreaterThanOrEqual(4.5);
  });
});
