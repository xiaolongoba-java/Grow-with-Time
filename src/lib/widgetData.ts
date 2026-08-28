import type { Anniversary, Memo, Task } from "@/types";
import { archiveMemo, createMemo, fetchMemos, updateMemo } from "@/lib/db/memos";
import { createTask, fetchTasks, toggleTaskComplete } from "@/lib/db/tasks";
import { fetchAnniversaries } from "@/lib/db/moments";
import {
  isNativeWidget,
  nativeSnapshotList,
  postNativeWidgetCommand,
} from "@/lib/nativeWidgetRuntime";

export async function widgetLoadTasks(): Promise<Task[]> {
  if (isNativeWidget()) return nativeSnapshotList<Task>("tasks");
  return fetchTasks();
}

export async function widgetLoadMemos(): Promise<Memo[]> {
  if (isNativeWidget()) return nativeSnapshotList<Memo>("memos");
  return fetchMemos();
}

export async function widgetLoadAnniversaries(): Promise<Anniversary[]> {
  if (isNativeWidget()) return nativeSnapshotList<Anniversary>("anniversaries");
  return fetchAnniversaries();
}

export async function widgetCreateTask(title: string, dueDate: string): Promise<void> {
  if (isNativeWidget()) {
    postNativeWidgetCommand({ action: "create_task", title, dueDate });
    return;
  }
  await createTask({ title, due_date: dueDate });
}

export async function widgetToggleTask(id: string): Promise<void> {
  if (isNativeWidget()) {
    postNativeWidgetCommand({ action: "toggle_task", id });
    return;
  }
  await toggleTaskComplete(id);
}

export async function widgetCreateMemo(content: string): Promise<void> {
  if (isNativeWidget()) {
    postNativeWidgetCommand({ action: "create_memo", content });
    return;
  }
  await createMemo(content);
}

export async function widgetUpdateMemo(
  id: string,
  payload: { title?: string; content?: string; pinned?: number; archived?: number },
): Promise<void> {
  if (isNativeWidget()) {
    postNativeWidgetCommand({ action: "update_memo", id, ...payload });
    return;
  }
  await updateMemo(id, payload);
}

export async function widgetArchiveMemo(id: string): Promise<void> {
  if (isNativeWidget()) {
    postNativeWidgetCommand({ action: "archive_memo", id });
    return;
  }
  await archiveMemo(id);
}
