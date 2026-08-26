import { useEffect, useRef } from "react";

type MemoRichEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
};

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}

export function MemoRichEditor({
  value,
  onChange,
  placeholder = "输入正文…",
  className = "",
}: MemoRichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = editorRef.current;
    if (!node) return;
    if (node.innerHTML !== value) {
      node.innerHTML = value || "";
    }
  }, [value]);

  return (
    <div className={`memo-rich-editor ${className}`.trim()}>
      <div className="memo-rich-tools" aria-label="富文本工具栏">
        <button type="button" title="标题" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("formatBlock", "h2")}>H2</button>
        <button type="button" title="粗体" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")}>B</button>
        <button type="button" title="斜体" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")}>I</button>
        <button type="button" title="下划线" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("underline")}>U</button>
        <button type="button" title="无序列表" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertUnorderedList")}>• 列表</button>
        <button type="button" title="有序列表" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertOrderedList")}>1. 列表</button>
        <button
          type="button"
          title="链接"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = window.prompt("链接地址", "https://");
            if (url) exec("createLink", url);
          }}
        >
          🔗
        </button>
        <button type="button" title="清除格式" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("removeFormat")}>清除</button>
      </div>
      <div
        ref={editorRef}
        className="memo-rich-surface"
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        suppressContentEditableWarning
        onInput={() => onChange(editorRef.current?.innerHTML ?? "")}
      />
    </div>
  );
}
