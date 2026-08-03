import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useAppStore } from "@/store/app";
import { parseTimeToMinutes, todayDateString } from "@/lib/dates";
import type { Task } from "@/types";
import { AppIcon } from "@/components/AppIcon";
import { isActiveTask } from "@/lib/tasks";

const HOUR_START = 8;
const HOUR_END = 23;
const HOUR_COUNT = HOUR_END - HOUR_START + 1;
const SLOT_W = 96;
const LANE_H = 84;
const COLLAPSE_KEY = "minimal.timelineCollapsed";
const POSITION_KEY = "minimal.timelineRailPositions";
const RAIL_MARGIN = 12;
const RAIL_TOP_SAFE = 52;
const RAIL_BOTTOM_SAFE = 76;

type RailPosition = { x: number; y: number };
type RailPositions = { collapsed?: RailPosition; open?: RailPosition };

function defaultRailPosition(collapsed: boolean): RailPosition {
  return {
    x: Math.max(RAIL_MARGIN, window.innerWidth - 150),
    y: collapsed
      ? Math.max(RAIL_TOP_SAFE, window.innerHeight - RAIL_BOTTOM_SAFE)
      : 72,
  };
}

function clampRailPosition(
  position: RailPosition,
  width: number,
  height: number,
): RailPosition {
  return {
    x: Math.max(
      RAIL_MARGIN,
      Math.min(window.innerWidth - width - RAIL_MARGIN, position.x),
    ),
    y: Math.max(
      RAIL_TOP_SAFE,
      Math.min(window.innerHeight - height - RAIL_BOTTOM_SAFE, position.y),
    ),
  };
}

type LaidOut = {
  task: Task;
  startMin: number;
  endMin: number;
  lane: number;
};

