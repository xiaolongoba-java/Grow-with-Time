import { create } from "zustand";
import type {
  AiSettings,
  AppSettings,
  Attachment,
  FilterState,
  Habit,
  HabitCheck,
  NavId,
  Project,
  SmartList,
  Tag,
  Task,
  TaskDraft,
  TaskUpdate,
  TaskTemplate,
  ThemeMode,
  Timer,
  TimerDraft,
  ViewMode,
  DateScope,
} from "@/types";
import * as db from "@/lib/db";
import { addDays, todayDateString } from "@/lib/dates";
import {
  focusEndsAtFromRemaining,
  remainingFocusSeconds,
} from "@/lib/focusTimer";
import { emitDataChanged } from "@/lib/widgetRefresh";
import { interpretOpenFocus, type FocusRecovery } from "@/lib/focusRecovery";
import {
  EMPTY_REMINDER_SYNC,
  type ReminderSyncStatus,
} from "@/lib/nativeReminders";
import { invoke } from "@tauri-apps/api/core";
import { syncWindowChrome } from "@/lib/windowChrome";
import { errorMessage } from "@/lib/errors";

const emptyFilter = (): FilterState => ({
  keyword: "",
  dateFrom: null,
  dateTo: null,
  priorities: [],
  tagIds: [],
});

interface AppStore {
  ready: boolean;
  error: string | null;
  tasks: Task[];
  trashTasks: Task[];
  tags: Tag[];
  tagMap: Record<string, string[]>;
  smartLists: SmartList[];
  habits: Habit[];
  habitChecks: HabitCheck[];
  timers: Timer[];
  attachments: Attachment[];
  projects: Project[];
  taskTemplates: TaskTemplate[];
  settings: AppSettings;
  nav: NavId;
  viewMode: ViewMode;
  dateScope: DateScope;
  calendarCursor: string;
  selectedTaskId: string | null;
  detailPreferEdit: boolean;
  createTaskOpen: boolean;
  activeTagId: string | null;
  activeSmartListId: string | null;
  filter: FilterState;
  focusTaskId: string | null;
  focusSeconds: number;
  focusEndsAt: number | null;
  focusRunning: boolean;
  focusSessionId: string | null;
  pendingFocusRecovery: FocusRecovery | null;
  reminderSync: ReminderSyncStatus;
  toast: string | null;
  canUndo: boolean;
  _undoAction: (() => Promise<void>) | null;
  navigationGuard: (() => boolean) | null;

