import { useEffect, useState } from "react";
import { register, isRegistered } from "@tauri-apps/plugin-global-shortcut";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { IconRail } from "@/components/IconRail";
import { NavSidebar } from "@/components/NavSidebar";
import { MainWorkspace } from "@/components/MainWorkspace";
import { TodayTimeline } from "@/components/TodayTimeline";
import { DetailDrawer } from "@/components/DetailDrawer";
import { useAppStore } from "@/store/app";
import { filterTasksByView } from "@/lib/tasks";
import { todayDateString } from "@/lib/dates";

const NAV_COLLAPSE_KEY = "minimal.navCollapsed";

export function MainApp() {
  const bootstrap = useAppStore((s) => s.bootstrap);
  const maybeRollover = useAppStore((s) => s.maybeRollover);
  const ready = useAppStore((s) => s.ready);
  const error = useAppStore((s) => s.error);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);
  const selectTask = useAppStore((s) => s.selectTask);
  const deleteTask = useAppStore((s) => s.deleteTask);
  const toast = useAppStore((s) => s.toast);
  const setToast = useAppStore((s) => s.setToast);
  const theme = useAppStore((s) => s.settings.theme);
  const setNav = useAppStore((s) => s.setNav);
  const tasks = useAppStore((s) => s.tasks);
  const nav = useAppStore((s) => s.nav);
  const tagMap = useAppStore((s) => s.tagMap);
  const activeTagId = useAppStore((s) => s.activeTagId);
  const filter = useAppStore((s) => s.filter);
  const settings = useAppStore((s) => s.settings);
  const settleTimers = useAppStore((s) => s.settleTimers);

  const [navCollapsed, setNavCollapsed] = useState(() => {
    try {
      return localStorage.getItem(NAV_COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void maybeRollover();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [maybeRollover]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(NAV_COLLAPSE_KEY, navCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.nav =
      navCollapsed ? "collapsed" : "expanded";
  }, [navCollapsed]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast, setToast]);

  useEffect(() => {
    const shortcut = "CommandOrControl+Shift+N";
    void (async () => {
      try {
        if (!(await isRegistered(shortcut))) {
          await register(shortcut, () => {
            void invoke("show_quick_add");
          });
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen("tray:today", () => setNav("today")).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [setNav]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";

      if (e.key === "Escape") {
        selectTask(null);
        return;
      }
      if (typing) return;

      const visible = filterTasksByView(tasks, nav, tagMap, activeTagId, filter);
      const idx = visible.findIndex((t) => t.id === selectedTaskId);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = visible[Math.min(visible.length - 1, Math.max(0, idx + 1))];
        if (next) selectTask(next.id);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = visible[Math.max(0, idx <= 0 ? 0 : idx - 1)];
        if (prev) selectTask(prev.id);
      }
      if (e.key === "Enter" && selectedTaskId) {
        /* already open */
      }
      if (e.key === "Delete" && selectedTaskId) {
        void deleteTask(selectedTaskId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    tasks,
    nav,
    tagMap,
    activeTagId,
    filter,
    selectedTaskId,
    selectTask,
    deleteTask,
  ]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        let granted = await isPermissionGranted();
        if (!granted) {
          const perm = await requestPermission();
          granted = perm === "granted";
        }
        if (!granted) return;

        const now = Date.now();
        const ahead = settings.notifyAhead;
        for (const task of tasks) {
          if (task.status !== "pending" || !task.due_date || task.parent_id) {
            continue;
          }
          const remind = task.remind_minutes ?? ahead;
          const due = new Date(
            `${task.due_date}T${task.due_time ?? "23:59"}:00`,
          ).getTime();
          const diff = due - now;
          if (diff > 0 && diff <= remind * 60 * 1000) {
            const key = `notified:${task.id}:${task.due_date}`;
            if (sessionStorage.getItem(key)) continue;
            sendNotification({
              title: "任务提醒",
              body: `${task.title} 将在 ${remind} 分钟内到期`,
            });
            sessionStorage.setItem(key, "1");
          }
        }
      } catch {
        /* ignore */
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [tasks, settings.notifyAhead]);

  useEffect(() => {
    const tick = window.setInterval(async () => {
      try {
        const fired = await settleTimers();
        if (!fired.length) return;

        let granted = await isPermissionGranted();
        if (!granted) {
          const perm = await requestPermission();
          granted = perm === "granted";
        }

        for (const item of fired) {
          const body = item.looped
            ? `「${item.timer.title}」到点了，已开始下一轮`
            : `「${item.timer.title}」倒计时结束`;
          if (granted) {
            sendNotification({ title: "定时提醒", body });
          }
          setToast(body);
        }
        try {
          await invoke("start_timer_ui");
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }
    }, 1000);
    return () => window.clearInterval(tick);
  }, [settleTimers, setToast]);

  if (!ready) {
    return <div className="empty-state">加载中…</div>;
  }

  const detailOpen = Boolean(selectedTaskId);
  const toggleNav = () => setNavCollapsed((v) => !v);

  return (
    <div className="app-root">
      <div
        className={`app-body ${detailOpen ? "detail-open" : ""} ${navCollapsed ? "nav-collapsed" : ""}`}
      >
        <IconRail />
        <NavSidebar onCollapse={() => setNavCollapsed(true)} />
        <MainWorkspace />
        {detailOpen ? <DetailDrawer /> : null}
        {navCollapsed ? (
          <button
            type="button"
            className="nav-edge-expand"
            title="展开侧栏"
            aria-label="展开侧栏"
            onClick={toggleNav}
          >
            ▸
          </button>
        ) : null}
      </div>
      <TodayTimeline />
      {toast ? <div className="toast">{toast}</div> : null}
      {error ? (
        <div className="toast" style={{ background: "var(--text-overdue)" }}>
          {error}
        </div>
      ) : null}
      <span style={{ display: "none" }}>{todayDateString()}</span>
    </div>
  );
}