function layoutRows(tasks: Task[]): { items: LaidOut[]; laneCount: number } {
  const timed = tasks
    .map((task) => {
      const startMin =
        parseTimeToMinutes(task.due_time) ?? HOUR_START * 60;
      const endRaw = parseTimeToMinutes(task.end_time);
      const endMin = Math.max(
        startMin + 30,
        endRaw ?? startMin + 60,
      );
      return { task, startMin, endMin };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  return {
    items: timed.map((event, lane) => ({ ...event, lane })),
    laneCount: Math.max(1, timed.length),
  };
}

function formatRange(start?: string | null, end?: string | null) {
  if (!start && !end) return "";
  if (start && end) return `${start}–${end}`;
  return start ?? end ?? "";
}

export function TodayTimeline() {
  const tasks = useAppStore((s) => s.tasks);
  const selectTask = useAppStore((s) => s.selectTask);
  const addTask = useAppStore((s) => s.addTask);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);
  const today = todayDateString();

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [hoveredTask, setHoveredTask] = useState<{
    task: Task;
    range: string;
    x: number;
    y: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const [railPositions, setRailPositions] = useState<RailPositions>(() => {
    try {
      return JSON.parse(localStorage.getItem(POSITION_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  const railMode = collapsed ? "collapsed" : "open";
  const storedRailPosition =
    railPositions[railMode] ?? defaultRailPosition(collapsed);
  const railPosition = clampRailPosition(
    storedRailPosition,
    railRef.current?.offsetWidth ?? 120,
    railRef.current?.offsetHeight ?? 40,
  );

  useEffect(() => {
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(railPositions));
    } catch {
      /* ignore */
    }
  }, [railPositions]);

  const moveRail = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const width = railRef.current?.offsetWidth ?? 120;
    const height = railRef.current?.offsetHeight ?? 40;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    const next = clampRailPosition(
      { x: drag.originX + dx, y: drag.originY + dy },
      width,
      height,
    );
    setRailPositions((current) => ({ ...current, [railMode]: next }));
  };

  const finishRailDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag?.moved) setCollapsed((value) => !value);
  };

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.timeline =
      collapsed ? "collapsed" : "expanded";
    return () => {
      delete document.documentElement.dataset.timeline;
    };
  }, [collapsed]);

  const todayTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          !t.parent_id &&
          isActiveTask(t) &&
          t.due_date !== null &&
          t.due_date <= today,
      ),
    [tasks, today],
  );

  const { items, laneCount } = useMemo(
    () => layoutRows(todayTasks),
    [todayTasks],
  );

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const axisStart = HOUR_START * 60;
  const axisEnd = (HOUR_END + 1) * 60;
  const totalMin = axisEnd - axisStart;
  const axisWidth = HOUR_COUNT * SLOT_W;
  const nowLeft =
    ((Math.min(axisEnd, Math.max(axisStart, nowMin)) - axisStart) /
      totalMin) *
    axisWidth;

  const minToX = (min: number) =>
    ((Math.min(axisEnd, Math.max(axisStart, min)) - axisStart) / totalMin) *
    axisWidth;

  const firstTaskId = items[0]?.task.id ?? null;
  const highlightTaskId = selectedTaskId ?? firstTaskId;

  useEffect(() => {
    if (collapsed || items.length === 0) return;
    const target =
      items.find((i) => i.task.id === highlightTaskId) ?? items[0];
    const el = scrollRef.current;
    if (!el || !target) return;

    const raf = requestAnimationFrame(() => {
      const left = minToX(target.startMin);
      const pad = 12;
      el.scrollLeft = Math.max(0, left - pad);
    });
    return () => cancelAnimationFrame(raf);
  }, [collapsed, highlightTaskId, items, axisWidth, totalMin, axisStart, axisEnd]);

  const openTaskDetail = (taskId: string) => {
    setHoveredTask(null);
    selectTask(taskId);
    setCollapsed(true);
  };

  const showTaskPreview = (
    event: { currentTarget: HTMLButtonElement },
    task: Task,
    range: string,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHoveredTask({
      task,
      range,
      x: Math.min(window.innerWidth - 304, Math.max(12, rect.left)),
      y:
        rect.bottom + 200 < window.innerHeight
          ? rect.bottom + 10
          : Math.max(12, rect.top - 198),
    });
  };

  return (
    <>
      {!collapsed ? (
        <button
          type="button"
          className="timeline-drawer-backdrop"
          aria-label="关闭时间轴"
          onClick={() => setCollapsed(true)}
        />
      ) : null}

      <aside
        className={`timeline-drawer ${collapsed ? "is-collapsed" : "is-open"}`}
        aria-hidden={collapsed}
      >
        <button
          ref={railRef}
          type="button"
          className="timeline-drawer-rail"
          title={collapsed ? "展开时间轴" : "收起时间轴"}
          aria-label={collapsed ? "展开时间轴" : "收起时间轴"}
          aria-expanded={!collapsed}
          style={{
            position: "fixed",
            left: railPosition.x,
            top: railPosition.y,
            right: "auto",
            bottom: "auto",
          }}
          onPointerDown={(event) => {
            dragRef.current = {
              startX: event.clientX,
              startY: event.clientY,
              originX: railPosition.x,
              originY: railPosition.y,
              moved: false,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={moveRail}
          onPointerUp={finishRailDrag}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setCollapsed((value) => !value);
            }
          }}
        >
          <AppIcon name="timer" size={17} />
          <span className="timeline-drawer-rail-label">
            {collapsed ? "今日时间轴" : "收起"}
          </span>
        </button>

        {!collapsed ? (
          <div className="timeline-drawer-panel">
            <div className="timeline-dock-head">
              <div className="timeline-dock-title">
                <h3>今日时间轴</h3>
                <span className="nav-count">{todayTasks.length}</span>
              </div>
              <input
                className="field timeline-quick-add"
                placeholder="+ 添加待办，回车保存"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = (e.target as HTMLInputElement).value.trim();
                    if (!v) return;
                    void addTask({ title: v, due_date: today });
                    (e.target as HTMLInputElement).value = "";
                  }
                }}
              />
            </div>

            <div className="timeline-dock-body">
              <div className="timeline-h-scroll" ref={scrollRef}>
                <div
                  className="timeline-h-axis"
                  style={{
                    width: axisWidth,
                    height: 36 + laneCount * LANE_H + 20,
                  }}
                >
                  <div className="timeline-h-hours">
                    {Array.from(
                      { length: HOUR_COUNT },
                      (_, i) => i + HOUR_START,
                    ).map((h) => (
                      <div
                        key={h}
                        className="timeline-h-hour"
                        style={{ width: SLOT_W }}
                      >
                        {String(h).padStart(2, "0")}:00
                      </div>
                    ))}
                  </div>

                  <div
                    className="timeline-h-lanes"
                    style={{ height: laneCount * LANE_H }}
                  >
                    {Array.from({ length: HOUR_COUNT }, (_, i) => (
                      <div
                        key={i}
                        className="timeline-h-gridline"
                        style={{ left: i * SLOT_W }}
                      />
                    ))}

                    {nowMin >= axisStart && nowMin <= axisEnd ? (
                      <div
                        className="timeline-h-now"
                        style={{ left: nowLeft }}
                      />
                    ) : null}

                    {items.map(({ task, startMin, endMin, lane }) => {
                      const left = minToX(startMin);
                      const width = Math.max(168, minToX(endMin) - left - 7);
                      const range = formatRange(task.due_time, task.end_time);
                      const p = task.priority ?? 3;
                      return (
                        <button
                          key={task.id}
                          type="button"
                          className={`timeline-h-event p${p} ${highlightTaskId === task.id ? "is-focus" : ""}`}
                          style={{
                            left,
                            width,
                            top: lane * LANE_H + 8,
                            height: LANE_H - 16,
                          }}
                          aria-label={`${task.title} ${range}`}
                          onMouseEnter={(event) =>
                            showTaskPreview(event, task, range)
                          }
                          onMouseMove={(event) =>
                            showTaskPreview(event, task, range)
                          }
                          onMouseLeave={() => setHoveredTask(null)}
                          onFocus={(event) =>
                            showTaskPreview(event, task, range)
                          }
                          onBlur={() => setHoveredTask(null)}
                          onClick={() => openTaskDetail(task.id)}
                        >
                          <span className="timeline-h-event-title">
                            {task.title}
                          </span>
                          {range ? (
                            <span className="timeline-h-event-time">
                              {range}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </aside>

      {hoveredTask && !collapsed ? (
        <div
          className="timeline-task-popover"
          style={{ left: hoveredTask.x, top: hoveredTask.y }}
          role="tooltip"
        >
          <div className="timeline-task-popover-head">
            <strong>{hoveredTask.task.title}</strong>
            <span
              className={`timeline-task-priority p${hoveredTask.task.priority}`}
            >
              P{hoveredTask.task.priority}
            </span>
          </div>
          <div className="timeline-task-popover-meta">
            <span>
              <AppIcon name="timer" size={14} />
              {hoveredTask.range || "未设置时间"}
            </span>
            <span>
              {hoveredTask.task.status === "in_progress" ? "进行中" : "待处理"}
            </span>
            {hoveredTask.task.estimated_minutes ? (
              <span>预计 {hoveredTask.task.estimated_minutes} 分钟</span>
            ) : null}
          </div>
          {hoveredTask.task.description || hoveredTask.task.notes ? (
            <p>{hoveredTask.task.description || hoveredTask.task.notes}</p>
          ) : (
            <p className="is-muted">点击任务可查看完整详情</p>
          )}
        </div>
      ) : null}
    </>
  );
}
