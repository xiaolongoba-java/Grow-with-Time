import type {
  Anniversary,
  DailyReflection,
  FutureLetter,
  Inspiration,
} from "@/types";
import { extractMomentTags } from "@/lib/moments";
import { createId, nowIso } from "@/lib/dates";
import { getDb } from "./client";

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

/* Anniversaries */
export async function fetchAnniversaries(): Promise<Anniversary[]> {
  const db = await getDb();
  return db.select<Anniversary[]>(
    "SELECT * FROM anniversaries ORDER BY event_date ASC",
  );
}

export async function createAnniversary(input: {
  title: string;
  event_date: string;
  recur_yearly?: number;
  note?: string;
}): Promise<Anniversary> {
  const db = await getDb();
  const timestamp = nowIso();
  const row: Anniversary = {
    id: createId(),
    title: input.title.trim(),
    event_date: input.event_date,
    recur_yearly: input.recur_yearly === 0 ? 0 : 1,
    note: input.note?.trim() ?? "",
    created_at: timestamp,
    updated_at: timestamp,
  };
  await db.execute(
    `INSERT INTO anniversaries
     (id,title,event_date,recur_yearly,note,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      row.id,
      row.title,
      row.event_date,
      row.recur_yearly,
      row.note,
      row.created_at,
      row.updated_at,
    ],
  );
  return row;
}

export async function updateAnniversary(
  id: string,
  patch: Partial<Pick<Anniversary, "title" | "event_date" | "recur_yearly" | "note">>,
): Promise<void> {
  const db = await getDb();
  const rows = await db.select<Anniversary[]>(
    "SELECT * FROM anniversaries WHERE id=$1",
    [id],
  );
  const current = rows[0];
  if (!current) return;
  const next = {
    title: patch.title?.trim() ?? current.title,
    event_date: patch.event_date ?? current.event_date,
    recur_yearly:
      patch.recur_yearly === undefined
        ? current.recur_yearly
        : patch.recur_yearly
          ? 1
          : 0,
    note: patch.note === undefined ? current.note : patch.note.trim(),
    updated_at: nowIso(),
  };
  await db.execute(
    `UPDATE anniversaries
     SET title=$1,event_date=$2,recur_yearly=$3,note=$4,updated_at=$5
     WHERE id=$6`,
    [next.title, next.event_date, next.recur_yearly, next.note, next.updated_at, id],
  );
}

export async function deleteAnniversary(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM anniversaries WHERE id=$1", [id]);
}

