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
  endsAt: number;
  remainingSec: number;
  canContinue: boolean;
  activitySettleAt: number;
  plannedSettleAt: number;
  extraCount: number;
  extras: FocusSession[];
};

export function toSafeIso(ms: number, fallbackIso?: string): string {
  if (Number.isFinite(ms)) {
    try {
      return new Date(ms).toISOString();
    } catch {
      /* fall through */
    }
  }
  if (fallbackIso) {
    const fallbackMs = Date.parse(fallbackIso);
    if (Number.isFinite(fallbackMs)) return new Date(fallbackMs).toISOString();
  }
  return new Date().toISOString();
}

function finiteMs(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function interpretOpenFocus(
  session: FocusSession,
  persisted: PersistedFocus | null,
  nowMs = Date.now(),
  defaultPlannedSec = 25 * 60,
  extras: FocusSession[] = [],
): FocusRecovery {
  const startedMs = new Date(session.started_at).getTime();
  const started = Number.isFinite(startedMs) ? startedMs : nowMs;
  const matched = Boolean(persisted && persisted.sessionId === session.id);
  const plannedSec =
    matched &&
    persisted &&
    finiteMs(persisted.plannedSec) != null &&
    persisted.plannedSec > 0
      ? persisted.plannedSec
      : defaultPlannedSec;
  const persistedEnds = matched && persisted ? finiteMs(persisted.endsAt) : null;
  const endsAt = persistedEnds ?? started + plannedSec * 1000;
  const remainingSec = Math.max(0, Math.ceil((endsAt - nowMs) / 1000));
  const lastAlive =
    matched && persisted
      ? finiteMs(persisted.lastHeartbeatAt) ?? finiteMs(persisted.hiddenAt)
      : null;
  const activitySettleAt = Math.max(started, lastAlive ?? started);
  return {
    session,
    endsAt,
    remainingSec,
    canContinue: Number.isFinite(startedMs) && remainingSec > 0,
    activitySettleAt,
    plannedSettleAt: endsAt,
    extraCount: extras.length,
    extras,
  };
}
