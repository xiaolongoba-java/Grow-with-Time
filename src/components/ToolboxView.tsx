import { useCallback, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/store/app";
import {
  applyDesktopOrganize,
  formatDesktopModified,
  KIND_META,
  openDesktopItem,
  previewDesktopOrganize,
  scanDesktop,
  toggleShortcutDock,
  undoDesktopOrganize,
  type DesktopItem,
  type DesktopKind,
  type DesktopScan,
  type OrganizePlan,
} from "@/lib/desktopOrganize";
import {
  applyWallpaper,
  getWallpaperLibrary,
  importWallpapers,
  removeWallpaper,
  updateWallpaperSettings,
  type WallpaperLibrary,
} from "@/lib/wallpaper";

type ToolId = "home" | "desktop" | "wallpaper";
type ViewMode = "grid" | "list";

export function ToolboxView() {
  const [tool, setTool] = useState<ToolId>("home");
  if (tool === "desktop") {
    return <DesktopOrganizer onBack={() => setTool("home")} />;
  }
  if (tool === "wallpaper") {
    return <WallpaperManager onBack={() => setTool("home")} />;
  }
  return (
    <main className="main-workspace toolbox-page">
      <div className="workspace-top">
        <div>
          <p className="toolbox-kicker">TOOLS</p>
          <h2>工具箱</h2>
          <p className="workspace-subtitle">
            日进和拾光之外的桌面便利工具。整理文件、收纳桌面，不混进任务主线。
          </p>
        </div>
      </div>
      <div className="toolbox-stage">
        <div className="toolbox-stage-copy">
          <span>DESKTOP STUDIO</span>
          <strong>让桌面保持清爽，也保持新鲜。</strong>
          <p>所有桌面工具集中在下方，像参考图里的 Dock 一样随手可用。</p>
        </div>
        <nav className="toolbox-dock" aria-label="桌面工具">
          <button type="button" onClick={() => setTool("desktop")}>
            <ToolIcon kind="organize" />
            <span>桌面收纳</span>
          </button>
          <button type="button" onClick={() => setTool("wallpaper")}>
            <ToolIcon kind="wallpaper" />
            <span>壁纸轮换</span>
          </button>
          <button type="button" className="is-soon" disabled>
            <ToolIcon kind="more" />
            <span>更多工具</span>
          </button>
        </nav>
      </div>
    </main>
  );
}

function ToolIcon({ kind }: { kind: "organize" | "wallpaper" | "more" }) {
  return (
    <span className={`toolbox-card-glyph is-${kind}`} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        {kind === "organize" ? <><path d="M4 7.5h6l1.7 2H20v9.5H4z"/><path d="M4 7.5V5h6l1.7 2H20v2.5"/></> : null}
        {kind === "wallpaper" ? <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m5.5 17 4.2-4.5 3 2.8 2.7-3.1 3.1 4.8"/><circle cx="16.5" cy="8.5" r="1.5"/></> : null}
        {kind === "more" ? <><path d="M12 5v14M5 12h14"/></> : null}
      </svg>
    </span>
  );
}

function WallpaperManager({ onBack }: { onBack: () => void }) {
  const setToast = useAppStore((state) => state.setToast);
  const [library, setLibrary] = useState<WallpaperLibrary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setLibrary(await getWallpaperLibrary()); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "无法读取壁纸库"); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const importImages = async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "壁纸图片", extensions: ["jpg", "jpeg", "png", "bmp"] }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    setBusy(true);
    try { setLibrary(await importWallpapers(paths)); setToast(`已导入 ${paths.length} 张壁纸`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "导入失败"); }
    finally { setBusy(false); }
  };

  const run = async (action: () => Promise<WallpaperLibrary>, message: string) => {
    if (busy) return;
    setBusy(true);
    try { setLibrary(await action()); setError(null); setToast(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); }
    finally { setBusy(false); }
  };

  const settings = library?.settings;
  return (
    <main className="main-workspace toolbox-page wallpaper-manager">
      <div className="workspace-top wallpaper-head">
        <div>
          <button type="button" className="btn-ghost toolbox-back" onClick={onBack}>← 工具箱</button>
          <p className="toolbox-kicker">WALLPAPER LIBRARY</p>
          <h2>壁纸轮换</h2>
          <p className="workspace-subtitle">把喜欢的图片存在应用图库里，按你的节奏自动更换系统桌面。</p>
        </div>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void importImages()}>
          ＋ 添加壁纸
        </button>
      </div>

      {error ? <p className="toolbox-error">{error}</p> : null}

      <section className="wallpaper-controls" aria-label="自动轮换设置">
        <label className="wallpaper-switch">
          <input type="checkbox" checked={settings?.enabled ?? false} disabled={!library?.items.length || busy}
            onChange={(event) => void run(() => updateWallpaperSettings(event.target.checked, settings?.intervalMinutes ?? 60, settings?.shuffle ?? true), event.target.checked ? "自动轮换已开启" : "自动轮换已关闭")} />
          <span><strong>自动轮换</strong><small>{library?.items.length ? "应用在后台时自动替换" : "先添加至少一张壁纸"}</small></span>
        </label>
        <label>更换频率
          <select value={settings?.intervalMinutes ?? 60} disabled={!library || busy}
            onChange={(event) => void run(() => updateWallpaperSettings(settings?.enabled ?? false, Number(event.target.value), settings?.shuffle ?? true), "轮换频率已更新")}>
            <option value={15}>每 15 分钟</option><option value={30}>每 30 分钟</option><option value={60}>每小时</option>
            <option value={180}>每 3 小时</option><option value={360}>每 6 小时</option><option value={1440}>每天</option>
          </select>
        </label>
        <label>播放方式
          <select value={settings?.shuffle ? "shuffle" : "sequence"} disabled={!library || busy}
            onChange={(event) => void run(() => updateWallpaperSettings(settings?.enabled ?? false, settings?.intervalMinutes ?? 60, event.target.value === "shuffle"), "播放方式已更新")}>
            <option value="shuffle">随机轮换</option><option value="sequence">顺序轮换</option>
          </select>
        </label>
      </section>

      {!library ? <p className="empty-state">正在读取壁纸库…</p> : library.items.length === 0 ? (
        <button type="button" className="wallpaper-empty" onClick={() => void importImages()}>
          <ToolIcon kind="wallpaper" /><strong>建立你的壁纸库</strong><span>支持 JPG、PNG、BMP，可一次选择多张</span>
        </button>
      ) : (
        <div className="wallpaper-grid">
          {library.items.map((item) => {
            const active = settings?.currentId === item.id;
            return <article key={item.id} className={`wallpaper-card ${active ? "is-active" : ""}`}>
              <img src={convertFileSrc(item.path)} alt={item.name} loading="lazy" />
              {active ? <span className="wallpaper-current">当前壁纸</span> : null}
              <div><strong title={item.name}>{item.name.replace(/\.[^.]+$/, "")}</strong>
                <span className="wallpaper-actions">
                  <button type="button" disabled={busy || active} onClick={() => void run(() => applyWallpaper(item.id), "壁纸已更换")}>设为壁纸</button>
                  <button type="button" className="danger" aria-label={`删除 ${item.name}`} disabled={busy} onClick={() => {
                    if (window.confirm(`从应用图库删除「${item.name}」？原始图片不会受影响。`)) void run(() => removeWallpaper(item.id), "已从图库删除");
                  }}>删除</button>
                </span>
              </div>
            </article>;
          })}
        </div>
      )}
    </main>
  );
}

