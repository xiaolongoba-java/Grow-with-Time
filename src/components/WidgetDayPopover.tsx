import { useEffect } from "react";
import { formatLongDate, isOverdue } from "@/lib/dates";
import type { Task } from "@/types";

type WidgetDayPopoverProps = {
  dateKey: string;
  tasks: Task[];
  anniversaryTitles?: string[];
  onClose: () => void;
  onToggleTask: (taskId: string) => void;
};

export function WidgetDayPopover({
  dateKey,
  tasks,
  anniversaryTitles = [],
  onClose,
  onToggleTask,
}: WidgetDayPopoverProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const sorted = [...tasks].sort(
    (a, b) =>
      Number(isOverdue(b)) - Number(isOverdue(a)) ||
      (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99") ||
      a.priority - b.priority,
  );

  return (
    <div
      className="widget-day-popover-backdrop"
      role="presentation"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <section
        className="widget-day-popover"
        role="dialog"
        aria-label={`${dateKey} 事项`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="widget-day-popover-head">
          <span className="widget-day-popover-date-mark" aria-hidden>
            {Number(dateKey.slice(-2))}
          </span>
          <div>
            <strong>{formatLongDate(dateKey)}</strong>
            <span>{sorted.length ? `${sorted.length} 项待办` : "今天留白"}</span>
          </div>
          <button type="button" aria-label="关闭" onClick={onClose} autoFocus>
            ×
          </button>
        </header>
        {anniversaryTitles.length ? (
          <ul className="widget-day-popover-anni">
            {anniversaryTitles.map((title) => (
              <li key={title}>🎂 {title}</li>
            ))}
          </ul>
        ) : null}
        <ul className="widget-day-popover-list">
          {sorted.map((task) => (
            <li key={task.id} className={isOverdue(task) ? "is-overdue" : ""}>
              <button
                type="button"
                className="widget-day-popover-check"
                aria-label={`完成 ${task.title}`}
                onClick={() => onToggleTask(task.id)}
              />
              <div>
                <strong>{task.title}</strong>
                <span>
                  {task.due_time
                    ? `${task.due_time}${task.end_time ? `–${task.end_time}` : ""}`
                    : isOverdue(task)
                      ? "已过期"
                      : "全天"}
                  {" · "}P{task.priority}
                </span>
              </div>
            </li>
          ))}
          {!sorted.length ? (
            <li className="widget-day-popover-empty">这一天没有待办事项</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
