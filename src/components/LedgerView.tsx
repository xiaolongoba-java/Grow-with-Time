import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createLedgerTransaction,
  fetchLedgerAccounts,
  fetchLedgerCategories,
  fetchLedgerCategorySummary,
  fetchLedgerTransactions,
  fetchLedgerTrend,
  formatLedgerMoney,
  getLedgerBudget,
  getSetting,
  parseAmountToCents,
  restoreLedgerTransaction,
  setLedgerBudget,
  setSetting,
  softDeleteLedgerTransaction,
  updateLedgerTransaction,
  type LedgerAccount,
  type LedgerCategory,
  type LedgerCategorySummary,
  type LedgerKind,
  type LedgerMonthSummary,
  type LedgerTransaction,
} from "@/lib/db";
import { useAppStore } from "@/store/app";

const ICONS: Record<string, string> = {
  food: "餐", car: "行", bag: "购", home: "住", play: "娱", medical: "医",
  book: "学", gift: "礼", plane: "旅", dots: "…", salary: "薪", star: "奖",
  trend: "财", zap: "兼", back: "退",
};

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function moveMonth(month: string, delta: number) {
  const [year, value] = month.split("-").map(Number);
  const d = new Date(year, value - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, value] = month.split("-");
  return `${year} 年 ${Number(value)} 月`;
}

function accountGlyph(kind: string) {
  return ({ cash: "现", card: "卡", credit: "信", alipay: "支", wechat: "微" } as Record<string, string>)[kind] ?? "账";
}

type DraftState = { kind: LedgerKind; amount: string; categoryId: number; accountId: number; date: string; note: string };

