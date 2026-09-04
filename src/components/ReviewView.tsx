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

  const weekCreated = stats.created.reduce((sum, value) => sum + value, 0);
  const weekCompleted = stats.completed.reduce((sum, value) => sum + value, 0);
  const activeGoals = goals.filter((goal) => goal.status === "active");
  const weekday = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("zh-CN", { weekday: "short" });

  return (
    <main className="main-workspace review-workspace">
      <header className="review-hero">
        <div>
          <span className="review-kicker">WEEKLY REVIEW · 近 7 日</span>
          <h2>这一周，时间留下了什么</h2>
          <p>不只看完成了多少，也看看精力落在哪里、哪些片段值得留下。</p>
        </div>
        <div className="review-hero-total"><strong>{weekCompleted}</strong><span>件事情完成</span></div>
      </header>

      <section className="review-metrics" aria-label="本周摘要">
        <article><span>整体完成率</span><strong>{stats.rate}%</strong><small>全部任务累计表现</small></article>
        <article><span>延期完成</span><strong>{stats.delayRate}%</strong><small>{stats.delayRate ? "可以留意计划余量" : "节奏保持得很好"}</small></article>
        <article><span>高效时段</span><strong>{stats.peak}:00</strong><small>最常完成任务的时间</small></article>
      </section>

      <div className="review-main-grid">
        <section className="review-story-card review-rhythm">
          <div className="review-section-head"><div><span>七日节奏</span><h3>新计划与完成情况</h3></div><div className="review-chart-legend"><i className="is-created" />新增 {weekCreated}<i className="is-completed" />完成 {weekCompleted}</div></div>
          <div className="review-rhythm-chart">
            {stats.days.map((day, i) => <div className="review-day" key={day} title={`${day} · 新增 ${stats.created[i]} · 完成 ${stats.completed[i]}`}>
              <div className="review-bar-pair"><i className="is-created" style={{ height: `${Math.max(5, (stats.created[i] / stats.max) * 100)}%` }} /><i className="is-completed" style={{ height: `${Math.max(5, (stats.completed[i] / stats.max) * 100)}%` }} /></div>
              <strong>{weekday(day)}</strong><span>{day.slice(5).replace("-", "/")}</span>
            </div>)}
          </div>
        </section>

        <section className="review-story-card review-goals">
          <div className="review-section-head"><div><span>长期方向</span><h3>本周目标投入</h3></div><b>{activeGoals.length}</b></div>
        <div className="review-goal-list">
          {activeGoals.map((goal) => {
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
          {!activeGoals.length ? <p className="review-soft-empty">暂无进行中的长期目标。</p> : null}
        </div>
        </section>
      </div>

      <section className="review-story-card review-reflections">
        <div className="review-reflections-head">
          <div>
            <span className="review-section-label">生活切片</span>
            <h3>拾光回望</h3>
            <p>从最近的手账里，重新看见那些值得记住的日子。</p>
          </div>
          <span>{reflectionEntries.length} 条记录</span>
        </div>
        {reflectionEntries.length ? (
          <div className="review-reflection-list">
            {reflectionEntries
              .slice(0, 7)
              .map((item) => (
                <article key={`${item.date}-${item.legacy ? "legacy" : "moment"}`}>
                  <div className="review-reflection-date"><time>{item.date.slice(5).replace("-", ".")}</time><span>{weekday(item.date)}</span></div>
                  <div><p>{item.text}</p><span>
                    {item.snapshot
                      ? `完成 ${item.snapshot.completed_minutes} / 计划 ${item.snapshot.planned_minutes} 分钟`
                      : item.summary || "今日拾光"}
                    {item.legacy ? " · 旧版记录" : ""}
                  </span></div>
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
