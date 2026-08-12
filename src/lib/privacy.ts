export type NotificationCopy = {
  title: string;
  body: string;
};

/** Privacy mode is opt-in; only the explicit setting value `"true"` enables it. */
export function isPrivacyModeEnabled(raw: string | null | undefined): boolean {
  return raw === "true";
}

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
