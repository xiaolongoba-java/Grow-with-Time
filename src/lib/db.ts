import Database from "@tauri-apps/plugin-sql";
import type {
  AiSettings,
  AppNotification,
  DaySnapshot,
  DailyReflection,
  AppSettings,
  Attachment,
  BackupPayload,
  Habit,
  HabitCheck,
  FocusSession,
  FutureLetter,
  Goal,
  GoalEntry,
  GoalMilestone,
  Achievement,
  Inspiration,
  Memo,
  Milestone,
  Project,
  SmartList,
  Tag,
  Task,
  TaskEvent,
  TaskDraft,
  TaskUpdate,
  TaskTemplate,
  ThemeMode,
  Timer,
  TimerDraft,
} from "@/types";
import { extractMomentTags } from "@/lib/moments";
import { createId, DB_URL, nowIso, nowTimeString, addMinutesToTime, ensureEndAfterStart, todayDateString } from "@/lib/dates";
import { nextRepeatTaskDraft, parseRepeatRule } from "@/lib/repeat";
import { goalAcceptsSource, localDateKey, localWeekStartKey } from "@/lib/growth";

let dbPromise: Promise<Database> | null = null;
const TASK_SELECT = `SELECT tasks.*,
  task_planning_metadata.reminder_minutes_json AS reminder_minutes_json,
  task_planning_metadata.estimated_minutes AS estimated_minutes
  FROM tasks LEFT JOIN task_planning_metadata
    ON task_planning_metadata.task_id = tasks.id`;

export async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL).then(async (db) => {
      // 防御：旧库漏跑迁移时补齐列
      try {
        await db.execute("ALTER TABLE tasks ADD COLUMN end_time TEXT");
      } catch {
        /* already exists */
      }
      try {
        await db.execute("ALTER TABLE tasks ADD COLUMN reminder_minutes_json TEXT");
      } catch {
        /* already exists */
      }
      try {
        await db.execute("ALTER TABLE tasks ADD COLUMN estimated_minutes INTEGER");
      } catch {
        /* already exists */
      }
      try {
        await db.execute(
          "ALTER TABLE memos ADD COLUMN title TEXT NOT NULL DEFAULT ''",
        );
      } catch {
        /* already exists */
      }
      try {
        await db.execute(`CREATE TABLE IF NOT EXISTS timers (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          title TEXT NOT NULL,
          interval_sec INTEGER NOT NULL,
          remaining_sec INTEGER NOT NULL,
          running INTEGER NOT NULL DEFAULT 0,
          enabled INTEGER NOT NULL DEFAULT 1,
          task_id TEXT,
          ends_at TEXT,
          last_fired_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`);
      } catch {
        /* ignore */
      }
      // v12 owns planning metadata formally. The legacy columns are read once
      // as an upgrade bridge, then every write is mirrored to the canonical table.
      await db.execute(
        `INSERT OR IGNORE INTO task_planning_metadata
         (task_id, reminder_minutes_json, estimated_minutes)
         SELECT id, COALESCE(reminder_minutes_json, '[]'), estimated_minutes FROM tasks`,
      );
      return db;
    });
  }
  return dbPromise;
}

function mapTask(row: Task): Task {
  const raw = (row as Task & { reminder_minutes_json?: string | null })
    .reminder_minutes_json;
  let reminders: number[] = Array.isArray(row.reminder_minutes)
    ? row.reminder_minutes
    : [];
  try {
    if (raw) reminders = JSON.parse(raw);
  } catch {
    reminders = [];
  }
  if (!reminders.length && row.remind_minutes != null) {
    reminders = [row.remind_minutes];
  }
  return {
    ...row,
    parent_id: row.parent_id ?? null,
    repeat_rule: row.repeat_rule ?? null,
    remind_minutes: row.remind_minutes ?? null,
    end_time: row.end_time ?? null,
    reminder_minutes: reminders,
    estimated_minutes: row.estimated_minutes ?? null,
    project_id: row.project_id ?? null,
    my_day_date: row.my_day_date ?? null,
    blocked_by_id: row.blocked_by_id ?? null,
    completion_criteria: row.completion_criteria ?? "",
    energy_level: row.energy_level ?? "medium",
    flexible: row.flexible ?? 1,
    schedule_locked: row.schedule_locked ?? 0,
    actual_minutes: row.actual_minutes ?? 0,
    goal_id: row.goal_id ?? null,
    goal_contribution: row.goal_contribution ?? 1,
  };
}

