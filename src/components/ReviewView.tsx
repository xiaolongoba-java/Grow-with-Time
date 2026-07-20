import { useMemo } from "react";
import { useAppStore } from "@/store/app";

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

export function ReviewView() {
  const tasks = useAppStore((s) => s.tasks);
  const settings = useAppStore((s) => s.settings);

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
        <h3>游戏化</h3>
        <p>
          Karma <strong>{settings.karma}</strong> · 连击{" "}
          <strong className="streak-pop">{settings.streak}</strong> 天
        </p>
      </section>
    </main>
  );
}
