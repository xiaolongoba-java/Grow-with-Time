import { useEffect, useRef, useState } from "react";
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
import { FocusRecoveryDialog } from "@/components/FocusRecoveryDialog";
import { MorningPlanDialog } from "@/components/MorningPlanDialog";
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
import { privacySafeNotification } from "@/lib/privacy";
import { useAppStore } from "@/store/app";
import { filterTasksByView } from "@/lib/tasks";
import { todayDateString } from "@/lib/dates";
import { openDesktopWidgets } from "@/lib/desktopWidgets";
import {
  applyPrivacyToReminderPlans,
  buildMissedReminderPlans,
  buildNativeReminderPlans,
  missedReminderNeedsPopup,
  OS_REMINDER_LIMIT,
  selectOsReminderWindow,
  type ReminderSyncStatus,
} from "@/lib/nativeReminders";

const NAV_COLLAPSE_KEY = "minimal.navCollapsed";
const REMINDER_RESYNC_MS = 6 * 60 * 60 * 1000;

type OsReminderSyncResult = {
  ok: boolean;
  scheduledCount: number;
  overflowCount: number;
  truncated: boolean;
  error: string | null;
  hostedIds?: string[];
};

type OsHostState = {
  osOk: boolean;
  hostedIds: Set<string>;
};

