import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { notifyWidgetError, openMainWindow, runWidgetAction } from "@/lib/openMainWindow";
import type { NavId } from "@/types";
import { fetchTasks } from "@/lib/db/tasks";
import { createMemo, fetchMemos } from "@/lib/db/memos";
import {
  fetchAnniversaries,
  fetchDailyReflections,
  fetchInspirations,
} from "@/lib/db/moments";
import { fetchHabitChecks, fetchHabits, toggleHabitCheck } from "@/lib/db/taxonomy";
import { fetchTimers } from "@/lib/db/timers";
import { formatLongDate, todayDateString } from "@/lib/dates";
import {
  anniversaryDatesInMonth,
  formatAnniversaryAnchor,
  listUpcomingAnniversaries,
} from "@/lib/anniversaries";
import { emitDataChanged, bindVisibleDataRefresh } from "@/lib/widgetRefresh";
import { restoreWidgetPosition } from "@/lib/widgetWindow";
import { formatCountdown, liveRemaining } from "@/lib/timers";
import type { Anniversary, Habit, HabitCheck, Memo, Task, Timer } from "@/types";

const FALLBACK_QUOTES = [
  "日进一步，拾光成河。",
  "把今天过成值得回望的一天。",
  "完成比完美更重要。",
  "先动起来，节奏会自己来。",
  "小事坚持，终成习惯。",
];

