import { useMemo, type CSSProperties } from "react";
import { useAppStore } from "@/store/app";
import { todayDateString } from "@/lib/dates";
import {
  buildWeekBuckets,
  categoryColor,
  mondayWeekDates,
  resolveCategoryId,
  shiftWeek,
  weekdayShort,
  type WeeklyCategoryId,
} from "@/lib/weeklyChecklist";

function formatMd(date: string) {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export function WeeklyChecklistView() {
  const tasks = useAppStore((s) => s.tasks);
  const tags = useAppStore((s) => s.tags);
  const tagMap = useAppStore((s) => s.tagMap);
  const calendarCursor = useAppStore((s) => s.calendarCursor);
  const setCalendarCursor = useAppStore((s) => s.setCalendarCursor);
  const setNav = useAppStore((s) => s.setNav);
  const setDateScope = useAppStore((s) => s.setDateScope);
  const toggleComplete = useAppStore((s) => s.toggleComplete);
  const selectTask = useAppStore((s) => s.selectTask);
  const today = todayDateString();

  const weekDates = useMemo(
    () => mondayWeekDates(calendarCursor || today),
    [calendarCursor, today],
  );
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];

  const { days, categories, stats, uncategorizedHint } = useMemo(
    () => buildWeekBuckets(tasks, weekDates, tagMap, tags),
    [tasks, weekDates, tagMap, tags],
  );

  const goalLine = (id: WeeklyCategoryId) => {
    const bucket = categories.find((item) => item.category.id === id);
    if (!bucket || bucket.total === 0) return "本周暂无任务";
    const active = bucket.tasks.find((task) => task.status !== "completed");
    return active?.title ?? "本周目标已完成";
  };

  return (
    <main className="main-workspace weekly-checklist">
      <div className="workspace-top weekly-checklist-top">
        <div>
          <h2>周清单</h2>
          <p className="weekly-checklist-sub">
            {weekStart} ～ {weekEnd} · 按标签看本周目标；按小时排程请用「周历」
          </p>
        </div>
        <div className="weekly-checklist-nav">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setCalendarCursor(shiftWeek(weekStart, -1))}
          >
            ‹ 上周
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setCalendarCursor(today)}
          >
            本周
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setCalendarCursor(shiftWeek(weekStart, 1))}
          >
            下周 ›
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setNav("today");
              setDateScope("week");
            }}
          >
            打开周历
          </button>
        </div>
      </div>

      {uncategorizedHint ? (
        <p className="weekly-checklist-hint">
          提示：给任务打上「工作 / 生活 / 健康 / 学习」标签后，本周目标分栏会自动汇总。
        </p>
      ) : null}

      <section className="weekly-goals" aria-label="本周目标">
        <h3>本周目标</h3>
        <div className="weekly-goal-grid">
          {categories.map((bucket) => (
            <article
              key={bucket.category.id}
              className="weekly-goal-card"
              style={{ "--goal-accent": bucket.category.color } as CSSProperties}
            >
              <header>
                <strong>{bucket.category.label}</strong>
                <span>
                  {bucket.done}/{bucket.total}
                </span>
              </header>
              <p>{goalLine(bucket.category.id)}</p>
              <div className="weekly-goal-bar">
                <i style={{ width: `${bucket.progress}%` }} />
              </div>
              <footer>{bucket.total} 项 · {bucket.progress}%</footer>
            </article>
          ))}
        </div>
      </section>

      <section className="weekly-days" aria-label="当周日历">
        <h3>当周日历</h3>
        <div className="weekly-day-grid">
          {days.map((day) => (
            <div
              key={day.date}
              className={`weekly-day-col ${day.date === today ? "is-today" : ""}`}
            >
              <header>
                <strong>
                  周{weekdayShort(day.date)} {formatMd(day.date)}
                </strong>
                <span>
                  {day.done}/{day.total}
                </span>
                <div className="weekly-day-bar">
                  <i
                    style={{
                      width: `${day.total ? Math.round((day.done / day.total) * 100) : 0}%`,
                    }}
                  />
                </div>
              </header>
              <ul>
                {day.tasks.length === 0 ? (
                  <li className="weekly-day-empty">空闲</li>
                ) : (
                  day.tasks.slice(0, 8).map((task) => {
                    const cat = resolveCategoryId(task.id, tagMap, tags);
                    return (
                      <li key={task.id}>
                        <button
                          type="button"
                          className={`weekly-day-task ${task.status === "completed" ? "is-done" : ""}`}
                          onClick={() => selectTask(task.id)}
                        >
                          <span
                            className="weekly-dot"
                            style={{ background: categoryColor(cat) }}
                          />
                          <span className="weekly-day-title">{task.title}</span>
                          <span
                            className="weekly-day-check"
                            role="checkbox"
                            aria-checked={task.status === "completed"}
                            onClick={(event) => {
                              event.stopPropagation();
                              void toggleComplete(task.id);
                            }}
                          >
                            {task.status === "completed" ? "✓" : "○"}
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="weekly-stats" aria-label="当周统计">
        <h3>当周数据</h3>
        <div className="weekly-stat-grid">
          <article>
            <span>本周事项</span>
            <strong>{stats.total}</strong>
            <p>
              完成 {stats.done} · 剩余 {stats.remaining}
            </p>
          </article>
          <article>
            <span>峰值日</span>
            <strong>
              {stats.peakDay ? `周${weekdayShort(stats.peakDay)}` : "—"}
            </strong>
            <p>
              {stats.peakDay
                ? `${stats.peakDone}/${stats.peakTotal} 完成`
                : "本周暂无安排"}
            </p>
          </article>
          <article>
            <span>满勤天数</span>
            <strong>{stats.streakDays}</strong>
            <p>当日事项全部完成的天数</p>
          </article>
          <article className="weekly-load-card">
            <span>日负荷</span>
            <div className="weekly-load-bars" aria-hidden>
              {stats.load.map((value, index) => (
                <i
                  key={weekDates[index]}
                  style={{ height: `${Math.max(12, Math.round(value * 100))}%` }}
                  title={`${weekDates[index]} · ${days[index].total} 项`}
                />
              ))}
            </div>
            <p>相对本周最高负荷</p>
          </article>
        </div>
      </section>
    </main>
  );
}
