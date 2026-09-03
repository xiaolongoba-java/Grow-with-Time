import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/app";
import { fetchDailyReflections, fetchDaySnapshots, fetchGoalEntries, fetchGoals } from "@/lib/db";
import type { DailyReflection, DaySnapshot, Goal, GoalEntry } from "@/types";
import { localDateKey, localWeekStartKey } from "@/lib/growth";

export function ReviewView() {
  const tasks = useAppStore((s) => s.tasks);
  const [snapshots, setSnapshots] = useState<DaySnapshot[]>([]);
  const [reflections, setReflections] = useState<DailyReflection[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalEntries, setGoalEntries] = useState<GoalEntry[]>([]);

  useEffect(() => {
    void Promise.all([fetchDaySnapshots(), fetchDailyReflections(), fetchGoals(), fetchGoalEntries()]).then(
      ([nextSnapshots, nextReflections, nextGoals, nextEntries]) => {
        setSnapshots(nextSnapshots);
        setReflections(nextReflections);
        setGoals(nextGoals);
        setGoalEntries(nextEntries);
      },
    );
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 6);
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekAgo);
      d.setDate(weekAgo.getDate() + i);
      days.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
    }

    const created = days.map(
      (d) => tasks.filter((t) => !t.parent_id && localDateKey(new Date(t.created_at)) === d).length,
    );
    const completed = days.map(
      (d) =>
        tasks.filter(
          (t) => !t.parent_id && t.completed_at && localDateKey(new Date(t.completed_at)) === d,
        ).length,
    );
    const roots = tasks.filter((t) => !t.parent_id);
    const done = roots.filter((t) => t.status === "completed").length;
    const rate = roots.length ? Math.round((done / roots.length) * 100) : 0;
    const delayed = roots.filter(
      (t) =>
        t.status === "completed" &&
        t.due_date &&
        t.completed_at &&
        localDateKey(new Date(t.completed_at)) > t.due_date,
    ).length;
    const delayRate = done ? Math.round((delayed / done) * 100) : 0;

    const hours = Array.from({ length: 24 }, () => 0);
    for (const t of roots) {
      if (!t.completed_at) continue;
      const h = new Date(t.completed_at).getHours();
      hours[h] += 1;
    }
    const peak = hours.indexOf(Math.max(...hours));

    return { days, created, completed, rate, delayRate, peak, max: Math.max(1, ...created, ...completed) };
  }, [tasks]);

  const reflectionEntries = useMemo(() => {
    const snapshotMap = new Map(snapshots.map((item) => [item.plan_date, item]));
    const entries = reflections
      .map((item) => ({
        date: item.reflection_date,
        text: item.harvest.trim() || item.highlight.trim() || item.tomorrow_note.trim(),
        summary: item.auto_summary,
        snapshot: snapshotMap.get(item.reflection_date),
        legacy: false,
      }))
      .filter((item) => item.text);
    const existingDates = new Set(entries.map((item) => item.date));
    for (const snapshot of snapshots) {
      if (snapshot.reflection.trim() && !existingDates.has(snapshot.plan_date)) {
        entries.push({
          date: snapshot.plan_date,
          text: snapshot.reflection.trim(),
          summary: "历史晚间收尾记录",
          snapshot,
          legacy: true,
        });
      }
    }
    return entries.sort((a, b) => b.date.localeCompare(a.date));
  }, [reflections, snapshots]);

  return (
    <main className="main-workspace" style={{ padding: 22, overflow: "auto" }}>
      <h2 style={{ fontFamily: "var(--font-display)" }}>生产力复盘</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 16 }}>
        <section className="review-card">
          <div className="field-label">完成率</div>
          <strong style={{ fontSize: 28 }}>{stats.rate}%</strong>
        </section>
        <section className="review-card">
          <div className="field-label">拖延率</div>
          <strong style={{ fontSize: 28 }}>{stats.delayRate}%</strong>
        </section>
        <section className="review-card">
          <div className="field-label">最活跃时段</div>
          <strong style={{ fontSize: 28 }}>{stats.peak}:00</strong>
        </section>
      </div>

      <section className="review-card" style={{ marginTop: 12 }}>
        <h3>近 7 日新增</h3>
        <div className="chart-bars">
          {stats.created.map((v, i) => (
            <span key={stats.days[i]} style={{ height: `${(v / stats.max) * 100}%` }} title={`${stats.days[i]}: ${v}`} />
          ))}
        </div>
      </section>

      <section className="review-card" style={{ marginTop: 12 }}>
        <h3>近 7 日完成</h3>
        <div className="chart-bars">
          {stats.completed.map((v, i) => (
            <span key={stats.days[i]} style={{ height: `${(v / stats.max) * 100}%` }} title={`${stats.days[i]}: ${v}`} />
          ))}
        </div>
      </section>

      <section className="review-card" style={{ marginTop: 12 }}>
        <h3>本周目标投入</h3>
        <div className="review-goal-list">
          {goals.filter((goal) => goal.status === "active").map((goal) => {
            const startKey = localWeekStartKey();
            const value = goalEntries
              .filter((entry) => entry.goal_id === goal.id && entry.entry_date >= startKey)
              .reduce((sum, entry) => sum + Number(entry.value), 0);
            return (
              <div key={goal.id} className="review-goal-row">
                <i style={{ background: goal.color }} />
                <span>{goal.title}</span>
                <strong>{Math.round(value * 10) / 10}{goal.unit}</strong>
              </div>
            );
          })}
          {!goals.some((goal) => goal.status === "active") ? <p>暂无进行中的长期目标。</p> : null}
        </div>
      </section>

      <section className="review-card review-reflections" style={{ marginTop: 12 }}>
        <div className="review-reflections-head">
          <div>
            <h3>拾光回望</h3>
            <p>以“今日拾光”为正式记录，旧版晚间一句自动兼容</p>
          </div>
          <span>{reflectionEntries.length} 条记录</span>
        </div>
        {reflectionEntries.length ? (
          <div className="review-reflection-list">
            {reflectionEntries
              .slice(0, 7)
              .map((item) => (
                <article key={`${item.date}-${item.legacy ? "legacy" : "moment"}`}>
                  <time>{item.date}</time>
                  <p>{item.text}</p>
                  <span>
                    {item.snapshot
                      ? `完成 ${item.snapshot.completed_minutes} / 计划 ${item.snapshot.planned_minutes} 分钟`
                      : item.summary || "今日拾光"}
                    {item.legacy ? " · 旧版记录" : ""}
                  </span>
                </article>
              ))}
          </div>
        ) : (
          <p className="review-reflection-empty">
            完成“今日收尾”或保存一条“今日拾光”后，回望会出现在这里。
          </p>
        )}
      </section>
    </main>
  );
}