export function LedgerView({ mode = "ledger" }: { mode?: "ledger" | "budget" }) {
  const [month, setMonth] = useState(currentMonth);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [categories, setCategories] = useState<LedgerCategory[]>([]);
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [summary, setSummary] = useState<LedgerCategorySummary[]>([]);
  const [trend, setTrend] = useState<LedgerMonthSummary[]>([]);
  const [budget, setBudget] = useState(0);
  const privacyMode = useAppStore((state) => state.settings.privacyMode);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<LedgerTransaction | null>(null);
  const [draft, setDraft] = useState<DraftState>({ kind: "expense", amount: "", categoryId: 1, accountId: 2, date: today(), note: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ text: string; undoId?: number } | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tx, cats, accts, parts, months, limit, hide] = await Promise.all([
        fetchLedgerTransactions(month), fetchLedgerCategories(undefined, true), fetchLedgerAccounts(true),
        fetchLedgerCategorySummary(month), fetchLedgerTrend(month), getLedgerBudget(month), getSetting("ledger_hide_amount"),
      ]);
      setTransactions(tx); setCategories(cats); setAccounts(accts); setSummary(parts); setTrend(months); setBudget(limit); setHidden(hide === "true");
    } catch (reason) {
      setNotice({ text: reason instanceof Error ? reason.message : "账本加载失败" });
    } finally { setLoading(false); }
  }, [month]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const open = () => openDrawer();
    window.addEventListener("ledger:open-entry", open);
    return () => window.removeEventListener("ledger:open-entry", open);
  }, [categories, accounts]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const activeCategories = categories.filter((item) => item.kind === draft.kind && item.is_enabled);
  const activeAccounts = accounts.filter((item) => item.is_enabled);
  const expense = transactions.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount_cents, 0);
  const income = transactions.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount_cents, 0);
  const budgetRatio = budget ? expense / budget : 0;
  const chartMax = Math.max(1, ...trend.map((item) => Math.max(item.expense_cents, item.income_cents)));
  const composition = useMemo(() => {
    let cursor = 0;
    if (!expense) return "conic-gradient(var(--ledger-line) 0 100%)";
    return `conic-gradient(${summary.map((item) => {
      const start = cursor; cursor += item.amount_cents / expense * 100;
      return `${item.color} ${start}% ${cursor}%`;
    }).join(",")})`;
  }, [summary, expense]);

  function openDrawer(item?: LedgerTransaction) {
    setError(""); setEditing(item ?? null);
    const kind = item?.type ?? "expense";
    const firstCategory = categories.find((entry) => entry.kind === kind && entry.is_enabled)?.id ?? (kind === "expense" ? 1 : 11);
    setDraft(item ? {
      kind, amount: (item.amount_cents / 100).toFixed(2), categoryId: item.category_id,
      accountId: item.account_id, date: item.date, note: item.note,
    } : { kind, amount: "", categoryId: firstCategory, accountId: accounts.find((entry) => entry.is_enabled)?.id ?? 2, date: today(), note: "" });
    setDrawer(true);
    window.setTimeout(() => noteRef.current?.focus(), 50);
  }

  function setKind(kind: LedgerKind) {
    setDraft((value) => ({ ...value, kind, categoryId: categories.find((item) => item.kind === kind && item.is_enabled)?.id ?? (kind === "expense" ? 1 : 11) }));
  }

  async function save() {
    const cents = parseAmountToCents(draft.amount);
    if (!cents) { setError("请输入 0.01～99,999,999.99 的有效金额，最多两位小数"); amountRef.current?.focus(); return; }
    if (!draft.categoryId || !draft.accountId) { setError("请选择分类和账户"); return; }
    if (draft.date > today()) { setError("记账日期不能晚于今天"); return; }
    const selectedCategory = categories.find((item) => item.id === draft.categoryId);
    if (!selectedCategory || selectedCategory.kind !== draft.kind) { setError("所选分类与收支类型不一致，请重新选择"); return; }
    try {
      const payload = { kind: draft.kind, amountCents: cents, categoryId: draft.categoryId, accountId: draft.accountId, occurredOn: draft.date, note: draft.note };
      if (editing) await updateLedgerTransaction(editing.id, editing.version, payload);
      else await createLedgerTransaction(payload);
      setDrawer(false); setNotice({ text: editing ? "记录已更新" : "已记一笔" }); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); }
  }

  async function remove(item: LedgerTransaction) {
    if (!await softDeleteLedgerTransaction(item.id, item.version)) { setNotice({ text: "记录已经变化，请刷新后重试" }); return; }
    setNotice({ text: "已移入账本回收站", undoId: item.id }); await load();
  }

  async function undoDelete(id: number) { await restoreLedgerTransaction(id); setNotice({ text: "已恢复记录" }); await load(); }

  async function toggleHidden() {
    if (privacyMode && !hidden) {
      setNotice({ text: "无痕模式开启时金额会隐藏，请到设置关闭无痕模式后再显示" });
      return;
    }
    const next = !hidden;
    setHidden(next);
    await setSetting("ledger_hide_amount", String(next));
  }

  const maskAmounts = hidden || privacyMode;
  const budgetHeadline = budget ? (maskAmounts ? "••••" : `${Math.round(budgetRatio * 100)}%`) : "未设置";

  const grouped = transactions.reduce<Record<string, LedgerTransaction[]>>((map, item) => {
    (map[item.date] ??= []).push(item); return map;
  }, {});

  return (
    <main className="main-workspace ledger-view">
      <header className="ledger-header">
        <div><p className="ledger-eyebrow">观流账本</p><h2>{mode === "budget" ? "预算" : "收支总览"}</h2><p>看见钱的去向，不评判每一笔生活。</p></div>
        <div className="ledger-head-actions">
          <div className="ledger-month-switcher" aria-label="选择月份"><button onClick={() => setMonth(moveMonth(month, -1))} aria-label="上个月">‹</button><strong>{monthLabel(month)}</strong><button onClick={() => setMonth(moveMonth(month, 1))} aria-label="下个月">›</button></div>
          <button className="btn-ghost" onClick={() => void toggleHidden()}>{maskAmounts ? "显示金额" : "隐藏金额"}</button>
          <button className="btn-primary" onClick={() => openDrawer()}>＋ 记一笔</button>
        </div>
      </header>

      {mode === "budget" ? (
        <BudgetPanel month={month} expense={expense} budget={budget} hidden={maskAmounts} onSaved={async () => { await load(); setNotice({ text: "预算已保存" }); }} />
      ) : (
        <>
          <section className="ledger-stat-grid" aria-label="本月收支摘要">
            <article><span>本月支出</span><strong className="expense">{formatLedgerMoney(expense, maskAmounts)}</strong><small>{transactions.filter((item) => item.type === "expense").length} 笔支出</small></article>
            <article><span>本月收入</span><strong>{formatLedgerMoney(income, maskAmounts)}</strong><small>{transactions.filter((item) => item.type === "income").length} 笔收入</small></article>
            <article><span>本月结余</span><strong>{formatLedgerMoney(income - expense, maskAmounts)}</strong><small>{income - expense >= 0 ? "保持从容" : "支出高于收入"}</small></article>
            <article><span>预算进度</span><strong>{budgetHeadline}</strong><div className="ledger-progress"><i style={{ width: `${Math.min(100, budgetRatio * 100)}%` }} /></div><small>{budget === 0 ? "可在预算页设置" : budgetRatio > 1 ? `已超支 ${formatLedgerMoney(expense - budget, maskAmounts)}` : budgetRatio === 1 ? "本月预算已用完" : `还可用 ${formatLedgerMoney(budget - expense, maskAmounts)}`}</small></article>
          </section>

          <section className="ledger-insight-grid">
            <article className="ledger-card"><div className="ledger-card-title"><div><h3>支出去向</h3><p>本月分类构成</p></div></div><div className="ledger-donut-wrap"><div className="ledger-donut" style={{ background: composition }}><span>{maskAmounts ? "••••" : `${summary.length} 类`}</span></div><div className="ledger-legend">{summary.slice(0, 6).map((item) => <div key={item.category_id}><i style={{ background: item.color }} /><span>{item.name}</span><strong>{expense ? Math.round(item.amount_cents / expense * 100) : 0}%</strong></div>)}{!summary.length && <p>记下第一笔支出后，这里会出现清晰的构成。</p>}</div></div></article>
            <article className="ledger-card"><div className="ledger-card-title"><div><h3>六个月流向</h3><p>收入与支出的变化</p></div><div className="ledger-chart-key"><span>收入</span><span>支出</span></div></div><div className="ledger-bars">{trend.map((item) => <div className="ledger-bar-group" key={item.month}><div><i className="income" style={{ height: `${Math.max(3, item.income_cents / chartMax * 100)}%` }} /><i className="expense" style={{ height: `${Math.max(3, item.expense_cents / chartMax * 100)}%` }} /></div><small>{Number(item.month.slice(5))}月</small></div>)}{!trend.length && <p>还没有趋势数据。</p>}</div></article>
          </section>

          <section className="ledger-card ledger-list-card"><div className="ledger-card-title"><div><h3>明细</h3><p>{monthLabel(month)} · {transactions.length} 笔</p></div></div>
            {loading ? <div className="empty-state">正在汇总账目…</div> : !transactions.length ? <div className="ledger-empty"><span>水面还很安静</span><p>记下第一笔，慢慢看清生活的流向。</p><button className="btn-primary" onClick={() => openDrawer()}>记第一笔</button></div> : Object.entries(grouped).map(([date, items]) => <div className="ledger-day" key={date}><h4>{date}</h4>{items.map((item) => <div className="ledger-row" key={item.id}><span className="ledger-row-icon" style={{ background: `${item.category_color}20`, color: item.category_color }}>{ICONS[item.category_icon] ?? "·"}</span><div className="ledger-row-main"><strong>{item.category_name}</strong><small>{item.note || item.account_name}</small></div><span className="ledger-account">{item.account_name}</span><strong className={item.type}>{item.type === "expense" ? "−" : "+"}{formatLedgerMoney(item.amount_cents, maskAmounts)}</strong><div className="ledger-row-actions"><button onClick={() => openDrawer(item)}>编辑</button><button onClick={() => void remove(item)}>删除</button></div></div>)}</div>)}</section>
        </>
      )}

      {drawer && (
        <div
          className="ledger-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDrawer(false);
          }}
        >
          <section className="ledger-drawer" role="dialog" aria-modal="true" aria-labelledby="ledger-drawer-title">
            <header>
              <div>
                <p className="ledger-eyebrow">{editing ? "编辑记录" : "快速记账"}</p>
                <h3 id="ledger-drawer-title">{editing ? "修改这一笔" : "记一笔"}</h3>
              </div>
              <button className="ledger-close" aria-label="关闭记账面板" onClick={() => setDrawer(false)}>×</button>
            </header>
            <label>
              事由
              <input
                ref={noteRef}
                maxLength={60}
                value={draft.note}
                placeholder="例如：午餐、地铁…"
                onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    amountRef.current?.focus();
                  }
                }}
              />
            </label>
            <label className="ledger-amount">
              <span>金额</span>
              <div>
                <b>¥</b>
                <input
                  ref={amountRef}
                  value={draft.amount}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  aria-describedby={error ? "ledger-error" : undefined}
                  onChange={(event) => {
                    const value = event.target.value.replace(/[^\d.]/g, "");
                    if (value.length <= 11) setDraft((current) => ({ ...current, amount: value }));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void save();
                  }}
                />
              </div>
            </label>
            <div className="ledger-quick-amounts">
              {[10, 20, 50, 100].map((value) => (
                <button key={value} onClick={() => setDraft((current) => ({ ...current, amount: String(value) }))}>
                  ¥{value}
                </button>
              ))}
            </div>
            <div className="ledger-kind-tabs">
              <button className={draft.kind === "expense" ? "active" : ""} onClick={() => setKind("expense")}>支出</button>
              <button className={draft.kind === "income" ? "active" : ""} onClick={() => setKind("income")}>收入</button>
            </div>
            <fieldset>
              <legend>分类</legend>
              <div className="ledger-choice-grid">
                {activeCategories.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={draft.categoryId === item.id ? "active" : ""}
                    onClick={() => setDraft((value) => ({ ...value, categoryId: item.id }))}
                  >
                    <i style={{ color: item.color }}>{ICONS[item.icon] ?? "·"}</i>
                    {item.name}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="ledger-form-row">
              <label>
                日期
                <input type="date" value={draft.date} onChange={(event) => setDraft((value) => ({ ...value, date: event.target.value }))} />
              </label>
              <label>
                账户
                <select value={draft.accountId} onChange={(event) => setDraft((value) => ({ ...value, accountId: Number(event.target.value) }))}>
                  {activeAccounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {accountGlyph(item.kind)} · {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error && <p className="ledger-error" id="ledger-error" role="alert">{error}</p>}
            <footer>
              <button className="btn-ghost" onClick={() => setDrawer(false)}>取消</button>
              <button className="btn-primary" onClick={() => void save()}>保存记录</button>
            </footer>
          </section>
        </div>
      )}
      {notice && <div className="ledger-toast" role="status"><span>{notice.text}</span>{notice.undoId && <button onClick={() => void undoDelete(notice.undoId!)}>撤销</button>}</div>}
    </main>
  );
}

