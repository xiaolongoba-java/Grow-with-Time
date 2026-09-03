import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { notifyWidgetError, openMainWindow, runWidgetAction } from "@/lib/openMainWindow";
import type { NavId } from "@/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createTask, fetchTasks, toggleTaskComplete } from "@/lib/db/tasks";
import { createMemo, fetchMemos, updateMemo } from "@/lib/db/memos";
import { fetchAnniversaries } from "@/lib/db/moments";
import {
  anniversaryDatesInMonth,
  formatAnniversaryAnchor,
  listUpcomingAnniversaries,
} from "@/lib/anniversaries";
import { isOverdue, todayDateString } from "@/lib/dates";
import { bindVisibleDataRefresh, emitDataChanged } from "@/lib/widgetRefresh";
import { restoreWidgetPosition } from "@/lib/widgetWindow";
import type { Anniversary, Memo, Task } from "@/types";

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
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>([]);
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
    const [nextTasks, nextMemos, nextAnniversaries] = await Promise.all([
      fetchTasks(),
      fetchMemos(),
      fetchAnniversaries(),
    ]);
    setTasks(nextTasks);
    setMemos(nextMemos);
    setAnniversaries(nextAnniversaries);
  };

  useEffect(() => {
    document.documentElement.dataset.desktopWidget = kind;
    document.body.dataset.desktopWidget = kind;
    const unbind = bindVisibleDataRefresh(() => refresh(), { fallbackMs: 30_000 });
    const current = getCurrentWebviewWindow();
    const positionKey = `minimal.widget.position.${kind}`;
    void restoreWidgetPosition(current, positionKey);
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
      unbind();
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

  const upcomingAnniversaries = useMemo(
    () => listUpcomingAnniversaries(anniversaries, today, 30, 4),
    [anniversaries, today],
  );

  const anniversaryMonthDates = useMemo(
    () =>
      anniversaryDatesInMonth(
        anniversaries,
        month.getFullYear(),
        month.getMonth(),
      ),
    [anniversaries, month],
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
      void emitDataChanged("task");
    } catch (cause) {
      notifyWidgetError(cause, "创建任务失败，请保留输入后重试");
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
      void emitDataChanged("memo");
    } catch (cause) {
      notifyWidgetError(cause, "保存备忘失败，请保留输入后重试");
    } finally {
      setBusy(false);
    }
  };

  const openMain = (nav?: NavId) => void openMainWindow(nav);
  const hideWidget = () => void runWidgetAction(
    getCurrentWebviewWindow().hide(),
    "隐藏组件失败",
  );

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
          <button type="button" title="打开主程序" onClick={() => openMain()}>
            ↗
          </button>
          <button
            type="button"
            title="隐藏组件"
            onClick={hideWidget}
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
              const anniTitles = anniversaryMonthDates.get(key) ?? [];
              const tipParts = [
                ...dayTasks.map((task) => task.title),
                ...anniTitles.map((title) => `纪念日 · ${title}`),
              ];
              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  className={[
                    "widget-calendar-day",
                    date.getMonth() !== month.getMonth() ? "is-outside" : "",
                    key === today ? "is-today" : "",
                    anniTitles.length ? "has-anni" : "",
                  ].join(" ")}
                  title={tipParts.length ? tipParts.join("\n") : "打开日历"}
                  onClick={() => openMain("calendar")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openMain("calendar");
                    }
                  }}
                >
                  <span>{date.getDate()}</span>
                  <div className="widget-calendar-dots">
                    {dayTasks.slice(0, 3).map((task) => (
                      <i
                        key={task.id}
                        style={{ background: priorityColor(task.priority) }}
                      />
                    ))}
                    {anniTitles.length ? (
                      <i className="is-anni" key="anni" />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {upcomingAnniversaries.length ? (
            <ul className="widget-anni-list">
              {upcomingAnniversaries.map(({ item, daysLeft }) => (
                <li
                  key={item.id}
                  className={`is-clickable ${daysLeft === 0 ? "is-today" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openMain("anniversaries")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openMain("anniversaries");
                    }
                  }}
                >
                  <span>{item.title}</span>
                  <strong>{daysLeft === 0 ? "今天" : `${daysLeft}天`}</strong>
                  <em>{formatAnniversaryAnchor(item)}</em>
                </li>
              ))}
            </ul>
          ) : null}
          <footer className="widget-calendar-summary">
            本月还有{" "}
            {[...activeTasksByDate.entries()]
              .filter(([key]) => key.startsWith(monthKey(month)))
              .reduce((sum, [, list]) => sum + list.length, 0)}{" "}
            项任务
            {anniversaryMonthDates.size
              ? ` · ${anniversaryMonthDates.size} 个纪念日`
              : ""}
          </footer>
        </section>
      ) : null}

      {kind === "today" ? (
        <section className="widget-today">
          {upcomingAnniversaries.length ? (
            <ul className="widget-anni-list">
              {upcomingAnniversaries.map(({ item, daysLeft }) => (
                <li
                  key={item.id}
                  className={`is-clickable ${daysLeft === 0 ? "is-today" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openMain("anniversaries")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openMain("anniversaries");
                    }
                  }}
                >
                  <span>{item.title}</span>
                  <strong>{daysLeft === 0 ? "今天" : `${daysLeft}天`}</strong>
                  <em>{formatAnniversaryAnchor(item)}</em>
                </li>
              ))}
            </ul>
          ) : null}
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
                  onClick={(event) => {
                    event.stopPropagation();
                    void runWidgetAction(
                      toggleTaskComplete(task.id).then(async () => {
                        await refresh();
                        await emitDataChanged("task");
                      }),
                      "更新任务失败",
                    );
                  }}
                />
                <div
                  className="widget-task-body is-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => openMain("today")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openMain("today");
                    }
                  }}
                >
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
                <article
                  key={memo.id}
                  className="widget-memo-card is-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => openMain("memos")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openMain("memos");
                    }
                  }}
                >
                  <div className="widget-memo-actions"><button type="button" title={memo.pinned ? "取消置顶" : "置顶"} onClick={(event) => { event.stopPropagation(); void runWidgetAction(updateMemo(memo.id, { pinned: memo.pinned ? 0 : 1 }).then(async () => { await refresh(); await emitDataChanged("memo"); }), "更新备忘失败"); }}>{memo.pinned ? "●" : "○"}</button><button type="button" title="归档" aria-label={`归档 ${memo.title || "备忘录"}`} onClick={(event) => { event.stopPropagation(); void runWidgetAction(updateMemo(memo.id, { archived: 1 }).then(async () => { await refresh(); await emitDataChanged("memo"); }), "归档备忘失败"); }}>⌄</button></div>
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
