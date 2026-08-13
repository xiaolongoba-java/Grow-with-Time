import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "@/store/app";

function minutesBetween(startIso: string, endMs: number): number {
  const start = new Date(startIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.round((endMs - start) / 60000));
}

export function FocusRecoveryDialog() {
  const pending = useAppStore((s) => s.pendingFocusRecovery);
  const resolve = useAppStore((s) => s.resolveFocusRecovery);
  const [busy, setBusy] = useState(false);
  const run = (
    action: "continue" | "settle_activity" | "settle_planned" | "abandon",
  ) => {
    if (busy) return;
    setBusy(true);
    void resolve(action).finally(() => setBusy(false));
  };

  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      setBusy(true);
      void resolve("abandon").finally(() => setBusy(false));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, busy, resolve]);

  if (!pending) return null;
  const minutes = Math.max(1, Math.round(pending.remainingSec / 60));
  const activityMinutes = minutesBetween(
    pending.session.started_at,
    pending.activitySettleAt,
  );
  const plannedMinutes = minutesBetween(
    pending.session.started_at,
    pending.plannedSettleAt,
  );
  return createPortal(
    <div
      className="modal-backdrop focus-recovery-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) run("abandon");
      }}
    >
      <section
        className="create-task-modal focus-recovery-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="focus-recovery-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span>未结束的专注</span>
            <h3 id="focus-recovery-title">上次专注在退出前没有结束</h3>
          </div>
        </div>
        <p className="create-task-hint">
          {pending.canContinue
            ? `还可以继续约 ${minutes} 分钟。也可以按最后活动时间结算（约 ${activityMinutes} 分钟），或按计划时长结算（约 ${plannedMinutes} 分钟）。`
            : `计划时间已经过了。可以按最后活动时间结算（约 ${activityMinutes} 分钟），或按计划时长结算（约 ${plannedMinutes} 分钟）。`}
        </p>
        {pending.extraCount ? (
          <p className="create-task-hint">
            另有 {pending.extraCount} 条异常会话，将一并按所选方式处理。
          </p>
        ) : null}
        <div className="create-task-actions focus-recovery-actions">
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => run("abandon")}>
            放弃
          </button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => run("settle_activity")}>
            按最后活动时间结算
          </button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => run("settle_planned")}>
            按计划时长结算
          </button>
          {pending.canContinue ? (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => run("continue")}>
              继续专注
            </button>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  );
}