const PALETTES = [
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

function greetingForHour(hour: number) {
  if (hour < 5) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateKey(date: Date) {
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekdayLabel(date: Date) {
  return ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
}

export function DashboardStripApp() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checks, setChecks] = useState<HabitCheck[]>([]);
  const [timers, setTimers] = useState<Timer[]>([]);
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>([]);
  const [quote, setQuote] = useState(FALLBACK_QUOTES[0]);
  const [memoText, setMemoText] = useState("");
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const value = new Date();
    value.setDate(1);
    value.setHours(0, 0, 0, 0);
    return value;
  });
  const [color, setColor] = useState(() => {
    try {
      return localStorage.getItem("minimal.dashboard.color") ?? "#355b8a";
    } catch {
      return "#355b8a";
    }
  });
  const [opacity, setOpacity] = useState(() => {
    try {
      const saved = localStorage.getItem("minimal.dashboard.opacity");
      return saved === null ? 84 : Number(saved);
    } catch {
      return 84;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("minimal.dashboard.color", color);
      localStorage.setItem("minimal.dashboard.opacity", String(opacity));
    } catch {
      /* ignore */
    }
  }, [color, opacity]);

  const refresh = async () => {
    const [
      nextTasks,
      nextMemos,
      nextHabits,
      nextChecks,
      nextTimers,
      nextAnniversaries,
      inspirations,
      reflections,
    ] = await Promise.all([
      fetchTasks(),
      fetchMemos(),
      fetchHabits(),
      fetchHabitChecks(),
      fetchTimers(),
      fetchAnniversaries(),
      fetchInspirations(false),
      fetchDailyReflections(),
    ]);
    setTasks(nextTasks);
    setMemos(nextMemos);
    setHabits(nextHabits);
    setChecks(nextChecks);
    setTimers(nextTimers);
    setAnniversaries(nextAnniversaries);

    const today = todayDateString();
    const highlight = reflections.find((item) => item.reflection_date === today)?.highlight?.trim();
    const inspiration = inspirations.find((item) => item.status === "inbox")?.content?.trim();
    if (highlight) setQuote(highlight);
    else if (inspiration) setQuote(inspiration.slice(0, 48));
    else setQuote(FALLBACK_QUOTES[Math.floor(Date.now() / 86_400_000) % FALLBACK_QUOTES.length]);
  };

  useEffect(() => {
    document.documentElement.dataset.desktopWidget = "dashboard";
    document.body.dataset.desktopWidget = "dashboard";
    const unbind = bindVisibleDataRefresh(() => refresh(), { fallbackMs: 30_000 });
    const tick = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    const current = getCurrentWebviewWindow();
    const positionKey = "minimal.dashboard.position";
    void restoreWidgetPosition(current, positionKey);
    let unlistenMoved: (() => void) | undefined;
    void current
      .onMoved(({ payload }) => {
        localStorage.setItem(
          positionKey,
          JSON.stringify({ x: payload.x, y: payload.y }),
        );
      })
      .then((unlisten) => {
        unlistenMoved = unlisten;
      });

    return () => {
      unbind();
      window.clearInterval(tick);
      unlistenMoved?.();
      delete document.documentElement.dataset.desktopWidget;
      delete document.body.dataset.desktopWidget;
    };
  }, []);

  const today = todayDateString();
  const greeting = greetingForHour(new Date(nowMs).getHours());
  const pendingToday = useMemo(
    () =>
      tasks.filter(
        (task) =>
          !task.parent_id &&
          !task.deleted_at &&
          !["completed", "cancelled"].includes(task.status) &&
          task.due_date !== null &&
          task.due_date <= today,
      ).length,
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

  const pinnedMemos = useMemo(
    () =>
      [...memos]
        .sort((a, b) => b.pinned - a.pinned || b.updated_at.localeCompare(a.updated_at))
        .slice(0, 4),
    [memos],
  );

  const checkedToday = useMemo(() => {
    const set = new Set(
      checks.filter((item) => item.check_date === today).map((item) => item.habit_id),
    );
    return set;
  }, [checks, today]);

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

  const taskDates = useMemo(() => {
    const set = new Set<string>();
    for (const task of tasks) {
      if (
        task.due_date &&
        !task.deleted_at &&
        !["completed", "cancelled"].includes(task.status)
      ) {
        set.add(task.due_date);
      }
    }
    return set;
  }, [tasks]);

  const activeTimers = useMemo(
    () =>
      timers
        .filter((timer) => timer.enabled)
        .sort((a, b) => Number(b.running) - Number(a.running) || a.title.localeCompare(b.title))
        .slice(0, 3),
    [timers],
  );

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

  const toggleHabit = async (habitId: string) => runWidgetAction(
    toggleHabitCheck(habitId, today).then(async () => {
      await refresh();
      await emitDataChanged("habit");
    }),
    "习惯打卡失败",
  );

  const openMain = (nav?: NavId) => void openMainWindow(nav);
  const hideWidget = () => void runWidgetAction(
    getCurrentWebviewWindow().hide(),
    "隐藏组件失败",
  );

  return (
    <main
      className={`dashboard-strip ${opacity === 0 ? "is-fully-transparent" : ""}`}
      style={
        {
          "--widget-rgb": hexToRgb(color),
          "--widget-opacity": opacity / 100,
          "--widget-accent": color,
        } as CSSProperties
      }
    >
      <header className="dashboard-strip-head" data-tauri-drag-region>
        <div data-tauri-drag-region>
          <span className="desktop-widget-kicker">GROW WITH TIME</span>
          <strong data-tauri-drag-region>桌面仪表盘</strong>
        </div>
        <div className="desktop-widget-actions">
          <button
            type="button"
            title="调整配色"
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
            title="隐藏"
            onClick={hideWidget}
          >
            ×
          </button>
        </div>
      </header>

      {paletteOpen ? (
        <aside className="widget-palette dashboard-palette" aria-label="仪表盘配色">
          <div className="widget-palette-title">
            <strong>配色</strong>
            <span>{opacity}%</span>
          </div>
          <div className="widget-palette-swatches">
            {PALETTES.map((palette) => (
              <button
                key={palette.id}
                type="button"
                title={palette.name}
                className={color === palette.color ? "is-active" : ""}
                style={{ background: palette.color }}
                onClick={() => setColor(palette.color)}
              />
            ))}
          </div>
          <label className="widget-opacity-control">
            <span>透明度</span>
            <input
              type="range"
              min="0"
              max="96"
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
            />
          </label>
        </aside>
      ) : null}

      <div className="dashboard-strip-body">
        <section
          className="dash-panel dash-greeting"
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
          <p className="dash-hello">{greeting}</p>
          <p className="dash-date">
            {formatLongDate(today)} · 周{weekdayLabel(new Date())}
          </p>
          <p className="dash-meta">今日待办 {pendingToday} 项</p>
          {upcomingAnniversaries[0] ? (
            <p className="dash-meta dash-anni">
              {`${upcomingAnniversaries[0].item.title} · ${
                upcomingAnniversaries[0].daysLeft === 0
                  ? "就是今天"
                  : `还有 ${upcomingAnniversaries[0].daysLeft} 天`
              }`}
            </p>
          ) : null}
        </section>

        <section className="dash-panel dash-memos">
          <div
            className="dash-panel-title is-link"
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
            备忘录
          </div>
          <ul>
            {pinnedMemos.length === 0 ? (
              <li className="dash-empty">暂无备忘</li>
            ) : (
              pinnedMemos.map((memo) => (
                <li
                  key={memo.id}
                  className="is-clickable"
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
                  {memo.pinned ? "📌 " : ""}
                  {(memo.title || memo.content).slice(0, 28)}
                </li>
              ))
            )}
          </ul>
          <form
            className="dash-compose"
            onSubmit={(event) => {
              event.preventDefault();
              void saveMemo();
            }}
          >
            <input
              value={memoText}
              placeholder="速记一条…"
              onChange={(event) => setMemoText(event.target.value)}
            />
            <button type="submit" disabled={busy || !memoText.trim()}>
              +
            </button>
          </form>
        </section>

        <section className="dash-panel dash-habits">
          <div
            className="dash-panel-title is-link"
            role="button"
            tabIndex={0}
            onClick={() => openMain("habits")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openMain("habits");
              }
            }}
          >
            打卡
          </div>
          <div className="dash-habit-list">
            {habits.length === 0 ? (
              <p className="dash-empty">暂无习惯</p>
            ) : (
              habits.slice(0, 5).map((habit) => {
                const done = checkedToday.has(habit.id);
                return (
                  <button
                    key={habit.id}
                    type="button"
                    className={`dash-habit ${done ? "is-done" : ""}`}
                    onClick={() => void toggleHabit(habit.id)}
                  >
                    <span>{done ? "✓" : "○"}</span>
                    {habit.title}
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="dash-panel dash-anniversaries">
          <div
            className="dash-panel-title is-link"
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
            纪念日
          </div>
          {upcomingAnniversaries.length === 0 ? (
            <p className="dash-empty">近 30 天暂无</p>
          ) : (
            <ul>
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
          )}
        </section>

        <section className="dash-panel dash-calendar">
          <div className="dash-panel-title dash-cal-toolbar">
            <button
              type="button"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              ‹
            </button>
            <strong>
              {month.getFullYear()}年{month.getMonth() + 1}月
            </strong>
            <button
              type="button"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              ›
            </button>
          </div>
          <div className="dash-cal-grid">
            {["一", "二", "三", "四", "五", "六", "日"].map((label) => (
              <span key={label} className="dash-cal-dow">
                {label}
              </span>
            ))}
            {calendarDays.map((day) => {
              const key = dateKey(day);
              const inMonth = day.getMonth() === month.getMonth();
              const anniTitles = anniversaryMonthDates.get(key);
              return (
                <span
                  key={key}
                  title={anniTitles?.join("、") || "打开主窗口"}
                  role="button"
                  tabIndex={0}
                  onClick={() => openMain("calendar")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openMain("calendar");
                    }
                  }}
                  className={[
                    "dash-cal-day",
                    inMonth ? "" : "is-out",
                    key === today ? "is-today" : "",
                    taskDates.has(key) ? "has-task" : "",
                    anniTitles?.length ? "has-anni" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {day.getDate()}
                </span>
              );
            })}
          </div>
        </section>

        <section className="dash-panel dash-timers">
          <div
            className="dash-panel-title is-link"
            role="button"
            tabIndex={0}
            onClick={() => openMain("reminders")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openMain("reminders");
              }
            }}
          >
            倒计时
          </div>
          {activeTimers.length === 0 ? (
            <p className="dash-empty">暂无倒计时</p>
          ) : (
            <ul>
              {activeTimers.map((timer) => (
                <li
                  key={timer.id}
                  className="is-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => openMain("reminders")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openMain("reminders");
                    }
                  }}
                >
                  <span>{timer.title}</span>
                  <strong className={timer.running ? "is-running" : ""}>
                    {formatCountdown(liveRemaining(timer, nowMs))}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="dashboard-strip-quote" data-tauri-drag-region>
        {quote}
      </footer>
    </main>
  );
}
