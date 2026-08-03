import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { WebviewWindow, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  createMemo,
  createTask,
  fetchMemos,
  fetchTasks,
  toggleTaskComplete,
  updateMemo,
} from "@/lib/db";
import { isOverdue, todayDateString } from "@/lib/dates";
import type { Memo, Task } from "@/types";

type WidgetKind = "calendar" | "today" | "memo";

const WIDGET_PALETTES = [
  { id: "ocean", name: "深海蓝", color: "#355b8a" },
  { id: "mist", name: "雾霾蓝", color: "#60758d" },
  { id: "apricot", name: "暖杏色", color: "#8b6554" },
  { id: "sage", name: "鼠尾草绿", color: "#587569" },
  { id: "twilight", name: "暮光紫", color: "#685d8d" },
  { id: "graphite", name: "石墨黑", color: "#343b47" },
] as const;

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((part) => part + part)
          .join("")
      : value;
  const parsed = Number.parseInt(normalized, 16);
  return `${(parsed >> 16) & 255}, ${(parsed >> 8) & 255}, ${parsed & 255}`;
}

const TITLES: Record<WidgetKind, string> = {
  calendar: "月历",
  today: "今日计划",
  memo: "备忘录",
};

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateKey(date: Date) {
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, "0")}`;
}

function priorityColor(priority: number) {
  if (priority === 1) return "#ff6b7a";
  if (priority === 2) return "#f5a453";
  if (priority === 3) return "#6f9df5";
  return "#8ea0b8";
}

export function DesktopWidgetApp({ kind }: { kind: WidgetKind }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [taskText, setTaskText] = useState("");
  const [memoText, setMemoText] = useState("");
  const [month, setMonth] = useState(() => {
    const value = new Date();
    value.setDate(1);
    value.setHours(0, 0, 0, 0);
    return value;
  });
  const [busy, setBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [widgetColor, setWidgetColor] = useState(() => {
    try {
      return localStorage.getItem(`minimal.widget.color.${kind}`) ?? "#355b8a";
    } catch {
      return "#355b8a";
    }
  });
  const [widgetOpacity, setWidgetOpacity] = useState(() => {
    try {
      const saved = localStorage.getItem(`minimal.widget.opacity.${kind}`);
      return saved === null ? 82 : Number(saved);
    } catch {
      return 82;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(`minimal.widget.color.${kind}`, widgetColor);
      localStorage.setItem(
        `minimal.widget.opacity.${kind}`,
        String(widgetOpacity),
      );
    } catch {
      // Color persistence is a progressive enhancement.
    }
  }, [kind, widgetColor, widgetOpacity]);

  const refresh = async () => {
    const [nextTasks, nextMemos] = await Promise.all([
      fetchTasks(),
      fetchMemos(),
    ]);
    setTasks(nextTasks);
    setMemos(nextMemos);
  };

  useEffect(() => {
    document.documentElement.dataset.desktopWidget = kind;
    document.body.dataset.desktopWidget = kind;
    void refresh();
    const poll = window.setInterval(() => void refresh(), 5_000);
    const current = getCurrentWebviewWindow();
    const positionKey = `minimal.widget.position.${kind}`;
    try {
      const saved = JSON.parse(localStorage.getItem(positionKey) ?? "null") as
        | { x: number; y: number }
        | null;
      if (saved) {
        void current.setPosition(new PhysicalPosition(saved.x, saved.y));
      }
    } catch {
      // Ignore invalid legacy window positions.
    }
    let unlistenMoved: (() => void) | undefined;
    void current.onMoved(({ payload }) => {
      localStorage.setItem(
        positionKey,
        JSON.stringify({ x: payload.x, y: payload.y }),
      );
    }).then((unlisten) => {
      unlistenMoved = unlisten;
    });
    return () => {
      window.clearInterval(poll);
      unlistenMoved?.();
      delete document.documentElement.dataset.desktopWidget;
      delete document.body.dataset.desktopWidget;
    };
  }, [kind]);

  const today = todayDateString();
  const todayTasks = useMemo(
    () =>
      tasks
        .filter(
          (task) =>
            !task.parent_id &&
            !task.deleted_at &&
            !["completed", "cancelled"].includes(task.status) &&
            task.due_date !== null &&
            task.due_date <= today,
        )
        .sort(
          (a, b) =>
            Number(isOverdue(b)) - Number(isOverdue(a)) ||
            (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99") ||
            a.priority - b.priority,
        ),
    [tasks, today],
  );

  const calendarDays = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstWeekday = new Date(year, monthIndex, 1).getDay();
    const startOffset = (firstWeekday + 6) % 7;
    const start = new Date(year, monthIndex, 1 - startOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const value = new Date(start);
      value.setDate(start.getDate() + index);
      return value;
    });
  }, [month]);

  const activeTasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (
        !task.due_date ||
        task.deleted_at ||
        ["completed", "cancelled"].includes(task.status)
      ) {
        continue;
      }
      const list = map.get(task.due_date) ?? [];
      list.push(task);
      map.set(task.due_date, list);
    }
    return map;
  }, [tasks]);

  const saveTask = async () => {
    const title = taskText.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      await createTask({ title, due_date: today });
      setTaskText("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const saveMemo = async () => {
    const content = memoText.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      await createMemo(content);
      setMemoText("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const openMain = async () => {
    const main = await WebviewWindow.getByLabel("main");
    await main?.show();
    await main?.unminimize();
    await main?.setFocus();
  };

  return (
    <main
      className={`desktop-widget desktop-widget-${kind} ${widgetOpacity === 0 ? "is-fully-transparent" : ""}`}
      style={
        {
          "--widget-rgb": hexToRgb(widgetColor),
          "--widget-opacity": widgetOpacity / 100,
          "--widget-accent": widgetColor,
        } as CSSProperties
      }
    >
      <header className="desktop-widget-head" data-tauri-drag-region>
        <div data-tauri-drag-region>
          <span className="desktop-widget-kicker">GROW WITH TIME</span>
          <strong data-tauri-drag-region>{TITLES[kind]}</strong>
        </div>
        <div className="desktop-widget-actions">
          <button
            type="button"
            title="调整浮窗颜色"
            aria-label="调整浮窗颜色"
            className={paletteOpen ? "is-active" : ""}
            onClick={() => setPaletteOpen((value) => !value)}
          >
            ◐
          </button>
          <button type="button" title="打开主程序" onClick={() => void openMain()}>
            ↗
          </button>
          <button
            type="button"
            title="隐藏组件"
            onClick={() => void getCurrentWebviewWindow().hide()}
          >
            ×
          </button>
        </div>
      </header>

      {paletteOpen ? (
        <aside className="widget-palette" aria-label="浮窗配色">
          <div className="widget-palette-title">
            <strong>浮窗配色</strong>
            <span>{widgetOpacity}%</span>
          </div>
          <div className="widget-palette-swatches">
            <button
              type="button"
              title="纯透明"
              aria-label="纯透明，无背景"
              className={`widget-clear-swatch ${widgetOpacity === 0 ? "is-active" : ""}`}
              onClick={() => setWidgetOpacity(0)}
            />
            {WIDGET_PALETTES.map((palette) => (
              <button
                key={palette.id}
                type="button"
                title={palette.name}
                aria-label={palette.name}
                className={widgetColor === palette.color ? "is-active" : ""}
                style={{ background: palette.color }}
                onClick={() => setWidgetColor(palette.color)}
              />
            ))}
            <label className="widget-custom-color" title="自定义颜色">
              <input
                type="color"
                value={widgetColor}
                onChange={(event) => setWidgetColor(event.target.value)}
              />
              <span>＋</span>
            </label>
          </div>
          <label className="widget-opacity-control">
            <span>透明度</span>
            <input
              type="range"
              min="0"
              max="96"
              value={widgetOpacity}
              onChange={(event) => setWidgetOpacity(Number(event.target.value))}
            />
          </label>
        </aside>
      ) : null}

      {kind === "calendar" ? (
        <section className="widget-calendar">
          <div className="widget-calendar-toolbar">
            <button
              type="button"
              onClick={() =>
                setMonth(
                  new Date(month.getFullYear(), month.getMonth() - 1, 1),
                )
              }
            >
              ‹
            </button>
            <strong>
              {month.getFullYear()}年 {month.getMonth() + 1}月
            </strong>
            <button
              type="button"
              onClick={() =>
                setMonth(
                  new Date(month.getFullYear(), month.getMonth() + 1, 1),
                )
              }
            >
              ›
            </button>
          </div>
          <div className="widget-calendar-weekdays">
            {"一二三四五六日".split("").map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="widget-calendar-grid">
            {calendarDays.map((date) => {
              const key = dateKey(date);
              const dayTasks = activeTasksByDate.get(key) ?? [];
              return (
                <div
                  key={key}
                  className={[
                    "widget-calendar-day",
                    date.getMonth() !== month.getMonth() ? "is-outside" : "",
                    key === today ? "is-today" : "",
                  ].join(" ")}
                  title={
                    dayTasks.length
                      ? dayTasks.map((task) => task.title).join("\n")
                      : "暂无任务"
                  }
                >
                  <span>{date.getDate()}</span>
                  <div className="widget-calendar-dots">
                    {dayTasks.slice(0, 4).map((task) => (
                      <i
                        key={task.id}
                        style={{ background: priorityColor(task.priority) }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <footer className="widget-calendar-summary">
            本月还有{" "}
            {[...activeTasksByDate.entries()]
              .filter(([key]) => key.startsWith(monthKey(month)))
              .reduce((sum, [, list]) => sum + list.length, 0)}{" "}
            项任务
          </footer>
        </section>
      ) : null}

      {kind === "today" ? (
        <section className="widget-today">
          <div className="widget-quick-row">
            <input
              value={taskText}
              placeholder="添加今日任务…"
              onChange={(event) => setTaskText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveTask();
              }}
            />
            <button type="button" disabled={busy} onClick={() => void saveTask()}>
              +
            </button>
          </div>
          <div className="widget-task-list">
            {todayTasks.map((task) => (
              <article
                key={task.id}
                className={`widget-task ${isOverdue(task) ? "is-overdue" : ""}`}
              >
                <button
                  className="widget-task-check"
                  type="button"
                  aria-label={`完成 ${task.title}`}
                  onClick={() => void toggleTaskComplete(task.id).then(refresh)}
                />
                <div>
                  <strong>{task.title}</strong>
                  <span>
                    {task.due_time
                      ? `${task.due_time}${task.end_time ? `–${task.end_time}` : ""}`
                      : isOverdue(task)
                        ? "已过期"
                        : "今天"}
                    {" · "}P{task.priority}
                  </span>
                </div>
              </article>
            ))}
            {!todayTasks.length ? (
              <div className="widget-empty">今天已经清空，做得很好。</div>
            ) : null}
          </div>
          <footer className="widget-progress">
            <span>今日待完成</span>
            <strong>{todayTasks.length}</strong>
          </footer>
        </section>
      ) : null}

      {kind === "memo" ? (
        <section className="widget-memos">
          <div className="widget-memo-compose">
            <textarea
              value={memoText}
              placeholder={"写下想法…\n支持 Markdown 与任务清单"}
              onChange={(event) => setMemoText(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  (event.ctrlKey || event.metaKey)
                ) {
                  event.preventDefault();
                  void saveMemo();
                }
              }}
            />
            <button type="button" disabled={busy} onClick={() => void saveMemo()}>
              保存
            </button>
          </div>
          <div className="widget-memo-list">
            {[...memos]
              .sort((a, b) => b.pinned - a.pinned)
              .slice(0, 8)
              .map((memo) => (
                <article key={memo.id} className="widget-memo-card">
                  <button
                    type="button"
                    className="widget-pin"
                    title={memo.pinned ? "取消置顶" : "置顶"}
                    onClick={() =>
                      void updateMemo(memo.id, {
                        pinned: memo.pinned ? 0 : 1,
                      }).then(refresh)
                    }
                  >
                    {memo.pinned ? "●" : "○"}
                  </button>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {memo.content}
                  </ReactMarkdown>
                </article>
              ))}
            {!memos.length ? (
              <div className="widget-empty">还没有备忘，写下第一条吧。</div>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
