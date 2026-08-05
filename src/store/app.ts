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
import { bumpGamification } from "@/lib/db";
import { addDays, todayDateString } from "@/lib/dates";
import { invoke } from "@tauri-apps/api/core";

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
  focusRunning: boolean;
  focusSessionId: string | null;
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
  toggleFocus: () => Promise<void>;
  resetFocus: () => Promise<void>;
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
}

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
    privacyMode: true,
    autoBackup: true,
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
  focusRunning: false,
  focusSessionId: null,
  toast: null,
  canUndo: false,
  _undoAction: null,
  navigationGuard: null,

  bootstrap: async () => {
    try {
      const today = todayDateString();
      const rolled = await db.rolloverOverdueTasks();
      await get().refreshAll();
      applyTheme(get().settings.theme);
      set({
        ready: true,
        error: null,
        calendarCursor: today,
        ...(rolled > 0
          ? { toast: `已将 ${rolled} 项未完成任务顺延至今日` }
          : {}),
      });
    } catch (e) {
      set({
        ready: true,
        error: e instanceof Error ? e.message : "初始化失败",
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
            ? { toast: `已将 ${rolled} 项未完成任务顺延至今日` }
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
    set({
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
    });
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
        nav === "today" || nav === "myday"
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
    if (task?.status === "completed") {
      const g = await bumpGamification();
      set((s) => ({
        settings: { ...s.settings, karma: g.karma, streak: g.streak },
        toast: `+10 Karma · 连击 ${g.streak} 天`,
      }));
    }
    await get().refreshAll();
    if (before) {
      set({
        toast: task?.status === "completed" ? "任务已完成" : "已恢复为待办",
        canUndo: true,
        _undoAction: async () => {
          await db.updateTask(id, { status: before.status });
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
    const previous = get().tasks
      .filter((task) => ids.includes(task.id))
      .map((task) => ({ id: task.id, status: task.status }));
    await db.batchSetTaskStatus(ids, "completed");
    await get().refreshAll();
    set({
      toast: `已完成 ${ids.length} 项任务`,
      canUndo: true,
      _undoAction: async () => {
        for (const status of [...new Set(previous.map((item) => item.status))]) {
          await db.batchSetTaskStatus(
            previous
              .filter((item) => item.status === status)
              .map((item) => item.id),
            status,
          );
        }
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
    if (patch.onboardingComplete !== undefined) {
      await db.setSetting(
        "onboarding_complete",
        String(patch.onboardingComplete),
      );
    }
    set((s) => ({ settings: { ...s.settings, ...patch } }));
  },

  saveAi: async (ai) => {
    await db.saveAiSettings(ai);
    set((s) => ({ settings: { ...s.settings, ai }, toast: "AI 设置已保存" }));
  },

  setFocusTask: (focusTaskId) =>
    set({
      focusTaskId,
      focusSeconds: 25 * 60,
      focusRunning: false,
      focusSessionId: null,
    }),
  tickFocus: () => {
    const { focusRunning, focusSeconds } = get();
    if (!focusRunning || focusSeconds <= 0) return;
    const next = focusSeconds - 1;
    set({ focusSeconds: next });
    if (next === 0 && get().focusSessionId) {
      const sessionId = get().focusSessionId!;
      void db.finishFocusSession(sessionId).then(() => get().refreshAll());
      set({ focusRunning: false, focusSessionId: null, toast: "专注完成，已记录实际耗时" });
    }
  },
  toggleFocus: async () => {
    const { focusRunning, focusSessionId, focusTaskId } = get();
    if (focusRunning) {
      if (focusSessionId) {
        await db.finishFocusSession(focusSessionId, "手动暂停");
      }
      set({
        focusRunning: false,
        focusSessionId: null,
        toast: "本次专注时间已记录",
      });
      await get().refreshAll();
      return;
    }
    const session = await db.startFocusSession(focusTaskId);
    set({ focusRunning: true, focusSessionId: session.id });
  },
  resetFocus: async () => {
    const { focusSessionId } = get();
    if (focusSessionId) {
      await db.finishFocusSession(focusSessionId, "重置计时器");
      await get().refreshAll();
    }
    set({
      focusSeconds: 25 * 60,
      focusRunning: false,
      focusSessionId: null,
    });
  },
}));
