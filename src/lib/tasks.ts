import type { FilterState, Task, TaskPriority } from "@/types";
import { isOverdue, todayDateString } from "@/lib/dates";

export function isActiveTask(task: Task): boolean {
  return task.status !== "completed" && task.status !== "cancelled";
}

export function filterTasksByView(
  tasks: Task[],
  view: string,
  tagMap: Record<string, string[]> = {},
  activeTagId: string | null = null,
  filter: FilterState | null = null,
): Task[] {
  const roots = tasks.filter((t) => !t.parent_id);
  let list = roots;

  const today = todayDateString();

  switch (view) {
    case "today":
      list = list.filter(
        (t) =>
          isActiveTask(t) && t.due_date !== null && t.due_date <= today,
      );
      break;
    case "myday":
      list = list.filter(
        (t) => isActiveTask(t) && t.my_day_date === today,
      );
      break;
    case "inbox":
      list = list.filter((t) => isActiveTask(t) && t.due_date === null);
      break;
    case "completed":
      list = list.filter((t) => t.status === "completed");
      break;
    case "all":
    case "board":
    case "calendar":
      break;
    case "tags":
      if (activeTagId) {
        list = list.filter((t) => tagMap[t.id]?.includes(activeTagId));
      }
      break;
    default:
      break;
  }

  if (filter) {
    list = applyFilter(list, filter, tagMap);
  }

  return sortTasks(list);
}

export function applyFilter(
  tasks: Task[],
  filter: FilterState,
  tagMap: Record<string, string[]>,
): Task[] {
  return tasks.filter((task) => {
    if (filter.keyword) {
      const kw = filter.keyword.toLowerCase();
      const hit =
        task.title.toLowerCase().includes(kw) ||
        task.description.toLowerCase().includes(kw) ||
        task.notes.toLowerCase().includes(kw);
      if (!hit) return false;
    }
    if (filter.dateFrom && (!task.due_date || task.due_date < filter.dateFrom)) {
      return false;
    }
    if (filter.dateTo && (!task.due_date || task.due_date > filter.dateTo)) {
      return false;
    }
    if (
      filter.priorities.length &&
      !filter.priorities.includes(task.priority as TaskPriority)
    ) {
      return false;
    }
    if (filter.tagIds.length) {
      const tags = tagMap[task.id] ?? [];
      if (!filter.tagIds.every((id) => tags.includes(id))) return false;
    }
    return true;
  });
}

export function sortTasks(tasks: Task[]): Task[] {
  const pending = tasks
    .filter(isActiveTask)
    .sort((a, b) => a.sort_order - b.sort_order);
  const completed = tasks
    .filter((t) => t.status === "completed")
    .sort((a, b) =>
      (b.completed_at ?? b.updated_at).localeCompare(
        a.completed_at ?? a.updated_at,
      ),
    );
  return [...pending, ...completed];
}

export function getSubtasks(tasks: Task[], parentId: string): Task[] {
  return tasks
    .filter((t) => t.parent_id === parentId && !t.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function subtaskProgress(tasks: Task[], parentId: string): number {
  const subs = getSubtasks(tasks, parentId);
  if (!subs.length) return 0;
  return subs.filter((t) => t.status === "completed").length / subs.length;
}

export function getEmptyMessage(view: string): string {
  switch (view) {
    case "today":
      return "今天没有待办，享受片刻空闲。";
    case "inbox":
      return "待办箱是空的。";
    case "completed":
      return "还没有完成的任务。";
    case "habits":
      return "创建第一个习惯开始追踪。";
    case "reminders":
      return "还没有提醒，创建一个循环倒计时吧。";
    case "trash":
      return "回收站是空的。";
    default:
      return "还没有任务，点击新建开始。";
  }
}

export function getViewTitle(view: string): string {
  const map: Record<string, string> = {
    today: "今日",
    myday: "我的一天",
    inbox: "待办箱",
    completed: "已完成",
    all: "全部任务",
    board: "看板",
    calendar: "日历",
    tags: "标签",
    habits: "习惯",
    reminders: "提醒",
    memos: "备忘录",
    review: "复盘",
    trash: "回收站",
    settings: "设置",
    smart: "智能列表",
  };
  return map[view] ?? "Grow with Time";
}

export function taskRowClassName(task: Task, selected: boolean): string {
  const classes = ["task-row"];
  if (selected) classes.push("is-selected");
  if (task.status === "completed") classes.push("is-completed");
  if (isOverdue(task)) classes.push("is-overdue");
  return classes.join(" ");
}

export function boardColumns(tasks: Task[]) {
  const roots = sortTasks(tasks.filter((t) => !t.parent_id));
  return {
    pending: roots.filter((t) => isActiveTask(t) && !isOverdue(t)),
    overdue: roots.filter((t) => isOverdue(t)),
    completed: roots.filter((t) => t.status === "completed"),
  };
}
