import { useEffect } from "react";
import { useAppStore } from "@/store/app";

type PomodoroPanelProps = {
  compact?: boolean;
  /** Prefer this task for focus; syncs into store when provided. */
  boundTaskId?: string | null;
  onClose?: () => void;
};

/** Compact pomodoro controls for the task detail view. */
export function PomodoroPanel({
  compact = false,
  boundTaskId = null,
  onClose,
}: PomodoroPanelProps) {
  const focusTaskId = useAppStore((s) => s.focusTaskId);
  const tasks = useAppStore((s) => s.tasks);
  const focusSeconds = useAppStore((s) => s.focusSeconds);
  const focusRunning = useAppStore((s) => s.focusRunning);
  const toggleFocus = useAppStore((s) => s.toggleFocus);
  const resetFocus = useAppStore((s) => s.resetFocus);
  const tickFocus = useAppStore((s) => s.tickFocus);
  const setFocusTask = useAppStore((s) => s.setFocusTask);

  const activeId = boundTaskId ?? focusTaskId;
  const task = tasks.find((t) => t.id === activeId);

  useEffect(() => {
    if (boundTaskId && focusTaskId !== boundTaskId) {
      setFocusTask(boundTaskId);
    }
  }, [boundTaskId, focusTaskId, setFocusTask]);

  useEffect(() => {
    if (!focusRunning) return;
    const id = window.setInterval(() => tickFocus(), 1000);
    return () => window.clearInterval(id);
  }, [focusRunning, tickFocus]);

  const mm = String(Math.floor(focusSeconds / 60)).padStart(2, "0");
  const ss = String(focusSeconds % 60).padStart(2, "0");

  return (
    <div className={`pomodoro-panel ${compact ? "is-compact" : ""}`}>
      <div className="pomodoro-head">
        <span className="pomodoro-label">番茄钟</span>
        <strong className="pomodoro-time">
          {mm}:{ss}
        </strong>
        {onClose ? (
          <button
            type="button"
            className="btn-ghost pomodoro-close"
            title="关闭"
            aria-label="关闭番茄钟"
            onClick={onClose}
          >
            ✕
          </button>
        ) : null}
      </div>
      <p className="pomodoro-task">{task ? task.title : "未选择任务"}</p>
      <div className="pomodoro-actions">
        <button
          type="button"
          className="btn-primary"
          style={{ width: "auto", padding: "6px 14px" }}
          onClick={() => void toggleFocus()}
          disabled={!task}
        >
          {focusRunning ? "暂停" : "开始"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => void resetFocus()}>
          重置
        </button>
      </div>
    </div>
  );
}
