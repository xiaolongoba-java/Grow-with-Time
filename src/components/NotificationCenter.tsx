import { useEffect, useState } from "react";
import type { AppNotification } from "@/types";
import {
  dismissAllNotifications,
  fetchNotifications,
  setNotificationStatus,
  snoozeNotification,
} from "@/lib/db";
import { AppIcon } from "@/components/AppIcon";
import { useAppStore } from "@/store/app";

export function NotificationCenter() {
  const selectTask = useAppStore((state) => state.selectTask);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [clearing, setClearing] = useState(false);

  const refresh = async () => setItems(await fetchNotifications());

  useEffect(() => {
    const onChanged = () => {
      if (open) void refresh();
    };
    window.addEventListener("notifications:changed", onChanged);
    return () => window.removeEventListener("notifications:changed", onChanged);
  }, [open]);

  const unread = items.filter(
    (item) => item.status === "delivered" || item.status === "pending",
  ).length;

  const clearAll = async () => {
    if (!items.length || clearing) return;
    setClearing(true);
    try {
      await dismissAllNotifications();
      window.dispatchEvent(new Event("notifications:changed"));
      await refresh();
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="notification-center">
      <button
        type="button"
        className="notification-trigger"
        title="通知中心"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void refresh();
        }}
      >
        <AppIcon name="timer" size={18} />
        <span className="notification-trigger-label">通知中心</span>
        {unread ? <span className="notification-unread">{unread}</span> : null}
      </button>

      {open ? (
        <section className="notification-popover">
          <header>
            <strong>通知中心</strong>
            <div className="notification-header-actions">
              <button
                type="button"
                className="btn-ghost"
                disabled={!items.length || clearing}
                onClick={() => void clearAll()}
              >
                {clearing ? "清除中…" : "清除全部"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                关闭
              </button>
            </div>
          </header>
          <div className="notification-list">
            {items.map((item) => (
              <article key={item.id} className={`notification-item ${item.status}`}>
                <button
                  type="button"
                  className="notification-copy"
                  onClick={() => {
                    if (item.task_id) selectTask(item.task_id);
                    void setNotificationStatus(item.id, "read").then(refresh);
                  }}
                >
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                  <small>{new Date(item.created_at).toLocaleString()}</small>
                </button>
                <div>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => void snoozeNotification(item.id, 10).then(refresh)}
                  >
                    10 分钟后
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() =>
                      void setNotificationStatus(item.id, "dismissed").then(refresh)
                    }
                  >
                    清除
                  </button>
                </div>
              </article>
            ))}
            {!items.length ? <div className="scope-empty">暂无通知</div> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
