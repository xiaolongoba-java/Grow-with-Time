import type {
  DaySnapshot,
  FocusSession,
  Task,
  TaskDraft,
  TaskEvent,
  TaskUpdate,
} from "@/types";
import {
  addMinutesToTime,
  createId,
  ensureEndAfterStart,
  nowIso,
  nowTimeString,
  todayDateString,
} from "@/lib/dates";
import { nextRepeatTaskDraft } from "@/lib/repeat";
import { localDateKey } from "@/lib/growth";
import { getDb, mapTask, saveTaskPlanningMetadata, TASK_SELECT } from "./client";
import { linkTag } from "./taxonomy";
import { addGoalEntry, refreshProjectGoals, removeGoalEntryBySource } from "./growth";

export async function fetchTasks(includeDeleted = false): Promise<Task[]> {
  const db = await getDb();
  const query = includeDeleted
    ? `${TASK_SELECT} ORDER BY tasks.sort_order ASC, tasks.created_at DESC`
    : `${TASK_SELECT} WHERE tasks.deleted_at IS NULL ORDER BY tasks.sort_order ASC, tasks.created_at DESC`;
  const rows = await db.select<Task[]>(query);
  return rows.map(mapTask);
}

export async function fetchTrashTasks(): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.select<Task[]>(
    `${TASK_SELECT} WHERE tasks.deleted_at IS NOT NULL ORDER BY tasks.deleted_at DESC`,
  );
  return rows.map(mapTask);
}