  bootstrap: () => Promise<void>;
  maybeRollover: () => Promise<void>;
  refreshAll: () => Promise<void>;
  setNav: (nav: NavId) => void;
  setNavigationGuard: (guard: (() => boolean) | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setDateScope: (scope: DateScope) => void;
  setCalendarCursor: (date: string) => void;
  selectTask: (id: string | null, opts?: { edit?: boolean }) => void;
  openCreateTask: () => void;
  closeCreateTask: () => void;
  setActiveTag: (id: string | null) => void;
  setFilter: (patch: Partial<FilterState>) => void;
  setToast: (msg: string | null) => void;
  undo: () => Promise<void>;

  addTask: (draft: TaskDraft) => Promise<Task | null>;
  saveTask: (id: string, updates: TaskUpdate) => Promise<void>;
  toggleComplete: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  batchComplete: (ids: string[]) => Promise<void>;
  batchDelete: (ids: string[]) => Promise<void>;
  restoreTask: (id: string) => Promise<void>;
  purgeTrash: () => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;

  addTag: (name: string) => Promise<void>;
  removeTag: (id: string) => Promise<void>;
  setTaskTags: (taskId: string, tagIds: string[]) => Promise<void>;
  addProject: (name: string) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;
  saveTemplate: (name: string, draft: TaskDraft) => Promise<void>;
  useTemplate: (id: string) => Promise<void>;
  removeTemplate: (id: string) => Promise<void>;

  saveSmartList: (name: string) => Promise<void>;
  removeSmartList: (id: string) => Promise<void>;
  applySmartList: (id: string) => void;

  addAttachment: (
    taskId: string,
    data: { kind: Attachment["kind"]; name: string; path: string },
  ) => Promise<void>;
  removeAttachment: (id: string) => Promise<void>;
  loadAttachments: (taskId: string) => Promise<void>;

  addHabit: (title: string, target?: number) => Promise<void>;
  removeHabit: (id: string) => Promise<void>;
  toggleHabitDay: (habitId: string, date: string) => Promise<void>;

  addTimer: (draft: TimerDraft) => Promise<Timer | null>;
  startTimer: (id: string) => Promise<void>;
  pauseTimer: (id: string) => Promise<void>;
  resetTimer: (id: string) => Promise<void>;
  removeTimer: (id: string) => Promise<void>;
  refreshTimers: () => Promise<void>;
  settleTimers: () => Promise<db.FiredTimer[]>;

  setTheme: (theme: ThemeMode) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  saveAi: (ai: AiSettings) => Promise<void>;

  setFocusTask: (id: string | null) => void;
  tickFocus: () => void;
  persistFocusHeartbeat: (hidden?: boolean) => void;
  toggleFocus: () => Promise<void>;
  resetFocus: () => Promise<void>;
  resolveFocusRecovery: (
    action: "continue" | "settle_activity" | "settle_planned" | "abandon",
  ) => Promise<void>;
  setReminderSync: (status: ReminderSyncStatus) => void;
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  void syncWindowChrome(theme);
}

let lastFocusHeartbeatWrite = 0;
const FOCUS_HEARTBEAT_MS = 15_000;

export const useAppStore = create<AppStore>((set, get) => ({
  ready: false,
  error: null,
  tasks: [],
  trashTasks: [],
  tags: [],
  tagMap: {},
  smartLists: [],
  habits: [],
  habitChecks: [],
  timers: [],
  attachments: [],
  projects: [],
  taskTemplates: [],
  settings: {
    theme: "system",
    notifyAhead: 30,
    autostart: false,
    privacyMode: false,
    autoBackup: true,
    autoBackupLastOk: null,
    autoBackupLastError: null,
    autoBackupFailStreak: 0,
    desktopWidgetMode: "dashboard",
    desktopWidgetLayer: "bottom",
    ai: { baseUrl: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o-mini" },
    karma: 0,
    streak: 0,
    lastCompleteDate: null,
    onboardingComplete: false,
  },
  nav: "today",
  viewMode: "board",
  dateScope: "day",
  calendarCursor: todayDateString(),
  selectedTaskId: null,
  detailPreferEdit: false,
  createTaskOpen: false,
  activeTagId: null,
  activeSmartListId: null,
  filter: emptyFilter(),
  focusTaskId: null,
  focusSeconds: 25 * 60,
  focusEndsAt: null,
  focusRunning: false,
  focusSessionId: null,
  pendingFocusRecovery: null,
  reminderSync: EMPTY_REMINDER_SYNC,
  toast: null,
  canUndo: false,
  _undoAction: null,
  navigationGuard: null,

  bootstrap: async () => {
    try {
      const today = todayDateString();
      const rolled = await db.rolloverOverdueTasks();
      await db.backfillGeneratedFromIds();
      await get().refreshAll();
      applyTheme(get().settings.theme);
      const openFocus = await db.fetchOpenFocusSessions();
      const persistedFocus = await db.loadActiveFocus();
      if (!openFocus.length) {
        await db.saveActiveFocus(null);
      } else {
        const latest = openFocus[0];
        const extras = openFocus.slice(1);
        set({
          pendingFocusRecovery: interpretOpenFocus(
            latest,
            persistedFocus,
            Date.now(),
            25 * 60,
            extras,
          ),
        });
      }
      set({
        ready: true,
        error: null,
        calendarCursor: today,
        ...(rolled > 0
          ? { toast: `已将 ${rolled} 项逾期任务加入今日计划，截止日期未改` }
          : {}),
      });
    } catch (e) {
      const detail = errorMessage(e, "初始化失败");
      const diskHint =
        /space|磁盘|disk|full|os error 112|SQLITE_FULL|SQLITE_IOERR/i.test(
          detail,
        )
          ? "（系统盘空间不足，请清理 C 盘后重启）"
          : "";
      set({
        ready: true,
        error: `${detail}${diskHint}`,
      });
    }
  },

  maybeRollover: async () => {
    try {
      const today = todayDateString();
      const rolled = await db.rolloverOverdueTasks();
      const onTodayNav = get().nav === "today";
      const cursorStale = get().calendarCursor !== today;
      if (rolled > 0 || (onTodayNav && cursorStale)) {
        if (rolled > 0) await get().refreshAll();
        set({
          ...(onTodayNav || rolled > 0 ? { calendarCursor: today } : {}),
          ...(rolled > 0
            ? { toast: `已将 ${rolled} 项逾期任务加入今日计划，截止日期未改` }
            : {}),
        });
      }
    } catch {
      /* ignore rollover errors */
    }
  },

  refreshAll: async () => {
    const [
      tasks,
      trashTasks,
      tags,
      tagMap,
      smartLists,
      habits,
      habitChecks,
      timers,
      settings,
      projects,
      taskTemplates,
    ] = await Promise.all([
      db.fetchTasks(),
      db.fetchTrashTasks(),
      db.fetchTags(),
      db.fetchTaskTagMap(),
      db.fetchSmartLists(),
      db.fetchHabits(),
      db.fetchHabitChecks(),
      db.fetchTimers(),
      db.loadAppSettings(),
      db.fetchProjects(),
      db.fetchTaskTemplates(),
    ]);
    set((s) => ({
      tasks,
      trashTasks,
      tags,
      tagMap,
      smartLists,
      habits,
      habitChecks,
      timers,
      // Don't regress onboarding if a concurrent refresh raced ahead of persist.
      settings: {
        ...settings,
        onboardingComplete:
          s.settings.onboardingComplete || settings.onboardingComplete,
      },
      projects,
      taskTemplates,
    }));
    void emitDataChanged("refresh");
  },

  setNavigationGuard: (navigationGuard) => set({ navigationGuard }),
  setNav: (nav) => {
    if (nav === get().nav) return;
    const guard = get().navigationGuard;
    if (guard && !guard()) return;
    set({
      nav,
      selectedTaskId: null,
      dateScope:
        nav === "today" || nav === "myday" || nav === "inbox" || nav === "all"
          ? "day"
          : nav === "calendar"
            ? "month"
            : get().dateScope,
      calendarCursor:
        nav === "today" || nav === "myday" || nav === "week"
          ? todayDateString()
          : get().calendarCursor,
      viewMode:
        nav === "board"
          ? "board"
          : nav === "calendar"
            ? "calendar"
            : get().viewMode,
    });
  },
  setViewMode: (viewMode) => set({ viewMode }),
  setDateScope: (dateScope) => set({ dateScope }),
  setCalendarCursor: (calendarCursor) => set({ calendarCursor }),
  selectTask: (selectedTaskId, opts) =>
    set({
      selectedTaskId,
      detailPreferEdit: Boolean(opts?.edit),
    }),
  openCreateTask: () => set({ createTaskOpen: true, selectedTaskId: null }),
  closeCreateTask: () => set({ createTaskOpen: false }),
  setActiveTag: (activeTagId) => {
    const guard = get().navigationGuard;
    if (get().nav !== "tags" && guard && !guard()) return;
    set({ activeTagId, nav: "tags" });
  },
  setFilter: (patch) => set({ filter: { ...get().filter, ...patch } }),
  setToast: (toast) =>
    set({
      toast,
      ...(toast === null ? { canUndo: false, _undoAction: null } : {}),
    }),
  undo: async () => {
    const action = get()._undoAction;
    if (!action) return;
    set({ canUndo: false, _undoAction: null, toast: null });
    await action();
    set({ toast: "已撤销" });
  },

  addTask: async (draft) => {
    try {
      const task = await db.createTask(draft);
      await get().refreshAll();
      set({ toast: "已创建任务" });
      return task;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "创建失败" });
      return null;
    }
  },

  saveTask: async (id, updates) => {
    try {
      const updated = await db.updateTask(id, updates);
      if (updated) {
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? updated : task,
          ),
        }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "保存失败";
      set({ error: msg, toast: msg });
      throw e;
    }
  },

  toggleComplete: async (id) => {
    const before = get().tasks.find((task) => task.id === id);
    const { task } = await db.toggleTaskComplete(id);
    await get().refreshAll();
    if (before) {
      set({
        toast: task?.status === "completed" ? "任务已完成" : "已恢复为待办",
        canUndo: true,
        _undoAction: async () => {
          await db.toggleTaskComplete(id);
          await get().refreshAll();
        },
      });
    }
  },

  deleteTask: async (id) => {
    await db.softDeleteTask(id);
    set({
      selectedTaskId: null,
      toast: "任务已移入回收站",
      canUndo: true,
      _undoAction: async () => {
        await db.restoreTask(id);
        await get().refreshAll();
      },
    });
    await get().refreshAll();
  },

  batchComplete: async (ids) => {
    const toComplete = get()
      .tasks.filter((task) => ids.includes(task.id) && task.status !== "completed")
      .map((task) => task.id);
    if (!toComplete.length) return;
    await db.batchSetTaskStatus(toComplete, "completed");
    await get().refreshAll();
    set({
      toast: `已完成 ${toComplete.length} 项任务`,
      canUndo: true,
      _undoAction: async () => {
        await db.batchSetTaskStatus(toComplete, "pending");
        await get().refreshAll();
      },
    });
  },

  batchDelete: async (ids) => {
    await db.batchSoftDeleteTasks(ids);
    await get().refreshAll();
    set({
      selectedTaskId: null,
      toast: `已删除 ${ids.length} 项任务`,
      canUndo: true,
      _undoAction: async () => {
        await db.batchRestoreTasks(ids);
        await get().refreshAll();
      },
    });
  },

  restoreTask: async (id) => {
    await db.restoreTask(id);
    await get().refreshAll();
  },

  purgeTrash: async () => {
    await db.purgeTrash();
    await get().refreshAll();
  },

  reorder: async (ids) => {
    await db.reorderTasks(ids);
    await get().refreshAll();
  },

  addTag: async (name) => {
    await db.createTag(name);
    await get().refreshAll();
  },

  removeTag: async (id) => {
    await db.deleteTag(id);
    await get().refreshAll();
  },

  setTaskTags: async (taskId, tagIds) => {
    await db.setTaskTags(taskId, tagIds);
    await get().refreshAll();
  },

  addProject: async (name) => {
    await db.createProject(name);
    await get().refreshAll();
    set({ toast: "项目已创建" });
  },

  archiveProject: async (id) => {
    await db.archiveProject(id);
    await get().refreshAll();
    set({ toast: "项目已归档" });
  },

  saveTemplate: async (name, draft) => {
    await db.saveTaskTemplate(name, draft);
    await get().refreshAll();
    set({ toast: "任务模板已保存" });
  },

  useTemplate: async (id) => {
    const template = get().taskTemplates.find((item) => item.id === id);
    if (!template) return;
    const draft = JSON.parse(template.task_json) as TaskDraft;
    const variables = [
      ...new Set(JSON.stringify(draft).match(/\{\{([^}]+)\}\}/g) ?? []),
    ];
    let serialized = JSON.stringify(draft);
    for (const token of variables) {
      const value = window.prompt(`模板参数：${token.slice(2, -2)}`, "") ?? "";
      serialized = serialized.split(token).join(value);
    }
    const resolved = JSON.parse(serialized) as TaskDraft;
    const root = await get().addTask({
      ...resolved,
      title: resolved.title || template.name,
      due_date:
        resolved.relative_due_days != null
          ? addDays(todayDateString(), resolved.relative_due_days)
          : todayDateString(),
    });
    if (root) {
      for (const subtask of resolved.subtasks ?? []) {
        await get().addTask({
          ...subtask,
          parent_id: root.id,
          due_date: null,
        });
      }
    }
    set({ toast: `已从「${template.name}」创建任务` });
  },

