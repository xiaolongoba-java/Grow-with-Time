import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  fetchNotifications,
  setNotificationStatus,
  setTaskNotificationsStatus,
  snoozeNotification,
} from "@/lib/db";
import { useAppStore } from "@/store/app";
import type { AppNotification } from "@/types";

function visibleNotifications(items: AppNotification[]): AppNotification[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (item.status !== "delivered") return false;
    const key = item.task_id ? `${item.kind}:${item.task_id}` : item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function DesktopNotificationCards() {
  const selectTask = useAppStore((state) => state.selectTask);
  const [items, setItems] = useState<AppNotification[]>([]);
  const knownIds = useRef<Set<string> | null>(null);

  const refresh = async (showOutside = false) => {
    const notifications = await fetchNotifications();
    const delivered = visibleNotifications(notifications);
    if (showOutside && knownIds.current) {
      const fresh = delivered.find((item) => !knownIds.current?.has(item.id));
      if (fresh) void invoke("show_notification_popup", { notification: fresh });
    }
    knownIds.current = new Set(delivered.map((item) => item.id));
    setItems(delivered.slice(0, 3));
  };

  const acknowledge = async (item: AppNotification) => {
    if (item.task_id) {
      selectTask(item.task_id);
      await setTaskNotificationsStatus(item.task_id, "read");
    } else {
      await setNotificationStatus(item.id, "read");
    }
    await refresh();
  };

  useEffect(() => {
    void refresh();
    const onChanged = () => void refresh(true);
    window.addEventListener("notifications:changed", onChanged);
    return () => window.removeEventListener("notifications:changed", onChanged);
  }, []);

  if (!items.length) return null;

  return (
    <aside className="desktop-notification-stack" aria-label="桌面通知" aria-live="polite">
      {items.map((item) => (
        <article className="desktop-notification-card" key={item.id}>
          <div className="desktop-notification-mark" aria-hidden>
            <span />
          </div>
          <div className="desktop-notification-content">
            <header>
              <span>
                {item.kind === "system"
                  ? "系统提醒"
                  : item.kind === "missed"
                    ? "错过的提醒"
                    : "日进 · 拾光"}
              </span>
              <button
                type="button"
                aria-label="关闭通知"
                onClick={() =>
                  void setNotificationStatus(item.id, "dismissed").then(() => refresh())
                }
              >
                ×
              </button>
            </header>
            <button
              type="button"
              className="desktop-notification-copy"
              onClick={() => void acknowledge(item)}
            >
              <strong>{item.title}</strong>
              <p>{item.body}</p>
            </button>
            <footer>
              <time>
                {new Date(item.scheduled_at ?? item.created_at).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <div>
                <button type="button" onClick={() => void snoozeNotification(item.id, 10).then(() => refresh())}>
                  10 分钟后
                </button>
                <button type="button" className="is-primary" onClick={() => void acknowledge(item)}>
                  知道了
                </button>
              </div>
            </footer>
          </div>
        </article>
      ))}
    </aside>
  );
}
