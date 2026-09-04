import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/app";
import type { Timer } from "@/types";
import { TIMER_PRESETS, formatCountdown, intervalLabel, liveRemaining } from "@/lib/timers";

const COUNTDOWN_PRESETS = [5, 10, 15, 25, 30, 60];
const PRESET_MARKS: Record<string, string> = { 喝水: "水", 站起来活动: "动", 护眼休息: "目" };

export function RemindersView() {
  const timers = useAppStore((s) => s.timers);
  const addTimer = useAppStore((s) => s.addTimer);
  const startTimer = useAppStore((s) => s.startTimer);
  const pauseTimer = useAppStore((s) => s.pauseTimer);
  const resetTimer = useAppStore((s) => s.resetTimer);
  const extendTimer = useAppStore((s) => s.extendTimer);
  const removeTimer = useAppStore((s) => s.removeTimer);
  const [tab, setTab] = useState<"countdown" | "interval">("countdown");
  const [countdownTitle, setCountdownTitle] = useState("");
  const [countdownMinutes, setCountdownMinutes] = useState(25);
  const [timeMode, setTimeMode] = useState<"duration" | "finish">("duration");
  const [finishAt, setFinishAt] = useState("");
  const [intervalTitle, setIntervalTitle] = useState("喝水");
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [presetKey, setPresetKey] = useState("喝水");
  const [, setTick] = useState(0);

  useEffect(() => { const id = window.setInterval(() => setTick((n) => n + 1), 1000); return () => window.clearInterval(id); }, []);
  const intervals = timers.filter((timer) => timer.kind === "interval");
  const countdowns = timers.filter((timer) => timer.kind === "task");
  const visibleTimers = tab === "countdown" ? countdowns : intervals;
  const active = useMemo(() => visibleTimers.filter((timer) => timer.running).sort((a, b) => liveRemaining(a) - liveRemaining(b))[0] ?? null, [visibleTimers]);
  const runningCount = visibleTimers.filter((timer) => timer.running).length;
  const finishedCount = visibleTimers.filter((timer) => !timer.running && liveRemaining(timer) === 0).length;

  const countdownSeconds = () => {
    if (timeMode === "duration") return Math.max(1, Math.floor(countdownMinutes)) * 60;
    if (!finishAt) return 0;
    const [hours, minutes] = finishAt.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
    const end = new Date(); end.setHours(hours, minutes, 0, 0);
    if (end.getTime() <= Date.now()) end.setDate(end.getDate() + 1);
    return Math.max(60, Math.ceil((end.getTime() - Date.now()) / 1000));
  };
  const createCountdown = async () => {
    const seconds = countdownSeconds(); if (!seconds) return;
    const timer = await addTimer({ kind: "task", title: countdownTitle.trim() || "倒计时", interval_sec: seconds, start: true });
    if (timer) setCountdownTitle("");
  };
  const createInterval = (start: boolean) => addTimer({ kind: "interval", title: intervalTitle.trim() || "循环提醒", interval_sec: Math.max(1, Math.floor(intervalMinutes)) * 60, start });

  return <div className="reminders-view">
    <header className="timer-page-head"><div><span className="reminders-kicker">时间控制台</span><h2>倒计时与循环提醒</h2><p>临时事项用倒计时，喝水、护眼等固定节奏用循环提醒。</p></div><div className="timer-tabs" role="tablist" aria-label="计时类型"><button type="button" role="tab" aria-selected={tab === "countdown"} className={tab === "countdown" ? "active" : ""} onClick={() => setTab("countdown")}>倒计时 <span>{countdowns.length}</span></button><button type="button" role="tab" aria-selected={tab === "interval"} className={tab === "interval" ? "active" : ""} onClick={() => setTab("interval")}>循环提醒 <span>{intervals.length}</span></button></div></header>
    <section className={`timer-status-rail ${active ? "has-active" : ""}`} aria-label="提醒状态">
      <i className="timer-status-pulse" />
      <div className="timer-status-primary"><span>{active ? "当前正在计时" : "当前没有运行中的提醒"}</span><strong>{active?.title ?? "时间空闲，可以开始一段新计时"}</strong></div>
      <div><span>运行中</span><strong>{runningCount}</strong></div><div><span>{tab === "countdown" ? "已结束" : "已保存"}</span><strong>{tab === "countdown" ? finishedCount : visibleTimers.length}</strong></div>
    </section>
    {active ? <ActiveHero timer={active} onPause={() => void pauseTimer(active.id)} onExtend={tab === "countdown" ? () => void extendTimer(active.id, 300) : undefined} onComplete={tab === "countdown" ? () => void removeTimer(active.id) : undefined} /> : null}
    {tab === "countdown" ? <>
      <section className="countdown-composer" aria-label="新建倒计时"><div className="countdown-composer-title"><div><span>新建倒计时</span><strong>想在多久后收到提醒？</strong></div><div className="countdown-mode-switch"><button type="button" className={timeMode === "duration" ? "active" : ""} onClick={() => setTimeMode("duration")}>按时长</button><button type="button" className={timeMode === "finish" ? "active" : ""} onClick={() => setTimeMode("finish")}>到指定时间</button></div></div>
        {timeMode === "duration" ? <div className="countdown-time-rail">{COUNTDOWN_PRESETS.map((minutes) => <button key={minutes} type="button" className={countdownMinutes === minutes ? "active" : ""} onClick={() => setCountdownMinutes(minutes)}><strong>{minutes}</strong><span>分钟</span></button>)}<label className="countdown-custom-time"><span>自定义</span><input aria-label="自定义分钟数" type="number" min={1} max={1440} value={countdownMinutes} onChange={(event) => setCountdownMinutes(Number(event.target.value) || 1)} /></label></div> : <label className="countdown-finish-field"><span>结束时间</span><input type="time" value={finishAt} onChange={(event) => setFinishAt(event.target.value)} /><small>早于当前时间时，将按明天计算。</small></label>}
        <div className="countdown-create-row"><input className="field" value={countdownTitle} onChange={(event) => setCountdownTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createCountdown(); }} placeholder="倒计时名称，例如：烤箱、休息、准备出门" /><button type="button" className="primary-btn" disabled={timeMode === "finish" && !finishAt} onClick={() => void createCountdown()}>开始倒计时</button></div>
      </section>
      <TimerList title="我的倒计时" timers={countdowns} empty="还没有倒计时。选择一个时长，输入名称后即可开始。" onStart={startTimer} onPause={pauseTimer} onReset={resetTimer} onExtend={(id) => extendTimer(id, 300)} onRemove={removeTimer} completionLabel="删除" />
    </> : <>
      <section className="reminders-composer" aria-label="新建循环提醒"><div className="reminders-preset-grid">{TIMER_PRESETS.map((preset) => <button key={preset.title} type="button" className={`reminders-preset ${presetKey === preset.title ? "is-selected" : ""}`} onClick={() => { setPresetKey(preset.title); setIntervalTitle(preset.title); setIntervalMinutes(Math.round(preset.interval_sec / 60)); }}><span className="reminders-preset-mark" aria-hidden>{PRESET_MARKS[preset.title] ?? "计"}</span><span className="reminders-preset-name">{preset.title}</span><span className="reminders-preset-gap">每 {intervalLabel(preset.interval_sec)}</span></button>)}</div><div className="reminders-form-row"><label className="reminders-field"><span className="field-label">名称</span><input className="field" value={intervalTitle} onChange={(event) => { setIntervalTitle(event.target.value); setPresetKey(""); }} placeholder="例如：喝水" /></label><label className="reminders-field reminders-field-mins"><span className="field-label">间隔（分钟）</span><input className="field" type="number" min={1} max={1440} value={intervalMinutes} onChange={(event) => { setIntervalMinutes(Number(event.target.value) || 1); setPresetKey(""); }} /></label><div className="reminders-form-actions"><button type="button" className="btn-ghost" onClick={() => void createInterval(false)}>仅保存</button><button type="button" className="primary-btn" onClick={() => void createInterval(true)}>开始提醒</button></div></div></section>
      <TimerList title="循环提醒" timers={intervals} empty="还没有循环提醒。选择一个模板，或创建自己的提醒节奏。" onStart={startTimer} onPause={pauseTimer} onReset={resetTimer} onRemove={removeTimer} />
    </>}
  </div>;
}

