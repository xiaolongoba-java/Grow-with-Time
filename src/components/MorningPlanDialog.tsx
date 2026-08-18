import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "@/store/app";
import type { MorningPlanReason } from "@/lib/morningPlan";

const REASON_LABEL: Record<MorningPlanReason, string> = {
  carryover: "昨天未完成",
  overdue: "已逾期",
  due_today: "今天到期",
  inbox: "待办箱",
  project: "项目",
  repeating: "周期任务",
};

const NEW_PREFIX = "new:";

export function MorningPlanDialog() {
  const pendingFocus = useAppStore((s) => s.pendingFocusRecovery);
  const pending = useAppStore((s) => s.pendingMorningPlan);
  const resolve = useAppStore((s) => s.resolveMorningPlan);
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [extras, setExtras] = useState<{ id: string; title: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pending) {
      setSelected([]);
      setDraft("");
      setExtras([]);
      return;
    }
    setSelected(
      pending.filter((item) => item.selectedByDefault).map((item) => item.id),
    );
    setDraft("");
    setExtras([]);
  }, [pending]);

  useEffect(() => {
    if (pending === null || pendingFocus) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      setBusy(true);
      void resolve(null).finally(() => setBusy(false));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, pendingFocus, busy, resolve]);

  if (pendingFocus || pending === null) return null;

  const addDraft = () => {
    const title = draft.trim();
    if (!title || busy) return;
    const id = `${NEW_PREFIX}${crypto.randomUUID()}`;
    setExtras((current) => [...current, { id, title }]);
    setSelected((current) => [...current, id]);
    setDraft("");
  };

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const run = (closeOnly: boolean) => {
    if (busy) return;
    setBusy(true);
    if (closeOnly) {
      void resolve(null).finally(() => setBusy(false));
      return;
    }
    const taskIds = selected.filter((id) => !id.startsWith(NEW_PREFIX));
    const titles = extras
      .filter((item) => selected.includes(item.id))
      .map((item) => item.title);
    void resolve({ taskIds, titles }).finally(() => setBusy(false));
  };

  const chosen = selected.length;

  return createPortal(
    <div
      className="modal-backdrop focus-recovery-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) run(true);
      }}
    >
      <section
        className="create-task-modal morning-plan-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="morning-plan-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span>今日计划</span>
            <h3 id="morning-plan-title">把要做的事一次加入我的一天</h3>
          </div>
        </div>
        <p className="create-task-hint">
          可从已有任务、项目和周期任务里勾选，也可以自己写一项。只会加入「我的一天」，不改截止日期。
        </p>
        <form
          className="morning-plan-compose"
          onSubmit={(event) => {
            event.preventDefault();
            addDraft();
          }}
        >
          <input
            className="field"
            value={draft}
            placeholder="自己写一项，回车加入"
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || !draft.trim()}
          >
            添加
          </button>
        </form>
        {pending.length || extras.length ? (
          <>
            <div className="morning-plan-toolbar">
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={() =>
                  setSelected([
                    ...pending.map((item) => item.id),
                    ...extras.map((item) => item.id),
                  ])
                }
              >
                全选
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={() =>
                  setSelected(
                    pending
                      .filter((item) => item.selectedByDefault)
                      .map((item) => item.id),
                  )
                }
              >
                只选建议
              </button>
            </div>
            <div className="morning-plan-list">
              {extras.map((item) => {
                const checked = selected.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className={`morning-plan-row ${checked ? "is-on" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={() => toggle(item.id)}
                    />
                    <span className="morning-plan-copy">
                      <strong>{item.title}</strong>
                      <small>刚写的</small>
                    </span>
                  </label>
                );
              })}
              {pending.map((item) => {
                const checked = selected.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className={`morning-plan-row ${checked ? "is-on" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={() => toggle(item.id)}
                    />
                    <span className="morning-plan-copy">
                      <strong>{item.title}</strong>
                      <small>
                        {REASON_LABEL[item.reason]}
                        {item.dueDate ? ` · ${item.dueDate}` : ""}
                        {item.estimatedMinutes
                          ? ` · ${item.estimatedMinutes} 分钟`
                          : ""}
                      </small>
                    </span>
                    <em className={`prio p${item.priority}`}>P{item.priority}</em>
                  </label>
                );
              })}
            </div>
          </>
        ) : (
          <p className="create-task-hint">
            现有任务都已在今天，或还没有可勾选的项。先在上面写一项即可。
          </p>
        )}
        <div className="create-task-actions focus-recovery-actions">
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() => run(true)}
          >
            取消
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !chosen}
            onClick={() => run(false)}
          >
            {busy ? "加入中…" : `加入我的一天（${chosen}）`}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
