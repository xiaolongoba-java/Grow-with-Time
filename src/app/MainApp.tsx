import { useEffect, useState } from "react";
import { register, isRegistered } from "@tauri-apps/plugin-global-shortcut";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { NavSidebar } from "@/components/NavSidebar";
import { MainWorkspace } from "@/components/MainWorkspace";
import { TodayTimeline } from "@/components/TodayTimeline";
import { DetailDrawer } from "@/components/DetailDrawer";
import { CommandPalette } from "@/components/CommandPalette";
import { OnboardingGuide } from "@/components/OnboardingGuide";
import { CreateTaskDialog } from "@/components/CreateTaskDialog";
import { GlassTitlebar } from "@/components/GlassTitlebar";
import {
  createNotificationRecord,
  ensureReminderRecord,
  ensureMissedNotification,
  fetchDueFutureLetters,
  fetchDueNotifications,
  getSetting,
  setSetting,
  setNotificationStatus,
  markFutureLetterDelivered,
} from "@/lib/db";
import { useAppStore } from "@/store/app";
import { filterTasksByView } from "@/lib/tasks";
import { todayDateString } from "@/lib/dates";
import {
  buildMissedReminderPlans,
  buildNativeReminderPlans,
} from "@/lib/nativeReminders";

const NAV_COLLAPSE_KEY = "minimal.navCollapsed";

