import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/store/app";
import type { TaskPriority } from "@/types";
import { TimeRangeFields } from "@/components/TimePicker";
import { findFirstAvailableTimeSlot } from "@/lib/planning";
import { nowTimeString, parseTimeToMinutes, todayDateString } from "@/lib/dates";

export function CreateTaskDialog() {
  const tasks = useAppStore((s) => s.tasks);
  const projects = useAppStore((s) => s.projects);
  const calendarCursor = useAppStore((s) => s.calendarCursor);
  const addTask = useAppStore((s) => s.addTask);
  const close = useAppStore((s) => s.closeCreateTask);
  const selectTask = useAppStore((s) => s.selectTask);
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(calendarCursor)
    ? calendarCursor
    : todayDateString();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(initialDate);
  const [dueTime, setDueTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(3);
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);
  const [projectId, setProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const suggestedSlot = useMemo(() => {
    const today = todayDateString();
    const now = parseTimeToMinutes(nowTimeString(false)) ?? 9 * 60;
    const notBefore = dueDate === today ? Math.max(9 * 60, now) : 9 * 60;
    return findFirstAvailableTimeSlot(tasks, dueDate, estimatedMinutes, notBefore);
  }, [tasks, dueDate, estimatedMinutes]);

  useEffect(() => {
    if (!suggestedSlot) return;
    setDueTime(suggestedSlot.start);
    setEndTime(suggestedSlot.end);
  }, [suggestedSlot]);

  useEffect(() => {
    titleRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  const submit = async () => {
    if (!title.trim() || !dueTime || !endTime || saving) return;
    setSaving(true);
    const task = await addTask({
      title: title.trim(),
      description: description.trim(),
      due_date: dueDate,
      due_time: dueTime,
      end_time: endTime,
      priority,
      estimated_minutes: estimatedMinutes,
      project_id: projectId || null,
      flexible: 0,
      schedule_locked: 1,
    });
    setSaving(false);
    if (!task) return;
    close();
    selectTask(task.id);
  };

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <form
        className="create-task-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => { event.preventDefault(); void submit(); }}
      >
        <div className="modal-head">
          <div><span>安排一段专注时间</span><h3 id="create-task-title">新建任务</h3></div>
          <button type="button" aria-label="关闭" onClick={close}>×</button>
        </div>
        <label>任务名称<input ref={titleRef} value={title} placeholder="现在要完成什么？" onChange={(event) => setTitle(event.target.value)} /></label>
        <label>任务说明<textarea value={description} placeholder="可选：补充背景或完成标准" onChange={(event) => setDescription(event.target.value)} /></label>
        <div className="create-task-grid">
          <label>日期<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          <label>优先级<select value={priority} onChange={(event) => setPriority(Number(event.target.value) as TaskPriority)}><option value={1}>P1 紧急</option><option value={2}>P2 高</option><option value={3}>P3 普通</option><option value={4}>P4 低</option></select></label>
          <label>预计时长<select value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(Number(event.target.value))}><option value={30}>30 分钟</option><option value={45}>45 分钟</option><option value={60}>1 小时</option><option value={90}>1.5 小时</option><option value={120}>2 小时</option></select></label>
          <label>所属项目<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">无项目</option>{projects.filter((project) => !project.archived).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        </div>
        <div className="create-task-time-card">
          <div><strong>时间安排</strong><span>{suggestedSlot ? "已避开当天已有任务，可继续手动调整" : "当天没有足够的连续空闲时间，请手动调整"}</span></div>
          <TimeRangeFields start={dueTime} end={endTime} onStartChange={setDueTime} onEndChange={setEndTime} />
        </div>
        <div className="create-task-actions"><button type="button" className="btn-ghost" onClick={close}>取消</button><button type="submit" className="btn-primary" disabled={!title.trim() || !dueTime || !endTime || saving}>{saving ? "创建中…" : "创建任务"}</button></div>
      </form>
    </div>
  );
}
