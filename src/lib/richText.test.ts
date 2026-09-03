// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { richTextToPlainText, sanitizeRichText } from "./richText";

describe("richText", () => {
  it("strips unsafe tags and event handlers", () => {
    const sanitized = sanitizeRichText(
      '<p>ok</p><script>alert(1)</script><img src=x onerror=alert(1) />',
    );
    expect(sanitized).toContain("<p>ok</p>");
    expect(sanitized).not.toContain("<script");
    expect(sanitized).not.toContain("onerror");
  });

  it("keeps safe links and drops javascript urls", () => {
    const sanitized = sanitizeRichText(
      '<a href="https://example.com">safe</a><a href="javascript:alert(1)">bad</a>',
    );
    expect(sanitized).toContain('href="https://example.com"');
    expect(sanitized).toContain('rel="noreferrer"');
    expect(sanitized).not.toContain("javascript:");
  });

  it("converts rich text to plain text for previews", () => {
    expect(richTextToPlainText("<p>Hello <strong>world</strong></p>")).toBe(
      "Hello world",
    );
  });
});