export async function createTask(draft: TaskDraft): Promise<Task> {
  const db = await getDb();
  const timestamp = nowIso();
  const isSubtask = Boolean(draft.parent_id);
  let start: string | null;
  let end: string | null;
  if (isSubtask) {
    start = draft.due_time ?? null;
    end = draft.end_time ?? null;
  } else {
    start =
      draft.due_time === undefined || draft.due_time === null || draft.due_time === ""
        ? nowTimeString()
        : draft.due_time;
    end =
      draft.end_time === undefined || draft.end_time === null || draft.end_time === ""
        ? addMinutesToTime(start, 60)
        : ensureEndAfterStart(start, draft.end_time);
  }

  const task: Task = {
    id: createId(),
    title: draft.title.trim(),
    description: draft.description?.trim() ?? "",
    notes: draft.notes?.trim() ?? "",
    priority: draft.priority ?? 3,
    status: "pending",
    due_date: draft.due_date === undefined ? todayDateString() : draft.due_date,
    due_time: start,
    end_time: end,
    sort_order: Date.now(),
    created_at: timestamp,
    updated_at: timestamp,
    completed_at: null,
    deleted_at: null,
    parent_id: draft.parent_id ?? null,
    repeat_rule: draft.repeat_rule ?? null,
    remind_minutes: draft.remind_minutes ?? null,
    reminder_minutes:
      draft.reminder_minutes ??
      (draft.remind_minutes != null ? [draft.remind_minutes] : []),
    estimated_minutes: draft.estimated_minutes ?? null,
    project_id: draft.project_id ?? null,
    my_day_date: draft.my_day_date ?? null,
    blocked_by_id: draft.blocked_by_id ?? null,
    completion_criteria: draft.completion_criteria ?? "",
    energy_level: draft.energy_level ?? "medium",
    flexible: draft.flexible ?? 1,
    schedule_locked: draft.schedule_locked ?? 0,
    actual_minutes: 0,
    goal_id: draft.goal_id ?? null,
    goal_contribution: draft.goal_contribution ?? 1,
  };

  await db.execute(
    `INSERT INTO tasks (
      id, title, description, notes, priority, status,
      due_date, due_time, end_time, sort_order, created_at, updated_at,
      completed_at, deleted_at, parent_id, repeat_rule, remind_minutes,
      project_id, my_day_date,
      blocked_by_id, completion_criteria, energy_level, flexible, schedule_locked,
      actual_minutes, goal_id, goal_contribution
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
    [
      task.id,
      task.title,
      task.description,
      task.notes,
      task.priority,
      task.status,
      task.due_date,
      task.due_time,
      task.end_time,
      task.sort_order,
      task.created_at,
      task.updated_at,
      task.completed_at,
      task.deleted_at,
      task.parent_id,
      task.repeat_rule,
      task.remind_minutes,
      task.project_id,
      task.my_day_date,
      task.blocked_by_id,
      task.completion_criteria,
      task.energy_level,
      task.flexible,
      task.schedule_locked,
      task.actual_minutes,
      task.goal_id,
      task.goal_contribution,
    ],
  );
  await saveTaskPlanningMetadata(task);
  await recordTaskEvent(task.id, "created", null, task);

  if (draft.tagIds?.length) {
    for (const tagId of draft.tagIds) {
      await linkTag(task.id, tagId);
    }
  }

  return task;
}

export async function updateTask(
  id: string,
  updates: TaskUpdate,
): Promise<Task | null> {
  const db = await getDb();
  const existing = await db.select<Task[]>(
    `${TASK_SELECT} WHERE tasks.id = $1 LIMIT 1`,
    [id],
  );
  if (existing.length === 0) return null;

  const current = mapTask(existing[0]);
  const next: Task = {
    ...current,
    ...updates,
    updated_at: nowIso(),
  };
  if (updates.remind_minutes !== undefined && updates.reminder_minutes === undefined) {
    next.reminder_minutes =
      updates.remind_minutes == null ? [] : [updates.remind_minutes];
  }

  if (updates.status === "completed" && current.status !== "completed") {
    next.completed_at = nowIso();
  }
  if (updates.status === "pending") {
    next.completed_at = null;
  }

  await db.execute(
    `UPDATE tasks SET
      title=$1, description=$2, notes=$3, priority=$4, status=$5,
      due_date=$6, due_time=$7, end_time=$8, updated_at=$9, completed_at=$10,
      parent_id=$11, repeat_rule=$12, remind_minutes=$13, sort_order=$14,
      project_id=$15, my_day_date=$16, blocked_by_id=$17,
      completion_criteria=$18, energy_level=$19, flexible=$20,
      schedule_locked=$21, actual_minutes=$22, goal_id=$23, goal_contribution=$24
    WHERE id=$25`,
    [
      next.title,
      next.description,
      next.notes,
      next.priority,
      next.status,
      next.due_date,
      next.due_time,
      next.end_time,
      next.updated_at,
      next.completed_at,
      next.parent_id,
      next.repeat_rule,
      next.remind_minutes,
      next.sort_order,
      next.project_id,
      next.my_day_date,
      next.blocked_by_id,
      next.completion_criteria,
      next.energy_level,
      next.flexible,
      next.schedule_locked,
      next.actual_minutes,
      next.goal_id,
      next.goal_contribution,
      id,
    ],
  );
  await saveTaskPlanningMetadata(next);
  await recordTaskEvent(id, "updated", current, next);
  const goalLinkChanged =
    current.goal_id !== next.goal_id ||
    current.goal_contribution !== next.goal_contribution;
  if (current.status === "completed" && goalLinkChanged && current.goal_id) {
    await removeGoalEntryBySource(current.goal_id, "task", current.id);
  }
  if (
    next.goal_id &&
    next.status === "completed" &&
    (current.status !== "completed" || goalLinkChanged)
  ) {
    await addGoalEntry({
      goal_id: next.goal_id,
      entry_date: localDateKey(new Date(next.completed_at ?? nowIso())),
      value: next.goal_contribution || 1,
      source_type: "task",
      source_id: next.id,
      note: next.title,
    });
  } else if (current.goal_id && current.status === "completed" && next.status !== "completed") {
    await removeGoalEntryBySource(current.goal_id, "task", current.id);
  }
  const affectedProjectIds = new Set(
    [current.project_id, next.project_id].filter((value): value is string => Boolean(value)),
  );
  for (const projectId of affectedProjectIds) {
    await refreshProjectGoals(projectId);
  }

  return next;
}

export async function recordTaskEvent(
  taskId: string,
  eventType: string,
  before: unknown,
  after: unknown,
  note = "",
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO task_events
      (id, task_id, event_type, before_json, after_json, note, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      createId(),
      taskId,
      eventType,
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
      note,
      nowIso(),
    ],
  );
}

export async function fetchTaskEvents(taskId: string): Promise<TaskEvent[]> {
  const db = await getDb();
  return db.select<TaskEvent[]>(
    `SELECT * FROM task_events
     WHERE task_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [taskId],
  );
}

