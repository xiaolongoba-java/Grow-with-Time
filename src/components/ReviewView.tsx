import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/app";
import { fetchDaySnapshots, fetchGoalEntries, fetchGoals } from "@/lib/db";
import type { DaySnapshot, Goal, GoalEntry } from "@/types";

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

export function ReviewView() {
  const tasks = useAppStore((s) => s.tasks);
  const settings = useAppStore((s) => s.settings);
  const [snapshots, setSnapshots] = useState<DaySnapshot[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalEntries, setGoalEntries] = useState<GoalEntry[]>([]);

  useEffect(() => {
    void Promise.all([fetchDaySnapshots(), fetchGoals(), fetchGoalEntries()]).then(
      ([nextSnapshots, nextGoals, nextEntries]) => {
        setSnapshots(nextSnapshots);
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
      (d) => tasks.filter((t) => !t.parent_id && dayKey(t.created_at) === d).length,
    );
    const completed = days.map(
      (d) =>
        tasks.filter(
          (t) => !t.parent_id && t.completed_at && dayKey(t.completed_at) === d,
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
        dayKey(t.completed_at) > t.due_date,
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
            const weekStart = new Date();
            weekStart.setDate(weekStart.getDate() - 6);
            const startKey = dayKey(weekStart.toISOString());
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

      <section className="review-card" style={{ marginTop: 12 }}>
        <h3>游戏化</h3>
        <p>
          Karma <strong>{settings.karma}</strong> · 连击{" "}
          <strong className="streak-pop">{settings.streak}</strong> 天
        </p>
      </section>

      <section className="review-card review-reflections" style={{ marginTop: 12 }}>
        <div className="review-reflections-head">
          <div>
            <h3>每日一句</h3>
            <p>来自“我的一天”晚间收尾</p>
          </div>
          <span>{snapshots.filter((item) => item.reflection.trim()).length} 条记录</span>
        </div>
        {snapshots.some((item) => item.reflection.trim()) ? (
          <div className="review-reflection-list">
            {snapshots
              .filter((item) => item.reflection.trim())
              .slice(0, 7)
              .map((item) => (
                <article key={item.id}>
                  <time>{item.plan_date}</time>
                  <p>{item.reflection}</p>
                  <span>
                    完成 {item.completed_minutes} / 计划 {item.planned_minutes} 分钟
                  </span>
                </article>
              ))}
          </div>
        ) : (
          <p className="review-reflection-empty">
            完成一次“今日收尾”后，你记录的一句话会出现在这里。
          </p>
        )}
      </section>
    </main>
  );
}
