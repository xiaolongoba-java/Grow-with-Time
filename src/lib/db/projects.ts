import type {
  AppNotification,
  Milestone,
  Project,
  Task,
  TaskDraft,
  TaskTemplate,
} from "@/types";
import { createId, nowIso } from "@/lib/dates";
import { getDb } from "./client";

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

export async function dismissAllNotifications(): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "UPDATE app_notifications SET status = 'dismissed' WHERE status != 'dismissed'",
  );
  return result.rowsAffected ?? 0;
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

