import { create } from "zustand";
import type {
  AiSettings,
  AppSettings,
  Attachment,
  FilterState,
  Habit,
  HabitCheck,
  NavId,
  SmartList,
  Tag,
  Task,
  TaskDraft,
  TaskUpdate,
  ThemeMode,
  ViewMode,
  DateScope,
} from "@/types";
import * as db from "@/lib/db";
import { bumpGamification } from "@/lib/db";
import { todayDateString } from "@/lib/dates";

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
  attachments: Attachment[];
  settings: AppSettings;
  nav: NavId;
  viewMode: ViewMode;
  dateScope: DateScope;
  calendarCursor: string;
  selectedTaskId: string | null;
  activeTagId: string | null;
  activeSmartListId: string | null;
  filter: FilterState;
  focusTaskId: string | null;
  focusSeconds: number;
  focusRunning: boolean;
  toast: string | null;

  bootstrap: () => Promise<void>;
  refreshAll: () => Promise<void>;
  setNav: (nav: NavId) => void;
  setViewMode: (mode: ViewMode) => void;
  setDateScope: (scope: DateScope) => void;
  setCalendarCursor: (date: string) => void;
  selectTask: (id: string | null) => void;
  setActiveTag: (id: string | null) => void;
  setFilter: (patch: Partial<FilterState>) => void;
  setToast: (msg: string | null) => void;

  addTask: (draft: TaskDraft) => Promise<Task | null>;
  saveTask: (id: string, updates: TaskUpdate) => Promise<void>;
  toggleComplete: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  restoreTask: (id: string) => Promise<void>;
  purgeTrash: () => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;

  addTag: (name: string) => Promise<void>;
  removeTag: (id: string) => Promise<void>;
  setTaskTags: (taskId: string, tagIds: string[]) => Promise<void>;

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

  setTheme: (theme: ThemeMode) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  saveAi: (ai: AiSettings) => Promise<void>;

  setFocusTask: (id: string | null) => void;
  tickFocus: () => void;
  toggleFocus: () => void;
  resetFocus: () => void;
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
  attachments: [],
  settings: {
    theme: "system",
    notifyAhead: 30,
    autostart: false,
    privacyMode: true,
    ai: { baseUrl: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o-mini" },
    karma: 0,
    streak: 0,
    lastCompleteDate: null,
  },
  nav: "today",
  viewMode: "board",
  dateScope: "day",
  calendarCursor: todayDateString(),
  selectedTaskId: null,
  activeTagId: null,
  activeSmartListId: null,
  filter: emptyFilter(),
  focusTaskId: null,
  focusSeconds: 25 * 60,
  focusRunning: false,
  toast: null,

  bootstrap: async () => {
    try {
      await get().refreshAll();
      applyTheme(get().settings.theme);
      set({ ready: true, error: null });
    } catch (e) {
      set({
        ready: true,
        error: e instanceof Error ? e.message : "初始化失败",
      });
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
      settings,
    ] = await Promise.all([
      db.fetchTasks(),
      db.fetchTrashTasks(),
      db.fetchTags(),
      db.fetchTaskTagMap(),
      db.fetchSmartLists(),
      db.fetchHabits(),
      db.fetchHabitChecks(),
      db.loadAppSettings(),
    ]);
    set({
      tasks,
      trashTasks,
      tags,
      tagMap,
      smartLists,
      habits,
      habitChecks,
      settings,
    });
  },

  setNav: (nav) =>
    set({
      nav,
      selectedTaskId: null,
      dateScope:
        nav === "today" || nav === "inbox" || nav === "all"
          ? "day"
          : nav === "calendar"
            ? "month"
            : get().dateScope,
      calendarCursor:
        nav === "today" ? todayDateString() : get().calendarCursor,
      viewMode:
        nav === "board"
          ? "board"
          : nav === "calendar"
            ? "calendar"
            : get().viewMode,
    }),
  setViewMode: (viewMode) => set({ viewMode }),
  setDateScope: (dateScope) => set({ dateScope }),
  setCalendarCursor: (calendarCursor) => set({ calendarCursor }),
  selectTask: (selectedTaskId) => set({ selectedTaskId }),
  setActiveTag: (activeTagId) => set({ activeTagId, nav: "tags" }),
  setFilter: (patch) => set({ filter: { ...get().filter, ...patch } }),
  setToast: (toast) => set({ toast }),

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
      await db.updateTask(id, updates);
      await get().refreshAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "保存失败";
      set({ error: msg, toast: msg });
      throw e;
    }
  },

  toggleComplete: async (id) => {
    const { task } = await db.toggleTaskComplete(id);
    if (task?.status === "completed") {
      const g = await bumpGamification();
      set((s) => ({
        settings: { ...s.settings, karma: g.karma, streak: g.streak },
        toast: `+10 Karma · 连击 ${g.streak} 天`,
      }));
    }
    await get().refreshAll();
  },

  deleteTask: async (id) => {
    await db.softDeleteTask(id);
    set({ selectedTaskId: null });
    await get().refreshAll();
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
    set((s) => ({ settings: { ...s.settings, ...patch } }));
  },

  saveAi: async (ai) => {
    await db.saveAiSettings(ai);
    set((s) => ({ settings: { ...s.settings, ai }, toast: "AI 设置已保存" }));
  },

  setFocusTask: (focusTaskId) =>
    set({ focusTaskId, focusSeconds: 25 * 60, focusRunning: false }),
  tickFocus: () => {
    const { focusRunning, focusSeconds } = get();
    if (!focusRunning || focusSeconds <= 0) return;
    set({ focusSeconds: focusSeconds - 1 });
  },
  toggleFocus: () => set({ focusRunning: !get().focusRunning }),
  resetFocus: () => set({ focusSeconds: 25 * 60, focusRunning: false }),
}));
