import { getDb, withTransaction } from "./client";
import { getSetting, setSetting } from "./settings";

export type LedgerKind = "expense" | "income";

export interface LedgerCategory {
  id: number;
  name: string;
  icon: string;
  color: string;
  kind: LedgerKind;
  sort_order: number;
  is_enabled: number;
  is_builtin: number;
}

export interface LedgerAccount {
  id: number;
  name: string;
  kind: string;
  color: string;
  sort_order: number;
  is_enabled: number;
}

export interface LedgerTransaction {
  id: number;
  type: LedgerKind;
  amount_cents: number;
  category_id: number;
  category_name: string;
  category_icon: string;
  category_color: string;
  account_id: number;
  account_name: string;
  account_color: string;
  date: string;
  note: string;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LedgerDraft {
  kind: LedgerKind;
  amountCents: number;
  categoryId: number;
  accountId: number;
  occurredOn: string;
  note?: string;
}

export interface LedgerMonthSummary {
  month: string;
  expense_cents: number;
  income_cents: number;
}

export interface LedgerCategorySummary {
  category_id: number;
  name: string;
  icon: string;
  color: string;
  amount_cents: number;
}

export function parseAmountToCents(raw: string): number | null {
  const value = raw.trim();
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{0,2})?$/.test(value)) return null;
  const [yuan, fraction = ""] = value.split(".");
  const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function formatLedgerMoney(cents: number, hidden = false): string {
  if (hidden) return "¥ ••••";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function monthRange(month: string): [string, string] {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error("月份格式无效");
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  const start = `${match[1]}-${match[2]}-01`;
  const endDate = new Date(year, index + 1, 1);
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-01`;
  return [start, end];
}

export async function fetchLedgerCategories(kind?: LedgerKind, includeDisabled = false) {
  const db = await getDb();
  const where = [kind ? "kind = $1" : "1=1", includeDisabled ? "1=1" : "is_enabled = 1"];
  return db.select<LedgerCategory[]>(
    `SELECT * FROM ledger_categories WHERE ${where.join(" AND ")} ORDER BY sort_order, id`,
    kind ? [kind] : [],
  );
}

export async function fetchLedgerAccounts(includeDisabled = false) {
  const db = await getDb();
  return db.select<LedgerAccount[]>(
    `SELECT * FROM ledger_accounts ${includeDisabled ? "" : "WHERE is_enabled = 1"} ORDER BY sort_order, id`,
  );
}

export async function fetchLedgerTransactions(month: string) {
  const [start, end] = monthRange(month);
  const db = await getDb();
  return db.select<LedgerTransaction[]>(
    `SELECT t.*, c.name category_name, c.icon category_icon, c.color category_color,
      a.name account_name, a.color account_color
     FROM ledger_transactions t
     JOIN ledger_categories c ON c.id = t.category_id
     JOIN ledger_accounts a ON a.id = t.account_id
     WHERE t.is_deleted=0 AND t.date >= $1 AND t.date < $2
     ORDER BY t.date DESC, t.created_at DESC`,
    [start, end],
  );
}

export async function fetchLedgerTrend(endMonth: string) {
  const [endStart, endExclusive] = monthRange(endMonth);
  const cursor = new Date(`${endStart}T00:00:00`);
  cursor.setMonth(cursor.getMonth() - 5);
  const start = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-01`;
  const db = await getDb();
  return db.select<LedgerMonthSummary[]>(
    `SELECT substr(date, 1, 7) month,
      SUM(CASE WHEN type='expense' THEN amount_cents ELSE 0 END) expense_cents,
      SUM(CASE WHEN type='income' THEN amount_cents ELSE 0 END) income_cents
     FROM ledger_transactions
     WHERE is_deleted=0 AND date >= $1 AND date < $2
     GROUP BY substr(date, 1, 7) ORDER BY month`,
    [start, endExclusive],
  );
}

export async function fetchLedgerCategorySummary(month: string) {
  const [start, end] = monthRange(month);
  const db = await getDb();
  return db.select<LedgerCategorySummary[]>(
    `SELECT c.id category_id, c.name, c.icon, c.color, SUM(t.amount_cents) amount_cents
     FROM ledger_transactions t JOIN ledger_categories c ON c.id=t.category_id
     WHERE t.is_deleted=0 AND t.type='expense' AND t.date >= $1 AND t.date < $2
     GROUP BY c.id ORDER BY amount_cents DESC`,
    [start, end],
  );
}

export async function createLedgerTransaction(draft: LedgerDraft) {
  if (!Number.isSafeInteger(draft.amountCents) || draft.amountCents <= 0) throw new Error("金额无效");
  const nowDate = new Date();
  const localToday = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}-${String(nowDate.getDate()).padStart(2, "0")}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.occurredOn) || draft.occurredOn > localToday) throw new Error("记账日期不能晚于今天");
  return withTransaction(async () => {
    const db = await getDb();
    const category = await db.select<{ kind: LedgerKind; is_enabled: number }[]>("SELECT kind,is_enabled FROM ledger_categories WHERE id=$1 LIMIT 1", [draft.categoryId]);
    if (!category[0] || category[0].kind !== draft.kind || !category[0].is_enabled) throw new Error("分类与收支类型不一致或已停用");
    const account = await db.select<{ is_enabled: number }[]>("SELECT is_enabled FROM ledger_accounts WHERE id=$1 LIMIT 1", [draft.accountId]);
    if (!account[0]?.is_enabled) throw new Error("账户不存在或已停用");
    const now = new Date().toISOString();
    const result = await db.execute(
      `INSERT INTO ledger_transactions
        (type,amount_cents,category_id,account_id,date,note,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
      [draft.kind, draft.amountCents, draft.categoryId, draft.accountId, draft.occurredOn, draft.note?.trim() ?? "", now],
    );
    return result.lastInsertId;
  });
}

export async function updateLedgerTransaction(id: number, version: number, draft: LedgerDraft) {
  const nowDate = new Date();
  const localToday = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}-${String(nowDate.getDate()).padStart(2, "0")}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.occurredOn) || draft.occurredOn > localToday) throw new Error("记账日期不能晚于今天");
  return withTransaction(async () => {
    const db = await getDb();
    const category = await db.select<{ kind: LedgerKind; is_enabled: number }[]>("SELECT kind,is_enabled FROM ledger_categories WHERE id=$1 LIMIT 1", [draft.categoryId]);
    if (!category[0] || category[0].kind !== draft.kind || !category[0].is_enabled) throw new Error("分类与收支类型不一致或已停用");
    const account = await db.select<{ is_enabled: number }[]>("SELECT is_enabled FROM ledger_accounts WHERE id=$1 LIMIT 1", [draft.accountId]);
    if (!account[0]?.is_enabled) throw new Error("账户不存在或已停用");
    const result = await db.execute(
      `UPDATE ledger_transactions SET type=$1,amount_cents=$2,category_id=$3,account_id=$4,
        date=$5,note=$6,version=version+1,updated_at=$7
       WHERE id=$8 AND version=$9 AND is_deleted=0`,
      [draft.kind, draft.amountCents, draft.categoryId, draft.accountId, draft.occurredOn, draft.note?.trim() ?? "", new Date().toISOString(), id, version],
    );
    if (!result.rowsAffected) throw new Error("这笔记录已在别处修改，请刷新后重试");
  });
}

export async function softDeleteLedgerTransaction(id: number, version: number) {
  const db = await getDb();
  const result = await db.execute(
    `UPDATE ledger_transactions SET is_deleted=1,deleted_at=$1,version=version+1,updated_at=$1
     WHERE id=$2 AND version=$3 AND is_deleted=0`,
    [new Date().toISOString(), id, version],
  );
  return Boolean(result.rowsAffected);
}

export async function restoreLedgerTransaction(id: number) {
  const db = await getDb();
  const now = new Date().toISOString();
  const result = await db.execute(
    "UPDATE ledger_transactions SET is_deleted=0,deleted_at=NULL,version=version+1,updated_at=$1 WHERE id=$2 AND is_deleted=1",
    [now, id],
  );
  return Boolean(result.rowsAffected);
}

export async function getLedgerBudget(month: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ amount_cents: number }[]>(
    "SELECT amount_cents FROM ledger_budgets WHERE month=$1 LIMIT 1",
    [month],
  );
  if (rows[0]) return rows[0].amount_cents;
  return Number(await getSetting("ledger_default_budget_cents")) || 0;
}

export async function setLedgerBudget(month: string, amountCents: number, asDefault = false) {
  if (asDefault) {
    await setSetting("ledger_default_budget_cents", String(amountCents));
    return;
  }
  const db = await getDb();
  await db.execute(
    `INSERT INTO ledger_budgets(month,amount_cents,updated_at) VALUES($1,$2,$3)
     ON CONFLICT(month) DO UPDATE SET amount_cents=excluded.amount_cents,updated_at=excluded.updated_at`,
    [month, amountCents, new Date().toISOString()],
  );
}

export async function saveLedgerCategory(input: { id?: number; name: string; icon: string; color: string; kind: LedgerKind }) {
  const db = await getDb();
  if (input.id) {
    await db.execute("UPDATE ledger_categories SET name=$1,icon=$2,color=$3 WHERE id=$4", [input.name.trim(), input.icon, input.color, input.id]);
  } else {
    await db.execute(
      "INSERT INTO ledger_categories(name,icon,color,kind,sort_order,is_builtin) VALUES($1,$2,$3,$4,(SELECT COALESCE(MAX(sort_order),0)+1 FROM ledger_categories WHERE kind=$4),0)",
      [input.name.trim(), input.icon, input.color, input.kind],
    );
  }
}

export async function saveLedgerAccount(input: { id?: number; name: string; kind?: string; color?: string }) {
  const db = await getDb();
  if (input.id) await db.execute("UPDATE ledger_accounts SET name=$1,kind=$2,color=$3 WHERE id=$4", [input.name.trim(), input.kind ?? "custom", input.color ?? "#2f6fed", input.id]);
  else await db.execute("INSERT INTO ledger_accounts(name,kind,color,sort_order) VALUES($1,$2,$3,(SELECT COALESCE(MAX(sort_order),0)+1 FROM ledger_accounts))", [input.name.trim(), input.kind ?? "custom", input.color ?? "#2f6fed"]);
}

export async function toggleLedgerCategory(id: number, enabled: boolean) {
  const db = await getDb();
  await db.execute("UPDATE ledger_categories SET is_enabled=$1 WHERE id=$2", [enabled ? 1 : 0, id]);
}

export async function toggleLedgerAccount(id: number, enabled: boolean) {
  const db = await getDb();
  await db.execute("UPDATE ledger_accounts SET is_enabled=$1 WHERE id=$2", [enabled ? 1 : 0, id]);
}

export async function purgeOldLedgerTrash(days = 30) {
  return withTransaction(async () => {
    const db = await getDb();
    const result = await db.execute(
      "DELETE FROM ledger_transactions WHERE is_deleted=1 AND deleted_at < datetime('now', $1)",
      [`-${days} days`],
    );
    return result.rowsAffected ?? 0;
  });
}
