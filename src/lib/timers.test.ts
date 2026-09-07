import { describe, expect, it } from "vitest";
import type { Timer } from "@/types";
import { nextRunningTimerDueAt } from "./timers";

function timer(partial: Partial<Timer>): Timer {
  return {
    id: "t1",
    kind: "interval",
    title: "喝水",
    interval_sec: 60,
    remaining_sec: 60,
    running: 0,
    enabled: 1,
    task_id: null,
    ends_at: null,
    last_fired_at: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("nextRunningTimerDueAt", () => {
  it("returns null when nothing is counting down", () => {
    expect(nextRunningTimerDueAt([timer({ running: 0 })], 1_000)).toBeNull();
    expect(
      nextRunningTimerDueAt(
        [timer({ running: 1, enabled: 0, ends_at: new Date(5_000).toISOString() })],
        1_000,
      ),
    ).toBeNull();
  });

  it("returns the earliest future due time", () => {
    const later = new Date(8_000).toISOString();
    const sooner = new Date(3_000).toISOString();
    expect(
      nextRunningTimerDueAt(
        [
          timer({ id: "a", running: 1, ends_at: later }),
          timer({ id: "b", running: 1, ends_at: sooner }),
        ],
        1_000,
      ),
    ).toBe(3_000);
  });

  it("clamps already-due timers to now so the scheduler fires immediately", () => {
    expect(
      nextRunningTimerDueAt(
        [timer({ running: 1, ends_at: new Date(500).toISOString() })],
        1_000,
      ),
    ).toBe(1_000);
  });
});