export async function startFocusSession(
  taskId: string | null,
): Promise<FocusSession> {
  const db = await getDb();
  const stamp = nowIso();
  const session: FocusSession = {
    id: createId(),
    task_id: taskId,
    started_at: stamp,
    ended_at: null,
    duration_sec: 0,
    interruption_reason: null,
    created_at: stamp,
  };
  await db.execute(
    `INSERT INTO focus_sessions
      (id, task_id, started_at, ended_at, duration_sec, interruption_reason, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      session.id,
      session.task_id,
      session.started_at,
      session.ended_at,
      session.duration_sec,
      session.interruption_reason,
      session.created_at,
    ],
  );
  return session;
}

export async function finishFocusSession(
  id: string,
  interruptionReason?: string | null,
): Promise<void> {
  const db = await getDb();
  const rows = await db.select<FocusSession[]>(
    "SELECT * FROM focus_sessions WHERE id = $1 LIMIT 1",
    [id],
  );
  if (!rows.length) return;
  const session = rows[0];
  const ended = nowIso();
  const durationSec = Math.max(
    0,
    Math.round(
      (new Date(ended).getTime() - new Date(session.started_at).getTime()) /
        1000,
    ),
  );
  await db.execute(
    `UPDATE focus_sessions
     SET ended_at = $1, duration_sec = $2, interruption_reason = $3
     WHERE id = $4`,
    [ended, durationSec, interruptionReason ?? null, id],
  );
  if (session.task_id && durationSec > 0) {
    const minutes = Math.max(1, Math.round(durationSec / 60));
    await db.execute(
      `UPDATE tasks
       SET actual_minutes = COALESCE(actual_minutes, 0) + $1,
           updated_at = $2
       WHERE id = $3`,
      [minutes, ended, session.task_id],
    );
    await recordTaskEvent(
      session.task_id,
      "time_logged",
      null,
      { minutes, interruptionReason: interruptionReason ?? null },
    );
    const taskRows = await db.select<Task[]>(
      `${TASK_SELECT} WHERE tasks.id = $1 LIMIT 1`,
      [session.task_id],
    );
    const task = taskRows[0] ? mapTask(taskRows[0]) : null;
    if (task?.goal_id) {
      await addGoalEntry({
        goal_id: task.goal_id,
        entry_date: localDateKey(new Date(ended)),
        value: minutes,
        source_type: "focus",
        source_id: id,
        note: `专注：${task.title}`,
      });
    }
  }
}

export async function fetchFocusSessions(
  taskId?: string,
): Promise<FocusSession[]> {
  const db = await getDb();
  return taskId
    ? db.select<FocusSession[]>(
        "SELECT * FROM focus_sessions WHERE task_id = $1 ORDER BY started_at DESC",
        [taskId],
      )
    : db.select<FocusSession[]>(
        "SELECT * FROM focus_sessions ORDER BY started_at DESC LIMIT 500",
      );
}

export async function saveDaySnapshot(
  planDate: string,
  tasks: Task[],
  phase: "morning" | "evening",
  reflection?: string,
): Promise<DaySnapshot> {
  const db = await getDb();
  const existing = await db.select<DaySnapshot[]>(
    "SELECT * FROM day_snapshots WHERE plan_date = $1 LIMIT 1",
    [planDate],
  );
  const stamp = nowIso();
  const plannedMinutes = tasks.reduce(
    (sum, task) => sum + (task.estimated_minutes ?? 0),
    0,
  );
  const completedMinutes = tasks
    .filter((task) => task.status === "completed")
    .reduce(
      (sum, task) =>
        sum + (task.actual_minutes || task.estimated_minutes || 0),
      0,
    );
  const serialized = JSON.stringify(
    tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      estimated_minutes: task.estimated_minutes,
      actual_minutes: task.actual_minutes,
    })),
  );
  if (existing.length) {
    await db.execute(
      `UPDATE day_snapshots SET
       evening_json = CASE WHEN $1 = 'evening' THEN $2 ELSE evening_json END,
       morning_json = CASE WHEN $1 = 'morning' THEN $2 ELSE morning_json END,
       planned_minutes = $3, completed_minutes = $4,
       reflection = COALESCE($5, reflection),
       updated_at = $6 WHERE plan_date = $7`,
      [
        phase,
        serialized,
        plannedMinutes,
        completedMinutes,
        reflection ?? null,
        stamp,
        planDate,
      ],
    );
  } else {
    await db.execute(
      `INSERT INTO day_snapshots
       (id, plan_date, morning_json, evening_json, planned_minutes,
        completed_minutes, reflection, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        createId(),
        planDate,
        phase === "morning" ? serialized : "[]",
        phase === "evening" ? serialized : null,
        plannedMinutes,
        completedMinutes,
        reflection ?? "",
        stamp,
        stamp,
      ],
    );
  }
  return (
    await db.select<DaySnapshot[]>(
      "SELECT * FROM day_snapshots WHERE plan_date = $1 LIMIT 1",
      [planDate],
    )
  )[0];
}

