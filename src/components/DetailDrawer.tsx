import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store/app";
import { getSubtasks, subtaskProgress } from "@/lib/tasks";
import { parseRepeatRule, stringifyRepeatRule } from "@/lib/repeat";
import type {
  Attachment,
  RepeatRule,
  TaskEvent,
  TaskPriority,
  TaskStatus,
} from "@/types";
import { open } from "@tauri-apps/plugin-dialog";
import { TimeRangeFields, defaultTimeRange } from "@/components/TimePicker";
import { PomodoroPanel } from "@/components/PomodoroPanel";
import { parseReminderMinutes } from "@/lib/planning";
import { fetchTaskEvents } from "@/lib/db";
import {
  ensureEndAfterStart,
  formatTimeRange,
  nowTimeString,
  todayDateString,
} from "@/lib/dates";

type Mode = "view" | "edit";

const PRIORITY_LABEL: Record<number, string> = {
  1: "P1 紧急",
  2: "P2 高",
  3: "P3 普通",
  4: "P4 低",
};

function repeatLabel(rule: string | null): string {
  const r = parseRepeatRule(rule);
  if (!r) return "不重复";
  if (r.frequency === "daily") return "每天";
  if (r.frequency === "weekly") return "每周";
  if (r.frequency === "monthly") return "每月";
  if (r.frequency === "custom") return "每月最后周五";
  return "不重复";
}

function statusLabel(status: TaskStatus): string {
  return {
    draft: "草稿",
    pending: "待处理",
    in_progress: "进行中",
    waiting: "等待",
    blocked: "阻塞",
    completed: "已完成",
    cancelled: "已取消",
  }[status];
}

function eventLabel(type: string): string {
  return {
    created: "创建任务",
    updated: "修改任务",
    time_logged: "记录专注时间",
    deleted: "移入回收站",
    restored: "从回收站恢复",
  }[type] ?? type;
}

