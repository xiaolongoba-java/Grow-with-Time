import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AppIcon } from "@/components/AppIcon";
import { checkForVersionUpdate, type VersionUpdate } from "@/lib/versionUpdate";
import { useAppStore } from "@/store/app";

const SNOOZE_KEY = "grow-with-time.version-update-snooze";
const SNOOZE_MS = 24 * 60 * 60 * 1000;

function isSnoozed(version: string): boolean {
  try {
    const value = JSON.parse(localStorage.getItem(SNOOZE_KEY) || "null") as { version?: string; until?: number } | null;
    return value?.version === version && Number(value.until) > Date.now();
  } catch {
    return false;
  }
}

export function VersionUpdateNotice() {
  const setToast = useAppStore((state) => state.setToast);
  const [update, setUpdate] = useState<VersionUpdate | null>(null);
  const [checking, setChecking] = useState(false);

  const runCheck = async (manual = false) => {
    if (checking) return;
    setChecking(true);
    try {
      const next = await checkForVersionUpdate();
      if (next && (manual || !isSnoozed(next.latestVersion))) setUpdate(next);
      else if (manual) setToast(next ? `v${next.latestVersion} 已暂缓提醒` : "当前已经是最新版本");
    } catch {
      if (manual) setToast("版本检查失败，请稍后重试");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void runCheck(false), 2500);
    const onManualCheck = () => void runCheck(true);
    window.addEventListener("version:check", onManualCheck);
    return () => { window.clearTimeout(timer); window.removeEventListener("version:check", onManualCheck); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!update) return null;
  const notes = update.releaseNotes.replace(/[#*_>`]/g, "").split("\n").filter(Boolean).slice(0, 2).join(" ").slice(0, 150);
  return <aside className="version-update-notice" role="dialog" aria-label="发现新版本" aria-live="polite">
    <div className="version-update-icon"><AppIcon name="sparkle" size={22} /></div>
    <div className="version-update-copy"><span>发现新版本</span><h3>日进·拾光 v{update.latestVersion}</h3><p>{notes}</p><small>当前 v{update.currentVersion} · 来自 {update.source}</small></div>
    <button type="button" className="version-update-close" aria-label="稍后提醒" onClick={() => { localStorage.setItem(SNOOZE_KEY, JSON.stringify({ version: update.latestVersion, until: Date.now() + SNOOZE_MS })); setUpdate(null); }}>×</button>
    <div className="version-update-actions"><button type="button" onClick={() => { localStorage.setItem(SNOOZE_KEY, JSON.stringify({ version: update.latestVersion, until: Date.now() + SNOOZE_MS })); setUpdate(null); }}>稍后提醒</button><button type="button" className="is-primary" onClick={() => void openUrl(update.releaseUrl)}>查看更新</button></div>
  </aside>;
}
