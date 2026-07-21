import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/app";
import type { Timer } from "@/types";
import {
  TIMER_PRESETS,
  formatCountdown,
  intervalLabel,
  liveRemaining,
} from "@/lib/timers";

const PRESET_MARKS: Record<string, string> = {
  喝水: "水",
  站起来活动: "动",
  护眼休息: "目",
};

export function RemindersView() {
  const timers = useAppStore((s) => s.timers);
  const addTimer = useAppStore((s) => s.addTimer);
  const startTimer = useAppStore((s) => s.startTimer);
  const pauseTimer = useAppStore((s) => s.pauseTimer);
  const resetTimer = useAppStore((s) => s.resetTimer);
  const removeTimer = useAppStore((s) => s.removeTimer);

  const [title, setTitle] = useState("喝水");
  const [minutes, setMinutes] = useState(30);
  const [presetKey, setPresetKey] = useState("喝水");
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const intervals = timers.filter((t) => t.kind === "interval");
  const taskTimers = timers.filter((t) => t.kind === "task");
  const active = useMemo(() => {
    const running = timers.filter((t) => t.running);
    if (!running.length) return null;
    return running.sort((a, b) => liveRemaining(a) - liveRemaining(b))[0];
  }, [timers]);

  const create = async (start: boolean) => {
    const sec = Math.max(1, Math.floor(minutes)) * 60;
    await addTimer({
      kind: "interval",
      title: title.trim() || "提醒",
      interval_sec: sec,
      start,
    });
  };

  return (
    <div className="reminders-view">
      {active ? (
        <ActiveHero
          timer={active}
          onPause={() => void pauseTimer(active.id)}
          onReset={() => void resetTimer(active.id)}
        />
      ) : (
        <header className="reminders-hero is-idle">
          <p className="reminders-kicker">循环 · 事项倒计时</p>
          <h3 className="reminders-hero-title">到点提醒，浮窗常驻</h3>
          <p className="reminders-hero-desc">
            开始后主窗口会最小化，桌面浮窗显示剩余时间；到点系统通知并自动开下一轮。
          </p>
        </header>
      )}

      <section className="reminders-composer" aria-label="新建循环提醒">
        <div className="reminders-preset-grid">
          {TIMER_PRESETS.map((p) => {
            const selected = presetKey === p.title;
            return (
              <button
                key={p.title}
                type="button"
                className={`reminders-preset ${selected ? "is-selected" : ""}`}
                onClick={() => {
                  setPresetKey(p.title);
                  setTitle(p.title);
                  setMinutes(Math.round(p.interval_sec / 60));
                }}
              >
                <span className="reminders-preset-mark" aria-hidden>
                  {PRESET_MARKS[p.title] ?? "计"}
                </span>
                <span className="reminders-preset-name">{p.title}</span>
                <span className="reminders-preset-gap">
                  {intervalLabel(p.interval_sec)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="reminders-form-row">
          <div className="reminders-field">
            <label className="field-label" htmlFor="reminder-title">
              名称
            </label>
            <input
              id="reminder-title"
              className="field"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setPresetKey("");
              }}
              placeholder="例如：喝水"
            />
          </div>
          <div className="reminders-field reminders-field-mins">
            <label className="field-label" htmlFor="reminder-mins">
              间隔（分钟）
            </label>
            <input
              id="reminder-mins"
              className="field"
              type="number"
              min={1}
              max={24 * 60}
              value={minutes}
              onChange={(e) => {
                setMinutes(Number(e.target.value) || 1);
                setPresetKey("");
              }}
            />
          </div>
          <div className="reminders-form-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void create(false)}
            >
              仅保存
            </button>
            <button
              type="button"
              className="primary-btn"
              onClick={() => void create(true)}
            >
              开始提醒
            </button>
          </div>
        </div>
      </section>

      <section className="reminders-section">
        <div className="reminders-section-head">
          <h3>循环提醒</h3>
          <span>{intervals.length}</span>
        </div>
        {!intervals.length ? (
          <div className="reminders-empty">
            还没有循环提醒。点上方模板，再点「开始提醒」。
          </div>
        ) : (
          <div className="reminders-stack">
            {intervals.map((t) => (
              <TimerCard
                key={t.id}
                timer={t}
                badge={`每 ${intervalLabel(t.interval_sec)}`}
                onStart={() => void startTimer(t.id)}
                onPause={() => void pauseTimer(t.id)}
                onReset={() => void resetTimer(t.id)}
                onRemove={() => {
                  if (window.confirm(`删除「${t.title}」？`)) {
                    void removeTimer(t.id);
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="reminders-section">
        <div className="reminders-section-head">
          <h3>事项倒计时</h3>
          <span>{taskTimers.length}</span>
        </div>
        {!taskTimers.length ? (
          <div className="reminders-empty">
            在任务详情里选择 5 / 15 / 25 分钟即可启动。
          </div>
        ) : (
          <div className="reminders-stack">
            {taskTimers.map((t) => (
              <TimerCard
                key={t.id}
                timer={t}
                badge="事项"
                onStart={() => void startTimer(t.id)}
                onPause={() => void pauseTimer(t.id)}
                onReset={() => void resetTimer(t.id)}
                onRemove={() => {
                  if (window.confirm(`删除「${t.title}」？`)) {
                    void removeTimer(t.id);
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ActiveHero({
  timer,
  onPause,
  onReset,
}: {
  timer: Timer;
  onPause: () => void;
  onReset: () => void;
}) {
  const remaining = liveRemaining(timer);
  const progress = Math.min(
    1,
    Math.max(0, 1 - remaining / Math.max(1, timer.interval_sec)),
  );

  return (
    <header className="reminders-hero is-active">
      <div className="reminders-hero-copy">
        <p className="reminders-kicker">进行中</p>
        <h3 className="reminders-hero-title">{timer.title}</h3>
        <p className="reminders-hero-desc">
          {timer.kind === "interval" ? "循环提醒" : "事项倒计时"} · 到点将通知并弹出浮窗
        </p>
        <div className="reminders-hero-actions">
          <button type="button" className="primary-btn" onClick={onPause}>
            暂停
          </button>
          <button type="button" className="btn-ghost" onClick={onReset}>
            重置
          </button>
        </div>
      </div>
      <div className="reminders-hero-clock" aria-live="polite">
        <div
          className="reminders-ring"
          style={{ ["--p" as string]: String(progress) }}
        >
          <strong>{formatCountdown(remaining)}</strong>
        </div>
      </div>
    </header>
  );
}

function TimerCard({
  timer,
  badge,
  onStart,
  onPause,
  onReset,
  onRemove,
}: {
  timer: Timer;
  badge: string;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onRemove: () => void;
}) {
  const remaining = liveRemaining(timer);
  const running = Boolean(timer.running);
  const progress = Math.min(
    1,
    Math.max(0, 1 - remaining / Math.max(1, timer.interval_sec)),
  );

  return (
    <article className={`timer-card ${running ? "is-running" : ""}`}>
      <div className="timer-card-top">
        <div className="timer-card-text">
          <strong>{timer.title}</strong>
          <span className="timer-badge">{badge}</span>
        </div>
        <div className="timer-countdown">{formatCountdown(remaining)}</div>
      </div>
      <div className="timer-progress" aria-hidden>
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="timer-actions">
        {running ? (
          <button type="button" className="btn-ghost" onClick={onPause}>
            暂停
          </button>
        ) : (
          <button type="button" className="btn-ghost" onClick={onStart}>
            开始
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onReset}>
          重置
        </button>
        <button type="button" className="btn-ghost danger" onClick={onRemove}>
          删除
        </button>
      </div>
    </article>
  );
}