function ActiveHero({ timer, onPause, onExtend, onComplete }: { timer: Timer; onPause: () => void; onExtend?: () => void; onComplete?: () => void }) {
  const remaining = liveRemaining(timer); const progress = Math.min(1, Math.max(0, 1 - remaining / Math.max(1, timer.interval_sec)));
  return <section className="reminders-hero is-active" aria-label="正在运行"><div className="reminders-hero-copy"><p className="reminders-kicker">正在进行</p><h3 className="reminders-hero-title">{timer.title}</h3><p className="reminders-hero-desc">{timer.kind === "interval" ? `每 ${intervalLabel(timer.interval_sec)} 提醒一次` : "到点后通过系统通知提醒"}</p><div className="reminders-hero-actions"><button type="button" className="primary-btn" onClick={onPause}>暂停</button>{onExtend ? <button type="button" className="btn-ghost" onClick={onExtend}>+5 分钟</button> : null}{onComplete ? <button type="button" className="btn-ghost" onClick={onComplete}>完成</button> : null}</div></div><div className="reminders-hero-clock"><div className="reminders-ring" style={{ ["--p" as string]: String(progress) }}><strong>{formatCountdown(remaining)}</strong></div></div></section>;
}

type TimerListProps = { title: string; timers: Timer[]; empty: string; onStart: (id: string) => Promise<void>; onPause: (id: string) => Promise<void>; onReset: (id: string) => Promise<void>; onExtend?: (id: string) => Promise<void>; onRemove: (id: string) => Promise<void>; completionLabel?: string };
function TimerList({ title, timers, empty, onStart, onPause, onReset, onExtend, onRemove, completionLabel = "删除" }: TimerListProps) {
  return <section className="reminders-section"><div className="reminders-section-head"><h3>{title}</h3><span>{timers.length}</span></div>{!timers.length ? <div className="reminders-empty">{empty}</div> : <div className="reminders-stack">{timers.map((timer) => <TimerCard key={timer.id} timer={timer} onStart={() => void onStart(timer.id)} onPause={() => void onPause(timer.id)} onReset={() => void onReset(timer.id)} onExtend={onExtend ? () => void onExtend(timer.id) : undefined} onRemove={() => { if (completionLabel === "完成" || window.confirm(`删除「${timer.title}」？`)) void onRemove(timer.id); }} completionLabel={completionLabel} />)}</div>}</section>;
}

