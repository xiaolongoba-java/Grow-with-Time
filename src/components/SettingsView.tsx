import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app";
import { exportBackup, importBackup, summarizeBackupRestore } from "@/lib/db";
import type { BackupPayload } from "@/types";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { invoke } from "@tauri-apps/api/core";
import { themeMeta, type VisualTheme } from "@/lib/themes";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    await importBackup(payload);
    await useAppStore.getState().refreshAll();
    setToast("已从备份恢复");
  };

  const toggleAutostart = async () => {
    const next = !settings.autostart;
    try {
      if (next) await enable();
      else await disable();
      const enabled = await isEnabled();
      await updateSettings({ autostart: enabled });
    } catch {
      await updateSettings({ autostart: next });
    }
  };

  return (
    <main className="main-workspace" style={{ padding: 22, overflow: "auto" }}>
      <h2 className="workspace-top" style={{ padding: 0 }}>
        设置
      </h2>

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
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          关闭主窗口后会驻留系统托盘；全局快捷键 Ctrl/Cmd+Shift+N。
        </p>
      </section>

      <section className="settings-card" style={{ marginTop: 12 }}>
        <h3>桌面浮窗</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          置顶小窗，可速记与查看今日待办。也可从托盘菜单打开。
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
          显示桌面浮窗
        </button>
      </section>

      <section className="settings-card" style={{ marginTop: 12 }}>
        <h3>桌面组件</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          侧栏与工具栏入口会按你选择的默认模式打开；两种模式可同时使用。
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              void import("@tauri-apps/api/core").then(({ invoke }) =>
                invoke("show_dashboard_strip"),
              );
            }}
          >
            打开仪表盘
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              void import("@tauri-apps/api/core").then(({ invoke }) =>
                invoke("show_desktop_widgets"),
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
          开启后，系统通知只显示「日进·拾光 / 你有一条提醒」，不展示具体任务标题与内容。
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
