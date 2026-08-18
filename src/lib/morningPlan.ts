import type { Task } from "@/types";
import { parseRepeatRule } from "@/lib/repeat";
import { isActiveTask } from "@/lib/tasks";

export type MorningPlanReason =
  | "carryover"
  | "overdue"
  | "due_today"
  | "inbox"
  | "project"
  | "repeating";

export type MorningPlanItem = {
  id: string;
  title: string;
  priority: number;
  dueDate: string | null;
  estimatedMinutes: number | null;
  projectId: string | null;
  reason: MorningPlanReason;
  selectedByDefault: boolean;
};

const REASON_RANK: Record<MorningPlanReason, number> = {
  carryover: 0,
  overdue: 1,
  due_today: 2,
  inbox: 3,
  repeating: 4,
  project: 5,
};

const PICK_LIMIT = 80;

export function isPickableMorningTask(task: Task, today: string): boolean {
  return !task.parent_id && !task.deleted_at && isActiveTask(task) && task.my_day_date !== today;
}

export function classifyMorningCandidate(
  task: Task,
  today: string,
): MorningPlanReason | null {
  if (!isPickableMorningTask(task, today)) return null;
  if (task.my_day_date && task.my_day_date < today) return "carryover";
  if (task.due_date && task.due_date < today) return "overdue";
  if (task.due_date === today) return "due_today";
  if (!task.due_date && task.priority <= 2) return "inbox";
  return null;
}

function toMorningItem(
  task: Task,
  today: string,
  fallback: MorningPlanReason,
): MorningPlanItem {
  const reason = classifyMorningCandidate(task, today) ?? fallback;
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    dueDate: task.due_date,
    estimatedMinutes: task.estimated_minutes,
    projectId: task.project_id,
    reason,
    selectedByDefault:
      reason !== "inbox" && reason !== "project" && reason !== "repeating",
  };
}

function sortMorningItems(items: MorningPlanItem[]): MorningPlanItem[] {
  return items.sort(
    (left, right) =>
      REASON_RANK[left.reason] - REASON_RANK[right.reason] ||
      left.priority - right.priority ||
      (left.dueDate ?? "").localeCompare(right.dueDate ?? "") ||
      left.title.localeCompare(right.title, "zh"),
  );
}

export function fallbackMorningReason(task: Task): MorningPlanReason {
  if (parseRepeatRule(task.repeat_rule)) return "repeating";
  if (task.project_id) return "project";
  return "inbox";
}

export function buildTodayPlanPicker(
  tasks: Task[],
  today: string,
  limit = PICK_LIMIT,
): MorningPlanItem[] {
  const items: MorningPlanItem[] = [];
  for (const task of tasks) {
    if (!isPickableMorningTask(task, today)) continue;
    items.push(toMorningItem(task, today, fallbackMorningReason(task)));
  }
  return sortMorningItems(items).slice(0, limit);
}

export function buildMorningPlan(
  tasks: Task[],
  today: string,
  limit = 24,
): MorningPlanItem[] {
  const items: MorningPlanItem[] = [];
  for (const task of tasks) {
    const reason = classifyMorningCandidate(task, today);
    if (!reason) continue;
    items.push(toMorningItem(task, today, reason));
  }
  return sortMorningItems(items).slice(0, limit);
}

export function listRepeatingMorningTasks(
  tasks: Task[],
  today: string,
  limit = PICK_LIMIT,
): MorningPlanItem[] {
  const items: MorningPlanItem[] = [];
  for (const task of tasks) {
    if (!isPickableMorningTask(task, today) || !parseRepeatRule(task.repeat_rule)) continue;
    items.push(toMorningItem(task, today, "repeating"));
  }
  return sortMorningItems(items).slice(0, limit);
}

export function listProjectMorningTasks(
  tasks: Task[],
  today: string,
  projectId: string,
  limit = PICK_LIMIT,
): MorningPlanItem[] {
  const items: MorningPlanItem[] = [];
  for (const task of tasks) {
    if (!isPickableMorningTask(task, today) || task.project_id !== projectId) continue;
    items.push(toMorningItem(task, today, "project"));
  }
  return sortMorningItems(items).slice(0, limit);
}