function TimerCard({ timer, onStart, onPause, onReset, onExtend, onRemove, completionLabel }: { timer: Timer; onStart: () => void; onPause: () => void; onReset: () => void; onExtend?: () => void; onRemove: () => void; completionLabel: string }) {
  const remaining = liveRemaining(timer); const running = Boolean(timer.running); const progress = Math.min(1, Math.max(0, 1 - remaining / Math.max(1, timer.interval_sec)));
  return <article className={`timer-card ${running ? "is-running" : ""}`}><div className="timer-card-top"><div className="timer-card-text"><strong>{timer.title}</strong><span className="timer-badge">{timer.kind === "interval" ? `每 ${intervalLabel(timer.interval_sec)}` : running ? "进行中" : remaining === 0 ? "已结束" : "已暂停"}</span></div><div className="timer-countdown">{formatCountdown(remaining)}</div></div><div className="timer-progress" aria-hidden><span style={{ width: `${Math.round(progress * 100)}%` }} /></div><div className="timer-actions">{running ? <button type="button" className="btn-ghost" onClick={onPause}>暂停</button> : <button type="button" className="btn-ghost" onClick={onStart}>{remaining === 0 ? "再次开始" : "继续"}</button>}{onExtend && remaining > 0 ? <button type="button" className="btn-ghost" onClick={onExtend}>+5 分钟</button> : null}{remaining === 0 ? <button type="button" className="btn-ghost danger" onClick={onRemove}>删除</button> : <details className="timer-more"><summary>更多</summary><div><button type="button" onClick={onReset}>重置</button><button type="button" className="danger" onClick={onRemove}>{completionLabel}</button></div></details>}</div></article>;
}
