import type { MemoFormat } from "@/types";

export function normalizeMemoFormat(value: string | null | undefined): MemoFormat {
  return value === "rich" ? "rich" : "markdown";
}

export function sanitizeRichHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

export function memoPlainText(content: string, format: MemoFormat): string {
  if (format === "rich") {
    return content
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return content.trim();
}

export function memoPreview(content: string, format: MemoFormat): string {
  const text = memoPlainText(content, format);
  const line = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  return line?.slice(0, 80) ?? "暂无内容";
}

export function memoFormatLabel(format: MemoFormat): string {
  return format === "rich" ? "富文本" : "Markdown";
}

export function titleFromMemoContent(
  content: string,
  format: MemoFormat,
  fallback = "无标题备忘",
): string {
  const text = memoPlainText(content, format);
  const first = text.split(/\r?\n/).find((l) => l.trim())?.trim().slice(0, 40);
  return first || fallback;
}