async function saveTaskPlanningMetadata(task: Task): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO task_planning_metadata
     (task_id, reminder_minutes_json, estimated_minutes)
     VALUES ($1,$2,$3)
     ON CONFLICT(task_id) DO UPDATE SET
       reminder_minutes_json=excluded.reminder_minutes_json,
       estimated_minutes=excluded.estimated_minutes`,
    [task.id, JSON.stringify(task.reminder_minutes ?? []), task.estimated_minutes ?? null],
  );
}

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

/* Tags */
export async function fetchTags(): Promise<Tag[]> {
  const db = await getDb();
  return db.select<Tag[]>("SELECT * FROM tags ORDER BY name ASC");
}

export async function createTag(name: string, color = "#5B8FF9"): Promise<Tag> {
  const db = await getDb();
  const tag: Tag = {
    id: createId(),
    name: name.trim(),
    color,
    created_at: nowIso(),
  };
  await db.execute(
    "INSERT INTO tags (id, name, color, created_at) VALUES ($1,$2,$3,$4)",
    [tag.id, tag.name, tag.color, tag.created_at],
  );
  return tag;
}

export async function updateTag(
  id: string,
  updates: { name?: string; color?: string },
): Promise<void> {
  const db = await getDb();
  const rows = await db.select<Tag[]>("SELECT * FROM tags WHERE id=$1", [id]);
  if (!rows[0]) return;
  const next = { ...rows[0], ...updates };
  await db.execute("UPDATE tags SET name=$1, color=$2 WHERE id=$3", [
    next.name,
    next.color,
    id,
  ]);
}

export async function deleteTag(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM task_tags WHERE tag_id=$1", [id]);
  await db.execute("DELETE FROM tags WHERE id=$1", [id]);
}

export async function fetchTaskTagMap(): Promise<Record<string, string[]>> {
  const db = await getDb();
  const rows = await db.select<{ task_id: string; tag_id: string }[]>(
    "SELECT task_id, tag_id FROM task_tags",
  );
  const map: Record<string, string[]> = {};
  for (const row of rows) {
    (map[row.task_id] ??= []).push(row.tag_id);
  }
  return map;
}

export async function linkTag(taskId: string, tagId: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES ($1,$2)",
    [taskId, tagId],
  );
}

export async function unlinkTag(taskId: string, tagId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM task_tags WHERE task_id=$1 AND tag_id=$2", [
    taskId,
    tagId,
  ]);
}

export async function setTaskTags(taskId: string, tagIds: string[]): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM task_tags WHERE task_id=$1", [taskId]);
  for (const tagId of tagIds) {
    await linkTag(taskId, tagId);
  }
}

/* Attachments */
export async function fetchAttachments(taskId: string): Promise<Attachment[]> {
  const db = await getDb();
  return db.select<Attachment[]>(
    "SELECT * FROM attachments WHERE task_id=$1 ORDER BY created_at DESC",
    [taskId],
  );
}

export async function fetchAllAttachments(): Promise<Attachment[]> {
  const db = await getDb();
  return db.select<Attachment[]>("SELECT * FROM attachments");
}

export async function addAttachment(
  taskId: string,
  data: { kind: Attachment["kind"]; name: string; path: string },
): Promise<Attachment> {
  const db = await getDb();
  const item: Attachment = {
    id: createId(),
    task_id: taskId,
    kind: data.kind,
    name: data.name,
    path: data.path,
    created_at: nowIso(),
  };
  await db.execute(
    "INSERT INTO attachments (id, task_id, kind, name, path, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
    [item.id, item.task_id, item.kind, item.name, item.path, item.created_at],
  );
  return item;
}

export async function removeAttachment(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM attachments WHERE id=$1", [id]);
}

/* Smart lists */
export async function fetchSmartLists(): Promise<SmartList[]> {
  const db = await getDb();
  return db.select<SmartList[]>("SELECT * FROM smart_lists ORDER BY created_at DESC");
}

export async function createSmartList(
  name: string,
  filter: object,
): Promise<SmartList> {
  const db = await getDb();
  const item: SmartList = {
    id: createId(),
    name,
    filter_json: JSON.stringify(filter),
    created_at: nowIso(),
  };
  await db.execute(
    "INSERT INTO smart_lists (id, name, filter_json, created_at) VALUES ($1,$2,$3,$4)",
    [item.id, item.name, item.filter_json, item.created_at],
  );
  return item;
}

export async function deleteSmartList(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM smart_lists WHERE id=$1", [id]);
}

/* Habits */
export async function fetchHabits(): Promise<Habit[]> {
  const db = await getDb();
  const rows = await db.select<Habit[]>("SELECT * FROM habits ORDER BY created_at DESC");
  return rows.map((habit) => ({
    ...habit,
    goal_id: habit.goal_id ?? null,
    goal_contribution: habit.goal_contribution ?? 1,
  }));
}

export async function createHabit(
  title: string,
  targetPerWeek = 3,
): Promise<Habit> {
  const db = await getDb();
  const habit: Habit = {
    id: createId(),
    title: title.trim(),
    target_per_week: targetPerWeek,
    created_at: nowIso(),
    goal_id: null,
    goal_contribution: 1,
  };
  await db.execute(
    "INSERT INTO habits (id, title, target_per_week, created_at) VALUES ($1,$2,$3,$4)",
    [habit.id, habit.title, habit.target_per_week, habit.created_at],
  );
  return habit;
}

export async function deleteHabit(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM habit_checks WHERE habit_id=$1", [id]);
  await db.execute("DELETE FROM habits WHERE id=$1", [id]);
}

export async function fetchHabitChecks(): Promise<HabitCheck[]> {
  const db = await getDb();
  return db.select<HabitCheck[]>("SELECT * FROM habit_checks");
}

export async function toggleHabitCheck(
  habitId: string,
  date: string,
): Promise<void> {
  const db = await getDb();
  const existing = await db.select<HabitCheck[]>(
    "SELECT * FROM habit_checks WHERE habit_id=$1 AND check_date=$2",
    [habitId, date],
  );
  if (existing.length) {
    await db.execute(
      "DELETE FROM habit_checks WHERE habit_id=$1 AND check_date=$2",
      [habitId, date],
    );
    const habits = await fetchHabits();
    const habit = habits.find((item) => item.id === habitId);
    if (habit?.goal_id) {
      await removeGoalEntryBySource(habit.goal_id, "habit", `${habitId}:${date}`);
    }
  } else {
    await db.execute(
      "INSERT INTO habit_checks (id, habit_id, check_date) VALUES ($1,$2,$3)",
      [createId(), habitId, date],
    );
    const habits = await fetchHabits();
    const habit = habits.find((item) => item.id === habitId);
    if (habit?.goal_id) {
      await addGoalEntry({
        goal_id: habit.goal_id,
        entry_date: date,
        value: habit.goal_contribution || 1,
        source_type: "habit",
        source_id: `${habitId}:${date}`,
        note: habit.title,
      });
    }
  }
}

export async function updateHabitGoal(
  habitId: string,
  goalId: string | null,
  contribution = 1,
): Promise<void> {
  const db = await getDb();
  const currentRows = await db.select<Habit[]>("SELECT * FROM habits WHERE id=$1", [habitId]);
  const currentGoalId = currentRows[0]?.goal_id ?? null;
  const checks = await db.select<HabitCheck[]>(
    "SELECT * FROM habit_checks WHERE habit_id=$1",
    [habitId],
  );
  if (currentGoalId) {
    for (const check of checks) {
      await removeGoalEntryBySource(currentGoalId, "habit", `${habitId}:${check.check_date}`);
    }
  }
  await db.execute(
    "UPDATE habits SET goal_id=$1, goal_contribution=$2 WHERE id=$3",
    [goalId, contribution, habitId],
  );
  if (goalId) {
    for (const check of checks) {
      await addGoalEntry({
        goal_id: goalId,
        entry_date: check.check_date,
        value: contribution,
        source_type: "habit",
        source_id: `${habitId}:${check.check_date}`,
        note: currentRows[0]?.title ?? "习惯打卡",
      });
    }
  }
}

/* Settings */
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = $1 LIMIT 1",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.select<{ key: string; value: string }[]>(
    "SELECT key, value FROM settings",
  );
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export async function getThemeSetting(): Promise<ThemeMode> {
  const value = await getSetting("theme");
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

export async function setThemeSetting(theme: ThemeMode): Promise<void> {
  await setSetting("theme", theme);
}

export async function loadAppSettings(): Promise<AppSettings> {
  const s = await getAllSettings();
  return {
    theme: (s.theme as ThemeMode) || "system",
    notifyAhead: Number(s.notify_ahead ?? 30),
    autostart: s.autostart === "true",
    privacyMode: s.privacy_mode !== "false",
    autoBackup: s.auto_backup !== "false",
    ai: {
      baseUrl: s.ai_base_url || "https://api.openai.com/v1",
      apiKey: s.ai_api_key || "",
      model: s.ai_model || "gpt-4o-mini",
    },
    karma: Number(s.karma ?? 0),
    streak: Number(s.streak ?? 0),
    lastCompleteDate: s.last_complete_date || null,
    onboardingComplete: s.onboarding_complete === "true",
  };
}

export async function saveAiSettings(ai: AiSettings): Promise<void> {
  await setSetting("ai_base_url", ai.baseUrl);
  await setSetting("ai_api_key", ai.apiKey);
  await setSetting("ai_model", ai.model);
}

/** Move pending dated tasks from before today to today. Idempotent; safe to call often. */
export async function rolloverOverdueTasks(): Promise<number> {
  const db = await getDb();
  const today = todayDateString();

  const rows = await db.select<{ id: string; repeat_rule: string | null }[]>(
    `SELECT id, repeat_rule FROM tasks
     WHERE status = 'pending'
       AND deleted_at IS NULL
       AND due_date IS NOT NULL
       AND due_date < $1`,
    [today],
  );

  const ids = rows
    .filter((row) => !parseRepeatRule(row.repeat_rule))
    .map((row) => row.id);

  if (ids.length === 0) return 0;

  const timestamp = nowIso();
  for (const id of ids) {
    await db.execute(
      "UPDATE tasks SET due_date = $1, updated_at = $2 WHERE id = $3",
      [today, timestamp, id],
    );
  }

  await setSetting("last_rollover_date", today);
  return ids.length;
}

export async function bumpGamification(): Promise<{
  karma: number;
  streak: number;
}> {
  const settings = await loadAppSettings();
  const today = todayDateString();
  let streak = settings.streak;
  if (settings.lastCompleteDate === today) {
    // already counted today for streak continuity only
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const y = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    streak = settings.lastCompleteDate === y ? streak + 1 : 1;
  }
  const karma = settings.karma + 10;
  await setSetting("karma", String(karma));
  await setSetting("streak", String(streak));
  await setSetting("last_complete_date", today);
  return { karma, streak };
}

/* Memos / 备忘录 */
function mapMemo(row: Memo): Memo {
  return {
    ...row,
    title: row.title ?? "",
    content: row.content ?? "",
    pinned: row.pinned ?? 0,
  };
}

export async function fetchMemos(): Promise<Memo[]> {
  const db = await getDb();
  const rows = await db.select<Memo[]>(
    "SELECT * FROM memos ORDER BY pinned DESC, updated_at DESC",
  );
  return rows.map(mapMemo);
}

export async function createMemo(
  content: string,
  title = "",
): Promise<Memo> {
  const db = await getDb();
  const now = nowIso();
  const trimmed = content.trim();
  const resolvedTitle =
    title.trim() ||
    trimmed.split(/\r?\n/).find((l) => l.trim())?.trim().slice(0, 40) ||
    "无标题备忘";
  const memo: Memo = {
    id: createId(),
    title: resolvedTitle,
    content: trimmed,
    pinned: 0,
    created_at: now,
    updated_at: now,
  };
  await db.execute(
    "INSERT INTO memos (id, title, content, pinned, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)",
    [
      memo.id,
      memo.title,
      memo.content,
      memo.pinned,
      memo.created_at,
      memo.updated_at,
    ],
  );
  return memo;
}

export async function updateMemo(
  id: string,
  updates: { title?: string; content?: string; pinned?: number },
): Promise<void> {
  const db = await getDb();
  const rows = await db.select<Memo[]>("SELECT * FROM memos WHERE id=$1", [id]);
  if (!rows[0]) return;
  const current = mapMemo(rows[0]);
  const next = {
    ...current,
    ...updates,
    updated_at: nowIso(),
  };
  if (updates.content !== undefined && updates.title === undefined) {
    const first = updates.content
      .split(/\r?\n/)
      .find((l) => l.trim())
      ?.trim()
      .slice(0, 40);
    if (first && (!current.title || current.title === "无标题备忘")) {
      next.title = first;
    }
  }
  await db.execute(
    "UPDATE memos SET title=$1, content=$2, pinned=$3, updated_at=$4 WHERE id=$5",
    [next.title, next.content, next.pinned, next.updated_at, id],
  );
}

export async function deleteMemo(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM memos WHERE id=$1", [id]);
}

/* Timers / 定时提醒 */
function mapTimer(row: Timer): Timer {
  return {
    ...row,
    kind: row.kind === "task" ? "task" : "interval",
    task_id: row.task_id ?? null,
    ends_at: row.ends_at ?? null,
    last_fired_at: row.last_fired_at ?? null,
    running: Number(row.running) ? 1 : 0,
    enabled: Number(row.enabled) ? 1 : 0,
  };
}

export async function fetchTimers(): Promise<Timer[]> {
  const db = await getDb();
  const rows = await db.select<Timer[]>(
    "SELECT * FROM timers ORDER BY running DESC, updated_at DESC",
  );
  return rows.map(mapTimer);
}

export async function createTimer(draft: TimerDraft): Promise<Timer> {
  const db = await getDb();
  const now = nowIso();
  const start = Boolean(draft.start);
  const endsAt = start
    ? new Date(Date.now() + draft.interval_sec * 1000).toISOString()
    : null;
  const timer: Timer = {
    id: createId(),
    kind: draft.kind,
    title: draft.title.trim() || "提醒",
    interval_sec: Math.max(5, Math.floor(draft.interval_sec)),
    remaining_sec: Math.max(5, Math.floor(draft.interval_sec)),
    running: start ? 1 : 0,
    enabled: 1,
    task_id: draft.task_id ?? null,
    ends_at: endsAt,
    last_fired_at: null,
    created_at: now,
    updated_at: now,
  };
  await db.execute(
    `INSERT INTO timers (
      id, kind, title, interval_sec, remaining_sec, running, enabled,
      task_id, ends_at, last_fired_at, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      timer.id,
      timer.kind,
      timer.title,
      timer.interval_sec,
      timer.remaining_sec,
      timer.running,
      timer.enabled,
      timer.task_id,
      timer.ends_at,
      timer.last_fired_at,
      timer.created_at,
      timer.updated_at,
    ],
  );
  return timer;
}