  removeTemplate: async (id) => {
    await db.deleteTaskTemplate(id);
    await get().refreshAll();
  },

  saveSmartList: async (name) => {
    await db.createSmartList(name, get().filter);
    await get().refreshAll();
    set({ toast: "已保存智能列表" });
  },

  removeSmartList: async (id) => {
    await db.deleteSmartList(id);
    await get().refreshAll();
  },

  applySmartList: (id) => {
    const list = get().smartLists.find((s) => s.id === id);
    if (!list) return;
    const guard = get().navigationGuard;
    if (get().nav !== "all" && guard && !guard()) return;
    try {
      const filter = JSON.parse(list.filter_json) as FilterState;
      set({ filter, activeSmartListId: id, nav: "all" });
    } catch {
      /* ignore */
    }
  },

  addAttachment: async (taskId, data) => {
    await db.addAttachment(taskId, data);
    await get().loadAttachments(taskId);
  },

  removeAttachment: async (id) => {
    const taskId = get().selectedTaskId;
    await db.removeAttachment(id);
    if (taskId) await get().loadAttachments(taskId);
  },

  loadAttachments: async (taskId) => {
    const attachments = await db.fetchAttachments(taskId);
    set({ attachments });
  },

  addHabit: async (title, target = 3) => {
    await db.createHabit(title, target);
    await get().refreshAll();
  },

