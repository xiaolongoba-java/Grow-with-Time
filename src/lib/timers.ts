import type { Timer } from "@/types";

export const TIMER_PRESETS: { title: string; interval_sec: number }[] = [
  { title: "喝水", interval_sec: 30 * 60 },
  { title: "站起来活动", interval_sec: 50 * 60 },
  { title: "护眼休息", interval_sec: 45 * 60 },
];

export function formatCountdown(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Remaining seconds from ends_at (or stored remaining_sec if paused). */
export function liveRemaining(timer: Timer, nowMs = Date.now()): number {
  if (timer.running && timer.ends_at) {
    const end = Date.parse(timer.ends_at);
    if (!Number.isNaN(end)) {
      return Math.max(0, Math.ceil((end - nowMs) / 1000));
    }
  }
  return Math.max(0, timer.remaining_sec);
}

export function intervalLabel(sec: number): string {
  if (sec < 60) return `${sec} 秒`;
  if (sec % 3600 === 0) return `${sec / 3600} 小时`;
  if (sec % 60 === 0) return `${sec / 60} 分钟`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} 分 ${s} 秒`;
}