export async function updateTimer(
  id: string,
  patch: Partial<
    Pick<
      Timer,
      | "title"
      | "interval_sec"
      | "remaining_sec"
      | "running"
      | "enabled"
      | "ends_at"
      | "last_fired_at"
      | "task_id"
    >
  >,
): Promise<Timer | null> {
  const db = await getDb();
  const rows = await db.select<Timer[]>("SELECT * FROM timers WHERE id=$1", [id]);
  if (!rows[0]) return null;
  const current = mapTimer(rows[0]);
  const next: Timer = {
    ...current,
    ...patch,
    updated_at: nowIso(),
  };
  if (patch.interval_sec != null) {
    next.interval_sec = Math.max(5, Math.floor(patch.interval_sec));
  }
  await db.execute(
    `UPDATE timers SET
      title=$1, interval_sec=$2, remaining_sec=$3, running=$4, enabled=$5,
      task_id=$6, ends_at=$7, last_fired_at=$8, updated_at=$9
    WHERE id=$10`,
    [
      next.title,
      next.interval_sec,
      next.remaining_sec,
      next.running,
      next.enabled,
      next.task_id,
      next.ends_at,
      next.last_fired_at,
      next.updated_at,
      id,
    ],
  );
  return next;
}

export async function deleteTimer(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM timers WHERE id=$1", [id]);
}

export async function startTimer(id: string): Promise<Timer | null> {
  const db = await getDb();
  const rows = await db.select<Timer[]>("SELECT * FROM timers WHERE id=$1", [id]);
  if (!rows[0]) return null;
  const current = mapTimer(rows[0]);
  const remaining = Math.max(5, current.remaining_sec || current.interval_sec);
  return updateTimer(id, {
    running: 1,
    enabled: 1,
    remaining_sec: remaining,
    ends_at: new Date(Date.now() + remaining * 1000).toISOString(),
  });
}

export async function pauseTimer(id: string): Promise<Timer | null> {
  const db = await getDb();
  const rows = await db.select<Timer[]>("SELECT * FROM timers WHERE id=$1", [id]);
  if (!rows[0]) return null;
  const current = mapTimer(rows[0]);
  let remaining = current.remaining_sec;
  if (current.running && current.ends_at) {
    const end = Date.parse(current.ends_at);
    if (!Number.isNaN(end)) {
      remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    }
  }
  return updateTimer(id, {
    running: 0,
    remaining_sec: remaining,
    ends_at: null,
  });
}

export async function resetTimer(id: string): Promise<Timer | null> {
  const db = await getDb();
  const rows = await db.select<Timer[]>("SELECT * FROM timers WHERE id=$1", [id]);
  if (!rows[0]) return null;
  const current = mapTimer(rows[0]);
  return updateTimer(id, {
    running: 0,
    remaining_sec: current.interval_sec,
    ends_at: null,
  });
}

export type FiredTimer = {
  timer: Timer;
  /** True when an interval timer was auto-restarted for the next cycle. */
  looped: boolean;
};

/** Settle expired running timers. Interval timers restart; task timers stop. */
export async function settleExpiredTimers(): Promise<FiredTimer[]> {
  const timers = await fetchTimers();
  const now = Date.now();
  const fired: FiredTimer[] = [];

  for (const timer of timers) {
    if (!timer.running || !timer.enabled || !timer.ends_at) continue;
    const end = Date.parse(timer.ends_at);
    if (Number.isNaN(end) || end > now) continue;

    const stamp = nowIso();
    if (timer.kind === "interval") {
      const next = await updateTimer(timer.id, {
        running: 1,
        remaining_sec: timer.interval_sec,
        ends_at: new Date(now + timer.interval_sec * 1000).toISOString(),
        last_fired_at: stamp,
      });
      if (next) fired.push({ timer: next, looped: true });
    } else {
      const next = await updateTimer(timer.id, {
        running: 0,
        remaining_sec: 0,
        ends_at: null,
        last_fired_at: stamp,
      });
      if (next) fired.push({ timer: next, looped: false });
    }
  }

  return fired;
}

