import { useEffect, useState, type KeyboardEvent } from "react";
import { PageCloseButton } from "@/components/PageCloseButton";
import { useAppStore } from "@/store/app";
import {
  exportBackup,
  fetchLedgerAccounts,
  fetchLedgerCategories,
  getSetting,
  importBackup,
  saveLedgerAccount,
  saveLedgerCategory,
  setSetting,
  summarizeBackupRestore,
  toggleLedgerAccount,
  toggleLedgerCategory,
  type LedgerAccount,
  type LedgerCategory,
  type LedgerKind,
} from "@/lib/db";
import type { BackupPayload } from "@/types";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { invoke } from "@tauri-apps/api/core";
import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { getVersion } from "@tauri-apps/api/app";
import { themeMeta, type VisualTheme } from "@/lib/themes";
import { OS_REMINDER_LIMIT } from "@/lib/nativeReminders";
import { emitDataChanged } from "@/lib/widgetRefresh";
import {
  HOTKEY_ACTIONS,
  acceleratorFromKeyboardEvent,
  displayAccelerator,
  findHotkeyConflict,
  hotkeyRegistrationErrorKey,
  isHotkeyEnabled,
  notifyHotkeysChanged,
  resolveAccelerator,
  type HotkeyActionId,
  type HotkeyDraft,
} from "@/lib/hotkeys";
import { requestLedgerEntryOpen } from "@/lib/ledgerQuickAdd";

type DatabaseHealth = {
  healthy: boolean;
  databaseExists: boolean;
  databaseSize: number;
  dataDirectory: string;
  writable: boolean;
};

type DatabaseBackupInfo = {
  id: string;
  size: number;
  createdAt: number;
};

