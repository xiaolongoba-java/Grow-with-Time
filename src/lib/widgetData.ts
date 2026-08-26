import type { Anniversary, Memo, Task } from "@/types";
import { archiveMemo, createMemo, fetchMemos, updateMemo } from "@/lib/db/memos";
import { createTask, fetchTasks, toggleTaskComplete } from "@/lib/db/tasks";
import { fetchAnniversaries } from "@/lib/db/moments";
import {
  bridgeCreateTask,
  bridgeFetchAnniversaries,
  bridgeFetchMemos,
  bridgeFetchTasks,
  bridgeToggleTask,
  bridgeUpsertMemo,
  isNativeWidgetHost,
} from "@/lib/widgetBridgeApi";

export async function widgetLoadTasks(): Promise<Task[]> {
  if (isNativeWidgetHost()) {
    return (await bridgeFetchTasks()) as unknown as Task[];
  }
  return fetchTasks();
}

export async function widgetLoadMemos(): Promise<Memo[]> {
  if (isNativeWidgetHost()) {
    return (await bridgeFetchMemos()) as unknown as Memo[];
  }
  return fetchMemos();
}

export async function widgetLoadAnniversaries(): Promise<Anniversary[]> {
  if (isNativeWidgetHost()) {
    return (await bridgeFetchAnniversaries()) as unknown as Anniversary[];
  }
  return fetchAnniversaries();
}

export async function widgetCreateTask(title: string, dueDate: string): Promise<void> {
  if (isNativeWidgetHost()) {
    await bridgeCreateTask(title, dueDate);
    return;
  }
  await createTask({ title, due_date: dueDate });
}

export async function widgetToggleTask(id: string): Promise<void> {
  if (isNativeWidgetHost()) {
    await bridgeToggleTask(id);
    return;
  }
  await toggleTaskComplete(id);
}

export async function widgetCreateMemo(content: string): Promise<void> {
  if (isNativeWidgetHost()) {
    await bridgeUpsertMemo({ content });
    return;
  }
  await createMemo(content);
}

export async function widgetUpdateMemo(
  id: string,
  payload: { title?: string; content?: string; pinned?: number; archived?: number },
): Promise<void> {
  if (isNativeWidgetHost()) {
    await bridgeUpsertMemo({ id, ...payload });
    return;
  }
  await updateMemo(id, payload);
}

export async function widgetArchiveMemo(id: string): Promise<void> {
  if (isNativeWidgetHost()) {
    await bridgeUpsertMemo({ id, content: "", archived: 1 });
    return;
  }
  await archiveMemo(id);
}
