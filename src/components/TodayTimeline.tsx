import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/store/app";
import { parseTimeToMinutes, todayDateString } from "@/lib/dates";
import type { Task } from "@/types";

const HOUR_START = 8;
const HOUR_END = 23;
const HOUR_COUNT = HOUR_END - HOUR_START + 1;
const SLOT_W = 108;
const LANE_H = 84;
const COLLAPSE_KEY = "minimal.timelineCollapsed";

type LaidOut = {
  task: Task;
  startMin: number;
  endMin: number;
  lane: number;
};

function layoutLanes(tasks: Task[]): { items: LaidOut[]; laneCount: number } {
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

  const laneEnds: number[] = [];
  const items: LaidOut[] = [];

  for (const ev of timed) {
    let lane = laneEnds.findIndex((end) => end <= ev.startMin);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(ev.endMin);
    } else {
      laneEnds[lane] = ev.endMin;
    }
    items.push({ ...ev, lane });
  }

  return { items, laneCount: Math.max(1, laneEnds.length) };
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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.timeline =
      collapsed ? "collapsed" : "expanded";
  }, [collapsed]);

  const todayTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          !t.parent_id &&
          t.status === "pending" &&
          t.due_date === today,
      ),
    [tasks, today],
  );

  const { items, laneCount } = useMemo(
    () => layoutLanes(todayTasks),
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
      const pad = 32;
      el.scrollLeft = Math.max(0, left - pad);
    });
    return () => cancelAnimationFrame(raf);
  }, [collapsed, highlightTaskId, items, axisWidth, totalMin, axisStart, axisEnd]);

  const openTaskDetail = (taskId: string) => {
    selectTask(taskId);
    setCollapsed(true);
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
          type="button"
          className="timeline-drawer-rail"
          title={collapsed ? "展开时间轴" : "收起时间轴"}
          aria-label={collapsed ? "展开时间轴" : "收起时间轴"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
        >
          <span className="timeline-drawer-rail-label">
            {collapsed ? "时间轴" : "收起"}
          </span>
          <span className="timeline-drawer-rail-icon">
            {collapsed ? "◂" : "▸"}
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
                      const width = Math.max(120, minToX(endMin) - left - 6);
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
                          title={`${task.title}\n${range}\n点击查看详情`}
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
    </>
  );
}
