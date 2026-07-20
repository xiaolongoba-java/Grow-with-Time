import { useMemo, useState } from "react";
import { useAppStore } from "@/store/app";
import { todayDateString } from "@/lib/dates";

export function HabitsView() {
  const habits = useAppStore((s) => s.habits);
  const habitChecks = useAppStore((s) => s.habitChecks);
  const addHabit = useAppStore((s) => s.addHabit);
  const removeHabit = useAppStore((s) => s.removeHabit);
  const toggleHabitDay = useAppStore((s) => s.toggleHabitDay);
  const [title, setTitle] = useState("");
  const today = todayDateString();

  const weekDates = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - day);
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(start);
      x.setDate(start.getDate() + i);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    });
  }, []);

  return (
    <main className="main-workspace" style={{ padding: 22, overflow: "auto" }}>
      <h2 style={{ fontFamily: "var(--font-display)" }}>习惯追踪</h2>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <input
          className="field"
          placeholder="例如：每周运动 3 次"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && title.trim()) {
              void addHabit(title.trim(), 3);
              setTitle("");
            }
          }}
        />
        <button
          type="button"
          className="btn-primary"
          style={{ width: "auto" }}
          onClick={() => {
            if (title.trim()) {
              void addHabit(title.trim(), 3);
              setTitle("");
            }
          }}
        >
          添加
        </button>
      </div>

      {!habits.length ? (
        <div className="empty-state">创建第一个习惯开始追踪。</div>
      ) : (
        habits.map((habit) => {
          const checks = habitChecks.filter((c) => c.habit_id === habit.id);
          const weekCount = checks.filter((c) => weekDates.includes(c.check_date)).length;
          const streak = (() => {
            let s = 0;
            const set = new Set(checks.map((c) => c.check_date));
            const cursor = new Date(`${today}T12:00:00`);
            while (set.has(
              `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`,
            )) {
              s += 1;
              cursor.setDate(cursor.getDate() - 1);
            }
            return s;
          })();

          return (
            <section key={habit.id} className="habits-card" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong className={streak > 0 ? "streak-pop" : ""}>
                  {habit.title}
                </strong>
                <button
                  type="button"
                  className="btn-ghost danger"
                  onClick={() => void removeHabit(habit.id)}
                >
                  删除
                </button>
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                本周 {weekCount}/{habit.target_per_week} · 连续 {streak} 天
              </p>
              <div style={{ display: "flex", gap: 6 }}>
                {weekDates.map((date) => {
                  const on = checks.some((c) => c.check_date === date);
                  return (
                    <button
                      key={date}
                      type="button"
                      className={`tag-pill ${on ? "on" : ""}`}
                      onClick={() => void toggleHabitDay(habit.id, date)}
                    >
                      {date.slice(8)}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </main>
  );
}
