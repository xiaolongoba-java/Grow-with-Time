import type { BackupPayload, KarmaLedgerEntry, Task, TaskPriority, TaskStatus } from "@/types";

export const BACKUP_PAYLOAD_VERSIONS = [2, 3, 4, 5, 6, 7] as const;

const TASK_STATUSES: TaskStatus[] = [
  "draft",
  "pending",
  "in_progress",
  "waiting",
  "blocked",
  "completed",
  "cancelled",
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type BackupIntegrityReport = {
  errors: string[];
  warnings: string[];
};

/** True when the backup JSON object own-property exists (missing keys must not wipe data). */
export function backupPayloadHas(
  payload: BackupPayload,
  key: keyof BackupPayload,
): boolean {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

export function validateBackupPayload(payload: unknown): BackupPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("备份文件格式无效");
  }
  const data = payload as Partial<BackupPayload>;
  if (
    typeof data.version !== "number" ||
    !BACKUP_PAYLOAD_VERSIONS.includes(
      data.version as (typeof BACKUP_PAYLOAD_VERSIONS)[number],
    )
  ) {
    throw new Error(`不支持的备份版本：${String(data.version)}`);
  }
  if (!Array.isArray(data.tasks) || !Array.isArray(data.tags)) {
    throw new Error("备份缺少任务或标签数据");
  }
  if (!data.settings || typeof data.settings !== "object") {
    throw new Error("备份缺少设置数据");
  }
  if (typeof data.exportedAt !== "string" || !data.exportedAt) {
    throw new Error("备份缺少导出时间");
  }
  const report = inspectBackupPayload(data as BackupPayload);
  if (report.errors.length) {
    throw new Error(report.errors.slice(0, 8).join("；"));
  }
  return data as BackupPayload;
}

function isYmd(value: string | null | undefined): boolean {
  if (!value) return true;
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function collectIds(items: { id?: string }[] | undefined, label: string, errors: string[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items ?? []) {
    if (!item?.id || typeof item.id !== "string") {
      errors.push(`${label}缺少 id`);
      continue;
    }
    if (ids.has(item.id)) errors.push(`${label}存在重复 id：${item.id}`);
    ids.add(item.id);
  }
  return ids;
}

export function inspectBackupPayload(payload: BackupPayload): BackupIntegrityReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const taskIds = collectIds(payload.tasks, "任务", errors);
  const tagIds = collectIds(payload.tags, "标签", errors);
  const projectIds = collectIds(payload.projects, "项目", errors);
  const goalIds = collectIds(payload.goals, "成长目标", errors);

  for (const task of payload.tasks as Task[]) {
    if (!TASK_STATUSES.includes(task.status)) {
      errors.push(`任务 ${task.id} 的状态无效：${String(task.status)}`);
    }
    const priority = task.priority as TaskPriority;
    if (![1, 2, 3, 4].includes(priority)) {
      errors.push(`任务 ${task.id} 的优先级无效`);
    }
    if (!isYmd(task.due_date) || !isYmd(task.my_day_date)) {
      errors.push(`任务 ${task.id} 的日期不合法`);
    }
    for (const value of [task.sort_order, task.actual_minutes, task.goal_contribution, task.flexible]) {
      if (typeof value === "number" && !Number.isFinite(value)) {
        errors.push(`任务 ${task.id} 含有非有限数值`);
      }
    }
    if (task.parent_id && !taskIds.has(task.parent_id)) {
      warnings.push(`任务 ${task.id} 的父任务不存在`);
    }
    if (task.project_id && payload.projects && !projectIds.has(task.project_id)) {
      warnings.push(`任务 ${task.id} 引用了不存在的项目`);
    }
    if (task.goal_id && payload.goals && !goalIds.has(task.goal_id)) {
      warnings.push(`任务 ${task.id} 引用了不存在的成长目标`);
    }
    if (task.generated_from_id && !taskIds.has(task.generated_from_id)) {
      warnings.push(`任务 ${task.id} 的重复来源不存在`);
    }
    if (task.blocked_by_id && !taskIds.has(task.blocked_by_id)) {
      warnings.push(`任务 ${task.id} 的前置任务不存在`);
    }
  }

  for (const link of payload.taskTags ?? []) {
    if (!taskIds.has(link.task_id) || !tagIds.has(link.tag_id)) {
      warnings.push("存在无效的任务-标签关联，恢复时将跳过");
    }
  }

  for (const attachment of payload.attachments ?? []) {
    if (!taskIds.has(attachment.task_id)) {
      warnings.push(`附件 ${attachment.id} 引用了不存在的任务`);
    }
    const path = attachment.path ?? "";
    if (path.includes("\0") || path.includes("..")) {
      errors.push(`附件 ${attachment.id} 的路径不合法`);
    }
  }

  return { errors, warnings: [...new Set(warnings)] };
}

