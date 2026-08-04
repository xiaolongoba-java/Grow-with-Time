import type { Task } from "@/types";

export function parseMomentTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

export function extractMomentTags(content: string): string[] {
  return [...new Set([...content.matchAll(/#([^\s#]+)/g)].map((match) => match[1]))];
}

export function buildDailyMomentSummary(tasks: Task[], date: string): string {
  const completed = tasks.filter((task) => task.completed_at?.slice(0, 10) === date);
  const minutes = completed.reduce(
    (sum, task) => sum + (task.actual_minutes || task.estimated_minutes || 0),
    0,
  );
  return `今天完成 ${completed.length} 项任务${minutes ? `，投入约 ${minutes} 分钟` : ""}。`;
}

export function daysUntilMoment(iso: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 86400000));
}
