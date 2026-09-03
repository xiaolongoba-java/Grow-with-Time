import type { Timer, TimerDraft } from "@/types";
import { createId, nowIso } from "@/lib/dates";
import { getDb } from "./client";

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

export async function extendTimer(
  id: string,
  additionalSec: number,
): Promise<Timer | null> {
  const db = await getDb();
  const rows = await db.select<Timer[]>("SELECT * FROM timers WHERE id=$1", [id]);
  if (!rows[0]) return null;
  const current = mapTimer(rows[0]);
  const added = Math.max(5, Math.floor(additionalSec));
  const remaining = liveRemainingForUpdate(current) + added;
  return updateTimer(id, {
    remaining_sec: remaining,
    ends_at: current.running
      ? new Date(Date.now() + remaining * 1000).toISOString()
      : null,
  });
}

function liveRemainingForUpdate(timer: Timer): number {
  if (timer.running && timer.ends_at) {
    const end = Date.parse(timer.ends_at);
    if (!Number.isNaN(end)) {
      return Math.max(0, Math.ceil((end - Date.now()) / 1000));
    }
  }
  return Math.max(0, timer.remaining_sec);
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
