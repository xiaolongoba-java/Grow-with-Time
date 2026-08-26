import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sanitizeRichHtml } from "@/lib/memoFormat";
import type { MemoFormat } from "@/types";

type MemoContentViewProps = {
  content: string;
  format?: MemoFormat | string | null;
  className?: string;
};

export function MemoContentView({
  content,
  format = "markdown",
  className = "",
}: MemoContentViewProps) {
  if (format === "rich") {
    if (!content.trim()) {
      return <div className={`memo-rich-preview is-empty ${className}`.trim()}>暂无内容</div>;
    }
    return (
      <div
        className={`memo-rich-preview ${className}`.trim()}
        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(content) }}
      />
    );
  }

  if (!content.trim()) {
    return <div className={`memo-markdown-empty ${className}`.trim()}>暂无内容</div>;
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children, ...props }) => (
          <a {...props} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