/* Growth goals, contributions, milestones and achievements */
export async function fetchGoals(includeArchived = false): Promise<Goal[]> {
  const db = await getDb();
  return db.select<Goal[]>(
    `SELECT * FROM goals ${includeArchived ? "" : "WHERE status != 'archived'"}
     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
              updated_at DESC`,
  );
}

export async function createGoal(
  draft: Partial<Goal> & Pick<Goal, "title">,
): Promise<Goal> {
  const db = await getDb();
  const stamp = nowIso();
  const goal: Goal = {
    id: createId(),
    title: draft.title.trim(),
    description: draft.description?.trim() ?? "",
    icon: draft.icon ?? "target",
    color: draft.color ?? "#2F6FED",
    goal_type: draft.goal_type ?? "quantity",
    start_date: draft.start_date ?? todayDateString(),
    target_date: draft.target_date ?? null,
    start_value: Number(draft.start_value ?? 0),
    target_value: Math.max(1, Number(draft.target_value ?? 1)),
    current_value: Number(draft.current_value ?? draft.start_value ?? 0),
    unit: draft.unit?.trim() || "次",
    status: draft.status ?? "active",
    motivation: draft.motivation?.trim() ?? "",
    project_id: draft.project_id ?? null,
    weekly_target: Math.max(0, Number(draft.weekly_target ?? 0)),
    manual_completion: draft.status === "completed" ? 1 : 0,
    created_at: stamp,
    updated_at: stamp,
  };
  await db.execute(
    `INSERT INTO goals
     (id,title,description,icon,color,goal_type,start_date,target_date,start_value,
      target_value,current_value,unit,status,motivation,project_id,weekly_target,
      manual_completion,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [
      goal.id, goal.title, goal.description, goal.icon, goal.color,
      goal.goal_type, goal.start_date, goal.target_date, goal.start_value,
      goal.target_value, goal.current_value, goal.unit, goal.status,
      goal.motivation, goal.project_id, goal.weekly_target, goal.manual_completion,
      goal.created_at, goal.updated_at,
    ],
  );
  if (goal.goal_type === "project") await refreshGoalProgress(goal.id);
  return goal;
}

export async function updateGoal(
  id: string,
  updates: Partial<Goal>,
): Promise<void> {
  const db = await getDb();
  const rows = await db.select<Goal[]>("SELECT * FROM goals WHERE id=$1", [id]);
  if (!rows[0]) return;
  const next = {
    ...rows[0],
    ...updates,
    manual_completion: updates.status === "completed"
      ? 1
      : updates.status !== undefined
        ? 0
        : rows[0].manual_completion ?? 0,
    updated_at: nowIso(),
  };
  await db.execute(
    `UPDATE goals SET title=$1,description=$2,icon=$3,color=$4,goal_type=$5,
     start_date=$6,target_date=$7,start_value=$8,target_value=$9,current_value=$10,
     unit=$11,status=$12,motivation=$13,project_id=$14,weekly_target=$15,
     manual_completion=$16,updated_at=$17 WHERE id=$18`,
    [
      next.title, next.description, next.icon, next.color, next.goal_type,
      next.start_date, next.target_date, next.start_value, next.target_value,
      next.current_value, next.unit, next.status, next.motivation,
      next.project_id, next.weekly_target, next.manual_completion, next.updated_at, id,
    ],
  );
}

export async function fetchGoalEntries(goalId?: string): Promise<GoalEntry[]> {
  const db = await getDb();
  return goalId
    ? db.select<GoalEntry[]>(
        "SELECT * FROM goal_entries WHERE goal_id=$1 ORDER BY entry_date DESC, created_at DESC",
        [goalId],
      )
    : db.select<GoalEntry[]>(
        "SELECT * FROM goal_entries ORDER BY entry_date DESC, created_at DESC",
      );
}

async function refreshGoalProgress(goalId: string): Promise<void> {
  const db = await getDb();
  const goalRows = await db.select<Goal[]>("SELECT * FROM goals WHERE id=$1", [goalId]);
  if (!goalRows[0]) return;
  const goal = goalRows[0];
  let current = Number(goal.start_value);
  if (goal.goal_type === "change") {
    const latest = await db.select<{ value: number }[]>(
      `SELECT value FROM goal_entries
       WHERE goal_id=$1 AND source_type='manual'
       ORDER BY entry_date DESC, created_at DESC LIMIT 1`,
      [goalId],
    );
    current = latest.length ? Number(latest[0].value) : Number(goal.start_value);
  } else if (goal.goal_type === "frequency") {
    const sums = await db.select<{ total: number | null }[]>(
      "SELECT SUM(value) AS total FROM goal_entries WHERE goal_id=$1 AND entry_date >= $2",
      [goalId, localWeekStartKey()],
    );
    current = Number(sums[0]?.total ?? 0);
  } else if (goal.goal_type === "project" && goal.project_id) {
    const counts = await db.select<{ total: number; done: number }[]>(
      `SELECT COUNT(*) AS total,
       SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS done
       FROM tasks WHERE project_id=$1 AND deleted_at IS NULL AND parent_id IS NULL`,
      [goal.project_id],
    );
    current = counts[0]?.total
      ? Math.round((Number(counts[0].done ?? 0) / Number(counts[0].total)) * 1000) / 10
      : 0;
  } else {
    const sums = await db.select<{ total: number | null }[]>(
      "SELECT SUM(value) AS total FROM goal_entries WHERE goal_id=$1",
      [goalId],
    );
    current = Number(goal.start_value) + Number(sums[0]?.total ?? 0);
  }
  const effectiveTarget = goal.goal_type === "frequency" && goal.weekly_target > 0
    ? Number(goal.weekly_target)
    : Number(goal.target_value);
  const reached = goal.goal_type === "frequency"
    ? false
    : effectiveTarget >= Number(goal.start_value)
      ? current >= effectiveTarget
      : current <= effectiveTarget;
  await db.execute(
    `UPDATE goals SET current_value=$1,
     status=CASE
       WHEN $2=1 AND status='active' THEN 'completed'
       WHEN $2=0 AND status='completed' AND manual_completion=0 THEN 'active'
       ELSE status END,
     updated_at=$3 WHERE id=$4`,
    [current, reached ? 1 : 0, nowIso(), goalId],
  );
  const ascending = Number(goalRows[0].target_value) >= Number(goalRows[0].start_value);
  const allMilestones = await db.select<GoalMilestone[]>(
    "SELECT * FROM goal_milestones WHERE goal_id=$1",
    [goalId],
  );
  const reverted = allMilestones.filter(
    (milestone) => milestone.completed_at &&
      (ascending ? current < milestone.target_value : current > milestone.target_value),
  );
  for (const milestone of reverted) {
    await db.execute("UPDATE goal_milestones SET completed_at=NULL WHERE id=$1", [milestone.id]);
    await db.execute(
      "DELETE FROM achievements WHERE source_type='milestone' AND source_id=$1",
      [milestone.id],
    );
  }
  const milestones = allMilestones.filter(
    (milestone) => !milestone.completed_at &&
      (ascending ? current >= milestone.target_value : current <= milestone.target_value),
  );
  for (const milestone of milestones) {
    const stamp = nowIso();
    await db.execute(
      "UPDATE goal_milestones SET completed_at=$1 WHERE id=$2",
      [stamp, milestone.id],
    );
    await createAchievement({
      goal_id: goalId,
      title: milestone.title,
      description: `达成阶段目标：${milestone.target_value}${goalRows[0].unit}`,
      achieved_at: localDateKey(new Date(stamp)),
      source_type: "milestone",
      source_id: milestone.id,
    });
  }
  if (reached) {
    await createAchievement({
      goal_id: goalId,
      title: `完成目标：${goalRows[0].title}`,
      description: `累计达到 ${current}${goalRows[0].unit}`,
      achieved_at: todayDateString(),
      source_type: "goal",
      source_id: goalId,
    });
  } else {
    await db.execute(
      "DELETE FROM achievements WHERE source_type='goal' AND source_id=$1",
      [goalId],
    );
  }
}

export async function addGoalEntry(
  input: Pick<GoalEntry, "goal_id" | "entry_date" | "value" | "source_type"> &
    Partial<Pick<GoalEntry, "source_id" | "note">>,
): Promise<boolean> {
  const db = await getDb();
  const goals = await db.select<Goal[]>("SELECT * FROM goals WHERE id=$1 LIMIT 1", [input.goal_id]);
  const goal = goals[0];
  if (!goal || !goalAcceptsSource(goal, input.source_type)) return false;
  const result = await db.execute(
    `INSERT OR IGNORE INTO goal_entries
     (id,goal_id,entry_date,value,source_type,source_id,note,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      createId(), input.goal_id, input.entry_date, Number(input.value),
      input.source_type, input.source_id ?? null, input.note?.trim() ?? "", nowIso(),
    ],
  );
  await refreshGoalProgress(input.goal_id);
  return result.rowsAffected > 0;
}