export function MainApp() {
  const bootstrap = useAppStore((s) => s.bootstrap);
  const maybeRollover = useAppStore((s) => s.maybeRollover);
  const ready = useAppStore((s) => s.ready);
  const error = useAppStore((s) => s.error);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);
  const createTaskOpen = useAppStore((s) => s.createTaskOpen);
  const selectTask = useAppStore((s) => s.selectTask);
  const deleteTask = useAppStore((s) => s.deleteTask);
  const toast = useAppStore((s) => s.toast);
  const setToast = useAppStore((s) => s.setToast);
  const canUndo = useAppStore((s) => s.canUndo);
  const undo = useAppStore((s) => s.undo);
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
    const t = window.setTimeout(() => setToast(null), canUndo ? 6000 : 2200);
    return () => window.clearTimeout(t);
  }, [toast, canUndo, setToast]);

  useEffect(() => {
    const shortcut = "CommandOrControl+Shift+N";
    const inspirationShortcut = "CommandOrControl+Shift+Space";
    void (async () => {
      try {
        if (!(await isRegistered(shortcut))) {
          await register(shortcut, () => {
            void invoke("show_quick_add");
          });
        }
        if (!(await isRegistered(inspirationShortcut))) {
          await register(inspirationShortcut, () => { void invoke("show_inspiration"); });
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
    const schedule = async () => {
      try {
        let granted = await isPermissionGranted();
        if (!granted) {
          const perm = await requestPermission();
          granted = perm === "granted";
        }
        if (!granted) {
          await invoke("sync_native_notifications", { reminders: [] });
          return;
        }

        const scheduled = buildNativeReminderPlans(
          tasks,
          settings.notifyAhead,
        );
        await invoke("sync_native_notifications", {
          reminders: scheduled,
        });
      } catch {
        /* ignore */
      }
    };
    void schedule();
  }, [tasks, settings.notifyAhead]);

  useEffect(() => {
    if (!ready) return;
    const recoverMissedReminders = async () => {
      const now = Date.now();
      const stored = await getSetting("native_reminder_last_scan_at");
      const lastScan = stored ? Number(stored) : now;
      const missed = buildMissedReminderPlans(
        tasks,
        settings.notifyAhead,
        lastScan,
        now,
      );
      for (const item of missed) {
        const created = await ensureReminderRecord({
          taskId: item.taskId,
          title: item.title,
          body: item.body,
          scheduledAt: new Date(item.fireAtMs).toISOString(),
        });
        if (created && item.showSystemNotification) {
          sendNotification({ title: item.title, body: item.body });
        }
      }
      await setSetting("native_reminder_last_scan_at", String(now));
      if (missed.length) {
        window.dispatchEvent(new Event("notifications:changed"));
      }
    };
    void recoverMissedReminders().catch(() => undefined);
    const timer = window.setInterval(() => {
      // Advance the watermark only after a real scan. This preserves the sleep
      // interval when Windows/macOS suspends the process between callbacks.
      void recoverMissedReminders().catch(() => undefined);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [ready, tasks, settings.notifyAhead]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<{
      id: string;
      taskId: string;
      title: string;
      body: string;
      firedAt: number;
    }>("native-reminder-fired", (event) => {
      const item = event.payload;
      void createNotificationRecord({
        taskId: item.taskId,
        title: item.title,
        body: item.body,
        scheduledAt: new Date(item.firedAt).toISOString(),
      }).then(() =>
        window.dispatchEvent(new Event("notifications:changed")),
      );
      void setSetting("native_reminder_last_scan_at", String(Date.now()));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const deliverLetters = async () => {
      const letters = await fetchDueFutureLetters();
      for (const letter of letters) {
        sendNotification({ title: `一封来自过去的信：${letter.title}`, body: "打开日进·拾光，在“拾光变迁”中查看。" });
        await createNotificationRecord({ title: `拾光变迁 · ${letter.title}`, body: "这封写给未来的信已经抵达。", scheduledAt: letter.deliver_at });
        await markFutureLetterDelivered(letter.id);
      }
      if (letters.length) window.dispatchEvent(new Event("notifications:changed"));
    };
    void deliverLetters().catch(() => undefined);
    const timer = window.setInterval(() => void deliverLetters().catch(() => undefined), 60_000);
    return () => window.clearInterval(timer);
  }, [ready]);

  useEffect(() => {
    const settleSnoozed = async () => {
      try {
        const due = await fetchDueNotifications();
        for (const item of due) {
          sendNotification({ title: item.title, body: item.body });
          await setNotificationStatus(item.id, "delivered");
        }
        if (due.length) {
          window.dispatchEvent(new Event("notifications:changed"));
        }
      } catch {
        /* ignore notification-center polling errors */
      }
    };
    const timer = window.setInterval(() => void settleSnoozed(), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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

  useEffect(() => {
    if (!settings.autoBackup) return;
    const backup = async () => {
      try {
        const [
          { exportBackup },
          { appDataDir, join },
          { mkdir, writeTextFile, readDir, remove },
        ] =
          await Promise.all([
            import("@/lib/db"),
            import("@tauri-apps/api/path"),
            import("@tauri-apps/plugin-fs"),
          ]);
        const root = await appDataDir();
        const dir = await join(root, "backups");
        await mkdir(dir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const path = await join(dir, `auto-backup-${stamp}.json`);
        const payload = await exportBackup();
        await writeTextFile(path, JSON.stringify(payload, null, 2));
        const backups = (await readDir(dir))
          .filter(
            (entry) =>
              entry.isFile && entry.name?.startsWith("auto-backup-"),
          )
          .sort((a, b) => (b.name ?? "").localeCompare(a.name ?? ""));
        for (const old of backups.slice(10)) {
          if (!old.name) continue;
          await remove(await join(dir, old.name));
        }
      } catch {
        /* automatic backup is best-effort */
      }
    };
    void backup();
    const timer = window.setInterval(() => void backup(), 6 * 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [settings.autoBackup]);

  useEffect(() => {
    if (!ready) return;
    const now = Date.now();
    const missed = tasks.filter((task) => {
      if (task.status !== "pending" || !task.due_date || task.parent_id) {
        return false;
      }
      const due = new Date(
        `${task.due_date}T${task.due_time ?? "23:59"}:00`,
      ).getTime();
      return due < now;
    });
    void Promise.all(missed.map(ensureMissedNotification)).then(() => {
      if (missed.length) {
        window.dispatchEvent(new Event("notifications:changed"));
      }
    });
  }, [ready, tasks]);

  if (!ready) {
    return <div className="empty-state">加载中…</div>;
  }

  const detailOpen = Boolean(selectedTaskId);
  const toggleNav = () => setNavCollapsed((v) => !v);

  return (
    <div className="app-root">
      <GlassTitlebar />
      <div
        className={`app-body ${detailOpen ? "detail-open" : ""} ${navCollapsed ? "nav-collapsed" : ""}`}
      >
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
      {!detailOpen ? <TodayTimeline /> : null}
      <CommandPalette />
      {createTaskOpen ? <CreateTaskDialog /> : null}
      <OnboardingGuide />
      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          <span>{toast}</span>
          {canUndo ? (
            <button type="button" className="toast-undo" onClick={() => void undo()}>
              撤销
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div className="toast" role="alert" aria-live="assertive" style={{ background: "var(--text-overdue)" }}>
          {error}
        </div>
      ) : null}
      <span style={{ display: "none" }}>{todayDateString()}</span>
    </div>
  );
}