export function DetailDrawer() {
  const tasks = useAppStore((s) => s.tasks);
  const tags = useAppStore((s) => s.tags);
  const tagMap = useAppStore((s) => s.tagMap);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);
  const detailPreferEdit = useAppStore((s) => s.detailPreferEdit);
  const selectTask = useAppStore((s) => s.selectTask);
  const saveTask = useAppStore((s) => s.saveTask);
  const deleteTask = useAppStore((s) => s.deleteTask);
  const addTask = useAppStore((s) => s.addTask);
  const setTaskTags = useAppStore((s) => s.setTaskTags);
  const setToast = useAppStore((s) => s.setToast);
  const attachments = useAppStore((s) => s.attachments);
  const loadAttachments = useAppStore((s) => s.loadAttachments);
  const addAttachment = useAppStore((s) => s.addAttachment);
  const removeAttachment = useAppStore((s) => s.removeAttachment);
  const toggleComplete = useAppStore((s) => s.toggleComplete);
  const setFocusTask = useAppStore((s) => s.setFocusTask);
  const focusTaskId = useAppStore((s) => s.focusTaskId);
  const addTimer = useAppStore((s) => s.addTimer);
  const timers = useAppStore((s) => s.timers);
  const projects = useAppStore((s) => s.projects);
  const saveTemplate = useAppStore((s) => s.saveTemplate);

  const task = tasks.find((t) => t.id === selectedTaskId) ?? null;

  const [mode, setMode] = useState<Mode>("view");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(3);
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [remind, setRemind] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [status, setStatus] = useState<TaskStatus>("pending");
  const [completionCriteria, setCompletionCriteria] = useState("");
  const [energyLevel, setEnergyLevel] =
    useState<"low" | "medium" | "high">("medium");
  const [flexible, setFlexible] = useState(true);
  const [blockedById, setBlockedById] = useState("");
  const [history, setHistory] = useState<TaskEvent[]>([]);
  const [repeat, setRepeat] = useState<RepeatRule | null>(null);
  const [subTitle, setSubTitle] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const loadedId = useRef<string | null>(null);

  useEffect(() => {
    if (!task) {
      loadedId.current = null;
      setMode("view");
      return;
    }
    if (loadedId.current === task.id) return;
    loadedId.current = task.id;
    setMode(detailPreferEdit ? "edit" : "view");
    hydrateFromTask();
    void loadAttachments(task.id);
    void fetchTaskEvents(task.id).then(setHistory);
    if (focusTaskId !== task.id) setFocusTask(task.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, detailPreferEdit]);

  const hydrateFromTask = () => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description);
    setNotes(task.notes);
    setPriority(task.priority);
    const range = defaultTimeRange();
    setDueDate(task.due_date ?? "");
    setDueTime(task.due_time ?? range.start);
    setEndTime(
      task.end_time ??
        ensureEndAfterStart(task.due_time ?? range.start, null),
    );
    setRemind(task.reminder_minutes.join(", "));
    setEstimatedMinutes(
      task.estimated_minutes != null ? String(task.estimated_minutes) : "",
    );
    setStatus(task.status);
    setCompletionCriteria(task.completion_criteria);
    setEnergyLevel(task.energy_level);
    setFlexible(Boolean(task.flexible));
    setBlockedById(task.blocked_by_id ?? "");
    setRepeat(parseRepeatRule(task.repeat_rule));
  };

  const enterEdit = () => {
    hydrateFromTask();
    setMode("edit");
  };

  const cancelEdit = () => {
    hydrateFromTask();
    setMode("view");
  };

  const persist = async () => {
    if (!task || saving) return false;
    const nextTitle = title.trim() || "新任务";
    const start = dueTime || nowTimeString();
    const end = ensureEndAfterStart(start, endTime);
    setSaving(true);
    try {
      await saveTask(task.id, {
        title: nextTitle,
        description,
        notes,
        priority,
        due_date: dueDate || null,
        due_time: start,
        end_time: end,
        remind_minutes: remind
          ? Number(remind.split(",")[0].trim()) || null
          : null,
        reminder_minutes: remind ? parseReminderMinutes(remind) : [],
        estimated_minutes: estimatedMinutes
          ? Math.max(1, Number(estimatedMinutes))
          : null,
        status,
        completion_criteria: completionCriteria,
        energy_level: energyLevel,
        flexible: flexible ? 1 : 0,
        blocked_by_id: blockedById || null,
        repeat_rule: stringifyRepeatRule(repeat),
      });
      setToast("已保存");
      setMode("view");
      return true;
    } catch {
      setToast("保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (!task) return null;

  const subs = getSubtasks(tasks, task.id);
  const progress = subtaskProgress(tasks, task.id);
  const selectedTags = tagMap[task.id] ?? [];
  const taskTags = tags.filter((t) => selectedTags.includes(t.id));
  const timeText = formatTimeRange(task.due_time, task.end_time);
  const estimateSamples = tasks.filter(
    (candidate) =>
      candidate.id !== task.id &&
      candidate.status === "completed" &&
      candidate.actual_minutes > 0 &&
      (task.project_id
        ? candidate.project_id === task.project_id
        : candidate.priority === task.priority),
  );
  const suggestedEstimate = estimateSamples.length
    ? Math.round(
        estimateSamples.reduce(
          (sum, candidate) => sum + candidate.actual_minutes,
          0,
        ) / estimateSamples.length,
      )
    : null;

  const pickFile = async () => {
    const selected = await open({ multiple: false });
    if (!selected || Array.isArray(selected)) return;
    const name = selected.split(/[/\\]/).pop() ?? selected;
    await addAttachment(task.id, { kind: "file", name, path: selected });
  };

  return (
    <aside className="detail-panel">
      <div className="panel-head">
        <h3>{mode === "view" ? "任务详情" : "编辑任务"}</h3>
        <div className="detail-head-actions">
          {mode === "view" ? (
            <button type="button" className="btn-ghost" onClick={enterEdit}>
              编辑
            </button>
          ) : (
            <>
              <button
                type="button"
                className="primary-btn"
                disabled={saving}
                onClick={() => void persist()}
              >
                {saving ? "保存中…" : "保存"}
              </button>
              <button type="button" className="btn-ghost" onClick={cancelEdit}>
                取消
              </button>
            </>
          )}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => selectTask(null)}
          >
            ✕
          </button>
        </div>
      </div>

      {mode === "view" ? (
        <div className="detail-body detail-view">
          <div className="detail-view-hero">
            <button
              type="button"
              className={`task-check ${task.status === "completed" ? "is-done" : ""}`}
              title={task.status === "completed" ? "标为未完成" : "标为完成"}
              onClick={() => void toggleComplete(task.id)}
            >
              {task.status === "completed" ? "✓" : ""}
            </button>
            <h2 className="detail-view-title">{task.title}</h2>
          </div>

          {task.description ? (
            <p className="detail-view-desc">{task.description}</p>
          ) : null}

          <div className="detail-meta-grid">
            <div className="detail-meta">
              <span className="field-label">日期</span>
              <strong>{task.due_date ?? "未设置"}</strong>
            </div>
            <div className="detail-meta">
              <span className="field-label">时间</span>
              <strong>{timeText || "未设置"}</strong>
            </div>
            <div className="detail-meta">
              <span className="field-label">优先级</span>
              <strong className={`prio p${task.priority}`}>
                {PRIORITY_LABEL[task.priority] ?? `P${task.priority}`}
              </strong>
            </div>
            <div className="detail-meta">
              <span className="field-label">提醒</span>
              <strong>
                {task.reminder_minutes.length
                  ? task.reminder_minutes.map((m) => `提前 ${m} 分钟`).join("、")
                  : "无"}
              </strong>
            </div>
            <div className="detail-meta">
              <span className="field-label">预计耗时</span>
              <strong>
                {task.estimated_minutes != null
                  ? `${task.estimated_minutes} 分钟`
                  : "未设置"}
              </strong>
            </div>
            <div className="detail-meta">
              <span className="field-label">实际耗时</span>
              <strong>{task.actual_minutes} 分钟</strong>
            </div>
            <div className="detail-meta">
              <span className="field-label">当前状态</span>
              <strong>{statusLabel(task.status)}</strong>
            </div>
            <div className="detail-meta">
              <span className="field-label">重复</span>
              <strong>{repeatLabel(task.repeat_rule)}</strong>
            </div>
          </div>

          {taskTags.length > 0 ? (
            <div>
              <span className="field-label">标签</span>
              <div className="tag-pills">
                {taskTags.map((tag) => (
                  <span key={tag.id} className="tag-pill on">
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {task.notes ? (
            <div>
              <span className="field-label">备注</span>
              <p className="detail-view-notes">{task.notes}</p>
            </div>
          ) : null}

          {task.completion_criteria ? (
            <div>
              <span className="field-label">完成标准</span>
              <p className="detail-view-notes">{task.completion_criteria}</p>
            </div>
          ) : null}

          {history.length ? (
            <details className="task-history">
              <summary>任务历史 · {history.length}</summary>
              <div>
                {history.slice(0, 20).map((event) => (
                  <article key={event.id}>
                    <span>{eventLabel(event.event_type)}</span>
                    <time>{new Date(event.created_at).toLocaleString()}</time>
                  </article>
                ))}
              </div>
            </details>
          ) : null}

          <PomodoroPanel compact boundTaskId={task.id} />

          <div className="detail-utility-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                const name = window.prompt("模板名称", task.title);
                if (!name?.trim()) return;
                void saveTemplate(name.trim(), {
                  title: task.title,
                  description: task.description,
                  notes: task.notes,
                  priority: task.priority,
                  due_time: task.due_time,
                  end_time: task.end_time,
                  repeat_rule: task.repeat_rule,
                  reminder_minutes: task.reminder_minutes,
                  estimated_minutes: task.estimated_minutes,
                  project_id: task.project_id,
                  relative_due_days: task.due_date
                    ? Math.round(
                        (new Date(`${task.due_date}T12:00:00`).getTime() -
                          new Date(
                            `${todayDateString()}T12:00:00`,
                          ).getTime()) /
                          86_400_000,
                      )
                    : undefined,
                  subtasks: subs.map((subtask) => ({
                    title: subtask.title,
                    description: subtask.description,
                    priority: subtask.priority,
                    estimated_minutes: subtask.estimated_minutes,
                  })),
                });
              }}
            >
              保存为模板
            </button>
          </div>

          <div className="task-countdown-box">
            <span className="field-label">事项倒计时</span>
            <div className="task-countdown-actions">
              {[5, 15, 25].map((m) => (
                <button
                  key={m}
                  type="button"
                  className="btn-ghost"
                  onClick={() =>
                    void addTimer({
                      kind: "task",
                      title: task.title,
                      interval_sec: m * 60,
                      task_id: task.id,
                      start: true,
                    })
                  }
                >
                  {m} 分钟
                </button>
              ))}
            </div>
            {timers.some((t) => t.task_id === task.id && t.running) ? (
              <p className="timer-meta">已有进行中的倒计时（主窗口已最小化，见浮窗）</p>
            ) : null}
          </div>

          {subs.length > 0 ? (
            <div>
              <span className="field-label">
                子任务 · {Math.round(progress * 100)}%
              </span>
              <div className="progress-bar" style={{ marginBottom: 8 }}>
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <div className="subtask-list">
                {subs.map((sub) => (
                  <div key={sub.id} className="subtask-item">
                    <button
                      type="button"
                      className="task-check"
                      onClick={() => void toggleComplete(sub.id)}
                    >
                      {sub.status === "completed" ? "✓" : ""}
                    </button>
                    <span
                      style={{
                        flex: 1,
                        textDecoration:
                          sub.status === "completed" ? "line-through" : "none",
                      }}
                    >
                      {sub.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {attachments.length > 0 ? (
            <div>
              <span className="field-label">附件</span>
              {attachments.map((a: Attachment) => (
                <div key={a.id} className="subtask-item">
                  <span style={{ flex: 1, fontSize: 12 }}>
                    {a.kind}: {a.name}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            className="btn-primary"
            onClick={enterEdit}
          >
            编辑任务
          </button>
        </div>
      ) : (
        <div className="detail-body">
          <div>
            <label className="field-label">标题</label>
            <input
              className="field"
              value={title}
              autoFocus={mode === "edit"}
              onFocus={(e) => {
                if (title === "新任务") e.currentTarget.select();
              }}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">描述</label>
            <textarea
              className="field"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">截止日期</label>
            <input
              className="field"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <TimeRangeFields
            start={dueTime}
            end={endTime}
            onStartChange={setDueTime}
            onEndChange={setEndTime}
          />
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
          >
            <div>
              <label className="field-label">优先级</label>
              <select
                className="field"
                value={priority}
                onChange={(e) =>
                  setPriority(Number(e.target.value) as TaskPriority)
                }
              >
                <option value={1}>P1</option>
                <option value={2}>P2</option>
                <option value={3}>P3</option>
                <option value={4}>P4</option>
              </select>
            </div>
            <div>
              <label className="field-label">提前提醒（可填多个）</label>
              <input
                className="field"
                placeholder="例如：60, 30, 10"
                value={remind}
                onChange={(e) => setRemind(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="field-label">预计耗时（分钟）</label>
            <input
              className="field"
              type="number"
              min={1}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              placeholder="例如：45"
            />
            <div className="estimate-presets">
              {[15, 30, 45, 60, 90].map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className="btn-ghost"
                  onClick={() => setEstimatedMinutes(String(minutes))}
                >
                  {minutes} 分
                </button>
              ))}
              {suggestedEstimate ? (
                <button
                  type="button"
                  className="btn-ghost estimate-suggestion"
                  onClick={() =>
                    setEstimatedMinutes(String(suggestedEstimate))
                  }
                >
                  根据历史建议 {suggestedEstimate} 分
                </button>
              ) : null}
            </div>
          </div>
          <div>
            <label className="field-label">所属项目</label>
            <select
              className="field"
              value={task.project_id ?? ""}
              onChange={(event) =>
                void saveTask(task.id, {
                  project_id: event.target.value || null,
                })
              }
            >
              <option value="">无项目</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <div className="lifecycle-grid">
            <div>
              <label className="field-label">任务状态</label>
              <select
                className="field"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as TaskStatus)
                }
              >
                <option value="draft">草稿</option>
                <option value="pending">待处理</option>
                <option value="in_progress">进行中</option>
                <option value="waiting">等待</option>
                <option value="blocked">阻塞</option>
                <option value="completed">完成</option>
                <option value="cancelled">取消</option>
              </select>
            </div>
            <div>
              <label className="field-label">精力要求</label>
              <select
                className="field"
                value={energyLevel}
                onChange={(event) =>
                  setEnergyLevel(
                    event.target.value as "low" | "medium" | "high",
                  )
                }
              >
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">完成标准</label>
            <textarea
              className="field"
              rows={2}
              value={completionCriteria}
              onChange={(event) => setCompletionCriteria(event.target.value)}
              placeholder="怎样才算真正完成？"
            />
          </div>
          <div>
            <label className="field-label">前置任务</label>
            <select
              className="field"
              value={blockedById}
              onChange={(event) => setBlockedById(event.target.value)}
            >
              <option value="">无</option>
              {tasks
                .filter(
                  (candidate) =>
                    candidate.id !== task.id &&
                    !candidate.parent_id &&
                    candidate.status !== "completed",
                )
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
            </select>
          </div>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={flexible}
              onChange={(event) => setFlexible(event.target.checked)}
            />
            可由智能排程调整时间
          </label>
          <div>
            <label className="field-label">重复</label>
            <select
              className="field"
              value={repeat?.frequency ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) setRepeat(null);
                else if (v === "custom")
                  setRepeat({
                    frequency: "custom",
                    interval: 1,
                    nthWeekday: { n: -1, weekday: 5 },
                  });
                else
                  setRepeat({
                    frequency: v as RepeatRule["frequency"],
                    interval: 1,
                  });
              }}
            >
              <option value="">不重复</option>
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
              <option value="custom">每月最后周五</option>
            </select>
          </div>
          <div>
            <label className="field-label">备注</label>
            <textarea
              className="field"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div>
            <label className="field-label">标签</label>
            <div className="tag-pills">
              {tags.map((tag) => {
                const on = selectedTags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={`tag-pill ${on ? "on" : ""}`}
                    onClick={() => {
                      const next = on
                        ? selectedTags.filter((id) => id !== tag.id)
                        : [...selectedTags, tag.id];
                      void setTaskTags(task.id, next);
                    }}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="field-label">
              子任务 {subs.length ? `· ${Math.round(progress * 100)}%` : ""}
            </label>
            {subs.length > 0 && (
              <div className="progress-bar" style={{ marginBottom: 8 }}>
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
            <div className="subtask-list">
              {subs.map((sub) => (
                <div key={sub.id} className="subtask-item">
                  <button
                    type="button"
                    className="task-check"
                    onClick={() => void toggleComplete(sub.id)}
                  >
                    {sub.status === "completed" ? "✓" : ""}
                  </button>
                  <span style={{ flex: 1 }}>{sub.title}</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  className="field"
                  placeholder="添加子任务"
                  value={subTitle}
                  onChange={(e) => setSubTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && subTitle.trim()) {
                      void addTask({
                        title: subTitle.trim(),
                        parent_id: task.id,
                        due_date: null,
                        due_time: null,
                      });
                      setSubTitle("");
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="field-label">附件</label>
            <div
              className={`drop-zone ${dragOver ? "active" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                const uri = e.dataTransfer.getData("text/uri-list");
                if (uri?.startsWith("http")) {
                  void addAttachment(task.id, {
                    kind: "url",
                    name: uri,
                    path: uri,
                  });
                  return;
                }
                if (file) {
                  void addAttachment(task.id, {
                    kind: "file",
                    name: file.name,
                    path: (file as File & { path?: string }).path || file.name,
                  });
                }
              }}
            >
              拖拽文件/链接到此处，或
              <button
                type="button"
                className="btn-ghost"
                onClick={() => void pickFile()}
              >
                选择文件
              </button>
            </div>
            {attachments.map((a: Attachment) => (
              <div key={a.id} className="subtask-item">
                <span style={{ flex: 1, fontSize: 12 }}>
                  {a.kind}: {a.name}
                </span>
                <button
                  type="button"
                  className="btn-ghost danger"
                  onClick={() => void removeAttachment(a.id)}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === "edit" ? (
        <div className="detail-footer">
          <button
            type="button"
            className="btn-primary"
            disabled={saving}
            onClick={() => void persist()}
          >
            {saving ? "保存中…" : "保存"}
          </button>
          <button
            type="button"
            className="btn-ghost danger"
            onClick={() => void deleteTask(task.id)}
          >
            删除
          </button>
        </div>
      ) : null}
    </aside>
  );
}
