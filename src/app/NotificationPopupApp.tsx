import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { setNotificationStatus, snoozeNotification } from "@/lib/db";
import type { AppNotification } from "@/types";

export function NotificationPopupApp() {
  const [item, setItem] = useState<AppNotification | null>(null);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<AppNotification>("notification:popup", (event) => setItem(event.payload)).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);
  const hide = () => void getCurrentWebviewWindow().hide();
  if (!item) return null;
  const dismiss = async () => { await setNotificationStatus(item.id, "dismissed"); hide(); };
  const snooze = async () => { await snoozeNotification(item.id, 10); hide(); };
  const open = async () => { await setNotificationStatus(item.id, "read"); await invoke("open_main_window"); hide(); };
  return <main className="outside-notification">
    <div className="outside-notification-accent" />
    <section>
      <header data-tauri-drag-region><span data-tauri-drag-region>日进 · 拾光</span><button type="button" aria-label="关闭提醒" onClick={() => void dismiss()}>×</button></header>
      <div className="outside-notification-title"><i /><div><small>{item.kind === "missed" ? "错过的提醒" : "到点提醒"}</small><h2>{item.title}</h2></div></div>
      <p>{item.body || "你设定的时间到了。"}</p>
      <footer><time>{new Date(item.scheduled_at ?? item.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time><div><button type="button" onClick={() => void snooze()}>10 分钟后</button><button type="button" className="is-primary" onClick={() => void open()}>查看</button></div></footer>
    </section>
  </main>;
}