  removeHabit: async (id) => {
    await db.deleteHabit(id);
    await get().refreshAll();
  },

  toggleHabitDay: async (habitId, date) => {
    await db.toggleHabitCheck(habitId, date);
    await get().refreshAll();
  },

  addTimer: async (draft) => {
    try {
      const timer = await db.createTimer(draft);
      await get().refreshTimers();
      if (draft.start) {
        try {
          await invoke("start_timer_ui");
        } catch {
          /* ignore if not in tauri */
        }
        set({ toast: `「${timer.title}」已开始，主窗口已最小化` });
      } else {
        set({ toast: "已创建提醒" });
      }
      return timer;
    } catch (e) {
      set({ toast: e instanceof Error ? e.message : "创建提醒失败" });
      return null;
    }
  },

  startTimer: async (id) => {
    await db.startTimer(id);
    await get().refreshTimers();
    try {
      await invoke("start_timer_ui");
    } catch {
      /* ignore */
    }
    const t = get().timers.find((x) => x.id === id);
    set({ toast: t ? `「${t.title}」已开始，主窗口已最小化` : "提醒已开始" });
  },

  pauseTimer: async (id) => {
    await db.pauseTimer(id);
    await get().refreshTimers();
  },

  resetTimer: async (id) => {
    await db.resetTimer(id);
    await get().refreshTimers();
  },

