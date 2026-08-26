import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/store/app";
import {
  archiveMemo,
  createMemo,
  deleteMemo,
  fetchMemos,
  restoreMemo,
  updateMemo,
  type MemoListFilter,
} from "@/lib/db";
import type { Memo, MemoFormat } from "@/types";
import { invoke } from "@tauri-apps/api/core";
import { MemoArchiveIcon } from "@/components/MemoArchiveIcon";
import { MemoContentView } from "@/components/MemoContentView";
import { MemoRichEditor } from "@/components/MemoRichEditor";
import { memoFormatLabel, memoPreview } from "@/lib/memoFormat";

function formatMemoTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function isBlankMemo(memo: Pick<Memo, "title" | "content">) {
  const title = memo.title.trim();
  const content = memo.content.trim();
  return (!title || title === "无标题备忘") && !content;
}

export function MemosView() {
  const setToast = useAppStore((s) => s.setToast);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [listFilter, setListFilter] = useState<MemoListFilter>("active");
  const [createPickerOpen, setCreatePickerOpen] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const isEditingRef = useRef(false);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const insertMarkdown = (before: string, after = "", fallback = "文本") => {
    const textarea = contentRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.slice(start, end) || fallback;
    const nextContent =
      content.slice(0, start) +
      before +
      selectedText +
      after +
      content.slice(end);
    setContent(nextContent);
    setDirty(true);
    requestAnimationFrame(() => {
      textarea.focus();
      const selectionStart = start + before.length;
      textarea.setSelectionRange(
        selectionStart,
        selectionStart + selectedText.length,
      );
    });
  };

  const loadMemo = (memo: Memo | null, editing = false) => {
    setSelectedId(memo?.id ?? null);
    setTitle(memo?.title ?? "");
    setContent(memo?.content ?? "");
    setDirty(false);
    setIsEditing(editing);
  };

  const refresh = async (
    preferId?: string | null,
    opts?: { editing?: boolean },
  ) => {
    const list = await fetchMemos(listFilter);
    setMemos(list);
    const nextId =
      preferId && list.some((m) => m.id === preferId)
        ? preferId
        : selectedIdRef.current && list.some((m) => m.id === selectedIdRef.current)
          ? selectedIdRef.current
          : list[0]?.id ?? null;
    const cur = list.find((m) => m.id === nextId) ?? null;
    const sameMemo = cur?.id === selectedIdRef.current;
    let nextEditing = false;
    if (opts?.editing === true) {
      nextEditing = true;
    } else if (opts?.editing === false) {
      nextEditing = false;
    } else if (sameMemo) {
      nextEditing = isEditingRef.current;
    } else if (cur) {
      nextEditing = isBlankMemo(cur);
    }
    loadMemo(cur, nextEditing);
  };

  useEffect(() => {
    void refresh(undefined, { editing: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listFilter]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return memos;
    return memos.filter(
      (m) =>
        m.title.toLowerCase().includes(kw) ||
        m.content.toLowerCase().includes(kw),
    );
  }, [memos, keyword]);

  const selected = memos.find((m) => m.id === selectedId) ?? null;
  const isRich = selected?.format === "rich";

  const selectMemo = (memo: Memo) => {
    if (memo.id === selectedIdRef.current) return;
    const applySelect = () => {
      loadMemo(memo, isBlankMemo(memo));
    };
    if (dirty && selected && isEditing) {
      void updateMemo(selected.id, { title, content }).then(() => {
        applySelect();
      });
      return;
    }
    applySelect();
  };

  const save = async () => {
    if (!selected) return;
    const t = title.trim() || "无标题备忘";
    await updateMemo(selected.id, { title: t, content });
    setTitle(t);
    setDirty(false);
    setIsEditing(false);
    setToast("备忘录已保存");
    await refresh(selected.id, { editing: false });
  };

  const cancelEdit = () => {
    if (!selected) return;
    setTitle(selected.title);
    setContent(selected.content);
    setDirty(false);
    setIsEditing(false);
  };

  const createNew = async (format: MemoFormat) => {
    setCreatePickerOpen(false);
    if (dirty && selected && isEditing) {
      await updateMemo(selected.id, {
        title: title.trim() || "无标题备忘",
        content,
      });
    }
    const memo = await createMemo("", "无标题备忘", format);
    setToast(`已新建${memoFormatLabel(format)}备忘录`);
    const list = await fetchMemos(listFilter);
    setMemos(list);
    loadMemo(memo, true);
  };

  return (
    <main className="memo-module">
      <aside className="memo-list-pane">
        <div className="memo-list-head">
          <h2>备忘录</h2>
          <div className="memo-create-wrap">
            <button
              type="button"
              className="btn-primary"
              style={{ width: "auto", padding: "8px 12px" }}
              onClick={() => setCreatePickerOpen((open) => !open)}
            >
              + 新建
            </button>
            {createPickerOpen ? (
              <div className="memo-create-menu" role="menu" aria-label="选择备忘录格式">
                <button type="button" role="menuitem" onClick={() => void createNew("markdown")}>
                  <strong>Markdown</strong>
                  <span>适合代码、清单与纯文本排版</span>
                </button>
                <button type="button" role="menuitem" onClick={() => void createNew("rich")}>
                  <strong>富文本</strong>
                  <span>所见即所得，适合快速记录</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <input
          className="field"
          placeholder="搜索备忘录…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <div className="memo-list-tabs" role="tablist" aria-label="备忘录筛选">
          {([
            ["active", "进行中"],
            ["archived", "已归档"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={listFilter === value}
              className={listFilter === value ? "active" : ""}
              onClick={() => setListFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="memo-list">
          {filtered.map((memo) => (
            <button
              key={memo.id}
              type="button"
              className={`memo-list-item ${selectedId === memo.id ? "active" : ""}`}
              onClick={() => selectMemo(memo)}
            >
              <div className="memo-list-title">
                {memo.pinned ? "📌 " : ""}
                {memo.title || "无标题备忘"}
                <span className="memo-format-badge">{memoFormatLabel(memo.format)}</span>
              </div>
              <div className="memo-list-preview">
                {memoPreview(memo.content, memo.format)}
              </div>
              <div className="memo-list-meta">
                {formatMemoTime(memo.updated_at)}
              </div>
            </button>
          ))}
          {!filtered.length ? (
            <div className="empty-state" style={{ padding: 24 }}>
              {keyword ? "没有匹配的备忘录" : "还没有备忘录，点上方新建"}
            </div>
          ) : null}
        </div>
      </aside>

      <section className="memo-editor-pane">
        {selected ? (
          <>
            <div className="memo-editor-toolbar">
              <span className="memo-editor-status">
                {isEditing ? (dirty ? "未保存" : "编辑中") : "阅读"} ·{" "}
                {memoFormatLabel(selected.format)} · {formatMemoTime(selected.updated_at)}
              </span>
              <div className="memo-editor-actions">
                {isEditing ? (
                  <>
                    <button type="button" className="btn-ghost" onClick={cancelEdit}>
                      取消
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ width: "auto", padding: "8px 14px" }}
                      disabled={!dirty}
                      onClick={() => void save()}
                    >
                      保存
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ width: "auto", padding: "8px 14px" }}
                    onClick={() => setIsEditing(true)}
                  >
                    编辑
                  </button>
                )}
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={isEditing}
                  onClick={() =>
                    void updateMemo(selected.id, {
                      pinned: selected.pinned ? 0 : 1,
                    }).then(() => refresh(selected.id))
                  }
                >
                  {selected.pinned ? "取消置顶" : "置顶"}
                </button>
                {selected.archived ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={isEditing}
                    onClick={() =>
                      void restoreMemo(selected.id).then(() => {
                        setToast("已恢复至进行中");
                        void refresh(null, { editing: false });
                      })
                    }
                  >
                    恢复
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost memo-archive-btn"
                    disabled={isEditing}
                    onClick={() =>
                      void archiveMemo(selected.id).then(() => {
                        setToast("已归档");
                        void refresh(null, { editing: false });
                      })
                    }
                  >
                    <MemoArchiveIcon size={15} />
                    归档
                  </button>
                )}
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={isEditing}
                  onClick={() => void invoke("show_float")}
                >
                  浮窗
                </button>
                <button
                  type="button"
                  className="btn-ghost danger"
                  disabled={isEditing}
                  onClick={() => {
                    if (!window.confirm("删除这条备忘录？")) return;
                    void deleteMemo(selected.id).then(() => {
                      loadMemo(null);
                      void refresh(null, { editing: false });
                    });
                  }}
                >
                  删除
                </button>
              </div>
            </div>

            {isEditing ? (
              <>
                <input
                  className="memo-title-input"
                  placeholder="标题"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setDirty(true);
                  }}
                />
                {!isRich ? (
                  <div className="memo-markdown-tools">
                    <button type="button" title="标题" onClick={() => insertMarkdown("## ", "", "标题")}>H2</button>
                    <button type="button" title="粗体" onClick={() => insertMarkdown("**", "**")}>B</button>
                    <button type="button" title="引用" onClick={() => insertMarkdown("> ", "", "引用")}>❝</button>
                    <button type="button" title="无序列表" onClick={() => insertMarkdown("- ", "", "列表项")}>• 列表</button>
                    <button type="button" title="任务清单" onClick={() => insertMarkdown("- [ ] ", "", "待办")}>☐ 待办</button>
                    <button type="button" title="行内代码" onClick={() => insertMarkdown("`", "`", "代码")}>{"</>"}</button>
                    <button type="button" title="链接" onClick={() => insertMarkdown("[", "](https://)", "链接文字")}>🔗</button>
                  </div>
                ) : null}
                <div className={`memo-markdown-workspace mode-edit${isRich ? " is-rich" : ""}`}>
                  {isRich ? (
                    <MemoRichEditor
                      value={content}
                      onChange={(html) => {
                        setContent(html);
                        setDirty(true);
                      }}
                    />
                  ) : (
                    <textarea
                      ref={contentRef}
                      className="memo-content-input"
                      placeholder={"支持 Markdown：# 标题、- 列表、- [ ] 任务、```代码块```…"}
                      value={content}
                      onChange={(e) => {
                        setContent(e.target.value);
                        setDirty(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          void save();
                        }
                      }}
                    />
                  )}
                </div>
              </>
            ) : (
              <article className="memo-read-view">
                <h1 className="memo-title-display">{title.trim() || "无标题备忘"}</h1>
                <div className="memo-read-body">
                  {content.trim() ? (
                    <MemoContentView content={content} format={selected.format} />
                  ) : (
                    <p className="memo-read-empty">暂无内容，点击「编辑」开始书写</p>
                  )}
                </div>
              </article>
            )}
          </>
        ) : (
          <div className="empty-state">选择或新建一条备忘录</div>
        )}
      </section>
    </main>
  );
}