export function sanitizeBackupPayload(payload: BackupPayload): BackupPayload {
  const taskIds = new Set(payload.tasks.map((item) => item.id));
  const tagIds = new Set(payload.tags.map((item) => item.id));
  const projectIds = new Set((payload.projects ?? []).map((item) => item.id));
  const goalIds = new Set((payload.goals ?? []).map((item) => item.id));
  const habitIds = new Set((payload.habits ?? []).map((item) => item.id));
  const hasProjects = backupPayloadHas(payload, "projects");
  const hasGoals = backupPayloadHas(payload, "goals");

  return {
    ...payload,
    tasks: payload.tasks.map((task) => ({
      ...task,
      parent_id: task.parent_id && taskIds.has(task.parent_id) ? task.parent_id : null,
      generated_from_id:
        task.generated_from_id && taskIds.has(task.generated_from_id)
          ? task.generated_from_id
          : null,
      blocked_by_id:
        task.blocked_by_id && taskIds.has(task.blocked_by_id)
          ? task.blocked_by_id
          : null,
      project_id:
        task.project_id && (!hasProjects || projectIds.has(task.project_id))
          ? task.project_id
          : null,
      goal_id:
        task.goal_id && (!hasGoals || goalIds.has(task.goal_id)) ? task.goal_id : null,
    })),
    taskTags: (payload.taskTags ?? []).filter(
      (link) => taskIds.has(link.task_id) && tagIds.has(link.tag_id),
    ),
    attachments: (payload.attachments ?? []).filter((item) => taskIds.has(item.task_id)),
    habitChecks: (payload.habitChecks ?? []).filter((item) => habitIds.has(item.habit_id)),
    notifications: payload.notifications?.filter(
      (item) => !item.task_id || taskIds.has(item.task_id),
    ),
    taskEvents: payload.taskEvents?.filter((item) => taskIds.has(item.task_id)),
    focusSessions: payload.focusSessions?.filter(
      (item) => !item.task_id || taskIds.has(item.task_id),
    ),
    timers: payload.timers?.filter((item) => !item.task_id || taskIds.has(item.task_id)),
    goalEntries: payload.goalEntries?.filter((item) => {
      if (hasGoals && !goalIds.has(item.goal_id)) return false;
      if (item.source_type === "task" && item.source_id && !taskIds.has(item.source_id)) {
        return false;
      }
      return true;
    }),
    milestones: payload.milestones?.filter(
      (item) => !hasProjects || projectIds.has(item.project_id),
    ),
    goalMilestones: payload.goalMilestones?.filter(
      (item) => !hasGoals || goalIds.has(item.goal_id),
    ),
    achievements: payload.achievements?.filter(
      (item) => !item.goal_id || !hasGoals || goalIds.has(item.goal_id),
    ),
    karmaLedger: payload.karmaLedger
      ? dedupeKarmaLedger(
          payload.karmaLedger.filter((item) => {
            if (item.source_type === "task" && item.source_id && !taskIds.has(item.source_id)) {
              return false;
            }
            return true;
          }),
        )
      : payload.karmaLedger,
  };
}

function dedupeKarmaLedger(entries: KarmaLedgerEntry[]): KarmaLedgerEntry[] {
  const seen = new Set<string>();
  const kept: KarmaLedgerEntry[] = [];
  for (const item of [...entries].reverse()) {
    const key = `${item.source_type}\0${item.source_id}\0${item.action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(item);
  }
  return kept.reverse();
}

/** Build a human-readable restore summary, including data that would be preserved. */
export function summarizeBackupRestore(payload: BackupPayload): string {
  const has = (key: keyof BackupPayload) => backupPayloadHas(payload, key);
  const lines = [
    `备份时间：${new Date(payload.exportedAt).toLocaleString()}`,
    `任务：${payload.tasks.length} 项`,
    `标签：${payload.tags.length} 个`,
    `习惯：${payload.habits?.length ?? 0} 个`,
  ];
  if (has("goals")) lines.push(`成长目标：${payload.goals?.length ?? 0} 个`);
  if (has("dailyReflections") || has("inspirations") || has("futureLetters") || has("anniversaries")) {
    lines.push(
      `拾光：回望 ${payload.dailyReflections?.length ?? 0} · 拾念 ${payload.inspirations?.length ?? 0} · 未来信 ${payload.futureLetters?.length ?? 0} · 纪念日 ${payload.anniversaries?.length ?? 0}`,
    );
  }
  const keep: string[] = [];
  if (!has("goals") && !has("goalEntries") && !has("achievements")) {
    keep.push("成长目标");
  }
  if (
    !has("dailyReflections") &&
    !has("inspirations") &&
    !has("futureLetters") &&
    !has("anniversaries")
  ) {
    keep.push("拾光记录");
  }
  if (!has("timers")) keep.push("循环提醒");
  if (keep.length) {
    lines.push("", `以下数据备份中未包含，将保留当前内容：${keep.join("、")}`);
  }
  const report = inspectBackupPayload(payload);
  if (report.warnings.length) {
    lines.push("", "引用完整性：", ...report.warnings.slice(0, 8).map((item) => `· ${item}`));
    if (report.warnings.length > 8) {
      lines.push(`· 另有 ${report.warnings.length - 8} 条警告`);
    }
  }
  lines.push("", "恢复会覆盖其余当前数据，是否继续？");
  return lines.join("\n");
}