  removeTimer: async (id) => {
    await db.deleteTimer(id);
    await get().refreshTimers();
  },

  refreshTimers: async () => {
    const timers = await db.fetchTimers();
    set({ timers });
  },

  settleTimers: async () => {
    const fired = await db.settleExpiredTimers();
    if (fired.length) {
      await get().refreshTimers();
    }
    return fired;
  },

  setTheme: async (theme) => {
    await db.setThemeSetting(theme);
    applyTheme(theme);
    set((s) => ({ settings: { ...s.settings, theme } }));
  },

  updateSettings: async (patch) => {
    // Apply optimistically so UI (e.g. onboarding dismiss) never waits on SQLite.
    const previous = get().settings;
    set((s) => ({ settings: { ...s.settings, ...patch } }));
    try {
      if (patch.notifyAhead !== undefined) {
        await db.setSetting("notify_ahead", String(patch.notifyAhead));
      }
      if (patch.autostart !== undefined) {
        await db.setSetting("autostart", String(patch.autostart));
      }
      if (patch.privacyMode !== undefined) {
        await db.setSetting("privacy_mode", String(patch.privacyMode));
      }
      if (patch.autoBackup !== undefined) {
        await db.setSetting("auto_backup", String(patch.autoBackup));
      }
      if (patch.desktopWidgetMode !== undefined) {
        await db.setSetting("desktop_widget_mode", patch.desktopWidgetMode);
      }
      if (patch.desktopWidgetLayer !== undefined) {
        await db.setSetting("desktop_widget_layer", patch.desktopWidgetLayer);
        const { openDesktopWidgets } = await import("@/lib/desktopWidgets");
        await openDesktopWidgets(
          get().settings.desktopWidgetMode,
          patch.desktopWidgetLayer,
        );
      }
      if (patch.onboardingComplete !== undefined) {
        await db.setSetting(
          "onboarding_complete",
          String(patch.onboardingComplete),
        );
      }
    } catch (e) {
      set((state) => {
        const settings = { ...state.settings };
        for (const key of Object.keys(patch) as (keyof AppSettings)[]) {
          if (Object.is(settings[key], patch[key])) {
            (settings as Record<keyof AppSettings, AppSettings[keyof AppSettings]>)[key] = previous[key];
          }
        }
        return {
          settings,
          toast: `设置保存失败，已恢复原设置：${errorMessage(e, "未知错误")}`,
        };
      });
    }
  },

