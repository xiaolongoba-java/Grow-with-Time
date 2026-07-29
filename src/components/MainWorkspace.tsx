import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  isActiveTask,
} from "@/lib/tasks";
import { formatDueDate, formatTimeRange, priorityLabel, todayDateString, addDays, formatLongDate, weekDates, parseDate, startOfWeek, parseTimeToMinutes } from "@/lib/dates";
import type { Task } from "@/types";
import { SettingsView } from "@/components/SettingsView";
import { HabitsView } from "@/components/HabitsView";
import { RemindersView } from "@/components/RemindersView";
import { ReviewView } from "@/components/ReviewView";
import { MemosView } from "@/components/MemosView";
import { ExpandableTaskItem } from "@/components/ExpandableTaskItem";
import { ProjectsView } from "@/components/ProjectsView";
import {
  findTimeConflictIds,
  pendingEstimatedMinutes,
  suggestDaySchedule,
} from "@/lib/planning";
import { saveDaySnapshot } from "@/lib/db";

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
  const nav = useAppStore((s) => s.nav);
  const saveTask = useAppStore((s) => s.saveTask);
  const cursor = useAppStore((s) => s.calendarCursor);
  const setCalendarCursor = useAppStore((s) => s.setCalendarCursor);
  const today = todayDateString();
  const batchComplete = useAppStore((s) => s.batchComplete);
  const batchDelete = useAppStore((s) => s.batchDelete);
  const setFocusTask = useAppStore((s) => s.setFocusTask);
  const toggleFocus = useAppStore((s) => s.toggleFocus);
  const focusRunning = useAppStore((s) => s.focusRunning);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [schedulePreview, setSchedulePreview] = useState<
    ReturnType<typeof suggestDaySchedule>
  >([]);
  const [acceptedScheduleIds, setAcceptedScheduleIds] = useState<string[]>([]);
  const [lockedScheduleIds, setLockedScheduleIds] = useState<string[]>([]);
  const [closingDay, setClosingDay] = useState(false);
  const [reflection, setReflection] = useState("");
  const [dispositions, setDispositions] = useState<Record<string, string>>({});

  const dayTasks = useMemo(() => {
    return allTasks
      .filter((t) => {
        if (t.parent_id || t.deleted_at) return false;
        if (nav === "myday") {
          return isActiveTask(t) && t.my_day_date === cursor;
        }
        if (t.due_date === cursor) return true;
        // Viewing today: also show unfinished overdue tasks (rollover fallback).
        return (
          cursor === today &&
          isActiveTask(t) &&
          t.due_date !== null &&
          t.due_date < today
        );
      })
      .sort((a, b) => (a.due_time ?? "").localeCompare(b.due_time ?? ""));
  }, [allTasks, cursor, today, nav]);
  const myDayCandidates = allTasks
    .filter(
      (task) =>
        !task.parent_id &&
        !task.deleted_at &&
        isActiveTask(task) &&
        task.my_day_date !== cursor,
    )
    .slice(0, 6);
  const pending = dayTasks.filter(isActiveTask).length;
  const done = dayTasks.filter((t) => t.status === "completed").length;
  const total = pending + done;
  const completion = total ? Math.round((done / total) * 100) : 0;
  const estimatedTotal = pendingEstimatedMinutes(dayTasks);
  const conflictIds = findTimeConflictIds(dayTasks);
  const previewSchedule = () => {
    const suggestions = suggestDaySchedule(
      dayTasks.map((task) =>
        lockedScheduleIds.includes(task.id) ? { ...task, flexible: 0 } : task,
      ),
    );
    setSchedulePreview(suggestions);
    setAcceptedScheduleIds(suggestions.map((item) => item.taskId));
    if (!suggestions.length) {
      useAppStore.getState().setToast("没有可排程的灵活任务");
    }
  };

  const applySchedule = async () => {
    for (const item of schedulePreview) {
      if (!acceptedScheduleIds.includes(item.taskId)) continue;
      await saveTask(item.taskId, {
        due_date: cursor,
        due_time: item.start,
        end_time: item.end,
      });
    }
    setSchedulePreview([]);
    useAppStore.getState().setToast("今日计划已应用");
  };

  const openDayClose = () => {
    setDispositions(
      Object.fromEntries(
        dayTasks.filter(isActiveTask).map((task) => [task.id, "tomorrow"]),
      ),
    );
    setClosingDay(true);
  };

  const settleDay = async () => {
    await saveDaySnapshot(cursor, dayTasks, "evening", reflection);
    for (const task of dayTasks.filter(isActiveTask)) {
      const choice = dispositions[task.id] ?? "tomorrow";
      if (choice === "cancel") {
        await saveTask(task.id, { status: "cancelled", my_day_date: null });
      } else if (choice === "inbox") {
        await saveTask(task.id, { my_day_date: null });
      } else {
        await saveTask(task.id, { my_day_date: addDays(cursor, 1) });
      }
    }
    setClosingDay(false);
    setReflection("");
    useAppStore.getState().setToast("今日收尾已完成");
  };

  return (
    <div className="scope-board">
      <section className="today-hero">
        <div className="today-hero-copy">
          <span className="today-eyebrow">
            {cursor === today ? "TODAY · 今日成长" : "DAILY PLAN · 当日计划"}
          </span>
          <h3>{done ? "做得很好，继续保持节奏。" : "从一件小事开始今天。"}</h3>
          <p>
            {total
              ? `今天安排 ${total} 件事 · 预计 ${Math.floor(estimatedTotal / 60)} 小时 ${estimatedTotal % 60} 分钟${estimatedTotal > 480 ? " · 计划可能过载" : ""}`
              : "暂时没有安排，给自己留一点生长的空间。"}
          </p>
          {conflictIds.size ? (
            <span className="plan-warning">
              {conflictIds.size} 项任务存在时间冲突
            </span>
          ) : null}
        </div>
        <div
          className="growth-ring"
          style={{ "--progress": completion } as CSSProperties}
          aria-label={`完成进度 ${completion}%`}
        >
          <div>
            <strong>{completion}%</strong>
            <span>已完成</span>
          </div>
        </div>
      </section>
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
        <button
          type="button"
          className={`btn-ghost ${selecting ? "active" : ""}`}
          onClick={() => {
            setSelecting((value) => !value);
            setSelectedIds([]);
          }}
        >
          {selecting ? "退出批量" : "批量管理"}
        </button>
        {(nav === "today" || nav === "myday") ? (
          <button
            type="button"
            className="btn-ghost schedule-action"
            onClick={previewSchedule}
          >
            整理今日
          </button>
        ) : null}
      </div>

      {schedulePreview.length ? (
        <section className="schedule-preview">
          <div className="schedule-preview-head">
            <div>
              <strong>今日排程建议</strong>
              <span>先预览，再决定应用哪些调整</span>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setSchedulePreview([])}>
              关闭
            </button>
          </div>
          {schedulePreview.map((item) => {
            const task = dayTasks.find((candidate) => candidate.id === item.taskId);
            const accepted = acceptedScheduleIds.includes(item.taskId);
            return (
              <div key={item.taskId} className="schedule-preview-row">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={() =>
                    setAcceptedScheduleIds((ids) =>
                      accepted
                        ? ids.filter((id) => id !== item.taskId)
                        : [...ids, item.taskId],
                    )
                  }
                />
                <time>{item.start}–{item.end}</time>
                <div>
                  <strong>{task?.title}</strong>
                  <span>
                    {task?.due_date ? "优先满足截止日期" : "填入今日可用空隙"}
                    {task?.energy_level ? ` · ${task.energy_level === "high" ? "高精力" : task.energy_level === "low" ? "低精力" : "中等精力"}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() =>
                    setLockedScheduleIds((ids) => {
                      const locked = ids.includes(item.taskId);
                      if (!locked) {
                        setAcceptedScheduleIds((acceptedIds) =>
                          acceptedIds.filter((id) => id !== item.taskId),
                        );
                      }
                      return locked
                        ? ids.filter((id) => id !== item.taskId)
                        : [...ids, item.taskId];
                    })
                  }
                >
                  {lockedScheduleIds.includes(item.taskId) ? "已锁定" : "锁定"}
                </button>
              </div>
            );
          })}
          <div className="schedule-preview-actions">
            <span>{acceptedScheduleIds.length} 项将被调整</span>
            <button type="button" className="btn-primary" onClick={() => void applySchedule()}>
              应用所选排程
            </button>
          </div>
        </section>
      ) : null}

      {selecting ? (
        <div className="batch-toolbar">
          <span>已选择 {selectedIds.length} 项</span>
          <button
            type="button"
            className="btn-ghost"
            disabled={!selectedIds.length}
            onClick={() => {
              void batchComplete(selectedIds).then(() => setSelectedIds([]));
            }}
          >
            批量完成
          </button>
          <button
            type="button"
            className="btn-ghost danger"
            disabled={!selectedIds.length}
            onClick={() => {
              void batchDelete(selectedIds).then(() => setSelectedIds([]));
            }}
          >
            批量删除
          </button>
        </div>
      ) : null}

      {nav === "myday" && myDayCandidates.length ? (
        <section className="myday-picker">
          <div>
            <strong>为今天挑选任务</strong>
            <span>从待办中加入，不会改变原截止日期</span>
          </div>
          <div className="myday-candidates">
            {myDayCandidates.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() =>
                  void saveTask(task.id, { my_day_date: cursor })
                }
              >
                <span>＋</span>
                {task.title}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {nav === "myday" ? (
        <div className="day-rituals">
          <button
            type="button"
            className="btn-ghost"
            onClick={() =>
              void saveDaySnapshot(cursor, dayTasks, "morning").then(() =>
                useAppStore.getState().setToast("晨间计划已保存"),
              )
            }
          >
            确认今日计划
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={openDayClose}
          >
            今日收尾
          </button>
        </div>
      ) : null}

      {nav === "myday" && closingDay ? (
        <section className="day-close-panel">
          <div>
            <strong>今日收尾</strong>
            <span>完成 {done} 项，还有 {pending} 项需要决定去向</span>
          </div>
          <textarea
            className="field"
            rows={2}
            value={reflection}
            onChange={(event) => setReflection(event.target.value)}
            placeholder="今天最值得记录的一句话…"
          />
          {dayTasks.filter(isActiveTask).map((task) => (
            <label key={task.id} className="day-close-task">
              <span>{task.title}</span>
              <select
                className="field"
                value={dispositions[task.id] ?? "tomorrow"}
                onChange={(event) =>
                  setDispositions((current) => ({
                    ...current,
                    [task.id]: event.target.value,
                  }))
                }
              >
                <option value="tomorrow">安排到明天</option>
                <option value="inbox">移回待办箱</option>
                <option value="cancel">取消任务</option>
              </select>
            </label>
          ))}
          <div className="day-close-actions">
            <button type="button" className="btn-ghost" onClick={() => setClosingDay(false)}>
              稍后
            </button>
            <button type="button" className="btn-primary" onClick={() => void settleDay()}>
              完成收尾
            </button>
          </div>
        </section>
      ) : null}

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
          {nav === "myday"
            ? "我的一天"
            : cursor === today
              ? "今日安排"
              : "当日安排"}
        </h3>
        {!dayTasks.length ? (
          <div className="scope-empty">这一天暂无任务</div>
        ) : (
          dayTasks.map((task) => (
            <ExpandableTaskItem
              key={task.id}
              task={task}
              selection={{
                active: selecting,
                selected: selectedIds.includes(task.id),
                onToggle: () =>
                  setSelectedIds((ids) =>
                    ids.includes(task.id)
                      ? ids.filter((id) => id !== task.id)
                      : [...ids, task.id],
                  ),
              }}
              meta={
                <>
                  <span>{formatTimeRange(task.due_time, task.end_time)}</span>
                  <span>{priorityLabel(task.priority)}</span>
                  {conflictIds.has(task.id) ? (
                    <span className="conflict-chip">时间冲突</span>
                  ) : null}
                </>
              }
              actions={
                !selecting && isActiveTask(task) ? (
                  <>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setFocusTask(task.id);
                        if (task.status !== "in_progress") {
                          void saveTask(task.id, { status: "in_progress" });
                        }
                        if (!focusRunning) void toggleFocus();
                      }}
                    >
                      专注
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => void saveTask(task.id, {
                        due_date: addDays(cursor, 1),
                        my_day_date: addDays(cursor, 1),
                      })}
                    >
                      明天
                    </button>
                    {nav === "myday" ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => void saveTask(task.id, { my_day_date: null })}
                      >
                        移出今日
                      </button>
                    ) : null}
                  </>
                ) : null
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

  const pending = weekTasks.filter(isActiveTask).length;
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
  const pending = monthTasks.filter(isActiveTask).length;
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
  if (nav === "projects") return <ProjectsView />;
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
