export type NotificationCopy = {
  title: string;
  body: string;
};

/** Mask system notification text when privacy mode is on. */
export function privacySafeNotification(
  privacyMode: boolean,
  title: string,
  body: string,
): NotificationCopy {
  if (!privacyMode) return { title, body };
  return {
    title: "日进·拾光",
    body: "你有一条提醒",
  };
}
