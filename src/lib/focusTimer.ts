/** Absolute-time focus countdown — survives sleep / long stalls. */

export function remainingFocusSeconds(
  endsAtMs: number | null,
  nowMs = Date.now(),
): number {
  if (endsAtMs === null) return 0;
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));
}

export function focusEndsAtFromRemaining(
  remainingSec: number,
  nowMs = Date.now(),
): number {
  return nowMs + Math.max(0, remainingSec) * 1000;
}
