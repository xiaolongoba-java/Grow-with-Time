import type { Anniversary, Memo, Task } from "@/types";
import { archiveMemo, createMemo, fetchMemos, updateMemo } from "@/lib/db/memos";
import { createTask, fetchTasks, toggleTaskComplete } from "@/lib/db/tasks";
import { fetchAnniversaries } from "@/lib/db/moments";

export async function widgetLoadTasks(): Promise<Task[]> {
  return fetchTasks();
}

export async function widgetLoadMemos(): Promise<Memo[]> {
  return fetchMemos();
}

export async function widgetLoadAnniversaries(): Promise<Anniversary[]> {
  return fetchAnniversaries();
}

export async function widgetCreateTask(title: string, dueDate: string): Promise<void> {
  await createTask({ title, due_date: dueDate });
}

export async function widgetToggleTask(id: string): Promise<void> {
  await toggleTaskComplete(id);
}

export async function widgetCreateMemo(content: string): Promise<void> {
  await createMemo(content);
}

export async function widgetUpdateMemo(
  id: string,
  payload: { title?: string; content?: string; pinned?: number; archived?: number },
): Promise<void> {
  await updateMemo(id, payload);
}

export async function widgetArchiveMemo(id: string): Promise<void> {
  await archiveMemo(id);
}
