import type { BackupPayload } from "@/types";

export const BACKUP_PAYLOAD_VERSIONS = [2, 3, 4, 5, 6] as const;

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
  return data as BackupPayload;
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
  lines.push("", "恢复会覆盖其余当前数据，是否继续？");
  return lines.join("\n");
}
