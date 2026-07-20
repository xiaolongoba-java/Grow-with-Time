import type { TaskDraft, TaskPriority } from "@/types";
import { addMinutesToTime, todayDateString } from "@/lib/dates";

export interface NlpResult {
  title: string;
  draft: Partial<TaskDraft>;
  hints: string[];
}

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nextWeekday(target: number): string {
  const d = new Date();
  const day = d.getDay();
  let diff = (target - day + 7) % 7;
  if (diff === 0) diff = 7;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseNaturalInput(input: string): NlpResult {
  let text = input.trim();
  const hints: string[] = [];
  const draft: Partial<TaskDraft> = {};

  const priorityMatch = text.match(/\b(p|P)([1-4])\b/);
  if (priorityMatch) {
    draft.priority = Number(priorityMatch[2]) as TaskPriority;
    hints.push(`优先级 P${draft.priority}`);
    text = text.replace(priorityMatch[0], " ").trim();
  }

  const timeMatch = text.match(
    /(上午|下午|晚上)?\s*(\d{1,2})(?:[:：点](\d{1,2})?)?/,
  );
  if (timeMatch) {
    let hour = Number(timeMatch[2]);
    const minute = timeMatch[3] ? Number(timeMatch[3]) : 0;
    const period = timeMatch[1];
    if (period === "下午" || period === "晚上") {
      if (hour < 12) hour += 12;
    }
    if (period === "上午" && hour === 12) hour = 0;
    draft.due_time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    draft.end_time = addMinutesToTime(draft.due_time, 60);
    hints.push(`时间 ${draft.due_time}–${draft.end_time}`);
    text = text.replace(timeMatch[0], " ").trim();
  }

  if (/今天/.test(text)) {
    draft.due_date = todayDateString();
    hints.push("日期 今天");
    text = text.replace(/今天/g, " ").trim();
  } else if (/明天/.test(text)) {
    draft.due_date = addDays(1);
    hints.push("日期 明天");
    text = text.replace(/明天/g, " ").trim();
  } else if (/后天/.test(text)) {
    draft.due_date = addDays(2);
    hints.push("日期 后天");
    text = text.replace(/后天/g, " ").trim();
  } else if (/下周[一二三四五六日天]?/.test(text)) {
    const map: Record<string, number> = {
      一: 1,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      日: 0,
      天: 0,
    };
    const m = text.match(/下周([一二三四五六日天])?/);
    const wd = m?.[1] ? map[m[1]] : 1;
    draft.due_date = nextWeekday(wd);
    hints.push("日期 下周");
    text = text.replace(/下周[一二三四五六日天]?/g, " ").trim();
  }

  if (!draft.due_date) {
    draft.due_date = todayDateString();
  }

  const title = text.replace(/\s+/g, " ").trim() || input.trim();
  return { title, draft, hints };
}
