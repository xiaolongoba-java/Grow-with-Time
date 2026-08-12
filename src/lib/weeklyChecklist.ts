import { addDays } from "@/lib/dates";
import { localDateKey, localWeekStartKey } from "@/lib/growth";
import { isActiveTask } from "@/lib/tasks";
import type { Tag, Task } from "@/types";

export type WeeklyCategoryId = "work" | "life" | "health" | "learning" | "other";

export type WeeklyCategory = {
  id: WeeklyCategoryId;
  label: string;
  color: string;
  aliases: string[];
};

export const WEEKLY_CATEGORIES: WeeklyCategory[] = [
  {
    id: "work",
    label: "工作",
    color: "#f0a05a",
    aliases: ["工作", "工作事项", "work", "job", "career"],
  },
  {
    id: "life",
    label: "生活",
    color: "#8b7cf6",
    aliases: ["生活", "日常", "life", "home"],
  },
  {
    id: "health",
    label: "健康",
    color: "#3ecf8e",
    aliases: ["健康", "运动", "health", "fitness", "sport"],
  },
  {
    id: "learning",
    label: "学习",
    color: "#f472b6",
    aliases: ["学习", "成长", "learning", "study", "read"],
  },
];

export function mondayWeekDates(anchor: string): string[] {
  const start = localWeekStartKey(new Date(`${anchor}T12:00:00`));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function shiftWeek(anchor: string, deltaWeeks: number): string {
  return addDays(localWeekStartKey(new Date(`${anchor}T12:00:00`)), deltaWeeks * 7);
}

export function taskDateInWeek(task: Task): string | null {
  if (task.due_date) return task.due_date;
  if (task.my_day_date) return task.my_day_date;
  if (task.completed_at) {
    const stamp = Date.parse(task.completed_at);
    if (!Number.isNaN(stamp)) return localDateKey(new Date(stamp));
  }
  return null;
}

export function isTaskInWeek(task: Task, weekStart: string, weekEnd: string): boolean {
  if (task.parent_id || task.deleted_at) return false;
  if (task.status === "cancelled") return false;

  const dates = new Set<string>();
  if (task.due_date) dates.add(task.due_date);
  if (task.my_day_date) dates.add(task.my_day_date);
  if (task.completed_at) {
    const stamp = Date.parse(task.completed_at);
    if (!Number.isNaN(stamp)) dates.add(localDateKey(new Date(stamp)));
  }

  for (const date of dates) {
    if (date >= weekStart && date <= weekEnd) return true;
  }
  return false;
}

export function resolveCategoryId(
  taskId: string,
  tagMap: Record<string, string[]>,
  tags: Tag[],
): WeeklyCategoryId {
  const ids = tagMap[taskId] ?? [];
  if (!ids.length) return "other";
  const names = ids
    .map((id) => tags.find((tag) => tag.id === id)?.name?.trim().toLowerCase())
    .filter(Boolean) as string[];

  for (const category of WEEKLY_CATEGORIES) {
    if (
      category.aliases.some((alias) =>
        names.includes(alias.toLowerCase()),
      )
    ) {
      return category.id;
    }
  }
  return "other";
}

export function categoryColor(
  categoryId: WeeklyCategoryId,
  fallback = "#94a3b8",
): string {
  return WEEKLY_CATEGORIES.find((item) => item.id === categoryId)?.color ?? fallback;
}

export type DayBucket = {
  date: string;
  tasks: Task[];
  done: number;
  total: number;
};

export type CategoryBucket = {
  category: WeeklyCategory;
  tasks: Task[];
  done: number;
  total: number;
  progress: number;
};

export type WeekStats = {
  total: number;
  done: number;
  remaining: number;
  peakDay: string | null;
  peakDone: number;
  peakTotal: number;
  streakDays: number;
  load: number[];
};

export function buildWeekBuckets(
  tasks: Task[],
  weekDates: string[],
  tagMap: Record<string, string[]>,
  tags: Tag[],
): {
  days: DayBucket[];
  categories: CategoryBucket[];
  stats: WeekStats;
  uncategorizedHint: boolean;
} {
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];
  const weekTasks = tasks.filter((task) => isTaskInWeek(task, weekStart, weekEnd));

  const days: DayBucket[] = weekDates.map((date) => {
    const dayTasks = weekTasks.filter((task) => {
      const primary =
        task.due_date && task.due_date >= weekStart && task.due_date <= weekEnd
          ? task.due_date
          : task.my_day_date &&
              task.my_day_date >= weekStart &&
              task.my_day_date <= weekEnd
            ? task.my_day_date
            : taskDateInWeek(task);
      return primary === date;
    });
    const done = dayTasks.filter((task) => task.status === "completed").length;
    return { date, tasks: dayTasks, done, total: dayTasks.length };
  });

  const categories: CategoryBucket[] = WEEKLY_CATEGORIES.map((category) => {
    const list = weekTasks.filter(
      (task) => resolveCategoryId(task.id, tagMap, tags) === category.id,
    );
    const done = list.filter((task) => task.status === "completed").length;
    const total = list.length;
    return {
      category,
      tasks: list,
      done,
      total,
      progress: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  });

  const total = weekTasks.length;
  const done = weekTasks.filter((task) => task.status === "completed").length;
  let peakDay: string | null = null;
  let peakDone = 0;
  let peakTotal = 0;
  for (const day of days) {
    if (day.total > peakTotal || (day.total === peakTotal && day.done > peakDone)) {
      peakDay = day.date;
      peakDone = day.done;
      peakTotal = day.total;
    }
  }

  let streakDays = 0;
  for (const day of days) {
    if (day.total > 0 && day.done === day.total) streakDays += 1;
  }

  const maxLoad = Math.max(1, ...days.map((day) => day.total));
  const load = days.map((day) => day.total / maxLoad);

  const tagged = weekTasks.some(
    (task) => resolveCategoryId(task.id, tagMap, tags) !== "other",
  );

  return {
    days,
    categories,
    stats: {
      total,
      done,
      remaining: Math.max(0, total - done),
      peakDay,
      peakDone,
      peakTotal,
      streakDays,
      load,
    },
    uncategorizedHint: total > 0 && !tagged,
  };
}

export function weekdayShort(date: string): string {
  const day = new Date(`${date}T12:00:00`).getDay();
  return ["日", "一", "二", "三", "四", "五", "六"][day];
}

export function isCompletedLike(task: Task): boolean {
  return task.status === "completed" || !isActiveTask(task);
}
