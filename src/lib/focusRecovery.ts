import type { FocusSession } from "@/types";

export type PersistedFocus = {
  sessionId: string;
  taskId: string | null;
  endsAt: number;
  plannedSec: number;
  lastHeartbeatAt?: number;
  hiddenAt?: number | null;
};

export type FocusRecovery = {
  session: FocusSession;
  endsAt: number | null;
  remainingSec: number;
  canContinue: boolean;
  activitySettleAt: number;
  plannedSettleAt: number;
  extraCount: number;
  extras: FocusSession[];
};

export function interpretOpenFocus(
  session: FocusSession,
  persisted: PersistedFocus | null,
  nowMs = Date.now(),
  defaultPlannedSec = 25 * 60,
  extras: FocusSession[] = [],
): FocusRecovery {
  const startedMs = new Date(session.started_at).getTime();
  const plannedSec =
    persisted?.sessionId === session.id
      ? persisted.plannedSec
      : defaultPlannedSec;
  const endsAt =
    persisted?.sessionId === session.id
      ? persisted.endsAt
      : Number.isFinite(startedMs)
        ? startedMs + plannedSec * 1000
        : null;
  const remainingSec = endsAt == null ? 0 : Math.max(0, Math.ceil((endsAt - nowMs) / 1000));
  const lastAlive =
    persisted?.sessionId === session.id
      ? persisted.lastHeartbeatAt ?? persisted.hiddenAt ?? null
      : null;
  const started = Number.isFinite(startedMs) ? startedMs : nowMs;
  const activitySettleAt = Math.max(started, lastAlive ?? started);
  const plannedSettleAt = endsAt ?? started + plannedSec * 1000;
  return {
    session,
    endsAt,
    remainingSec,
    canContinue: remainingSec > 0,
    activitySettleAt,
    plannedSettleAt,
    extraCount: extras.length,
    extras,
  };
}
