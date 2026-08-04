import { describe, expect, it } from "vitest";
import { buildDailyMomentSummary, daysUntilMoment, extractMomentTags, parseMomentTags } from "./moments";
import type { Task } from "@/types";

describe("拾光规则", () => {
  it("安全解析标签并拒绝损坏数据", () => {
    expect(parseMomentTags('["灵感","产品"]')).toEqual(["灵感", "产品"]);
    expect(parseMomentTags("broken")).toEqual([]);
  });

  it("从闪念中去重提取标签", () => {
    expect(extractMomentTags("记录 #产品 #灵感 #产品")).toEqual(["产品", "灵感"]);
  });

  it("按本地日期汇总完成事项和投入", () => {
    const tasks = [
      { completed_at: "2026-08-04T08:00:00", actual_minutes: 25, estimated_minutes: 10 },
      { completed_at: "2026-08-04T10:00:00", actual_minutes: 0, estimated_minutes: 30 },
      { completed_at: "2026-08-03T10:00:00", actual_minutes: 90 },
    ] as Task[];
    expect(buildDailyMomentSummary(tasks, "2026-08-04")).toBe("今天完成 2 项任务，投入约 55 分钟。");
  });

  it("未来信倒计时不会显示负数", () => {
    const now = new Date("2026-08-04T00:00:00").getTime();
    expect(daysUntilMoment("2026-08-06T00:00:00", now)).toBe(2);
    expect(daysUntilMoment("2026-08-01T00:00:00", now)).toBe(0);
  });
});
