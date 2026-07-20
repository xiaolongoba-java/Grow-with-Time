import type { AiSettings, Task } from "@/types";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export function hasAiKey(ai: AiSettings): boolean {
  return Boolean(ai.apiKey?.trim());
}

export async function chatCompletion(
  ai: AiSettings,
  system: string,
  user: string,
): Promise<string> {
  if (!hasAiKey(ai)) {
    throw new Error("请先在设置中配置 API Key");
  }

  const base = ai.baseUrl.replace(/\/$/, "");
  const res = await tauriFetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ai.apiKey}`,
    },
    body: JSON.stringify({
      model: ai.model || "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI 请求失败: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function suggestSubtasks(
  ai: AiSettings,
  taskTitle: string,
): Promise<string[]> {
  const content = await chatCompletion(
    ai,
    "你是任务拆解助手。只输出 JSON 数组字符串，例如 [\"子任务1\",\"子任务2\"]，不要其它文字。",
    `请把「${taskTitle}」拆成 3-8 个可执行子任务。`,
  );

  try {
    const start = content.indexOf("[");
    const end = content.lastIndexOf("]");
    const json = content.slice(start, end + 1);
    const arr = JSON.parse(json) as unknown;
    if (Array.isArray(arr)) {
      return arr.map(String).filter(Boolean).slice(0, 12);
    }
  } catch {
    /* fallthrough */
  }
  return content
    .split("\n")
    .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function heuristicSchedule(tasks: Task[]): string {
  const pending = tasks.filter(
    (t) => t.status === "pending" && !t.parent_id && !t.deleted_at,
  );
  const high = pending.filter((t) => t.priority <= 2).length;
  const today = pending.filter((t) => {
    const d = new Date().toISOString().slice(0, 10);
    return t.due_date === d;
  }).length;
  const suggest = Math.min(8, Math.max(3, high + Math.ceil(today / 2) + 2));
  return `建议今日聚焦约 ${suggest} 项：优先完成 ${high} 个高优先级，以及 ${today} 个今日到期任务。先做耗时短、优先级高的事项，避免同时开启超过 3 个大任务。`;
}

export async function suggestSchedule(
  ai: AiSettings,
  tasks: Task[],
): Promise<string> {
  const base = heuristicSchedule(tasks);
  if (!hasAiKey(ai)) return base;

  try {
    const titles = tasks
      .filter((t) => t.status === "pending" && !t.parent_id)
      .slice(0, 20)
      .map((t) => `- ${t.title} (P${t.priority}, ${t.due_date ?? "无日期"})`)
      .join("\n");
    const polished = await chatCompletion(
      ai,
      "你是生产力教练。用简洁中文给出今日排期建议，不超过 120 字。",
      `本地启发式：${base}\n任务列表：\n${titles}`,
    );
    return polished || base;
  } catch {
    return base;
  }
}