function BudgetPanel({ month, expense, budget, hidden, onSaved }: { month: string; expense: number; budget: number; hidden: boolean; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState(budget ? String(budget / 100) : "");
  const [asDefault, setAsDefault] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setValue(budget ? String(budget / 100) : ""), [budget]);
  const ratio = budget ? expense / budget : 0;
  async function save() { const cents = value.trim() === "0" ? 0 : parseAmountToCents(value); if (cents === null) { setError("请输入有效预算金额，设为 0 可关闭预算"); return; } await setLedgerBudget(month, cents, asDefault); setError(""); await onSaved(); }
  return <section className="ledger-budget-layout"><article className="ledger-card ledger-budget-hero"><p className="ledger-eyebrow">月度边界</p><h3>{monthLabel(month)}</h3><strong>{budget ? (hidden ? "••••" : `${Math.round(ratio * 100)}%`) : "尚未设置"}</strong><div className="ledger-progress large"><i style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div><p>{!budget ? "预算不是限制，而是一条让你更安心的边界。" : ratio > 1 ? `超出 ${formatLedgerMoney(expense - budget, hidden)}` : ratio === 1 ? "预算刚好用完" : `已用 ${formatLedgerMoney(expense, hidden)}，剩余 ${formatLedgerMoney(budget - expense, hidden)}`}</p></article><article className="ledger-card ledger-budget-form"><h3>设置预算</h3><label>预算金额<div className="ledger-budget-input"><span>¥</span><input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value.replace(/[^\d.]/g, ""))} placeholder="例如 5000" /></div></label><label className="ledger-checkbox"><input type="checkbox" checked={asDefault} onChange={(event) => setAsDefault(event.target.checked)} />同时设为以后月份的默认预算</label>{error && <p className="ledger-error">{error}</p>}<button className="btn-primary" onClick={() => void save()}>保存预算</button><small>当月预算优先于默认预算；填 0 可关闭当月预算提醒。</small></article></section>;
}
