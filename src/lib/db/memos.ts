import type { Memo } from "@/types";
import { createId, nowIso } from "@/lib/dates";
import { getDb } from "./client";

/* Memos / 备忘录 */
function mapMemo(row: Memo): Memo {
  return {
    ...row,
    title: row.title ?? "",
    content: row.content ?? "",
    pinned: row.pinned ?? 0,
    archived: row.archived ?? 0,
    format: row.format === "richtext" ? "richtext" : "markdown",
  };
}

export async function fetchMemos(options?: {
  archived?: boolean | "all";
}): Promise<Memo[]> {
  const db = await getDb();
  const archived = options?.archived ?? false;
  const where =
    archived === "all" ? "" : `WHERE archived=${archived ? 1 : 0}`;
  const rows = await db.select<Memo[]>(
    `SELECT * FROM memos ${where} ORDER BY pinned DESC, updated_at DESC`,
  );
  return rows.map(mapMemo);
}

export async function createMemo(
  content: string,
  title = "",
  format: Memo["format"] = "markdown",
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
    archived: 0,
    format,
    created_at: now,
    updated_at: now,
  };
  await db.execute(
    "INSERT INTO memos (id, title, content, pinned, archived, format, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      memo.id,
      memo.title,
      memo.content,
      memo.pinned,
      memo.archived,
      memo.format,
      memo.created_at,
      memo.updated_at,
    ],
  );
  return memo;
}

export async function updateMemo(
  id: string,
  updates: {
    title?: string;
    content?: string;
    pinned?: number;
    archived?: number;
    format?: "markdown" | "richtext";
  },
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
    "UPDATE memos SET title=$1, content=$2, pinned=$3, archived=$4, format=$5, updated_at=$6 WHERE id=$7",
    [next.title, next.content, next.pinned, next.archived, next.format, next.updated_at, id],
  );
}

export async function deleteMemo(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM memos WHERE id=$1", [id]);
}