const EMPTY_OS_HOST: OsHostState = { osOk: false, hostedIds: new Set() };

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
  const focusRunning = useAppStore((s) => s.focusRunning);
  const tickFocus = useAppStore((s) => s.tickFocus);

  const [navCollapsed, setNavCollapsed] = useState(() => {
    try {
      return localStorage.getItem(NAV_COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const setReminderSync = useAppStore((s) => s.setReminderSync);
  const lastOsHostRef = useRef<OsHostState>(EMPTY_OS_HOST);
  const reminderPassRef = useRef(Promise.resolve());
  const runFullReminderPassRef = useRef<() => Promise<void>>(async () => undefined);

  const enqueueReminderPass = (fn: () => Promise<void>) => {
    const run = reminderPassRef.current.then(fn, fn);
    reminderPassRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const syncOsReminders = async (): Promise<OsHostState> => {
    const status: ReminderSyncStatus = {
      osAvailable: false,
      permissionGranted: false,
      scheduledCount: 0,
      overflowCount: 0,
      truncated: false,
      totalUpcoming: 0,
      lastOkAt: useAppStore.getState().reminderSync.lastOkAt,
      lastError: null,
    };
    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        const perm = await requestPermission();
        granted = perm === "granted";
      }
      status.permissionGranted = granted;
      const snapshot = useAppStore.getState();
      const scheduled = applyPrivacyToReminderPlans(
        buildNativeReminderPlans(snapshot.tasks, snapshot.settings.notifyAhead),
        snapshot.settings.privacyMode,
      );
      status.totalUpcoming = scheduled.length;
      if (!granted) {
        await invoke("sync_native_notifications", { reminders: [] });
        status.lastError = "未授予通知权限";
        lastOsHostRef.current = EMPTY_OS_HOST;
        setReminderSync(status);
        return EMPTY_OS_HOST;
      }
      const result = await invoke<OsReminderSyncResult>("sync_native_notifications", {
        reminders: scheduled,
      });
      const hostedIds = result.ok
        ? new Set(
            Array.isArray(result.hostedIds)
              ? result.hostedIds
              : selectOsReminderWindow(scheduled).windowed.map((item) => item.reminderId),
          )
        : new Set<string>();
      const host: OsHostState = { osOk: result.ok, hostedIds };
      lastOsHostRef.current = host;
      status.osAvailable = result.ok;
      status.scheduledCount = result.scheduledCount;
      status.overflowCount = result.overflowCount;
      status.truncated = result.truncated;
      if (result.ok) {
        status.lastOkAt = Date.now();
        status.lastError = result.truncated
          ? `系统队列上限 ${OS_REMINDER_LIMIT} 条 / 90 天，其余在应用运行时补发`
          : null;
      } else {
        status.lastError = result.error || "系统提醒登记失败，已改用应用内调度";
      }
      setReminderSync(status);
      return host;
    } catch (error) {
      lastOsHostRef.current = EMPTY_OS_HOST;
      status.lastError = error instanceof Error ? error.message : "系统提醒同步失败";
      setReminderSync(status);
      return EMPTY_OS_HOST;
    }
  };

  const scanMissedReminders = async (host: OsHostState) => {
    const snapshot = useAppStore.getState();
    const now = Date.now();
    const stored = await getSetting("native_reminder_last_scan_at");
    const lastScan = stored ? Number(stored) : now;
    const missed = buildMissedReminderPlans(
      snapshot.tasks,
      snapshot.settings.notifyAhead,
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
      if (created && missedReminderNeedsPopup(item, host.osOk, host.hostedIds)) {
        const copy = privacySafeNotification(
          snapshot.settings.privacyMode,
          item.title,
          item.body,
        );
        sendNotification(copy);
      }
    }
    await setSetting("native_reminder_last_scan_at", String(now));
    if (missed.length) {
      window.dispatchEvent(new Event("notifications:changed"));
    }
  };

  const runFullReminderPass = () =>
    enqueueReminderPass(async () => {
      const host = await syncOsReminders();
      await scanMissedReminders(host);
    });
  const runMissedOnlyPass = () =>
    enqueueReminderPass(async () => {
      await scanMissedReminders(lastOsHostRef.current);
    });
  runFullReminderPassRef.current = runFullReminderPass;

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Single global focus ticker — uses absolute endsAt so sleep gaps are settled.
  useEffect(() => {
    if (!focusRunning) return;
    const id = window.setInterval(() => tickFocus(), 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tickFocus();
      else useAppStore.getState().persistFocusHeartbeat(true);
    };
    const onPageHide = () => {
      useAppStore.getState().persistFocusHeartbeat(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [focusRunning, tickFocus]);

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
    let unlisten: (() => void) | undefined;
    void listen<string>("tray:desktop-widgets", (event) => {
      const mode = event.payload === "classic" ? "classic" : "dashboard";
      const current = useAppStore.getState().settings;
      void openDesktopWidgets(mode, current.desktopWidgetLayer);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<{ nav?: string }>("widget:navigate", (event) => {
      const nav = event.payload?.nav;
      if (nav) setNav(nav as Parameters<typeof setNav>[0]);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [setNav]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen("main:hidden-to-tray", () => {
      try {
        if (sessionStorage.getItem("minimal.trayHint")) return;
        sessionStorage.setItem("minimal.trayHint", "1");
      } catch {
        /* ignore */
      }
      setToast("已放到托盘，提醒会继续。彻底退出请用托盘「退出应用」。");
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [setToast]);

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
    if (!ready) return;
    void runFullReminderPass().catch(() => undefined);
    const fullTimer = window.setInterval(() => {
      void runFullReminderPassRef.current().catch(() => undefined);
    }, REMINDER_RESYNC_MS);
    const missedTimer = window.setInterval(() => {
      void runMissedOnlyPass().catch(() => undefined);
    }, 60_000);
    return () => {
      window.clearInterval(fullTimer);
      window.clearInterval(missedTimer);
    };
  }, [ready, tasks, settings.notifyAhead, settings.privacyMode]);

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
      void (async () => {
        await setSetting("native_reminder_last_scan_at", String(Date.now()));
        await runFullReminderPassRef.current();
      })().catch(() => undefined);
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
        sendNotification(
          privacySafeNotification(
            useAppStore.getState().settings.privacyMode,
            `一封来自过去的信：${letter.title}`,
            "打开日进·拾光，在“拾光变迁”中查看。",
          ),
        );
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
          sendNotification(
            privacySafeNotification(
              useAppStore.getState().settings.privacyMode,
              item.title,
              item.body,
            ),
          );
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
            sendNotification(
              privacySafeNotification(
                useAppStore.getState().settings.privacyMode,
                "定时提醒",
                body,
              ),
            );
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
          { exportBackup, setSetting },
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
        const okAt = new Date().toISOString();
        await setSetting("auto_backup_last_ok", okAt);
        await setSetting("auto_backup_last_error", "");
        await setSetting("auto_backup_fail_streak", "0");
        useAppStore.setState((state) => ({
          settings: {
            ...state.settings,
            autoBackupLastOk: okAt,
            autoBackupLastError: null,
            autoBackupFailStreak: 0,
          },
        }));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error || "未知错误");
        try {
          const { setSetting } = await import("@/lib/db");
          const prev = useAppStore.getState().settings.autoBackupFailStreak;
          const streak = prev + 1;
          await setSetting("auto_backup_last_error", message);
          await setSetting("auto_backup_fail_streak", String(streak));
          useAppStore.setState((state) => ({
            settings: {
              ...state.settings,
              autoBackupLastError: message,
              autoBackupFailStreak: streak,
            },
            // Prompt once when failures start stacking; avoid nagging every interval.
            toast:
              streak === 1 || streak === 3
                ? `自动备份失败：${message}`
                : state.toast,
          }));
        } catch {
          /* ignore secondary persistence errors */
        }
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
      <FocusRecoveryDialog />
      <MorningPlanDialog />
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
          <span>{error}</span>
          <button
            type="button"
            className="toast-undo"
            onClick={() => {
              useAppStore.setState({ error: null });
              void bootstrap();
            }}
          >
            重试
          </button>
          <button
            type="button"
            className="toast-undo"
            onClick={() => useAppStore.setState({ error: null })}
          >
            关闭
          </button>
        </div>
      ) : null}
      <span style={{ display: "none" }}>{todayDateString()}</span>
    </div>
  );
}
