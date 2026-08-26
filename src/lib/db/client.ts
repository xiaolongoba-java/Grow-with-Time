import Database from "@tauri-apps/plugin-sql";
import type { Task } from "@/types";
import { DB_URL } from "@/lib/dates";

let dbPromise: Promise<Database> | null = null;
export const TASK_SELECT = `SELECT tasks.*,
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
        await db.execute("ALTER TABLE tasks ADD COLUMN generated_from_id TEXT");
      } catch {
        /* already exists */
      }
      try {
        await db.execute(`CREATE TABLE IF NOT EXISTS karma_ledger (
          id TEXT PRIMARY KEY,
          source_type TEXT NOT NULL,
          source_id TEXT NOT NULL,
          action TEXT NOT NULL,
          points INTEGER NOT NULL,
          entry_date TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(source_type, source_id, action)
        )`);
      } catch {
        /* ignore */
      }
      try {
        await db.execute(
          "ALTER TABLE memos ADD COLUMN title TEXT NOT NULL DEFAULT ''",
        );
      } catch {
        /* already exists */
      }
      try {
        await db.execute(
          "ALTER TABLE memos ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
        );
      } catch {
        /* already exists */
      }
      try {
        await db.execute(
          "ALTER TABLE memos ADD COLUMN format TEXT NOT NULL DEFAULT 'markdown'",
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
      try {
        await db.execute(`CREATE TABLE IF NOT EXISTS anniversaries (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          event_date TEXT NOT NULL,
          recur_yearly INTEGER NOT NULL DEFAULT 1,
          note TEXT NOT NULL DEFAULT '',
          calendar TEXT NOT NULL DEFAULT 'solar',
          lunar_month INTEGER,
          lunar_day INTEGER,
          lunar_leap INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`);
      } catch {
        /* ignore */
      }
      for (const sql of [
        "ALTER TABLE anniversaries ADD COLUMN calendar TEXT NOT NULL DEFAULT 'solar'",
        "ALTER TABLE anniversaries ADD COLUMN lunar_month INTEGER",
        "ALTER TABLE anniversaries ADD COLUMN lunar_day INTEGER",
        "ALTER TABLE anniversaries ADD COLUMN lunar_leap INTEGER NOT NULL DEFAULT 0",
      ]) {
        try {
          await db.execute(sql);
        } catch {
          /* already exists */
        }
      }
      // v12 owns planning metadata formally. The legacy columns are read once
      // as an upgrade bridge, then every write is mirrored to the canonical table.
      await db.execute(
        `INSERT OR IGNORE INTO task_planning_metadata
         (task_id, reminder_minutes_json, estimated_minutes)
         SELECT id, COALESCE(reminder_minutes_json, '[]'), estimated_minutes FROM tasks`,
      );
      try {
        await db.execute("PRAGMA busy_timeout = 5000");
      } catch {
        /* ignore */
      }
      return db;
    });
  }
  return dbPromise;
}

let txQueue: Promise<unknown> = Promise.resolve();
let txDepth = 0;

/**
 * Serialize writes on the JS side.
 * Do not issue BEGIN/COMMIT through tauri-plugin-sql: it uses a sqlx pool, so
 * those statements can land on different connections and fail with
 * "cannot start a transaction within a transaction".
 * Nested calls run immediately on the same queue turn (no deadlock).
 */
export function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (txDepth > 0) return fn();
  const run = txQueue.then(async () => {
    txDepth += 1;
    try {
      return await fn();
    } finally {
      txDepth -= 1;
    }
  });
  txQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function mapTask(row: Task): Task {
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
    generated_from_id: row.generated_from_id ?? null,
  };
}

export async function saveTaskPlanningMetadata(task: Task): Promise<void> {
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

