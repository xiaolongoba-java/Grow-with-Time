import { describe, expect, it } from "vitest";
import type { FocusSession } from "@/types";
import { interpretOpenFocus, toSafeIso } from "./focusRecovery";

const session = (startedAt: string): FocusSession => ({
  id: "sess-1",
  task_id: "task-1",
  started_at: startedAt,
  ended_at: null,
  duration_sec: 0,
  interruption_reason: null,
  created_at: startedAt,
});

describe("interpretOpenFocus", () => {
  it("continues when persisted endsAt is still in the future", () => {
    const now = Date.parse("2026-08-13T10:00:00");
    const result = interpretOpenFocus(
      session("2026-08-13T09:50:00.000Z"),
      {
        sessionId: "sess-1",
        taskId: "task-1",
        endsAt: now + 120_000,
        plannedSec: 25 * 60,
      },
      now,
    );
    expect(result.canContinue).toBe(true);
    expect(result.remainingSec).toBe(120);
  });

  it("settles when the planned window already elapsed", () => {
    const now = Date.parse("2026-08-13T10:30:00.000Z");
    const started = "2026-08-13T10:00:00.000Z";
    const result = interpretOpenFocus(session(started), null, now, 25 * 60);
    expect(result.canContinue).toBe(false);
    expect(result.remainingSec).toBe(0);
    expect(result.activitySettleAt).toBe(Date.parse(started));
    expect(result.plannedSettleAt).toBe(Date.parse("2026-08-13T10:25:00.000Z"));
  });

  it("keeps activity settle at the last heartbeat, not now or the planned end", () => {
    const started = "2026-08-13T10:00:00.000Z";
    const startedMs = Date.parse(started);
    const now = Date.parse("2026-08-14T09:00:00.000Z");
    const result = interpretOpenFocus(
      session(started),
      {
        sessionId: "sess-1",
        taskId: "task-1",
        endsAt: startedMs + 25 * 60 * 1000,
        plannedSec: 25 * 60,
        lastHeartbeatAt: startedMs + 5 * 60 * 1000,
      },
      now,
    );
    expect(result.activitySettleAt).toBe(startedMs + 5 * 60 * 1000);
    expect(result.plannedSettleAt).toBe(startedMs + 25 * 60 * 1000);
    expect(result.canContinue).toBe(false);
  });

  it("ignores invalid heartbeat when computing activity settle", () => {
    const started = "2026-08-13T10:00:00.000Z";
    const startedMs = Date.parse(started);
    const result = interpretOpenFocus(
      session(started),
      {
        sessionId: "sess-1",
        taskId: "task-1",
        endsAt: startedMs + 25 * 60 * 1000,
        plannedSec: 25 * 60,
        lastHeartbeatAt: Number.NaN,
      },
      Date.parse("2026-08-14T09:00:00.000Z"),
    );
    expect(Number.isFinite(result.activitySettleAt)).toBe(true);
    expect(result.activitySettleAt).toBe(startedMs);
  });
});

describe("toSafeIso", () => {
  it("falls back instead of throwing on NaN", () => {
    expect(toSafeIso(Number.NaN, "2026-08-13T10:00:00.000Z")).toBe(
      "2026-08-13T10:00:00.000Z",
    );
  });
});
