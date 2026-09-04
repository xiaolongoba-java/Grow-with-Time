import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { deleteTimer, fetchTimers, pauseTimer, resetTimer, startTimer } from "@/lib/db/timers";
import { formatCountdown, liveRemaining } from "@/lib/timers";
import { bindVisibleDataRefresh } from "@/lib/widgetRefresh";
import type { Timer } from "@/types";

export function FloatApp() {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const refresh = async () => {
    try { setTimers(await fetchTimers()); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "计时器加载失败"); }
  };

  useEffect(() => {
    document.documentElement.dataset.theme ||= "system";
    const unbind = bindVisibleDataRefresh(refresh, { fallbackMs: 30_000 });
    const tick = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => { unbind(); window.clearInterval(tick); };
  }, []);

  const activeTimers = useMemo(() => [...timers].filter((timer) => timer.enabled).sort((a, b) => {
    if (a.running !== b.running) return b.running - a.running;
    return liveRemaining(a) - liveRemaining(b);
  }), [timers]);
  const primaryTimer = activeTimers.find((timer) => timer.running) ?? activeTimers[0] ?? null;
  const hideFloat = () => void invoke("hide_float").catch(() => getCurrentWebviewWindow().hide());
  const remaining = primaryTimer ? liveRemaining(primaryTimer) : 0;
  const progress = primaryTimer ? Math.min(1, Math.max(0, 1 - remaining / Math.max(1, primaryTimer.interval_sec))) : 0;

  return <main className="float-shell float-timer-shell">
    <header className="float-titlebar" data-tauri-drag-region>
      <div data-tauri-drag-region><i className={primaryTimer?.running ? "is-running" : ""} /><strong data-tauri-drag-region>倒计时</strong></div>
      <button type="button" className="float-close" title="关闭倒计时" aria-label="关闭倒计时" onClick={hideFloat}>×</button>
    </header>
    <section className="float-body float-timer-body">
      {error ? <div className="float-timer-empty"><strong>暂时无法读取倒计时</strong><span>{error}</span><button type="button" onClick={() => void refresh()}>重试</button></div> : primaryTimer ? <>
        <p className="float-timer-kicker">{primaryTimer.running ? "专注进行中" : remaining === 0 ? "计时已结束" : "计时已暂停"}</p>
        <div className="float-timer-ring" style={{ ["--p" as string]: String(progress) }}><p className="float-timer-clock">{formatCountdown(remaining)}</p></div>
        <div className="float-timer-caption"><strong>{primaryTimer.title}</strong><span>{primaryTimer.kind === "interval" ? "循环提醒" : "单次倒计时"}</span></div>
        <div className="float-timer-actions">
          {primaryTimer.running ? <button type="button" className="is-primary" onClick={() => void pauseTimer(primaryTimer.id).then(refresh)}>暂停</button> : remaining > 0 ? <button type="button" className="is-primary" onClick={() => void startTimer(primaryTimer.id).then(refresh)}>继续</button> : null}
          {remaining > 0 ? <button type="button" onClick={() => void resetTimer(primaryTimer.id).then(refresh)}>重置</button> : <button type="button" className="is-danger" onClick={() => void deleteTimer(primaryTimer.id).then(refresh)}>删除</button>}
        </div>
        {activeTimers.length > 1 ? <div className="float-timer-queue"><span>另外 {activeTimers.length - 1} 个计时</span>{activeTimers.filter((timer) => timer.id !== primaryTimer.id).slice(0, 2).map((timer) => <div key={timer.id}><span>{timer.title}</span><strong>{formatCountdown(liveRemaining(timer))}</strong></div>)}</div> : null}
      </> : <div className="float-timer-empty"><span className="float-timer-empty-mark">00:00</span><strong>还没有倒计时</strong><span>从提醒页面开始一段计时后，这里会专心显示它。</span></div>}
    </section>
  </main>;
}