export async function fetchDaySnapshots(): Promise<DaySnapshot[]> {
  const db = await getDb();
  return db.select<DaySnapshot[]>(
    "SELECT * FROM day_snapshots ORDER BY plan_date DESC LIMIT 90",
  );
}

export async function reorderTasks(
  orderedIds: string[],
): Promise<void> {
  const db = await getDb();
  const base = Date.now();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.execute("UPDATE tasks SET sort_order=$1, updated_at=$2 WHERE id=$3", [
      base + i,
      nowIso(),
      orderedIds[i],
    ]);
  }
}

export async function batchSetTaskStatus(
  ids: string[],
  status: Task["status"],
): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  const stamp = nowIso();
  await db.execute("BEGIN IMMEDIATE");
  try {
    for (const id of ids) {
      await db.execute(
        `UPDATE tasks SET status=$1, updated_at=$2,
         completed_at=CASE WHEN $1='completed' THEN $2 ELSE NULL END
         WHERE id=$3`,
        [status, stamp, id],
      );
    }
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
  for (const id of ids) {
    await recordTaskEvent(id, "batch_status", null, { status });
  }
}

export async function batchSoftDeleteTasks(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  const stamp = nowIso();
  await db.execute("BEGIN IMMEDIATE");
  try {
    for (const id of ids) {
      await db.execute(
        "UPDATE tasks SET deleted_at=$1, updated_at=$1 WHERE id=$2",
        [stamp, id],
      );
    }
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
  for (const id of ids) {
    await recordTaskEvent(id, "deleted", null, null);
  }
}

export async function batchRestoreTasks(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  await db.execute("BEGIN IMMEDIATE");
  try {
    for (const id of ids) {
      await db.execute(
        "UPDATE tasks SET deleted_at=NULL, updated_at=$1 WHERE id=$2",
        [nowIso(), id],
      );
    }
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
}

export async function toggleTaskComplete(
  id: string,
): Promise<{ task: Task | null; spawned: Task | null }> {
  const db = await getDb();
  const existing = await db.select<Task[]>(
    `${TASK_SELECT} WHERE tasks.id = $1 LIMIT 1`,
    [id],
  );
  if (existing.length === 0) return { task: null, spawned: null };

  const current = mapTask(existing[0]);
  if (current.status === "completed") {
    return { task: await updateTask(id, { status: "pending" }), spawned: null };
  }

  const completed = await updateTask(id, { status: "completed" });
  let spawned: Task | null = null;

  if (current.repeat_rule && current.parent_id === null) {
    const draft = nextRepeatTaskDraft(current);
    if (draft) spawned = await createTask(draft);
  }

  return { task: completed, spawned };
}

export async function softDeleteTask(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE tasks SET deleted_at = $1, updated_at = $1 WHERE id = $2 OR parent_id = $2",
    [nowIso(), id],
  );
}

export async function restoreTask(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE tasks SET deleted_at = NULL, updated_at = $1 WHERE id = $2 OR parent_id = $2",
    [nowIso(), id],
  );
}

export async function purgeTrash(): Promise<number> {
  const db = await getDb();
  const before = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM tasks WHERE deleted_at IS NOT NULL",
  );
  await db.execute(
    "DELETE FROM attachments WHERE task_id IN (SELECT id FROM tasks WHERE deleted_at IS NOT NULL)",
  );
  await db.execute(
    "DELETE FROM task_tags WHERE task_id IN (SELECT id FROM tasks WHERE deleted_at IS NOT NULL)",
  );
  await db.execute(
    "DELETE FROM task_planning_metadata WHERE task_id IN (SELECT id FROM tasks WHERE deleted_at IS NOT NULL)",
  );
  await db.execute("DELETE FROM tasks WHERE deleted_at IS NOT NULL");
  return before[0]?.count ?? 0;
}

