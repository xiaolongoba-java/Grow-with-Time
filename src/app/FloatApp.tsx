import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  getCurrentWebviewWindow,
  WebviewWindow,
} from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import {
  createMemo,
  createTask,
  deleteMemo,
  fetchMemos,
  fetchTasks,
  fetchTimers,
  pauseTimer,
  resetTimer,
  rolloverOverdueTasks,
  startTimer,
  toggleTaskComplete,
  updateMemo,
} from "@/lib/db";
import { formatDueDate, isOverdue, todayDateString } from "@/lib/dates";
import { parseNaturalInput } from "@/lib/nlp";
import { formatCountdown, liveRemaining } from "@/lib/timers";
import type { Memo, Task, Timer } from "@/types";

export function FloatApp() {
  const [tab, setTab] = useState<"todo" | "memo" | "timer">("todo");
  const [memoText, setMemoText] = useState("");
  const [taskText, setTaskText] = useState("");
  const [memos, setMemos] = useState<Memo[]>([]);
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [timers, setTimers] = useState<Timer[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  const refresh = async () => {
    try {
      await rolloverOverdueTasks();
      const [allMemos, tasks, allTimers] = await Promise.all([
        fetchMemos(),
        fetchTasks(),
        fetchTimers(),
      ]);
      setMemos(allMemos);
      setTimers(allTimers);
      const today = todayDateString();
      setTodayTasks(
        tasks.filter(
          (t) =>
            !t.parent_id &&
            t.status === "pending" &&
            t.due_date !== null &&
            t.due_date <= today,
        ),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败，请重启应用");
    }
  };

  useEffect(() => {
    document.documentElement.dataset.theme ||= "system";
    void refresh();
    const poll = window.setInterval(() => void refresh(), 5_000);
    const tick = window.setInterval(() => setTick((n) => n + 1), 1000);
    let unlistenFocus: (() => void) | undefined;
    let unlistenTimer: (() => void) | undefined;
    void listen("float:focus", () => {
      const input = document.querySelector<HTMLInputElement>(
        tab === "memo" ? ".float-input" : ".float-task-input",
      );
      input?.focus();
    }).then((fn) => {
      unlistenFocus = fn;
    });
    void listen("float:timer", () => {
      setTab("timer");
      void refresh();
    }).then((fn) => {
      unlistenTimer = fn;
    });
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
      unlistenFocus?.();
      unlistenTimer?.();
    };
  }, [tab]);

  const sortedToday = useMemo(() => {
    const overdue = todayTasks.filter((t) => isOverdue(t));
    const dueToday = todayTasks.filter((t) => !isOverdue(t));
    return [...overdue, ...dueToday];
  }, [todayTasks]);

  const pinned = useMemo(() => memos.filter((m) => m.pinned), [memos]);
  const others = useMemo(() => memos.filter((m) => !m.pinned), [memos]);

  const activeTimers = useMemo(() => {
    return [...timers]
      .filter((t) => t.enabled)
      .sort((a, b) => {
        if (a.running !== b.running) return b.running - a.running;
        return liveRemaining(a) - liveRemaining(b);
      });
  }, [timers]);

  const primaryTimer = activeTimers.find((t) => t.running) ?? activeTimers[0] ?? null;

  const hideFloat = () => {
    void invoke("hide_float").catch(() => {
      void getCurrentWebviewWindow().hide();
    });
  };

  const saveMemo = async () => {
    const text = memoText.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      if (editingId) {
        await updateMemo(editingId, { content: text });
        setEditingId(null);
      } else {
        await createMemo(text);
      }
      setMemoText("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const saveTask = async () => {
    const parsed = parseNaturalInput(taskText);
    if (!parsed.title || busy) return;
    setBusy(true);
    try {
      await createTask({
        title: parsed.title,
        ...parsed.draft,
        due_date: parsed.draft.due_date ?? todayDateString(),
      });
      setTaskText("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="float-shell">
      <header className="float-titlebar" data-tauri-drag-region>
        <strong data-tauri-drag-region>
          {tab === "todo"
            ? `今日待办 · ${sortedToday.length}`
            : tab === "timer"
              ? "倒计时"
              : "备忘录"}
        </strong>
        <div className="float-actions">
          <button
            type="button"
            className="btn-ghost"
            title="打开主窗口"
            onClick={() => {
              void (async () => {
                hideFloat();
                const main = await WebviewWindow.getByLabel("main");
                await main?.show();
                await main?.setFocus();
              })();
            }}
          >
            ⌂
          </button>
          <button
            type="button"
            className="btn-ghost"
            title="隐藏浮窗"
            onClick={hideFloat}
          >
            ✕
          </button>
        </div>
      </header>

      <div className="seg float-tabs">
        <button
          type="button"
          className={tab === "todo" ? "active" : ""}
          onClick={() => setTab("todo")}
        >
          今日 {sortedToday.length}
        </button>
        <button
          type="button"
          className={tab === "timer" ? "active" : ""}
          onClick={() => setTab("timer")}
        >
          倒计时
        </button>
        <button
          type="button"
          className={tab === "memo" ? "active" : ""}
          onClick={() => setTab("memo")}
        >
          备忘录
        </button>
      </div>

      {error ? (
        <div className="float-body">
          <div className="empty-state" style={{ padding: 16, color: "var(--text-overdue)" }}>
            {error}
          </div>
          <button type="button" className="btn-primary" onClick={() => void refresh()}>
            重试
          </button>
        </div>
      ) : tab === "timer" ? (
        <div className="float-body float-timer-body">
          {primaryTimer ? (
            <>
              <p className="float-timer-kicker">
                {primaryTimer.kind === "interval" ? "循环提醒" : "事项倒计时"}
                {primaryTimer.running ? " · 进行中" : " · 已暂停"}
              </p>
              <div
                className="float-timer-ring"
                style={{
                  ["--p" as string]: String(
                    Math.min(
                      1,
                      Math.max(
                        0,
                        1 -
                          liveRemaining(primaryTimer) /
                            Math.max(1, primaryTimer.interval_sec),
                      ),
                    ),
                  ),
                }}
              >
                <p className="float-timer-clock">
                  {formatCountdown(liveRemaining(primaryTimer))}
                </p>
              </div>
              <p className="float-timer-title">{primaryTimer.title}</p>
              <div className="float-timer-actions">
                {primaryTimer.running ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => void pauseTimer(primaryTimer.id).then(refresh)}
                  >
                    暂停
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => void startTimer(primaryTimer.id).then(refresh)}
                  >
                    继续
                  </button>
                )}
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void resetTimer(primaryTimer.id).then(refresh)}
                >
                  重置
                </button>
              </div>
              {activeTimers.length > 1 ? (
                <div className="float-timer-list">
                  {activeTimers
                    .filter((t) => t.id !== primaryTimer.id)
                    .map((t) => (
                      <div key={t.id} className="float-timer-item">
                        <span>{t.title}</span>
                        <strong>{formatCountdown(liveRemaining(t))}</strong>
                      </div>
                    ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state" style={{ padding: 16 }}>
              暂无进行中的提醒
            </div>
          )}
        </div>
      ) : tab === "todo" ? (
        <div className="float-body">
          <input
            className="field float-task-input"
            placeholder="添加今日任务，回车保存"
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void saveTask();
              }
            }}
          />
          <div className="float-list">
            {sortedToday.map((task) => (
              <div
                key={task.id}
                className={`float-memo float-todo ${isOverdue(task) ? "is-overdue" : ""}`}
              >
                <button
                  type="button"
                  className="task-check"
                  aria-label="完成"
                  onClick={() => void toggleTaskComplete(task.id).then(refresh)}
                />
                <div className="float-todo-body">
                  <p className="float-todo-title">{task.title}</p>
                  <div className="task-meta">
                    <span>{formatDueDate(task.due_date)}</span>
                    {task.due_time ? (
                      <span>
                        {task.end_time
                          ? `${task.due_time}–${task.end_time}`
                          : task.due_time}
                      </span>
                    ) : null}
                    <span>P{task.priority}</span>
                    {isOverdue(task) ? <span>已过期</span> : null}
                  </div>
                </div>
              </div>
            ))}
            {!sortedToday.length ? (
              <div className="empty-state" style={{ padding: 16 }}>
                今天暂无待办
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="float-body">
          <textarea
            className="float-input field"
            rows={3}
            placeholder="写点什么，Ctrl+Enter 保存…"
            value={memoText}
            onChange={(e) => setMemoText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void saveMemo();
              }
            }}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => void saveMemo()}
          >
            {editingId ? "更新备忘" : "保存备忘"}
          </button>
          <div className="float-list">
            {[...pinned, ...others].map((memo) => (
              <div key={memo.id} className="float-memo">
                {memo.title ? (
                  <strong style={{ fontSize: 12 }}>{memo.title}</strong>
                ) : null}
                <p>{memo.content}</p>
                <div className="float-memo-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setEditingId(memo.id);
                      setMemoText(memo.content);
                    }}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() =>
                      void updateMemo(memo.id, {
                        pinned: memo.pinned ? 0 : 1,
                      }).then(refresh)
                    }
                  >
                    {memo.pinned ? "取消置顶" : "置顶"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost danger"
                    onClick={() => void deleteMemo(memo.id).then(refresh)}
                  >
                    删
                  </button>
                </div>
              </div>
            ))}
            {!memos.length ? (
              <div className="empty-state" style={{ padding: 16 }}>
                还没有备忘录
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
