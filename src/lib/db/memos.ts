import type { Memo, MemoFormat } from "@/types";
import { createId, nowIso } from "@/lib/dates";
import { normalizeMemoFormat, titleFromMemoContent } from "@/lib/memoFormat";
import { getDb } from "./client";

export type MemoListFilter = "active" | "archived" | "all";

/* Memos / 备忘录 */
function mapMemo(row: Memo): Memo {
  return {
    ...row,
    title: row.title ?? "",
    content: row.content ?? "",
    format: normalizeMemoFormat(row.format),
    pinned: row.pinned ?? 0,
    archived: row.archived ?? 0,
  };
}

function filterClause(filter: MemoListFilter): string {
  if (filter === "archived") return "WHERE archived = 1";
  if (filter === "active") return "WHERE archived = 0";
  return "";
}

export async function fetchMemos(
  filter: MemoListFilter = "active",
): Promise<Memo[]> {
  const db = await getDb();
  const rows = await db.select<Memo[]>(
    `SELECT * FROM memos ${filterClause(filter)} ORDER BY pinned DESC, updated_at DESC`,
  );
  return rows.map(mapMemo);
}

export async function createMemo(
  content: string,
  title = "",
  format: MemoFormat = "markdown",
): Promise<Memo> {
  const db = await getDb();
  const now = nowIso();
  const trimmed = content.trim();
  const resolvedTitle =
    title.trim() ||
    titleFromMemoContent(trimmed, format) ||
    "无标题备忘";
  const memo: Memo = {
    id: createId(),
    title: resolvedTitle,
    content: trimmed,
    format,
    pinned: 0,
    archived: 0,
    created_at: now,
    updated_at: now,
  };
  await db.execute(
    "INSERT INTO memos (id, title, content, format, pinned, archived, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      memo.id,
      memo.title,
      memo.content,
      memo.format,
      memo.pinned,
      memo.archived,
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
    format?: MemoFormat;
    pinned?: number;
    archived?: number;
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
    const autoTitle = titleFromMemoContent(
      updates.content,
      updates.format ?? current.format,
    );
    if (autoTitle && (!current.title || current.title === "无标题备忘")) {
      next.title = autoTitle;
    }
  }
  await db.execute(
    "UPDATE memos SET title=$1, content=$2, format=$3, pinned=$4, archived=$5, updated_at=$6 WHERE id=$7",
    [
      next.title,
      next.content,
      next.format,
      next.pinned,
      next.archived,
      next.updated_at,
      id,
    ],
  );
}

export async function archiveMemo(id: string): Promise<void> {
  await updateMemo(id, { archived: 1, pinned: 0 });
}

export async function restoreMemo(id: string): Promise<void> {
  await updateMemo(id, { archived: 0 });
}

export async function deleteMemo(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM memos WHERE id=$1", [id]);
}
