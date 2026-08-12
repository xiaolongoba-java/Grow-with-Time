import type {
  Attachment,
  Habit,
  HabitCheck,
  SmartList,
  Tag,
} from "@/types";
import { createId, nowIso } from "@/lib/dates";
import { getDb } from "./client";
import { addGoalEntry, removeGoalEntryBySource } from "./growth";

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