  saveAi: async (ai) => {
    await db.saveAiSettings(ai);
    set((s) => ({ settings: { ...s.settings, ai }, toast: "AI 设置已保存" }));
  },

  setFocusTask: (focusTaskId) => {
    // Re-binding the same task must not wipe an in-progress session
    // (detail drawer / pomodoro panel sync often re-calls this).
    if (get().focusTaskId === focusTaskId) {
      set({ focusTaskId });
      return;
    }
    if (get().focusRunning) {
      set({ toast: "已有专注任务正在进行，请先暂停后再切换" });
      return;
    }
    set({
      focusTaskId,
      focusSeconds: 25 * 60,
      focusEndsAt: null,
      focusRunning: false,
      focusSessionId: null,
    });
  },
  tickFocus: () => {
    const { focusRunning, focusEndsAt, focusSessionId } = get();
    if (!focusRunning || focusEndsAt === null) return;
    const next = remainingFocusSeconds(focusEndsAt);
    set({ focusSeconds: next });
    if (Date.now() - lastFocusHeartbeatWrite >= FOCUS_HEARTBEAT_MS) {
      lastFocusHeartbeatWrite = Date.now();
      get().persistFocusHeartbeat();
    }
    if (next === 0 && focusSessionId) {
      void db.finishFocusSession(focusSessionId).then(async () => {
        await db.saveActiveFocus(null);
        await get().refreshAll();
      });
      set({
        focusRunning: false,
        focusEndsAt: null,
        focusSessionId: null,
        toast: "专注完成，已记录实际耗时",
      });
    }
  },
  persistFocusHeartbeat: (hidden = false) => {
    const { focusRunning, focusSessionId, focusTaskId, focusEndsAt, focusSeconds } =
      get();
    if (!focusRunning || !focusSessionId || focusEndsAt == null) return;
    lastFocusHeartbeatWrite = Date.now();
    void db.saveActiveFocus({
      sessionId: focusSessionId,
      taskId: focusTaskId,
      endsAt: focusEndsAt,
      plannedSec: Math.max(focusSeconds, 1),
      lastHeartbeatAt: Date.now(),
      hiddenAt: hidden ? Date.now() : null,
    });
  },
  toggleFocus: async () => {
    const { focusRunning, focusSessionId, focusTaskId, focusSeconds, focusEndsAt } =
      get();
    if (focusRunning) {
      const remaining = remainingFocusSeconds(focusEndsAt);
      if (focusSessionId) {
        await db.finishFocusSession(focusSessionId, "手动暂停");
      }
      await db.saveActiveFocus(null);
      set({
        focusRunning: false,
        focusEndsAt: null,
        focusSeconds: remaining > 0 ? remaining : focusSeconds,
        focusSessionId: null,
        toast: "本次专注时间已记录",
      });
      await get().refreshAll();
      return;
    }
    const session = await db.startFocusSession(focusTaskId);
    const plannedSec = focusSeconds;
    const endsAt = focusEndsAtFromRemaining(plannedSec);
    await db.saveActiveFocus({
      sessionId: session.id,
      taskId: focusTaskId,
      endsAt,
      plannedSec,
      lastHeartbeatAt: Date.now(),
      hiddenAt: null,
    });
    set({
      focusRunning: true,
      focusSessionId: session.id,
      focusEndsAt: endsAt,
      focusSeconds: remainingFocusSeconds(endsAt),
    });
  },
  resetFocus: async () => {
    const { focusSessionId } = get();
    if (focusSessionId) {
      await db.finishFocusSession(focusSessionId, "重置计时器");
      await get().refreshAll();
    }
    await db.saveActiveFocus(null);
    set({
      focusSeconds: 25 * 60,
      focusEndsAt: null,
      focusRunning: false,
      focusSessionId: null,
    });
  },
  resolveFocusRecovery: async (action) => {
    const pending = get().pendingFocusRecovery;
    if (!pending) return;
    const extraEndedAt = (startedAt: string) => {
      if (action === "abandon" || action === "settle_activity") return startedAt;
      const started = Date.parse(startedAt);
      const plannedMs = Math.max(
        0,
        pending.plannedSettleAt - new Date(pending.session.started_at).getTime(),
      );
      const plannedEnd = started + plannedMs;
      if (action === "continue") {
        return new Date(Math.min(Date.now(), plannedEnd)).toISOString();
      }
      return new Date(plannedEnd).toISOString();
    };
    const finishExtras = async () => {
      const reason =
        action === "abandon" ? "异常退出，已放弃" : "异常退出后结算";
      for (const extra of pending.extras) {
        await db.finishFocusSession(extra.id, reason, extraEndedAt(extra.started_at));
      }
    };
    if (action === "continue" && pending.canContinue && pending.endsAt) {
      await finishExtras();
      await db.saveActiveFocus({
        sessionId: pending.session.id,
        taskId: pending.session.task_id,
        endsAt: pending.endsAt,
        plannedSec: Math.max(pending.remainingSec, 1),
        lastHeartbeatAt: Date.now(),
        hiddenAt: null,
      });
      set({
        pendingFocusRecovery: null,
        focusTaskId: pending.session.task_id,
        focusSessionId: pending.session.id,
        focusEndsAt: pending.endsAt,
        focusSeconds: pending.remainingSec,
        focusRunning: true,
        toast: pending.extraCount
          ? `已继续上次专注，另外 ${pending.extraCount} 条已按计划时长结算`
          : "已继续上次专注",
      });
      return;
    }
    const abandon = action === "abandon";
    const endedAt = abandon
      ? pending.session.started_at
      : new Date(
          action === "settle_planned"
            ? pending.plannedSettleAt
            : pending.activitySettleAt,
        ).toISOString();
    await db.finishFocusSession(
      pending.session.id,
      abandon ? "异常退出，已放弃" : "异常退出后结算",
      endedAt,
    );
    await finishExtras();
    await db.saveActiveFocus(null);
    set({
      pendingFocusRecovery: null,
      focusSessionId: null,
      focusEndsAt: null,
      focusRunning: false,
      toast: abandon
        ? "已放弃上次未结束的专注"
        : action === "settle_planned"
          ? "已按计划时长结算专注"
          : "已按最后活动时间结算专注",
    });
    await get().refreshAll();
  },
  setReminderSync: (reminderSync) => set({ reminderSync }),
}));
