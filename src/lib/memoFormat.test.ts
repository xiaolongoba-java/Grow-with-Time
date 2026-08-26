import { describe, expect, it } from "vitest";
import {
  memoPlainText,
  memoPreview,
  normalizeMemoFormat,
  sanitizeRichHtml,
  titleFromMemoContent,
} from "@/lib/memoFormat";

describe("memoFormat", () => {
  it("normalizes memo format", () => {
    expect(normalizeMemoFormat("rich")).toBe("rich");
    expect(normalizeMemoFormat("markdown")).toBe("markdown");
    expect(normalizeMemoFormat(undefined)).toBe("markdown");
  });

  it("strips rich html for preview", () => {
    expect(memoPreview("<p><strong>Hello</strong> world</p>", "rich")).toBe("Hello world");
  });

  it("derives title from rich content", () => {
    expect(titleFromMemoContent("<h2>项目计划</h2><p>内容</p>", "rich")).toBe("项目计划 内容");
  });

  it("sanitizes script tags", () => {
    expect(sanitizeRichHtml('<p>ok</p><script>alert(1)</script>')).not.toContain("script");
  });

  it("keeps markdown plain text", () => {
    expect(memoPlainText("## Title\nbody", "markdown")).toBe("## Title\nbody");
  });
});