async function refreshProjectGoals(projectId: string): Promise<void> {
  const db = await getDb();
  const goals = await db.select<{ id: string }[]>(
    "SELECT id FROM goals WHERE goal_type='project' AND project_id=$1",
    [projectId],
  );
  for (const goal of goals) await refreshGoalProgress(goal.id);
}

export async function reconcileGoalEntries(goalId: string): Promise<number> {
  const db = await getDb();
  const goals = await db.select<Goal[]>("SELECT * FROM goals WHERE id=$1 LIMIT 1", [goalId]);
  const goal = goals[0];
  if (!goal) return 0;
  const entries = await db.select<GoalEntry[]>("SELECT * FROM goal_entries WHERE goal_id=$1", [goalId]);
  const invalid = entries.filter((entry) => !goalAcceptsSource({ ...goal, status: "active" }, entry.source_type));
  for (const entry of invalid) {
    await db.execute("DELETE FROM goal_entries WHERE id=$1", [entry.id]);
  }
  await refreshGoalProgress(goalId);
  return invalid.length;
}

export async function removeGoalEntryBySource(
  goalId: string,
  sourceType: GoalEntry["source_type"],
  sourceId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM goal_entries WHERE goal_id=$1 AND source_type=$2 AND source_id=$3",
    [goalId, sourceType, sourceId],
  );
  await refreshGoalProgress(goalId);
}

export async function fetchGoalMilestones(goalId?: string): Promise<GoalMilestone[]> {
  const db = await getDb();
  return goalId
    ? db.select<GoalMilestone[]>(
        "SELECT * FROM goal_milestones WHERE goal_id=$1 ORDER BY sort_order,target_value",
        [goalId],
      )
    : db.select<GoalMilestone[]>("SELECT * FROM goal_milestones ORDER BY created_at DESC");
}

export async function createGoalMilestone(
  goalId: string,
  title: string,
  targetValue: number,
  targetDate: string | null = null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO goal_milestones
     (id,goal_id,title,target_value,target_date,completed_at,sort_order,created_at)
     VALUES ($1,$2,$3,$4,$5,NULL,$6,$7)`,
    [createId(), goalId, title.trim(), targetValue, targetDate, Date.now(), nowIso()],
  );
  await refreshGoalProgress(goalId);
}

export async function fetchAchievements(): Promise<Achievement[]> {
  const db = await getDb();
  return db.select<Achievement[]>(
    "SELECT * FROM achievements ORDER BY pinned DESC, achieved_at DESC, created_at DESC",
  );
}

export async function createAchievement(
  input: Pick<Achievement, "title" | "achieved_at" | "source_type"> &
    Partial<Omit<Achievement, "id" | "title" | "achieved_at" | "source_type" | "created_at">>,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR IGNORE INTO achievements
     (id,goal_id,title,description,achieved_at,image_path,source_type,source_id,pinned,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      createId(), input.goal_id ?? null, input.title.trim(),
      input.description?.trim() ?? "", input.achieved_at,
      input.image_path ?? null, input.source_type, input.source_id ?? null,
      input.pinned ?? 0, nowIso(),
    ],
  );
}

export async function toggleAchievementPinned(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE achievements SET pinned=CASE pinned WHEN 1 THEN 0 ELSE 1 END WHERE id=$1",
    [id],
  );
}

/* 拾光：每日日志、灵感与未来信件 */
export async function fetchDailyReflections(): Promise<DailyReflection[]> {
  const db = await getDb();
  return db.select<DailyReflection[]>(
    "SELECT * FROM daily_reflections ORDER BY reflection_date DESC",
  );
}

export async function saveDailyReflection(
  reflectionDate: string,
  input: Partial<Pick<DailyReflection, "harvest" | "highlight" | "mood" | "tomorrow_note" | "auto_summary">>,
): Promise<void> {
  const db = await getDb();
  const stamp = nowIso();
  await db.execute(
    `INSERT INTO daily_reflections
     (id,reflection_date,harvest,highlight,mood,tomorrow_note,auto_summary,created_at,updated_at)
     VALUES ($1,$2,COALESCE($3,''),COALESCE($4,''),COALESCE($5,''),COALESCE($6,''),COALESCE($7,''),$8,$8)
     ON CONFLICT(reflection_date) DO UPDATE SET
       harvest=COALESCE($3,daily_reflections.harvest),
       highlight=COALESCE($4,daily_reflections.highlight),
       mood=COALESCE($5,daily_reflections.mood),
       tomorrow_note=COALESCE($6,daily_reflections.tomorrow_note),
       auto_summary=COALESCE($7,daily_reflections.auto_summary),
       updated_at=excluded.updated_at`,
    [
      createId(), reflectionDate,
      input.harvest === undefined ? null : input.harvest,
      input.highlight === undefined ? null : input.highlight,
      input.mood === undefined ? null : input.mood,
      input.tomorrow_note === undefined ? null : input.tomorrow_note,
      input.auto_summary === undefined ? null : input.auto_summary,
      stamp,
    ],
  );
}

export async function saveDayCloseReflection(
  reflectionDate: string,
  reflection: string,
  autoSummary: string,
): Promise<void> {
  const db = await getDb();
  const stamp = nowIso();
  await db.execute(
    `INSERT INTO daily_reflections
     (id,reflection_date,harvest,highlight,mood,tomorrow_note,auto_summary,created_at,updated_at)
     VALUES ($1,$2,$3,'','','',$4,$5,$5)
     ON CONFLICT(reflection_date) DO UPDATE SET
       harvest=CASE
         WHEN TRIM(daily_reflections.harvest)='' AND TRIM(excluded.harvest)!='' THEN excluded.harvest
         ELSE daily_reflections.harvest
       END,
       auto_summary=excluded.auto_summary,
       updated_at=excluded.updated_at`,
    [createId(), reflectionDate, reflection.trim(), autoSummary, stamp],
  );
}

export async function fetchInspirations(includeArchived = false): Promise<Inspiration[]> {
  const db = await getDb();
  return db.select<Inspiration[]>(
    `SELECT * FROM inspirations ${includeArchived ? "" : "WHERE status != 'archived'"}
     ORDER BY created_at DESC`,
  );
}

export async function createInspiration(
  content: string,
  destination: Inspiration["destination"] = "inbox",
): Promise<Inspiration> {
  const db = await getDb();
  const stamp = nowIso();
  const tags = extractMomentTags(content);
  const item: Inspiration = {
    id: createId(), content: content.trim(), tags_json: JSON.stringify(tags),
    destination, status: "inbox", created_at: stamp, updated_at: stamp,
  };
  await db.execute(
    `INSERT INTO inspirations
     (id,content,tags_json,destination,status,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [item.id,item.content,item.tags_json,item.destination,item.status,item.created_at,item.updated_at],
  );
  return item;
}

