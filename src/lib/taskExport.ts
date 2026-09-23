import type { Task } from "@/types";
import { addDays, startOfWeek, todayDateString, toDateString } from "@/lib/dates";
import { isActiveTask } from "@/lib/tasks";

export type TaskExportPeriod = "week" | "month" | "quarter";

export type TaskExportRange = {
  period: TaskExportPeriod;
  start: string;
  end: string;
  label: string;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function taskExportRange(
  period: TaskExportPeriod,
  anchor = todayDateString(),
): TaskExportRange {
  const [year, month] = anchor.split("-").map(Number);
  if (period === "week") {
    const start = startOfWeek(anchor);
    const end = addDays(start, 6);
    return { period, start, end, label: `${start} ～ ${end}` };
  }
  if (period === "month") {
    const start = `${year}-${pad(month)}-01`;
    const last = new Date(year, month, 0).getDate();
    const end = `${year}-${pad(month)}-${pad(last)}`;
    return { period, start, end, label: `${year}年${month}月` };
  }
  const quarter = Math.floor((month - 1) / 3);
  const startMonth = quarter * 3 + 1;
  const endMonth = startMonth + 2;
  const start = `${year}-${pad(startMonth)}-01`;
  const last = new Date(year, endMonth, 0).getDate();
  const end = `${year}-${pad(endMonth)}-${pad(last)}`;
  return {
    period,
    start,
    end,
    label: `${year}年Q${quarter + 1}`,
  };
}

function taskAnchorDate(task: Task): string | null {
  return task.due_date || task.my_day_date || task.completed_at?.slice(0, 10) || null;
}

export function tasksInExportRange(tasks: Task[], range: TaskExportRange): Task[] {
  return tasks.filter((task) => {
    if (task.parent_id || task.deleted_at) return false;
    const date = taskAnchorDate(task);
    return Boolean(date && date >= range.start && date <= range.end);
  });
}

function csvCell(value: string | number | null | undefined) {
  return JSON.stringify(value == null ? "" : String(value));
}

export function buildTaskExportCsv(
  tasks: Task[],
  range: TaskExportRange,
  tagMap: Record<string, string[]> = {},
  tags: { id: string; name: string }[] = [],
): string {
  const tagName = (id: string) => tags.find((tag) => tag.id === id)?.name ?? id;
  const header = [
    "id",
    "title",
    "status",
    "priority",
    "due_date",
    "due_time",
    "end_time",
    "my_day_date",
    "completed_at",
    "tags",
    "description",
  ].join(",");
  const rows = tasksInExportRange(tasks, range).map((task) =>
    [
      csvCell(task.id),
      csvCell(task.title),
      csvCell(task.status),
      csvCell(task.priority),
      csvCell(task.due_date),
      csvCell(task.due_time),
      csvCell(task.end_time),
      csvCell(task.my_day_date),
      csvCell(task.completed_at),
      csvCell((tagMap[task.id] ?? []).map(tagName).join("|")),
      csvCell(task.description),
    ].join(","),
  );
  return [`# ${range.label}`, `# 未完成 ${tasksInExportRange(tasks, range).filter(isActiveTask).length} 项`, header, ...rows].join("\n");
}

export function defaultTaskExportName(range: TaskExportRange) {
  return `grow-with-time-tasks-${range.period}-${toDateString(new Date())}.csv`;
}
