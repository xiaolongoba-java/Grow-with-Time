import Database from "@tauri-apps/plugin-sql";
import type {
  AiSettings,
  AppSettings,
  Attachment,
  BackupPayload,
  Habit,
  HabitCheck,
  Memo,
  SmartList,
  Tag,
  Task,
  TaskDraft,
  TaskUpdate,
  ThemeMode,
} from "@/types";
import { createId, DB_URL, nowIso, nowTimeString, addMinutesToTime, ensureEndAfterStart, todayDateString } from "@/lib/dates";
import { nextOccurrence } from "@/lib/repeat";

let dbPromise: Promise<Database> | null = null;

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
        await db.execute(
          "ALTER TABLE memos ADD COLUMN title TEXT NOT NULL DEFAULT ''",
        );
      } catch {
        /* already exists */
      }
      return db;
    });
  }
  return dbPromise;
}

function mapTask(row: Task): Task {
  return {
    ...row,
    parent_id: row.parent_id ?? null,
    repeat_rule: row.repeat_rule ?? null,
    remind_minutes: row.remind_minutes ?? null,
    end_time: row.end_time ?? null,
  };
}

export async function fetchTasks(includeDeleted = false): Promise<Task[]> {
  const db = await getDb();
  const query = includeDeleted
    ? "SELECT * FROM tasks ORDER BY sort_order ASC, created_at DESC"
    : "SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY sort_order ASC, created_at DESC";
  const rows = await db.select<Task[]>(query);
  return rows.map(mapTask);
}

export async function fetchTrashTasks(): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.select<Task[]>(
    "SELECT * FROM tasks WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
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
  };

  await db.execute(
    `INSERT INTO tasks (
      id, title, description, notes, priority, status,
      due_date, due_time, end_time, sort_order, created_at, updated_at,
      completed_at, deleted_at, parent_id, repeat_rule, remind_minutes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
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
    ],
  );

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
    "SELECT * FROM tasks WHERE id = $1 LIMIT 1",
    [id],
  );
  if (existing.length === 0) return null;

  const current = mapTask(existing[0]);
  const next: Task = {
    ...current,
    ...updates,
    updated_at: nowIso(),
  };

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
      parent_id=$11, repeat_rule=$12, remind_minutes=$13, sort_order=$14
    WHERE id=$15`,
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
      id,
    ],
  );

  return next;
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

export async function toggleTaskComplete(
  id: string,
): Promise<{ task: Task | null; spawned: Task | null }> {
  const db = await getDb();
  const existing = await db.select<Task[]>(
    "SELECT * FROM tasks WHERE id = $1 LIMIT 1",
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
    const next = nextOccurrence(current);
    if (next) {
      spawned = await createTask({
        title: current.title,
        description: current.description,
        notes: current.notes,
        priority: current.priority,
        due_date: next.due_date,
        due_time: next.due_time,
        end_time: current.end_time,
        repeat_rule: current.repeat_rule,
        remind_minutes: current.remind_minutes,
      });
    }
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
  return db.select<Habit[]>("SELECT * FROM habits ORDER BY created_at DESC");
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
  } else {
    await db.execute(
      "INSERT INTO habit_checks (id, habit_id, check_date) VALUES ($1,$2,$3)",
      [createId(), habitId, date],
    );
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
    ai: {
      baseUrl: s.ai_base_url || "https://api.openai.com/v1",
      apiKey: s.ai_api_key || "",
      model: s.ai_model || "gpt-4o-mini",
    },
    karma: Number(s.karma ?? 0),
    streak: Number(s.streak ?? 0),
    lastCompleteDate: s.last_complete_date || null,
  };
}

export async function saveAiSettings(ai: AiSettings): Promise<void> {
  await setSetting("ai_base_url", ai.baseUrl);
  await setSetting("ai_api_key", ai.apiKey);
  await setSetting("ai_model", ai.model);
}

/** Move pending dated tasks from before today to today (once per calendar day). */
export async function rolloverOverdueTasks(): Promise<number> {
  const db = await getDb();
  const today = todayDateString();
  const last = await getSetting("last_rollover_date");
  if (last === today) return 0;

  const timestamp = nowIso();
  const result = await db.execute(
    `UPDATE tasks SET due_date = $1, updated_at = $2
     WHERE status = 'pending'
       AND deleted_at IS NULL
       AND due_date IS NOT NULL
       AND due_date < $1
       AND (repeat_rule IS NULL OR repeat_rule = '')`,
    [today, timestamp],
  );
  await setSetting("last_rollover_date", today);
  return result.rowsAffected ?? 0;
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
  const settings = await getAllSettings();

  return {
    version: 2,
    exportedAt: nowIso(),
    tasks,
    tags,
    taskTags,
    attachments,
    smartLists,
    habits,
    habitChecks,
    memos,
    settings,
  };
}

export async function importBackup(payload: BackupPayload): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM habit_checks");
  await db.execute("DELETE FROM habits");
  await db.execute("DELETE FROM attachments");
  await db.execute("DELETE FROM task_tags");
  await db.execute("DELETE FROM smart_lists");
  await db.execute("DELETE FROM tags");
  await db.execute("DELETE FROM tasks");
  await db.execute("DELETE FROM memos");

  for (const task of payload.tasks) {
    await db.execute(
      `INSERT INTO tasks (
        id, title, description, notes, priority, status,
        due_date, due_time, end_time, sort_order, created_at, updated_at,
        completed_at, deleted_at, parent_id, repeat_rule, remind_minutes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
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
      ],
    );
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
      "INSERT INTO habits (id, title, target_per_week, created_at) VALUES ($1,$2,$3,$4)",
      [h.id, h.title, h.target_per_week, h.created_at],
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
  for (const [key, value] of Object.entries(payload.settings)) {
    await setSetting(key, value);
  }
}