export async function updateInspirationStatus(
  id: string,
  status: Inspiration["status"],
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE inspirations SET status=$1,updated_at=$2 WHERE id=$3", [status, nowIso(), id]);
}

export async function fetchFutureLetters(): Promise<FutureLetter[]> {
  const db = await getDb();
  return db.select<FutureLetter[]>("SELECT * FROM future_letters ORDER BY deliver_at DESC");
}

export async function createFutureLetter(
  title: string,
  content: string,
  deliverAt: string,
): Promise<FutureLetter> {
  const db = await getDb();
  const stamp = nowIso();
  const letter: FutureLetter = {
    id: createId(), title: title.trim(), content: content.trim(), deliver_at: deliverAt,
    status: "waiting", delivered_at: null, opened_at: null, created_at: stamp, updated_at: stamp,
  };
  await db.execute(
    `INSERT INTO future_letters
     (id,title,content,deliver_at,status,delivered_at,opened_at,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [letter.id,letter.title,letter.content,letter.deliver_at,letter.status,null,null,stamp,stamp],
  );
  return letter;
}

export async function fetchDueFutureLetters(now = nowIso()): Promise<FutureLetter[]> {
  const db = await getDb();
  return db.select<FutureLetter[]>(
    "SELECT * FROM future_letters WHERE status='waiting' AND deliver_at <= $1 ORDER BY deliver_at",
    [now],
  );
}

export async function markFutureLetterDelivered(id: string): Promise<void> {
  const db = await getDb();
  const stamp = nowIso();
  await db.execute(
    "UPDATE future_letters SET status='delivered',delivered_at=$1,updated_at=$1 WHERE id=$2 AND status='waiting'",
    [stamp,id],
  );
}

export async function openFutureLetter(id: string): Promise<void> {
  const db = await getDb();
  const stamp = nowIso();
  await db.execute(
    "UPDATE future_letters SET status='opened',opened_at=COALESCE(opened_at,$1),updated_at=$1 WHERE id=$2",
    [stamp,id],
  );
}

/* Backup */
export async function exportBackup(): Promise<BackupPayload> {
  const db = await getDb();
  const tasks = await fetchTasks(true);
  const tags = await fetchTags();
  const taskTags = await db.select<{ task_id: string; tag_id: string }[]>(
    "SELECT task_id, tag_id FROM task_tags",
  );
  const attachments = await fetchAllAttachments();
  const smartLists = await fetchSmartLists();
  const habits = await fetchHabits();
  const habitChecks = await fetchHabitChecks();
  const memos = await fetchMemos();
  const projects = await db.select<Project[]>("SELECT * FROM projects");
  const taskTemplates = await fetchTaskTemplates();
  const notifications = await db.select<AppNotification[]>(
    "SELECT * FROM app_notifications",
  );
  const taskEvents = await db.select<TaskEvent[]>("SELECT * FROM task_events");
  const focusSessions = await db.select<FocusSession[]>(
    "SELECT * FROM focus_sessions",
  );
  const daySnapshots = await db.select<DaySnapshot[]>(
    "SELECT * FROM day_snapshots",
  );
  const milestones = await db.select<Milestone[]>("SELECT * FROM milestones");
  const goals = await fetchGoals(true);
  const goalEntries = await fetchGoalEntries();
  const goalMilestones = await fetchGoalMilestones();
  const achievements = await fetchAchievements();
  const timers = await fetchTimers();
  const dailyReflections = await fetchDailyReflections();
  const inspirations = await fetchInspirations(true);
  const futureLetters = await fetchFutureLetters();
  const settings = await getAllSettings();

  return {
    version: 6,
    exportedAt: nowIso(),
    tasks,
    tags,
    taskTags,
    attachments,
    smartLists,
    habits,
    habitChecks,
    memos,
    projects,
    taskTemplates,
    notifications,
    taskEvents,
    focusSessions,
    daySnapshots,
    milestones,
    goals,
    goalEntries,
    goalMilestones,
    achievements,
    timers,
    dailyReflections,
    inspirations,
    futureLetters,
    settings,
  };
}

export async function importBackup(payload: BackupPayload): Promise<void> {
  const db = await getDb();
  const has = (key: keyof BackupPayload) =>
    Object.prototype.hasOwnProperty.call(payload, key);

  await db.execute("BEGIN IMMEDIATE");
  try {
    if (has("futureLetters")) await db.execute("DELETE FROM future_letters");
    if (has("inspirations")) await db.execute("DELETE FROM inspirations");
    if (has("dailyReflections")) await db.execute("DELETE FROM daily_reflections");
    if (has("timers")) await db.execute("DELETE FROM timers");
    if (
      has("achievements") ||
      has("goalMilestones") ||
      has("goalEntries") ||
      has("goals")
    ) {
      await db.execute("DELETE FROM achievements");
      await db.execute("DELETE FROM goal_milestones");
      await db.execute("DELETE FROM goal_entries");
      await db.execute("DELETE FROM goals");
    }
    if (has("focusSessions")) await db.execute("DELETE FROM focus_sessions");
    if (has("taskEvents")) await db.execute("DELETE FROM task_events");
    if (has("daySnapshots")) await db.execute("DELETE FROM day_snapshots");
    if (has("milestones")) await db.execute("DELETE FROM milestones");
    await db.execute("DELETE FROM habit_checks");
    await db.execute("DELETE FROM habits");
    await db.execute("DELETE FROM attachments");
    await db.execute("DELETE FROM task_tags");
    await db.execute("DELETE FROM smart_lists");
    await db.execute("DELETE FROM tags");
    await db.execute("DELETE FROM task_planning_metadata");
    await db.execute("DELETE FROM tasks");
    if (has("memos")) await db.execute("DELETE FROM memos");
    if (has("notifications")) await db.execute("DELETE FROM app_notifications");
    if (has("taskTemplates")) await db.execute("DELETE FROM task_templates");
    if (has("projects")) await db.execute("DELETE FROM projects");

  for (const task of payload.tasks) {
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
        task.end_time ?? null,
        task.sort_order,
        task.created_at,
        task.updated_at,
        task.completed_at,
        task.deleted_at,
        task.parent_id ?? null,
        task.repeat_rule ?? null,
        task.remind_minutes ?? null,
        task.project_id ?? null,
        task.my_day_date ?? null,
        task.blocked_by_id ?? null,
        task.completion_criteria ?? "",
        task.energy_level ?? "medium",
        task.flexible ?? 1,
        task.schedule_locked ?? 0,
        task.actual_minutes ?? 0,
        task.goal_id ?? null,
        task.goal_contribution ?? 1,
      ],
    );
    // Backup tasks already carry the normalized multi-reminder array. Persist
    // it directly instead of re-parsing a database-only JSON column.
    await saveTaskPlanningMetadata(task);
  }

  for (const tag of payload.tags) {
    await db.execute(
      "INSERT INTO tags (id, name, color, created_at) VALUES ($1,$2,$3,$4)",
      [tag.id, tag.name, tag.color, tag.created_at],
    );
  }
  for (const tt of payload.taskTags) {
    await db.execute(
      "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES ($1,$2)",
      [tt.task_id, tt.tag_id],
    );
  }
  for (const a of payload.attachments) {
    await db.execute(
      "INSERT INTO attachments (id, task_id, kind, name, path, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [a.id, a.task_id, a.kind, a.name, a.path, a.created_at],
    );
  }
  for (const s of payload.smartLists) {
    await db.execute(
      "INSERT INTO smart_lists (id, name, filter_json, created_at) VALUES ($1,$2,$3,$4)",
      [s.id, s.name, s.filter_json, s.created_at],
    );
  }
  for (const h of payload.habits) {
    await db.execute(
      "INSERT INTO habits (id, title, target_per_week, created_at, goal_id, goal_contribution) VALUES ($1,$2,$3,$4,$5,$6)",
      [h.id, h.title, h.target_per_week, h.created_at, h.goal_id ?? null, h.goal_contribution ?? 1],
    );
  }
  for (const c of payload.habitChecks) {
    await db.execute(
      "INSERT INTO habit_checks (id, habit_id, check_date) VALUES ($1,$2,$3)",
      [c.id, c.habit_id, c.check_date],
    );
  }
  for (const m of payload.memos ?? []) {
    await db.execute(
      "INSERT INTO memos (id, title, content, pinned, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [
        m.id,
        m.title ?? "",
        m.content,
        m.pinned,
        m.created_at,
        m.updated_at,
      ],
    );
  }
  for (const project of payload.projects ?? []) {
    await db.execute(
      `INSERT INTO projects
       (id, name, color, due_date, archived, created_at, updated_at, goal, success_criteria)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        project.id,
        project.name,
        project.color,
        project.due_date,
        project.archived,
        project.created_at,
        project.updated_at,
        project.goal ?? "",
        project.success_criteria ?? "",
      ],
    );
  }
  for (const template of payload.taskTemplates ?? []) {
    await db.execute(
      `INSERT INTO task_templates
       (id, name, task_json, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        template.id,
        template.name,
        template.task_json,
        template.created_at,
        template.updated_at,
      ],
    );
  }
  for (const notification of payload.notifications ?? []) {
    await db.execute(
      `INSERT INTO app_notifications
       (id, task_id, kind, title, body, scheduled_at, status, snoozed_until, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        notification.id,
        notification.task_id,
        notification.kind,
        notification.title,
        notification.body,
        notification.scheduled_at,
        notification.status,
        notification.snoozed_until,
        notification.created_at,
      ],
    );
  }
  for (const event of payload.taskEvents ?? []) {
    await db.execute(
      `INSERT INTO task_events
       (id, task_id, event_type, before_json, after_json, note, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        event.id,
        event.task_id,
        event.event_type,
        event.before_json,
        event.after_json,
        event.note,
        event.created_at,
      ],
    );
  }
  for (const session of payload.focusSessions ?? []) {
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
  }
  for (const snapshot of payload.daySnapshots ?? []) {
    await db.execute(
      `INSERT INTO day_snapshots
       (id, plan_date, morning_json, evening_json, planned_minutes,
        completed_minutes, reflection, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        snapshot.id,
        snapshot.plan_date,
        snapshot.morning_json,
        snapshot.evening_json,
        snapshot.planned_minutes,
        snapshot.completed_minutes,
        snapshot.reflection,
        snapshot.created_at,
        snapshot.updated_at,
      ],
    );
  }
  for (const milestone of payload.milestones ?? []) {
    await db.execute(
      `INSERT INTO milestones (id, project_id, title, due_date, completed, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        milestone.id,
        milestone.project_id,
        milestone.title,
        milestone.due_date,
        milestone.completed,
        milestone.created_at,
      ],
    );
  }
  for (const goal of payload.goals ?? []) {
    await db.execute(
      `INSERT INTO goals
       (id,title,description,icon,color,goal_type,start_date,target_date,start_value,
        target_value,current_value,unit,status,motivation,project_id,weekly_target,
        manual_completion,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [goal.id,goal.title,goal.description,goal.icon,goal.color,goal.goal_type,
       goal.start_date,goal.target_date,goal.start_value,goal.target_value,
       goal.current_value,goal.unit,goal.status,goal.motivation,goal.project_id,
       goal.weekly_target,goal.manual_completion ?? (goal.status === "completed" ? 1 : 0),
       goal.created_at,goal.updated_at],
    );
  }
  for (const entry of payload.goalEntries ?? []) {
    await db.execute(
      `INSERT INTO goal_entries
       (id,goal_id,entry_date,value,source_type,source_id,note,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [entry.id,entry.goal_id,entry.entry_date,entry.value,entry.source_type,
       entry.source_id,entry.note,entry.created_at],
    );
  }
  for (const milestone of payload.goalMilestones ?? []) {
    await db.execute(
      `INSERT INTO goal_milestones
       (id,goal_id,title,target_value,target_date,completed_at,sort_order,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [milestone.id,milestone.goal_id,milestone.title,milestone.target_value,
       milestone.target_date,milestone.completed_at,milestone.sort_order,milestone.created_at],
    );
  }
  for (const achievement of payload.achievements ?? []) {
    await db.execute(
      `INSERT INTO achievements
       (id,goal_id,title,description,achieved_at,image_path,source_type,source_id,pinned,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [achievement.id,achievement.goal_id,achievement.title,achievement.description,
       achievement.achieved_at,achievement.image_path,achievement.source_type,
       achievement.source_id,achievement.pinned,achievement.created_at],
    );
  }
  for (const timer of payload.timers ?? []) {
    await db.execute(
      `INSERT INTO timers
       (id,kind,title,interval_sec,remaining_sec,running,enabled,task_id,ends_at,
        last_fired_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        timer.id, timer.kind, timer.title, timer.interval_sec,
        timer.remaining_sec, timer.running, timer.enabled, timer.task_id,
        timer.ends_at, timer.last_fired_at, timer.created_at, timer.updated_at,
      ],
    );
  }
  for (const item of payload.dailyReflections ?? []) {
    await db.execute(
      `INSERT INTO daily_reflections
       (id,reflection_date,harvest,highlight,mood,tomorrow_note,auto_summary,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [item.id,item.reflection_date,item.harvest,item.highlight,item.mood,item.tomorrow_note,item.auto_summary,item.created_at,item.updated_at],
    );
  }
  for (const item of payload.inspirations ?? []) {
    await db.execute(
      `INSERT INTO inspirations (id,content,tags_json,destination,status,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [item.id,item.content,item.tags_json,item.destination,item.status,item.created_at,item.updated_at],
    );
  }
  for (const item of payload.futureLetters ?? []) {
    await db.execute(
      `INSERT INTO future_letters
       (id,title,content,deliver_at,status,delivered_at,opened_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [item.id,item.title,item.content,item.deliver_at,item.status,item.delivered_at,item.opened_at,item.created_at,item.updated_at],
    );
  }
  for (const [key, value] of Object.entries(payload.settings)) {
    await setSetting(key, value);
  }
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
}

/** Build a human-readable restore summary, including data that would be preserved. */
export function summarizeBackupRestore(payload: BackupPayload): string {
  const has = (key: keyof BackupPayload) =>
    Object.prototype.hasOwnProperty.call(payload, key);
  const lines = [
    `备份时间：${new Date(payload.exportedAt).toLocaleString()}`,
    `任务：${payload.tasks.length} 项`,
    `标签：${payload.tags.length} 个`,
    `习惯：${payload.habits.length} 个`,
  ];
  if (has("goals")) lines.push(`成长目标：${payload.goals?.length ?? 0} 个`);
  if (has("dailyReflections") || has("inspirations") || has("futureLetters")) {
    lines.push(
      `拾光：回望 ${payload.dailyReflections?.length ?? 0} · 拾念 ${payload.inspirations?.length ?? 0} · 未来信 ${payload.futureLetters?.length ?? 0}`,
    );
  }
  const keep: string[] = [];
  if (!has("goals") && !has("goalEntries") && !has("achievements")) {
    keep.push("成长目标");
  }
  if (!has("dailyReflections") && !has("inspirations") && !has("futureLetters")) {
    keep.push("拾光记录");
  }
  if (!has("timers")) keep.push("循环提醒");
  if (keep.length) {
    lines.push("", `以下数据备份中未包含，将保留当前内容：${keep.join("、")}`);
  }
  lines.push("", "恢复会覆盖其余当前数据，是否继续？");
  return lines.join("\n");
}

/* Projects and reusable task templates */
export async function fetchProjects(): Promise<Project[]> {
  const db = await getDb();
  return db.select<Project[]>(
    "SELECT * FROM projects WHERE archived = 0 ORDER BY created_at DESC",
  );
}

export async function createProject(
  name: string,
  color = "#7D9BE8",
): Promise<Project> {
  const db = await getDb();
  const timestamp = nowIso();
  const project: Project = {
    id: createId(),
    name: name.trim(),
    color,
    due_date: null,
    archived: 0,
    created_at: timestamp,
    updated_at: timestamp,
    goal: "",
    success_criteria: "",
  };
  await db.execute(
    `INSERT INTO projects
      (id, name, color, due_date, archived, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      project.id,
      project.name,
      project.color,
      project.due_date,
      project.archived,
      project.created_at,
      project.updated_at,
    ],
  );
  return project;
}

export async function archiveProject(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE projects SET archived = 1, updated_at = $1 WHERE id = $2",
    [nowIso(), id],
  );
}

export async function updateProject(
  id: string,
  updates: Partial<
    Pick<Project, "name" | "color" | "goal" | "success_criteria" | "due_date">
  >,
): Promise<void> {
  const db = await getDb();
  const current = (
    await db.select<Project[]>(
      "SELECT * FROM projects WHERE id = $1 LIMIT 1",
      [id],
    )
  )[0];
  if (!current) return;
  const next = { ...current, ...updates, updated_at: nowIso() };
  await db.execute(
    `UPDATE projects SET name=$1, color=$2, goal=$3, success_criteria=$4,
     due_date=$5, updated_at=$6 WHERE id=$7`,
    [
      next.name,
      next.color,
      next.goal,
      next.success_criteria,
      next.due_date,
      next.updated_at,
      id,
    ],
  );
}

export async function fetchMilestones(): Promise<Milestone[]> {
  const db = await getDb();
  return db.select<Milestone[]>(
    "SELECT * FROM milestones ORDER BY due_date ASC, created_at ASC",
  );
}

export async function createMilestone(
  projectId: string,
  title: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO milestones
     (id, project_id, title, due_date, completed, created_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [createId(), projectId, title.trim(), null, 0, nowIso()],
  );
}

export async function toggleMilestone(
  id: string,
  completed: boolean,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE milestones SET completed = $1 WHERE id = $2",
    [completed ? 1 : 0, id],
  );
}

export async function fetchTaskTemplates(): Promise<TaskTemplate[]> {
  const db = await getDb();
  return db.select<TaskTemplate[]>(
    "SELECT * FROM task_templates ORDER BY updated_at DESC",
  );
}

export async function saveTaskTemplate(
  name: string,
  draft: TaskDraft,
): Promise<TaskTemplate> {
  const db = await getDb();
  const timestamp = nowIso();
  const template: TaskTemplate = {
    id: createId(),
    name: name.trim(),
    task_json: JSON.stringify(draft),
    created_at: timestamp,
    updated_at: timestamp,
  };
  await db.execute(
    `INSERT INTO task_templates (id, name, task_json, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      template.id,
      template.name,
      template.task_json,
      template.created_at,
      template.updated_at,
    ],
  );
  return template;
}

export async function deleteTaskTemplate(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM task_templates WHERE id = $1", [id]);
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const db = await getDb();
  return db.select<AppNotification[]>(
    `SELECT * FROM app_notifications
     WHERE status != 'dismissed'
     ORDER BY created_at DESC LIMIT 100`,
  );
}

export async function createNotificationRecord(input: {
  taskId?: string | null;
  kind?: AppNotification["kind"];
  title: string;
  body?: string;
  scheduledAt?: string | null;
  status?: AppNotification["status"];
}): Promise<AppNotification> {
  const db = await getDb();
  const notification: AppNotification = {
    id: createId(),
    task_id: input.taskId ?? null,
    kind: input.kind ?? "reminder",
    title: input.title,
    body: input.body ?? "",
    scheduled_at: input.scheduledAt ?? null,
    status: input.status ?? "delivered",
    snoozed_until: null,
    created_at: nowIso(),
  };
  await db.execute(
    `INSERT INTO app_notifications
      (id, task_id, kind, title, body, scheduled_at, status, snoozed_until, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      notification.id,
      notification.task_id,
      notification.kind,
      notification.title,
      notification.body,
      notification.scheduled_at,
      notification.status,
      notification.snoozed_until,
      notification.created_at,
    ],
  );
  return notification;
}

export async function ensureReminderRecord(input: {
  taskId: string;
  title: string;
  body: string;
  scheduledAt: string;
}): Promise<boolean> {
  const db = await getDb();
  const existing = await db.select<{ id: string }[]>(
    `SELECT id FROM app_notifications
     WHERE task_id=$1 AND kind='reminder' AND scheduled_at=$2 LIMIT 1`,
    [input.taskId, input.scheduledAt],
  );
  if (existing.length) return false;
  await createNotificationRecord({
    taskId: input.taskId,
    kind: "reminder",
    title: input.title,
    body: input.body,
    scheduledAt: input.scheduledAt,
  });
  return true;
}

export async function setNotificationStatus(
  id: string,
  status: AppNotification["status"],
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE app_notifications SET status = $1 WHERE id = $2",
    [status, id],
  );
}

export async function snoozeNotification(
  id: string,
  minutes: number,
): Promise<void> {
  const db = await getDb();
  const until = new Date(Date.now() + minutes * 60_000).toISOString();
  await db.execute(
    `UPDATE app_notifications
     SET status = 'pending', snoozed_until = $1 WHERE id = $2`,
    [until, id],
  );
}

export async function fetchDueNotifications(): Promise<AppNotification[]> {
  const db = await getDb();
  return db.select<AppNotification[]>(
    `SELECT * FROM app_notifications
     WHERE status = 'pending'
       AND snoozed_until IS NOT NULL
       AND snoozed_until <= $1`,
    [nowIso()],
  );
}

export async function ensureMissedNotification(
  task: Task,
): Promise<void> {
  if (!task.due_date) return;
  const db = await getDb();
  const exists = await db.select<{ id: string }[]>(
    `SELECT id FROM app_notifications
     WHERE task_id = $1 AND kind = 'missed' LIMIT 1`,
    [task.id],
  );
  if (exists.length) return;
  await createNotificationRecord({
    taskId: task.id,
    kind: "missed",
    title: "错过的任务",
    body: task.title,
    scheduledAt: `${task.due_date}T${task.due_time ?? "23:59"}:00`,
  });
}
