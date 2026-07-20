import { useState } from "react";
import { useAppStore } from "@/store/app";
import { exportBackup, importBackup } from "@/lib/db";
import type { BackupPayload, ThemeMode } from "@/types";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";

export function SettingsView() {
  const settings = useAppStore((s) => s.settings);
  const setTheme = useAppStore((s) => s.setTheme);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const saveAi = useAppStore((s) => s.saveAi);
  const setToast = useAppStore((s) => s.setToast);
  const [ai, setAi] = useState(settings.ai);

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
        <h3>外观</h3>
        <div className="seg" style={{ marginTop: 8, width: "fit-content" }}>
          {(["light", "dark", "system"] as ThemeMode[]).map((t) => (
            <button
              key={t}
              type="button"
              className={settings.theme === t ? "active" : ""}
              onClick={() => void setTheme(t)}
            >
              {t === "light" ? "浅色" : t === "dark" ? "深色" : "跟随系统"}
            </button>
          ))}
        </div>
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
      </section>

      <section className="settings-card" style={{ marginTop: 12 }}>
        <h3>数据备份</h3>
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
        </div>
      </section>

      <section className="settings-card" style={{ marginTop: 12 }}>
        <h3>AI（OpenAI 兼容）</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          未配置 API Key 时，AI 拆解与智能排期不可用。
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
