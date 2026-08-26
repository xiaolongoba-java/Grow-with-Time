import type {
  AppNotification,
  BackupPayload,
  DaySnapshot,
  FocusSession,
  KarmaLedgerEntry,
  Milestone,
  Project,
  TaskEvent,
} from "@/types";
import { nowIso } from "@/lib/dates";
import { backupPayloadHas, sanitizeBackupPayload, validateBackupPayload } from "@/lib/backup";
import { getDb, withTransaction } from "./client";
import { saveTaskPlanningMetadata } from "./client";
import { fetchTasks } from "./tasks";
import {
  fetchAllAttachments,
  fetchHabitChecks,
  fetchHabits,
  fetchSmartLists,
  fetchTags,
} from "./taxonomy";
import { fetchMemos } from "./memos";
import { fetchTimers } from "./timers";
import {
  fetchAchievements,
  fetchGoalEntries,
  fetchGoalMilestones,
  fetchGoals,
} from "./growth";
import {
  fetchAnniversaries,
  fetchDailyReflections,
  fetchFutureLetters,
  fetchInspirations,
} from "./moments";
import { fetchTaskTemplates } from "./projects";
import { getAllSettings, refreshKarmaFromLedger, setSetting } from "./settings";

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
  const memos = await fetchMemos("all");
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
  const anniversaries = await fetchAnniversaries();
  const karmaLedger = await db.select<KarmaLedgerEntry[]>(
    "SELECT * FROM karma_ledger ORDER BY created_at ASC",
  );
  const settings = await getAllSettings();

  return {
    version: 7,
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
    anniversaries,
    karmaLedger,
    settings,
  };
}

export async function importBackup(raw: BackupPayload): Promise<void> {
  const db = await getDb();
  validateBackupPayload(raw);
  const payload = sanitizeBackupPayload(raw);
  const has = (key: keyof BackupPayload) => backupPayloadHas(raw, key);

  await withTransaction(async () => {
    if (has("anniversaries")) await db.execute("DELETE FROM anniversaries");
    // Tasks are replaced by every supported backup version. Keeping a local
    // ledger from the previous dataset would leave points tied to removed tasks.
    // v7 restores its ledger below; older backups restart from their saved Karma.
    await db.execute("DELETE FROM karma_ledger");
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
        actual_minutes, goal_id, goal_contribution, generated_from_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`,
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
        task.generated_from_id ?? null,
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
      "INSERT INTO memos (id, title, content, format, pinned, archived, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        m.id,
        m.title ?? "",
        m.content,
        m.format ?? "markdown",
        m.pinned,
        m.archived ?? 0,
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
  for (const item of payload.anniversaries ?? []) {
    await db.execute(
      `INSERT INTO anniversaries
       (id,title,event_date,recur_yearly,note,calendar,lunar_month,lunar_day,lunar_leap,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        item.id,
        item.title,
        item.event_date,
        item.recur_yearly,
        item.note,
        item.calendar === "lunar" ? "lunar" : "solar",
        item.lunar_month ?? null,
        item.lunar_day ?? null,
        item.lunar_leap ? 1 : 0,
        item.created_at,
        item.updated_at,
      ],
    );
  }
  for (const item of payload.karmaLedger ?? []) {
    await db.execute(
      `INSERT OR IGNORE INTO karma_ledger
       (id,source_type,source_id,action,points,entry_date,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [item.id,item.source_type,item.source_id,item.action,item.points,item.entry_date,item.created_at],
    );
  }
  for (const [key, value] of Object.entries(payload.settings)) {
    await setSetting(key, value);
  }
  if (!has("karmaLedger")) {
    await setSetting("karma_base", payload.settings.karma ?? "0");
    await setSetting("karma_streak_base", payload.settings.streak ?? "0");
    await setSetting(
      "karma_streak_last_date",
      payload.settings.last_complete_date ?? "",
    );
  } else {
    await refreshKarmaFromLedger();
  }
  });
}