function DesktopOrganizer({ onBack }: { onBack: () => void }) {
  const setToast = useAppStore((state) => state.setToast);
  const desktopWidgetLayer = useAppStore((state) => state.settings.desktopWidgetLayer);
  const [scan, setScan] = useState<DesktopScan | null>(null);
  const [mode, setMode] = useState<ViewMode>("grid");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<DesktopItem | null>(null);
  const [plan, setPlan] = useState<OrganizePlan | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setScan(await scanDesktop());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取桌面");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: "preview" | "apply" | "undo") => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "preview") {
        const next = await previewDesktopOrganize();
        if (!next.moves.length) {
          setToast("桌面顶层没有需要整理的项目");
          setPlan(null);
          return;
        }
        setPlan(next);
        return;
      }
      const result =
        action === "apply" ? await applyDesktopOrganize() : await undoDesktopOrganize();
      setPlan(null);
      await refresh();
      if (result.failed.length) {
        setToast(
          `${action === "apply" ? "已整理" : "已还原"} ${result.moved} 项，${result.failed.length} 项未完成`,
        );
      } else if (action === "apply") {
        setToast(`已将 ${result.moved} 项移入「日进收纳」，可在本页撤销`);
      } else {
        setToast(`已还原 ${result.moved} 项到桌面`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const total = scan?.total ?? 0;

  return (
    <main className="main-workspace toolbox-page desktop-organizer">
      <div className="workspace-top">
        <div>
          <button type="button" className="btn-ghost toolbox-back" onClick={onBack}>
            ← 工具箱
          </button>
          <p className="toolbox-kicker">GROW WITH TIME</p>
          <h2>桌面收纳</h2>
          <p className="workspace-subtitle">
            桌面共 {total} 项。整理只移动桌面顶层，放入「{scan?.rootFolder ?? "日进收纳"}」，不递归、不覆盖、可撤销。
          </p>
        </div>
        <div className="toolbox-toolbar">
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => void toggleShortcutDock(desktopWidgetLayer).then((visible) => {
            setToast(visible ? "快捷方式停靠栏已打开，主窗口最小化后仍会留在桌面" : "快捷方式停靠栏已收起");
          }).catch((cause) => setError(cause instanceof Error ? cause.message : "无法打开快捷方式停靠栏"))}>
            快捷方式停靠栏
          </button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => void refresh()}>
            刷新
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={busy || !scan?.canUndo}
            onClick={() => void run("undo")}
          >
            撤销上次整理
          </button>
          <div className="toolbox-mode" role="group" aria-label="视图">
            <button
              type="button"
              className={mode === "grid" ? "is-active" : ""}
              onClick={() => setMode("grid")}
            >
              栅格
            </button>
            <button
              type="button"
              className={mode === "list" ? "is-active" : ""}
              onClick={() => setMode("list")}
            >
              列表
            </button>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || total === 0}
            onClick={() => void run("preview")}
          >
            整理桌面
          </button>
        </div>
      </div>

      {error ? <p className="toolbox-error">{error}</p> : null}

      {!scan ? (
        <p className="empty-state">正在读取桌面…</p>
      ) : total === 0 ? (
        <p className="empty-state">桌面顶层已经很干净。分类文件夹在「日进收纳」里。</p>
      ) : (
        <div className={`organizer-board is-${mode}`}>
          {scan.categories.map((category) => (
            <section key={category.kind} className="organizer-col">
              <header>
                <span>
                  {KIND_META[category.kind].glyph} {category.label}
                </span>
                <em>{category.items.length}</em>
              </header>
              <ul>
                {category.items.map((item) => (
                  <li key={item.path}>
                    <button
                      type="button"
                      className="organizer-item"
                      onMouseEnter={() => setHover(item)}
                      onMouseLeave={() => setHover((current) => (current?.path === item.path ? null : current))}
                      onDoubleClick={() => void openDesktopItem(item.path).catch((cause) => {
                        setToast(cause instanceof Error ? cause.message : "无法打开");
                      })}
                    >
                      <span className={`organizer-icon kind-${item.kind}`} aria-hidden>
                        {KIND_META[item.kind as DesktopKind].glyph}
                      </span>
                      <span className="organizer-name">{stemName(item.name)}</span>
                    </button>
                    {hover?.path === item.path ? (
                      <div className="organizer-tip" role="tooltip">
                        <strong>{item.name}</strong>
                        <span>{formatDesktopModified(item.modifiedAt)}</span>
                        <span>双击打开</span>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {plan ? (
        <div className="modal-backdrop" onClick={() => !busy && setPlan(null)}>
          <section
            className="create-task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="organize-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span>桌面收纳</span>
                <h3 id="organize-title">确认整理 {plan.moves.length} 项</h3>
              </div>
            </div>
            <p className="create-task-hint">
              将移入桌面上的「日进收纳」分类文件夹。不会覆盖已有文件，系统文件和该文件夹本身会跳过。
            </p>
            <ul className="organize-preview">
              {plan.moves.slice(0, 8).map((item) => (
                <li key={item.from}>
                  {KIND_META[item.kind].label} · {item.name}
                </li>
              ))}
              {plan.moves.length > 8 ? <li>另有 {plan.moves.length - 8} 项…</li> : null}
            </ul>
            <div className="create-task-actions">
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => setPlan(null)}>
                取消
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => void run("apply")}
              >
                开始整理
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function stemName(name: string): string {
  if (!name.includes(".")) return name;
  if (name.startsWith(".")) return name;
  return name.replace(/\.[^.]+$/, "");
}