export function SettingsView() {
  const settings = useAppStore((s) => s.settings);
  const setTheme = useAppStore((s) => s.setTheme);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const saveAi = useAppStore((s) => s.saveAi);
  const setToast = useAppStore((s) => s.setToast);
  const [ai, setAi] = useState(settings.ai);
  const [databaseHealth, setDatabaseHealth] = useState<DatabaseHealth | null>(null);
  const [databaseBackups, setDatabaseBackups] = useState<DatabaseBackupInfo[]>([]);
  const [checkingData, setCheckingData] = useState(false);
  const [appVersion, setAppVersion] = useState("…");
  const [hotkeys, setHotkeys] = useState<Record<HotkeyActionId, HotkeyDraft>>(() =>
    Object.fromEntries(
      HOTKEY_ACTIONS.map((action) => [
        action.id,
        { enabled: true, accelerator: action.defaultAccelerator },
      ]),
    ) as Record<HotkeyActionId, HotkeyDraft>,
  );
  const [recordingHotkey, setRecordingHotkey] = useState<HotkeyActionId | null>(null);
  const [recordingOriginal, setRecordingOriginal] = useState("");
  const [hotkeyErrors, setHotkeyErrors] = useState<Partial<Record<HotkeyActionId, string>>>({});
  const [notificationPermission, setNotificationPermission] = useState<boolean | null>(null);

  const refreshDataHealth = async () => {
    setCheckingData(true);
    try {
      const [health, backups] = await Promise.all([
        invoke<DatabaseHealth>("database_health"),
        invoke<DatabaseBackupInfo[]>("list_database_backups"),
      ]);
      setDatabaseHealth(health);
      setDatabaseBackups(backups);
    } catch (error) {
      setToast(`数据检查失败：${String(error)}`);
    } finally {
      setCheckingData(false);
    }
  };

  useEffect(() => {
    void refreshDataHealth();
    void getVersion().then(setAppVersion).catch(() => setAppVersion("未知"));
    void isPermissionGranted().then(setNotificationPermission).catch(() => setNotificationPermission(false));
    void Promise.all(
      HOTKEY_ACTIONS.map(async (action) => {
        const [enabled, accelerator, registrationError] = await Promise.all([
          getSetting(action.enabledKey),
          getSetting(action.acceleratorKey),
          getSetting(hotkeyRegistrationErrorKey(action.id)),
        ]);
        return [
          action.id,
          {
            enabled: isHotkeyEnabled(enabled),
            accelerator: resolveAccelerator(action, accelerator),
          },
          registrationError ?? "",
        ] as const;
      }),
    ).then((entries) => {
      setHotkeys(Object.fromEntries(entries.map(([id, draft]) => [id, draft])) as Record<HotkeyActionId, HotkeyDraft>);
      setHotkeyErrors(Object.fromEntries(entries.map(([id, , error]) => [id, error])));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchHotkey = (id: HotkeyActionId, patch: Partial<HotkeyDraft>) => {
    setHotkeys((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };

  const saveHotkey = async (id: HotkeyActionId) => {
    const action = HOTKEY_ACTIONS.find((item) => item.id === id);
    if (!action) return;
    const conflict = findHotkeyConflict(id, hotkeys);
    if (conflict) {
      setToast(`该组合已被「${conflict.label}」占用`);
      return;
    }
    const draft = hotkeys[id];
    const previousEnabled = isHotkeyEnabled(await getSetting(action.enabledKey));
    const previousAccelerator = resolveAccelerator(
      action,
      await getSetting(action.acceleratorKey),
    );
    const handler = () => {
      if (id === "quick_add") void invoke("show_quick_add");
      if (id === "inspiration") void invoke("show_inspiration");
      if (id === "ledger_quick_add") {
        useAppStore.getState().setNav("ledger");
        requestLedgerEntryOpen();
        void invoke("open_main_window", { nav: "ledger" });
      }
      if (id === "countdown") {
        const store = useAppStore.getState();
        store.setNav("reminders");
        void invoke("open_main_window", { nav: "reminders" });
        if (!store.timers.some((timer) => timer.running && timer.kind === "task")) {
          void store.addTimer({
            kind: "task",
            title: "快捷倒计时",
            interval_sec: 25 * 60,
            start: true,
          });
        }
      }
    };
    let registeredNew = false;
    let removedPrevious = false;
    try {
      if (action.scope === "global") {
        if (!draft.enabled) {
          if (previousEnabled && await isRegistered(previousAccelerator)) {
            await unregister(previousAccelerator);
            removedPrevious = true;
          }
        } else if (!(previousAccelerator === draft.accelerator && await isRegistered(draft.accelerator))) {
          if (await isRegistered(draft.accelerator)) {
            throw new Error("该组合键已被应用内其他动作占用");
          }
          await register(draft.accelerator, handler);
          registeredNew = true;
          if (previousEnabled && previousAccelerator !== draft.accelerator && await isRegistered(previousAccelerator)) {
            await unregister(previousAccelerator);
            removedPrevious = true;
          }
        }
      }
      await setSetting(action.enabledKey, String(draft.enabled));
      await setSetting(action.acceleratorKey, draft.accelerator);
      await setSetting(hotkeyRegistrationErrorKey(id), "");
      setHotkeyErrors((current) => ({ ...current, [id]: "" }));
      notifyHotkeysChanged();
      setToast(`${action.label}快捷键已更新`);
    } catch (error) {
      if (registeredNew && await isRegistered(draft.accelerator).catch(() => false)) {
        await unregister(draft.accelerator).catch(() => undefined);
      }
      if (removedPrevious && previousEnabled && !(await isRegistered(previousAccelerator).catch(() => false))) {
        await register(previousAccelerator, handler).catch(() => undefined);
      }
      const message = error instanceof Error ? error.message : String(error);
      await setSetting(hotkeyRegistrationErrorKey(id), message);
      setHotkeyErrors((current) => ({ ...current, [id]: message }));
      setToast(`${action.label}启用失败，请更换组合键：${message}`);
    }
  };

  const captureHotkey = (id: HotkeyActionId, event: KeyboardEvent<HTMLButtonElement>) => {
    if (recordingHotkey !== id) return;
    event.preventDefault();
    if (event.key === "Escape") {
      patchHotkey(id, { accelerator: recordingOriginal });
      setRecordingHotkey(null);
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      patchHotkey(id, { accelerator: "" });
      return;
    }
    const accelerator = acceleratorFromKeyboardEvent(event.nativeEvent);
    if (!accelerator) return;
    patchHotkey(id, { accelerator });
    setRecordingHotkey(null);
  };

  const toggleHotkeyRecording = (id: HotkeyActionId) => {
    if (recordingHotkey === id) {
      patchHotkey(id, { accelerator: recordingOriginal });
      setRecordingHotkey(null);
      return;
    }
    setRecordingOriginal(hotkeys[id].accelerator);
    setRecordingHotkey(id);
  };

  const cancelHotkeyRecording = (id: HotkeyActionId) => {
    if (recordingHotkey !== id) return;
    patchHotkey(id, { accelerator: recordingOriginal });
    setRecordingHotkey(null);
  };

  const restoreDatabaseBackup = async (backup: DatabaseBackupInfo) => {
    const created = new Date(backup.createdAt * 1000).toLocaleString();
    if (
      !window.confirm(
        `确认恢复 ${created} 的启动备份？\n\n当前数据库会先自动备份，应用随后重启。`,
      )
    ) {
      return;
    }
    await invoke("schedule_database_restore", { backupId: backup.id });
    await invoke("restart_app");
  };

  const exportJson = async () => {
    const payload = await exportBackup();
    const path = await save({
      defaultPath: `grow-with-time-backup-${Date.now()}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    await writeTextFile(path, JSON.stringify(payload, null, 2));
    setToast("已导出 JSON 备份");
  };

  const exportCsv = async () => {
    const payload = await exportBackup();
    const header =
      "id,title,status,priority,due_date,due_time,end_time,parent_id,created_at,completed_at\n";
    const rows = payload.tasks
      .map((t) =>
        [
          t.id,
          JSON.stringify(t.title),
          t.status,
          t.priority,
          t.due_date ?? "",
          t.due_time ?? "",
          t.end_time ?? "",
          t.parent_id ?? "",
          t.created_at,
          t.completed_at ?? "",
        ].join(","),
      )
      .join("\n");
    const path = await save({
      defaultPath: `grow-with-time-tasks-${Date.now()}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return;
    await writeTextFile(path, header + rows);
    setToast("已导出 CSV");
  };

  const importJson = async () => {
    const path = await open({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path || Array.isArray(path)) return;
    const text = await readTextFile(path);
    const payload = JSON.parse(text) as BackupPayload;
    if (!window.confirm(summarizeBackupRestore(payload))) return;
    const backupId = await invoke<string>("create_database_backup");
    // Keep a crash-safe rollback marker until every import write succeeds.
    await invoke("schedule_database_restore", { backupId });
    try {
      await importBackup(payload);
      await invoke("cancel_database_restore");
      await useAppStore.getState().refreshAll();
      setToast("已从备份恢复");
    } catch (error) {
      setToast(`恢复失败，正在从快照 ${backupId} 回滚并重启…`);
      await invoke("restart_app");
      throw error;
    }
  };

  const toggleAutostart = async () => {
    const next = !settings.autostart;
    try {
      if (next) await enable();
      else await disable();
      const enabled = await isEnabled();
      await updateSettings({ autostart: enabled });
    } catch (error) {
      const actual = await isEnabled().catch(() => settings.autostart);
      await updateSettings({ autostart: actual });
      setToast(`开机自启设置失败，已保持${actual ? "开启" : "关闭"}：${String(error)}`);
    }
  };

  const enableNotifications = async () => {
    try {
      const permission = await requestPermission();
      const granted = permission === "granted";
      setNotificationPermission(granted);
      setToast(granted ? "系统通知权限已开启" : "系统通知权限未授予");
      window.dispatchEvent(new Event("notifications:permission-changed"));
    } catch (error) {
      setNotificationPermission(false);
      setToast(`通知权限申请失败：${String(error)}`);
    }
  };

  return (
    <main className="main-workspace" style={{ padding: 22, overflow: "auto" }}>
      <div className="workspace-top" style={{ padding: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>设置</h2>
        <PageCloseButton />
      </div>

      <section className="settings-card" style={{ marginTop: 16 }}>
        <div className="theme-section-heading">
          <div><h3>外观</h3><p>选择一天工作时想进入的光线。</p></div>
          <span>清晰，也要有氛围</span>
        </div>
        <div className="theme-gallery">
          {(Object.entries(themeMeta) as [VisualTheme, (typeof themeMeta)[VisualTheme]][]).map(([t, meta]) => (
            <button
              key={t}
              type="button"
              className={`theme-preview theme-preview-${t} ${settings.theme === t ? "active" : ""}`}
              onClick={() => void setTheme(t)}
              aria-pressed={settings.theme === t}
            >
              <span className="theme-preview-canvas" style={{ "--preview-bg": meta.preview[0], "--preview-card": meta.preview[1], "--preview-accent": meta.preview[2] } as React.CSSProperties}>
                <i /><i /><i /><b />
              </span>
              <span className="theme-preview-copy"><strong>{meta.name}</strong><small>{meta.mood}</small><em>{meta.description}</em></span>
              <span className="theme-preview-check" aria-hidden>{settings.theme === t ? "✓" : ""}</span>
            </button>
          ))}
        </div>
        <label className="theme-system-toggle">
          <input type="checkbox" checked={settings.theme === "system"} onChange={(event) => void setTheme(event.target.checked ? "system" : "light")} />
          <span><strong>跟随系统</strong><small>随 Windows 在清昼与静夜之间自动切换</small></span>
        </label>
      </section>

      <section className="settings-card" style={{ marginTop: 12 }}>
        <h3>提醒与启动</h3>
        <label className="field-label">默认提前提醒（分钟）</label>
        <input
          className="field"
          type="number"
          style={{ maxWidth: 160 }}
          value={settings.notifyAhead}
          onChange={(e) =>
            void updateSettings({ notifyAhead: Number(e.target.value) || 30 })
          }
        />
        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn-ghost" onClick={() => void toggleAutostart()}>
            开机自启：{settings.autostart ? "已开启" : "已关闭"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            style={{ marginLeft: 8 }}
            disabled={notificationPermission === true}
            onClick={() => void enableNotifications()}
          >
            系统通知：{notificationPermission === null ? "检测中…" : notificationPermission ? "已授权" : "点击授权"}
          </button>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          关闭主窗口会放到托盘，不会退出；彻底退出请用托盘「退出应用」。
          系统会登记到期提醒，完全退出后仍可能弹出。若系统通知权限被关，则无法保证准点。
          全局快捷键可在下方「全局快捷键」中启停和改绑。
        </p>
        <ReminderSyncStatusCard />
      </section>

      <section className="settings-card settings-version-card" style={{ marginTop: 12 }}>
        <div><span>应用版本</span><h3>日进·拾光 v{appVersion}</h3><p>启动后会静默检查一次；只有发现新版本时才会提醒。</p></div>
        <button type="button" className="btn-ghost" onClick={() => window.dispatchEvent(new Event("version:check"))}>检查更新</button>
      </section>

      <section className="settings-card" style={{ marginTop: 12 }}>
        <h3>桌面浮窗</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          专注显示当前倒计时。开始倒计时后会自动打开，也可从托盘菜单呼出。
        </p>
        <button
          type="button"
          className="btn-primary"
          style={{ width: "auto" }}
          onClick={() => {
            void import("@tauri-apps/api/core").then(({ invoke }) =>
              invoke("show_float"),
            );
          }}
        >
          显示倒计时浮窗
        </button>
      </section>

      <section className="settings-card" style={{ marginTop: 12 }}>
        <h3>桌面组件</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          默认模式决定侧栏「桌面组件」打开哪一种。置底时组件贴在主窗口后面，仍保留玻璃透明感。
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <button
            type="button"
            className={settings.desktopWidgetMode === "dashboard" ? "btn-primary" : "btn-ghost"}
            style={{ width: "auto" }}
            onClick={() => void updateSettings({ desktopWidgetMode: "dashboard" })}
          >
            横条仪表盘
          </button>
          <button
            type="button"
            className={settings.desktopWidgetMode === "classic" ? "btn-primary" : "btn-ghost"}
            style={{ width: "auto" }}
            onClick={() => void updateSettings({ desktopWidgetMode: "classic" })}
          >
            经典三件套
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <button
            type="button"
            className={settings.desktopWidgetLayer === "bottom" ? "btn-primary" : "btn-ghost"}
            style={{ width: "auto" }}
            onClick={() => void updateSettings({ desktopWidgetLayer: "bottom" })}
          >
            贴窗口底层
          </button>
          <button
            type="button"
            className={settings.desktopWidgetLayer === "top" ? "btn-primary" : "btn-ghost"}
            style={{ width: "auto" }}
            onClick={() => void updateSettings({ desktopWidgetLayer: "top" })}
          >
            始终置顶
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              void import("@/lib/desktopWidgets").then(({ openDesktopWidgets }) =>
                openDesktopWidgets("dashboard", settings.desktopWidgetLayer),
              );
            }}
          >
            打开仪表盘
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              void import("@/lib/desktopWidgets").then(({ openDesktopWidgets }) =>
                openDesktopWidgets("classic", settings.desktopWidgetLayer),
              );
            }}
          >
            打开经典组件
          </button>
        </div>
      </section>

      <section className="settings-card" style={{ marginTop: 12 }}>
        <h3>隐私</h3>
        <p>本地优先，任务数据仅保存在本机。默认不上传任何日志与任务内容。</p>
        <button
          type="button"
          className="btn-ghost"
          onClick={() =>
            void updateSettings({ privacyMode: !settings.privacyMode })
          }
        >
          无痕模式：{settings.privacyMode ? "开启" : "关闭"}
        </button>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          开启后，系统通知只显示「日进·拾光 / 你有一条提醒」；任务标题会打码；账本金额显示为圆点，状态文案（如「尚未设置」）保持清晰。
        </p>
      </section>

      <section className="settings-card" style={{ marginTop: 12 }}>
        <h3>数据备份</h3>
        <button
          type="button"
          className="btn-ghost"
          onClick={() =>
            void updateSettings({ autoBackup: !settings.autoBackup })
          }
        >
          自动备份：{settings.autoBackup ? "已开启" : "已关闭"}
        </button>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          开启后每 6 小时保存一份备份，自动保留最近 10 个版本。
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          最近成功：
          {settings.autoBackupLastOk
            ? new Date(settings.autoBackupLastOk).toLocaleString()
            : "尚无成功记录"}
          {settings.autoBackupLastError
            ? ` · 最近失败：${settings.autoBackupLastError}${
                settings.autoBackupFailStreak > 1
                  ? `（连续 ${settings.autoBackupFailStreak} 次）`
                  : ""
              }`
            : " · 当前无失败"}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn-primary" style={{ width: "auto" }} onClick={() => void exportJson()}>
            导出 JSON
          </button>
          <button type="button" className="btn-ghost" onClick={() => void exportCsv()}>
            导出 CSV
          </button>
          <button type="button" className="btn-ghost" onClick={() => void importJson()}>
            导入恢复
          </button>
          <button type="button" className="btn-ghost" onClick={() => void invoke("open_data_directory")}>
            打开数据目录
          </button>
        </div>

        <div className="data-health-panel">
          <div className="data-health-head">
            <div>
              <strong>数据健康</strong>
              <span>
                {databaseHealth
                  ? databaseHealth.healthy && databaseHealth.writable
                    ? "数据库正常，可读写"
                    : "数据库需要检查"
                  : "尚未检查"}
              </span>
            </div>
            <button
              type="button"
              className="btn-ghost"
              disabled={checkingData}
              onClick={() => void refreshDataHealth()}
            >
              {checkingData ? "检查中…" : "重新检查"}
            </button>
          </div>
          {databaseHealth ? (
            <dl className="data-health-details">
              <div>
                <dt>数据库大小</dt>
                <dd>{Math.max(1, Math.round(databaseHealth.databaseSize / 1024))} KB</dd>
              </div>
              <div>
                <dt>启动备份</dt>
                <dd>{databaseBackups.length} 份</dd>
              </div>
            </dl>
          ) : null}
          {databaseBackups.length ? (
            <div className="database-backup-list">
              {databaseBackups.slice(0, 5).map((backup) => (
                <div key={backup.id}>
                  <span>
                    {new Date(backup.createdAt * 1000).toLocaleString()}
                    <small>{Math.max(1, Math.round(backup.size / 1024))} KB</small>
                  </span>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => void restoreDatabaseBackup(backup)}
                  >
                    恢复此版本
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="settings-hint">下次启动时会生成第一份数据库快照。</p>
          )}
        </div>
      </section>

      <section className="settings-card" style={{ marginTop: 12 }}>
        <LedgerSettingsPanel setToast={setToast} />
      </section>

      <section className="settings-card" style={{ marginTop: 12 }}>
        <h3>全局快捷键</h3>
        <p className="settings-hint">所有带快捷键的功能都在这里配置。标了「全局」的在其他应用中也能唤起；命令面板仅在主窗口内生效。</p>
        {HOTKEY_ACTIONS.map((action) => {
          const draft = hotkeys[action.id];
          const recording = recordingHotkey === action.id;
          const conflict = findHotkeyConflict(action.id, hotkeys);
          return (
            <div key={action.id} style={{ marginTop: 14 }}>
              <div className="settings-row">
                <div>
                  <strong>{action.label}</strong>
                  <p className="settings-hint">
                    {action.hint}
                    {action.scope === "global" ? " · 全局" : " · 仅主窗口"}
                  </p>
                </div>
                <label className="ledger-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) => patchHotkey(action.id, { enabled: event.target.checked })}
                  />
                  启用
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!draft.enabled}
                  onClick={() => toggleHotkeyRecording(action.id)}
                  onKeyDown={(event) => captureHotkey(action.id, event)}
                  onBlur={() => cancelHotkeyRecording(action.id)}
                  aria-pressed={recording}
                >
                  {recording ? "请按 Ctrl/⌘ + 按键（Esc 取消）" : displayAccelerator(draft.accelerator)}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!draft.enabled}
                  onClick={() => patchHotkey(action.id, { accelerator: action.defaultAccelerator })}
                >
                  恢复默认
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: "auto" }}
                  disabled={draft.enabled && (!draft.accelerator || Boolean(conflict))}
                  onClick={() => void saveHotkey(action.id)}
                >
                  保存
                </button>
              </div>
              {conflict && draft.enabled ? (
                <p className="settings-hint" role="alert">与「{conflict.label}」冲突，请更换后再保存</p>
              ) : null}
              {!draft.accelerator && draft.enabled ? (
                <p className="settings-hint" role="alert">请录制一个组合键，或先关闭此快捷键</p>
              ) : null}
              {hotkeyErrors[action.id] ? (
                <p className="settings-hint" role="alert">当前未启用：{hotkeyErrors[action.id]}</p>
              ) : null}
            </div>
          );
        })}
      </section>

      <section className="settings-card" style={{ marginTop: 12 }}>
        <h3>AI（OpenAI 兼容）</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          未配置 API Key 时，AI 拆解与智能排期不可用。Base URL 仅支持 HTTPS，或本机
          HTTP（localhost / 127.0.0.1）。
        </p>
        <label className="field-label">Base URL</label>
        <input
          className="field"
          value={ai.baseUrl}
          onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })}
        />
        <label className="field-label">API Key</label>
        <input
          className="field"
          type="password"
          value={ai.apiKey}
          onChange={(e) => setAi({ ...ai, apiKey: e.target.value })}
        />
        <label className="field-label">Model</label>
        <input
          className="field"
          value={ai.model}
          onChange={(e) => setAi({ ...ai, model: e.target.value })}
        />
        <button
          type="button"
          className="btn-primary"
          style={{ width: "auto", marginTop: 10 }}
          onClick={() => void saveAi(ai)}
        >
          保存 AI 设置
        </button>
      </section>
    </main>
  );
}

function LedgerSettingsPanel({ setToast }: { setToast: (message: string | null) => void }) {
  const [categories, setCategories] = useState<LedgerCategory[]>([]);
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [expenseDefault, setExpenseDefault] = useState(1);
  const [incomeDefault, setIncomeDefault] = useState(11);
  const [accountDefault, setAccountDefault] = useState(2);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryKind, setNewCategoryKind] = useState<LedgerKind>("expense");
  const [newAccountName, setNewAccountName] = useState("");

  const load = async () => {
    const [nextCategories, nextAccounts, expense, income, account] = await Promise.all([
      fetchLedgerCategories(undefined, true),
      fetchLedgerAccounts(true),
      getSetting("ledger_default_expense_category_id"),
      getSetting("ledger_default_income_category_id"),
      getSetting("ledger_default_account_id"),
    ]);
    const enabledExpenses = nextCategories.filter((item) => item.kind === "expense" && item.is_enabled);
    const enabledIncomes = nextCategories.filter((item) => item.kind === "income" && item.is_enabled);
    const enabledAccounts = nextAccounts.filter((item) => item.is_enabled);
    const configuredExpense = Number(expense);
    const configuredIncome = Number(income);
    const configuredAccount = Number(account);
    setCategories(nextCategories);
    setAccounts(nextAccounts);
    setExpenseDefault(enabledExpenses.some((item) => item.id === configuredExpense) ? configuredExpense : enabledExpenses[0]?.id ?? 0);
    setIncomeDefault(enabledIncomes.some((item) => item.id === configuredIncome) ? configuredIncome : enabledIncomes[0]?.id ?? 0);
    setAccountDefault(enabledAccounts.some((item) => item.id === configuredAccount) ? configuredAccount : enabledAccounts[0]?.id ?? 0);
  };

  useEffect(() => { void load(); }, []);

  const saveDefault = async (key: string, value: number) => {
    await setSetting(key, String(value));
    if (key.includes("expense")) setExpenseDefault(value);
    else if (key.includes("income")) setIncomeDefault(value);
    else setAccountDefault(value);
    setToast("账本默认项已更新");
    await emitDataChanged("ledger-settings");
  };

  const toggleCategory = async (category: LedgerCategory) => {
    const enabledForKind = categories.filter((item) => item.kind === category.kind && item.is_enabled);
    if (category.is_enabled && enabledForKind.length <= 1) {
      setToast(`${category.kind === "expense" ? "支出" : "收入"}至少保留一个可用分类`);
      return;
    }
    try {
      if (category.is_enabled) {
        const fallback = enabledForKind.find((item) => item.id !== category.id);
        const currentDefault = category.kind === "expense" ? expenseDefault : incomeDefault;
        if (fallback && currentDefault === category.id) {
          await saveDefault(
            category.kind === "expense" ? "ledger_default_expense_category_id" : "ledger_default_income_category_id",
            fallback.id,
          );
        }
      }
      await toggleLedgerCategory(category.id, !category.is_enabled);
      await load();
      await emitDataChanged("ledger-settings");
    } catch (error) {
      setToast(`分类状态更新失败：${String(error)}`);
    }
  };

  const toggleAccount = async (account: LedgerAccount) => {
    const enabledAccounts = accounts.filter((item) => item.is_enabled);
    if (account.is_enabled && enabledAccounts.length <= 1) {
      setToast("至少保留一个可用支付渠道");
      return;
    }
    try {
      if (account.is_enabled && accountDefault === account.id) {
        const fallback = enabledAccounts.find((item) => item.id !== account.id);
        if (fallback) await saveDefault("ledger_default_account_id", fallback.id);
      }
      await toggleLedgerAccount(account.id, !account.is_enabled);
      await load();
      await emitDataChanged("ledger-settings");
    } catch (error) {
      setToast(`支付渠道状态更新失败：${String(error)}`);
    }
  };

  const addCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      await saveLedgerCategory({ name, kind: newCategoryKind, icon: "dots", color: newCategoryKind === "expense" ? "#8d99ab" : "#2f8f68" });
      setNewCategoryName("");
      await load();
      setToast("分类已添加");
      await emitDataChanged("ledger-settings");
    } catch (error) {
      setToast(`分类添加失败：${String(error)}`);
    }
  };

  const addAccount = async () => {
    const name = newAccountName.trim();
    if (!name) return;
    try {
      await saveLedgerAccount({ name });
      setNewAccountName("");
      await load();
      setToast("支付渠道已添加");
      await emitDataChanged("ledger-settings");
    } catch (error) {
      setToast(`支付渠道添加失败：${String(error)}`);
    }
  };

  return (
    <div className="ledger-settings-panel">
      <div className="theme-section-heading">
        <div><h3>观流账本</h3><p>设置快速记账的默认项，维护分类和支付渠道。</p></div>
        <span>少填一步，记得更快</span>
      </div>
      <div className="ledger-settings-defaults">
        <label>默认支出分类<select value={expenseDefault} onChange={(event) => void saveDefault("ledger_default_expense_category_id", Number(event.target.value))}>{categories.filter((item) => item.kind === "expense" && item.is_enabled).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>默认收入分类<select value={incomeDefault} onChange={(event) => void saveDefault("ledger_default_income_category_id", Number(event.target.value))}>{categories.filter((item) => item.kind === "income" && item.is_enabled).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>默认支付渠道<select value={accountDefault} onChange={(event) => void saveDefault("ledger_default_account_id", Number(event.target.value))}>{accounts.filter((item) => item.is_enabled).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      <div className="ledger-settings-columns">
        <div>
          <h4>收支分类</h4>
          <div className="ledger-settings-add"><select value={newCategoryKind} onChange={(event) => setNewCategoryKind(event.target.value as LedgerKind)}><option value="expense">支出</option><option value="income">收入</option></select><input maxLength={12} value={newCategoryName} placeholder="新分类名称" onChange={(event) => setNewCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addCategory(); }} /><button className="btn-ghost" onClick={() => void addCategory()}>添加</button></div>
          <div className="ledger-settings-list">{categories.map((category) => <LedgerCategorySettingRow key={category.id} category={category} onChanged={load} onToggle={toggleCategory} setToast={setToast} />)}</div>
        </div>
        <div>
          <h4>支付渠道</h4>
          <div className="ledger-settings-add"><input maxLength={16} value={newAccountName} placeholder="新渠道名称" onChange={(event) => setNewAccountName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addAccount(); }} /><button className="btn-ghost" onClick={() => void addAccount()}>添加</button></div>
          <div className="ledger-settings-list">{accounts.map((account) => <LedgerAccountSettingRow key={account.id} account={account} onChanged={load} onToggle={toggleAccount} setToast={setToast} />)}</div>
        </div>
      </div>
    </div>
  );
}

function LedgerCategorySettingRow({ category, onChanged, onToggle, setToast }: { category: LedgerCategory; onChanged: () => Promise<void>; onToggle: (category: LedgerCategory) => Promise<void>; setToast: (message: string | null) => void }) {
  const [name, setName] = useState(category.name);
  useEffect(() => setName(category.name), [category.name]);
  const saveName = async () => {
    if (!name.trim() || name.trim() === category.name) return;
    try {
      await saveLedgerCategory({ id: category.id, name, icon: category.icon, color: category.color, kind: category.kind });
      await onChanged();
      setToast("分类名称已更新");
      await emitDataChanged("ledger-settings");
    } catch (error) { setName(category.name); setToast(`分类更新失败：${String(error)}`); }
  };
  return <div className="ledger-settings-item"><span>{category.kind === "expense" ? "支" : "收"}</span><input maxLength={12} value={name} onChange={(event) => setName(event.target.value)} onBlur={() => void saveName()} onKeyDown={(event) => { if (event.key === "Enter") void saveName(); }} /><button className="btn-ghost" onClick={() => void onToggle(category)}>{category.is_enabled ? "停用" : "启用"}</button></div>;
}

function LedgerAccountSettingRow({ account, onChanged, onToggle, setToast }: { account: LedgerAccount; onChanged: () => Promise<void>; onToggle: (account: LedgerAccount) => Promise<void>; setToast: (message: string | null) => void }) {
  const [name, setName] = useState(account.name);
  useEffect(() => setName(account.name), [account.name]);
  const saveName = async () => {
    if (!name.trim() || name.trim() === account.name) return;
    try {
      await saveLedgerAccount({ id: account.id, name, kind: account.kind, color: account.color });
      await onChanged();
      setToast("支付渠道已更新");
      await emitDataChanged("ledger-settings");
    } catch (error) { setName(account.name); setToast(`支付渠道更新失败：${String(error)}`); }
  };
  return <div className="ledger-settings-item"><span>账</span><input maxLength={16} value={name} onChange={(event) => setName(event.target.value)} onBlur={() => void saveName()} onKeyDown={(event) => { if (event.key === "Enter") void saveName(); }} /><button className="btn-ghost" onClick={() => void onToggle(account)}>{account.is_enabled ? "停用" : "启用"}</button></div>;
}

function ReminderSyncStatusCard() {
  const sync = useAppStore((s) => s.reminderSync);
  const osLabel =
    sync.osAvailable == null
      ? "检测中…"
      : sync.osAvailable
        ? "可用"
        : "不可用，已改用应用内调度";
  const permLabel =
    sync.permissionGranted == null
      ? "检测中…"
      : sync.permissionGranted
        ? "已授权"
        : "未授权";
  const lastSyncLabel = sync.lastOkAt
    ? new Date(sync.lastOkAt).toLocaleString()
    : "尚未成功";
  const failed = Boolean(sync.lastError) && !sync.osAvailable;
  return (
    <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
      <p>系统提醒：{osLabel}</p>
      <p>通知权限：{permLabel}</p>
      <p>
        系统托管 {sync.scheduledCount} 条
        {sync.totalUpcoming ? `（即将到期共 ${sync.totalUpcoming} 条）` : ""}
        ，另有 {sync.overflowCount} 条依赖应用运行。
      </p>
      <p>
        完全退出后，只有系统托管的提醒可能弹出；超出 {OS_REMINDER_LIMIT} 条或 90 天的提醒，要等应用再次运行后才会补发。
      </p>
      {sync.truncated ? (
        <p>
          因系统限制，目前只登记了最近 {OS_REMINDER_LIMIT} 条、90 天内的提醒；队列会每 6 小时以及每次提醒触发后自动补入。
        </p>
      ) : null}
      <p>最近一次同步：{failed ? `失败 · ${sync.lastError}` : `成功 · ${lastSyncLabel}`}</p>
      {!failed && sync.lastError ? <p>{sync.lastError}</p> : null}
    </div>
  );
}
