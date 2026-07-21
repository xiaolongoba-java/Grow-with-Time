import { useEffect, useMemo, useRef } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useAppStore } from "@/store/app";
import {
  boardColumns,
  filterTasksByView,
  getEmptyMessage,
  getViewTitle,
} from "@/lib/tasks";
import { formatDueDate, formatTimeRange, priorityLabel, todayDateString, addDays, formatLongDate, weekDates, parseDate, startOfWeek, parseTimeToMinutes } from "@/lib/dates";
import type { Task } from "@/types";
import { SettingsView } from "@/components/SettingsView";
import { HabitsView } from "@/components/HabitsView";
import { RemindersView } from "@/components/RemindersView";
import { ReviewView } from "@/components/ReviewView";
import { MemosView } from "@/components/MemosView";
import { ExpandableTaskItem } from "@/components/ExpandableTaskItem";

function BoardView({ tasks }: { tasks: Task[] }) {
  const cols = boardColumns(tasks);
  const saveTask = useAppStore((s) => s.saveTask);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const id = String(active.id);
    const col = String(over.id);
    if (col === "pending") void saveTask(id, { status: "pending" });
    if (col === "completed") void saveTask(id, { status: "completed" });
    if (col === "overdue") {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const d = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
      void saveTask(id, { status: "pending", due_date: d });
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="board">
        {(
          [
            ["pending", "进行中", cols.pending],
            ["overdue", "已过期", cols.overdue],
            ["completed", "已完成", cols.completed],
          ] as const
        ).map(([id, title, list]) => (
          <div key={id} className="board-col" id={id}>
            <h3>
              {title} · {list.length}
            </h3>
            <SortableContext items={list.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {list.map((task) => (
                <ExpandableTaskItem
                  key={task.id}
                  task={task}
                  meta={<span>{formatDueDate(task.due_date)}</span>}
                />
              ))}
            </SortableContext>
          </div>
        ))}
      </div>
    </DndContext>
  );
}

function DayBoard() {
  const allTasks = useAppStore((s) => s.tasks);
  const cursor = useAppStore((s) => s.calendarCursor);
  const setCalendarCursor = useAppStore((s) => s.setCalendarCursor);
  const today = todayDateString();

  const dayTasks = useMemo(() => {
    return allTasks
      .filter((t) => {
        if (t.parent_id || t.deleted_at) return false;
        if (t.due_date === cursor) return true;
        // Viewing today: also show unfinished overdue tasks (rollover fallback).
        return (
          cursor === today &&
          t.status === "pending" &&
          t.due_date !== null &&
          t.due_date < today
        );
      })
      .sort((a, b) => (a.due_time ?? "").localeCompare(b.due_time ?? ""));
  }, [allTasks, cursor, today]);
  const pending = dayTasks.filter((t) => t.status === "pending").length;
  const done = dayTasks.filter((t) => t.status === "completed").length;

  return (
    <div className="scope-board">
      <div className="scope-nav">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setCalendarCursor(addDays(cursor, -1))}
        >
          ‹
        </button>
        <strong>{formatLongDate(cursor)}</strong>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setCalendarCursor(addDays(cursor, 1))}
        >
          ›
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setCalendarCursor(today)}
        >
          今日
        </button>
      </div>

      <div className="scope-summary">
        <div className="scope-card">
          <span>待办</span>
          <strong>{pending}</strong>
        </div>
        <div className="scope-card">
          <span>已完成</span>
          <strong>{done}</strong>
        </div>
      </div>

      <div className="day-agenda">
        <h3 className="scope-section-title">
          {cursor === today ? "今日安排" : "当日安排"}
        </h3>
        {!dayTasks.length ? (
          <div className="scope-empty">这一天暂无任务</div>
        ) : (
          dayTasks.map((task) => (
            <ExpandableTaskItem
              key={task.id}
              task={task}
              meta={
                <>
                  <span>{formatTimeRange(task.due_time, task.end_time)}</span>
                  <span>{priorityLabel(task.priority)}</span>
                </>
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function WeekBoard() {
  const allTasks = useAppStore((s) => s.tasks);
  const cursor = useAppStore((s) => s.calendarCursor);
  const setCalendarCursor = useAppStore((s) => s.setCalendarCursor);
  const selectTask = useAppStore((s) => s.selectTask);
  const saveTask = useAppStore((s) => s.saveTask);
  const bodyRef = useRef<HTMLDivElement>(null);
  const today = todayDateString();
  const weekStart = startOfWeek(cursor);
  const days = weekDates(cursor);
  const weekLabel = `${formatLongDate(days[0])} – ${parseDate(days[6]).getMonth() + 1}月${parseDate(days[6]).getDate()}日`;

  const weekTasks = useMemo(() => {
    const end = addDays(weekStart, 6);
    return allTasks.filter(
      (t) =>
        !t.parent_id &&
        !t.deleted_at &&
        t.due_date !== null &&
        t.due_date >= weekStart &&
        t.due_date <= end,
    );
  }, [allTasks, weekStart]);

  const pending = weekTasks.filter((t) => t.status === "pending").length;
  const done = weekTasks.filter((t) => t.status === "completed").length;

  const hourStart = 8;
  const hours = Array.from({ length: 15 }, (_, i) => i + hourStart); // 08–22
  const slotH = 48;
  const now = new Date();
  const nowDay = today;
  const nowTop =
    ((now.getHours() - hourStart) * 60 + now.getMinutes()) / 60 * slotH;

  const weekday = ["日", "一", "二", "三", "四", "五", "六"];

  // 自动滚到当前时间，避免晚上的任务看起来像“没显示”
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const target = Math.max(0, nowTop - 80);
    el.scrollTop = target;
  }, [weekStart, nowTop]);

  return (
    <div className="scope-board">
      <div className="scope-nav">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setCalendarCursor(addDays(cursor, -7))}
        >
          ‹
        </button>
        <strong>{weekLabel}</strong>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setCalendarCursor(addDays(cursor, 7))}
        >
          ›
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setCalendarCursor(today)}
        >
          今日
        </button>
      </div>

      <div className="scope-summary">
        <div className="scope-card">
          <span>本周待办</span>
          <strong>{pending}</strong>
        </div>
        <div className="scope-card">
          <span>本周完成</span>
          <strong>{done}</strong>
        </div>
      </div>

      {weekTasks.length ? (
        <div className="week-task-strip">
          {weekTasks.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`week-chip ${t.status === "completed" ? "is-done" : ""}`}
              onClick={() => selectTask(t.id)}
              title={`${t.due_date} ${formatTimeRange(t.due_time, t.end_time)}`}
            >
              <span className="week-chip-date">
                {t.due_date?.slice(5)} {formatTimeRange(t.due_time, t.end_time)}
              </span>
              {t.title}
            </button>
          ))}
        </div>
      ) : (
        <div className="scope-empty">本周暂无带日期的任务</div>
      )}

      <div className="week-board" ref={bodyRef}>
        <div className="week-head">
          <div className="week-gutter" />
          {days.map((date) => {
            const d = parseDate(date);
            return (
              <div
                key={date}
                className={`week-day-head ${date === today ? "is-today" : ""}`}
              >
                <span>{weekday[d.getDay()]}</span>
                <strong>{d.getDate()}</strong>
              </div>
            );
          })}
        </div>

        <div className="week-allday">
          <div className="week-gutter">
            <span className="week-allday-label">全天</span>
          </div>
          {days.map((date) => (
            <div key={date} className="week-allday-cell">
              {weekTasks
                .filter((t) => t.due_date === date && !t.due_time)
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="week-allday-event"
                    onClick={() => selectTask(t.id)}
                  >
                    {t.title}
                  </button>
                ))}
            </div>
          ))}
        </div>

        <div className="week-body">
          <div className="week-gutter">
            {hours.map((h) => (
              <div key={h} className="week-hour" style={{ height: slotH }}>
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {days.map((date) => (
            <div
              key={date}
              className="week-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/task");
                if (id) void saveTask(id, { due_date: date });
              }}
            >
              {hours.map((h) => (
                <div key={h} className="week-slot" style={{ height: slotH }} />
              ))}
              {date === nowDay &&
              now.getHours() >= hourStart &&
              now.getHours() <= hourStart + hours.length - 1 ? (
                <div className="now-line week-now" style={{ top: nowTop }} />
              ) : null}
              {weekTasks
                .filter((t) => t.due_date === date && t.due_time)
                .map((t) => {
                  const startMin = parseTimeToMinutes(t.due_time)!;
                  const endMin =
                    parseTimeToMinutes(t.end_time) ?? startMin + 60;
                  const duration = Math.max(30, endMin - startMin);
                  const top =
                    ((startMin - hourStart * 60) / 60) * slotH;
                  const height = (duration / 60) * slotH;
                  return (
                    <div
                      key={t.id}
                      className={`week-event ${t.status === "completed" ? "is-done" : ""}`}
                      style={{
                        top: Math.max(0, top),
                        height: Math.max(28, height),
                      }}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/task", t.id)
                      }
                      onClick={() => selectTask(t.id)}
                    >
                      <span className="week-event-time">
                        {formatTimeRange(t.due_time, t.end_time)}
                      </span>
                      {t.title}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthBoard() {
  const allTasks = useAppStore((s) => s.tasks);
  const cursor = useAppStore((s) => s.calendarCursor);
  const setCalendarCursor = useAppStore((s) => s.setCalendarCursor);
  const setDateScope = useAppStore((s) => s.setDateScope);
  const selectTask = useAppStore((s) => s.selectTask);
  const saveTask = useAppStore((s) => s.saveTask);
  const today = todayDateString();

  const year = Number(cursor.slice(0, 4));
  const month = Number(cursor.slice(5, 7)) - 1;
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { date: string | null; day: number | null }[] = [];
  for (let i = 0; i < startPad; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date, day: d });
  }

  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const monthTasks = allTasks.filter(
    (t) =>
      !t.parent_id &&
      !t.deleted_at &&
      t.due_date !== null &&
      t.due_date >= monthStart &&
      t.due_date <= monthEnd,
  );
  const pending = monthTasks.filter((t) => t.status === "pending").length;
  const done = monthTasks.filter((t) => t.status === "completed").length;

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setCalendarCursor(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
    );
  };

  return (
    <div className="scope-board">
      <div className="scope-nav">
        <button type="button" className="btn-ghost" onClick={() => shiftMonth(-1)}>
          ‹
        </button>
        <strong>
          {year}年{month + 1}月
        </strong>
        <button type="button" className="btn-ghost" onClick={() => shiftMonth(1)}>
          ›
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setCalendarCursor(today)}
        >
          今日
        </button>
      </div>

      <div className="scope-summary">
        <div className="scope-card">
          <span>本月待办</span>
          <strong>{pending || "本月无待办"}</strong>
        </div>
        <div className="scope-card">
          <span>本月完成</span>
          <strong>{done}</strong>
        </div>
      </div>

      <div className="calendar-grid month-grid">
        {["日", "一", "二", "三", "四", "五", "六"].map((w) => (
          <div key={w} className="cal-weekday">
            {w}
          </div>
        ))}
        {cells.map((cell, idx) => (
          <div
            key={idx}
            className={`cal-cell ${cell.date ? "" : "muted"} ${cell.date === today ? "is-today" : ""}`}
            onClick={() => {
              if (cell.date) {
                setCalendarCursor(cell.date);
                setDateScope("day");
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/task");
              if (id && cell.date) void saveTask(id, { due_date: cell.date });
            }}
          >
            {cell.day ? <div className="cal-day">{cell.day}</div> : null}
            {cell.date
              ? allTasks
                  .filter(
                    (t) =>
                      !t.parent_id &&
                      !t.deleted_at &&
                      t.due_date === cell.date,
                  )
                  .slice(0, 3)
                  .map((t) => (
                    <div
                      key={t.id}
                      className="cal-task"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/task", t.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectTask(t.id);
                      }}
                    >
                      {t.title}
                    </div>
                  ))
              : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function TrashView() {
  const trashTasks = useAppStore((s) => s.trashTasks);
  const restoreTask = useAppStore((s) => s.restoreTask);
  const purgeTrash = useAppStore((s) => s.purgeTrash);

  return (
    <div className="task-scroll">
      <div style={{ marginBottom: 12 }}>
        <button
          type="button"
          className="btn-ghost danger"
          disabled={!trashTasks.length}
          onClick={() => {
            if (window.confirm("确定清空回收站？")) void purgeTrash();
          }}
        >
          清空回收站
        </button>
      </div>
      {!trashTasks.length ? (
        <div className="empty-state">{getEmptyMessage("trash")}</div>
      ) : (
        trashTasks.map((task) => (
          <div key={task.id} className="task-row">
            <div>
              <p className="task-title">{task.title}</p>
            </div>
            <button type="button" className="btn-ghost" onClick={() => void restoreTask(task.id)}>
              恢复
            </button>
          </div>
        ))
      )}
    </div>
  );
}

export function MainWorkspace() {
  const nav = useAppStore((s) => s.nav);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const dateScope = useAppStore((s) => s.dateScope);
  const setDateScope = useAppStore((s) => s.setDateScope);
  const tasks = useAppStore((s) => s.tasks);
  const tagMap = useAppStore((s) => s.tagMap);
  const activeTagId = useAppStore((s) => s.activeTagId);
  const filter = useAppStore((s) => s.filter);

  const visible = useMemo(
    () => filterTasksByView(tasks, nav, tagMap, activeTagId, filter),
    [tasks, nav, tagMap, activeTagId, filter],
  );

  useEffect(() => {
    if (nav === "board") setViewMode("board");
    if (nav === "calendar") {
      setViewMode("calendar");
      setDateScope("month");
    }
  }, [nav, setViewMode, setDateScope]);

  if (nav === "settings") return <SettingsView />;
  if (nav === "habits") return <HabitsView />;
  if (nav === "reminders") {
    return (
      <main className="main-workspace">
        <div className="workspace-top">
          <h2>{getViewTitle("reminders")}</h2>
        </div>
        <RemindersView />
      </main>
    );
  }
  if (nav === "review") return <ReviewView />;
  if (nav === "memos") return <MemosView />;
  if (nav === "trash") {
    return (
      <main className="main-workspace">
        <div className="workspace-top">
          <h2>{getViewTitle("trash")}</h2>
        </div>
        <TrashView />
      </main>
    );
  }

  const useScopeBoard = nav !== "board";

  return (
    <main className="main-workspace">
      <div className="workspace-top">
        <h2>{getViewTitle(nav)}</h2>
        <div className="top-controls">
          {useScopeBoard ? (
            <div className="seg">
              {(["day", "week", "month"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={dateScope === s ? "active" : ""}
                  onClick={() => setDateScope(s)}
                >
                  {s === "day" ? "日" : s === "week" ? "周" : "月"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {useScopeBoard && dateScope === "day" ? <DayBoard /> : null}
      {useScopeBoard && dateScope === "week" ? <WeekBoard /> : null}
      {useScopeBoard && dateScope === "month" ? <MonthBoard /> : null}
      {!useScopeBoard ? <BoardView tasks={visible} /> : null}
    </main>
  );
}

