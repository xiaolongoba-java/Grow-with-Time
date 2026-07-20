import { useState, type ReactNode } from "react";
import { useAppStore } from "@/store/app";
import { getSubtasks, subtaskProgress } from "@/lib/tasks";
import { priorityLabel } from "@/lib/dates";
import type { Task } from "@/types";

export function ExpandableTaskItem({
  task,
  meta,
}: {
  task: Task;
  meta?: ReactNode;
}) {
  const tasks = useAppStore((s) => s.tasks);
  const selectTask = useAppStore((s) => s.selectTask);
  const toggleComplete = useAppStore((s) => s.toggleComplete);
  const setFocusTask = useAppStore((s) => s.setFocusTask);
  const addTask = useAppStore((s) => s.addTask);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");

  const subs = getSubtasks(tasks, task.id);
  const progress = subtaskProgress(tasks, task.id);
  const doneCount = subs.filter((s) => s.status === "completed").length;

  const toggleExpand = () => {
    setExpanded((v) => !v);
    setFocusTask(task.id);
  };

  return (
    <div
      className={`expand-task ${task.status === "completed" ? "is-done" : ""} ${expanded ? "is-open" : ""}`}
    >
      <div className="expand-task-row" onClick={toggleExpand}>
        <button
          type="button"
          className="task-check"
          onClick={(e) => {
            e.stopPropagation();
            void toggleComplete(task.id);
          }}
        >
          {task.status === "completed" ? "✓" : ""}
        </button>
        <div className="expand-task-main">
          <p className="task-title">{task.title}</p>
          <div className="task-meta">
            {meta}
            {subs.length ? (
              <span className="subtask-count">
                子任务 {doneCount}/{subs.length}
                {progress > 0 ? ` · ${Math.round(progress * 100)}%` : ""}
              </span>
            ) : (
              <span className="subtask-count muted">点击添加子任务</span>
            )}
          </div>
        </div>
        <button
          type="button"
          className="btn-ghost expand-detail"
          title="打开详情"
          onClick={(e) => {
            e.stopPropagation();
            selectTask(task.id);
            setFocusTask(task.id);
          }}
        >
          详情
        </button>
        <span className={`expand-caret ${expanded ? "open" : ""}`} aria-hidden>
          ▾
        </span>
      </div>

      {expanded ? (
        <div className="expand-subtasks">
          {subs.map((sub) => (
            <div
              key={sub.id}
              className={`expand-sub ${sub.status === "completed" ? "is-done" : ""}`}
            >
              <button
                type="button"
                className="task-check"
                onClick={() => void toggleComplete(sub.id)}
              >
                {sub.status === "completed" ? "✓" : ""}
              </button>
              <button
                type="button"
                className="expand-sub-title"
                onClick={() => selectTask(sub.id)}
              >
                {sub.title}
              </button>
              <span className="task-meta">{priorityLabel(sub.priority)}</span>
            </div>
          ))}
          {!subs.length ? (
            <div className="expand-sub-empty">暂无子任务，在下方添加</div>
          ) : null}
          <input
            className="field expand-sub-input"
            placeholder="添加子任务，回车保存"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const title = draft.trim();
              if (!title) return;
              void addTask({
                title,
                parent_id: task.id,
                due_date: null,
                due_time: null,
              }).then(() => setDraft(""));
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
