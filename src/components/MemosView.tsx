import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/app";
import {
  createMemo,
  deleteMemo,
  fetchMemos,
  updateMemo,
} from "@/lib/db";
import type { Memo } from "@/types";
import { invoke } from "@tauri-apps/api/core";

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

function preview(content: string): string {
  const line = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  return line?.slice(0, 80) ?? "暂无内容";
}

export function MemosView() {
  const setToast = useAppStore((s) => s.setToast);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);

  const refresh = async (preferId?: string | null) => {
    const list = await fetchMemos();
    setMemos(list);
    const nextId =
      preferId && list.some((m) => m.id === preferId)
        ? preferId
        : selectedId && list.some((m) => m.id === selectedId)
          ? selectedId
          : list[0]?.id ?? null;
    setSelectedId(nextId);
    const cur = list.find((m) => m.id === nextId) ?? null;
    setTitle(cur?.title ?? "");
    setContent(cur?.content ?? "");
    setDirty(false);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const selectMemo = (memo: Memo) => {
    if (dirty && selected) {
      void updateMemo(selected.id, { title, content }).then(() => {
        setSelectedId(memo.id);
        setTitle(memo.title);
        setContent(memo.content);
        setDirty(false);
        void refresh(memo.id);
      });
      return;
    }
    setSelectedId(memo.id);
    setTitle(memo.title);
    setContent(memo.content);
    setDirty(false);
  };

  const save = async () => {
    if (!selected) return;
    const t = title.trim() || "无标题备忘";
    await updateMemo(selected.id, { title: t, content });
    setTitle(t);
    setDirty(false);
    setToast("备忘录已保存");
    await refresh(selected.id);
  };

  const createNew = async () => {
    if (dirty && selected) {
      await updateMemo(selected.id, {
        title: title.trim() || "无标题备忘",
        content,
      });
    }
    const memo = await createMemo("", "无标题备忘");
    setToast("已新建备忘录");
    await refresh(memo.id);
  };

  return (
    <main className="memo-module">
      <aside className="memo-list-pane">
        <div className="memo-list-head">
          <h2>备忘录</h2>
          <button
            type="button"
            className="btn-primary"
            style={{ width: "auto", padding: "8px 12px" }}
            onClick={() => void createNew()}
          >
            + 新建
          </button>
        </div>
        <input
          className="field"
          placeholder="搜索备忘录…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
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
              </div>
              <div className="memo-list-preview">{preview(memo.content)}</div>
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
                {dirty ? "未保存" : "已保存"} · {formatMemoTime(selected.updated_at)}
              </span>
              <div className="memo-editor-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() =>
                    void updateMemo(selected.id, {
                      pinned: selected.pinned ? 0 : 1,
                    }).then(() => refresh(selected.id))
                  }
                >
                  {selected.pinned ? "取消置顶" : "置顶"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void invoke("show_float")}
                >
                  浮窗
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
                <button
                  type="button"
                  className="btn-ghost danger"
                  onClick={() => {
                    if (!window.confirm("删除这条备忘录？")) return;
                    void deleteMemo(selected.id).then(() => {
                      setSelectedId(null);
                      void refresh(null);
                    });
                  }}
                >
                  删除
                </button>
              </div>
            </div>
            <input
              className="memo-title-input"
              placeholder="标题"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
            />
            <textarea
              className="memo-content-input"
              placeholder="写下想法、会议纪要、灵感…"
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
          </>
        ) : (
          <div className="empty-state">选择或新建一条备忘录</div>
        )}
      </section>
    </main>
  );
}
