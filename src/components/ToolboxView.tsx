import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/store/app";
import {
  applyDesktopOrganize,
  formatDesktopModified,
  KIND_META,
  openDesktopItem,
  previewDesktopOrganize,
  scanDesktop,
  undoDesktopOrganize,
  type DesktopItem,
  type DesktopKind,
  type DesktopScan,
  type OrganizePlan,
} from "@/lib/desktopOrganize";

type ToolId = "home" | "desktop";
type ViewMode = "grid" | "list";

export function ToolboxView() {
  const [tool, setTool] = useState<ToolId>("home");
  if (tool === "desktop") {
    return <DesktopOrganizer onBack={() => setTool("home")} />;
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
      <div className="toolbox-grid">
        <button type="button" className="toolbox-card" onClick={() => setTool("desktop")}>
          <span className="toolbox-card-glyph" aria-hidden>
            ▦
          </span>
          <strong>桌面收纳</strong>
          <p>把桌面顶层的文件按类型移入「日进收纳」，整理后可撤销。</p>
        </button>
        <div className="toolbox-card is-soon" aria-disabled="true">
          <span className="toolbox-card-glyph" aria-hidden>
            +
          </span>
          <strong>更多工具</strong>
          <p>截图标注、快速粘贴板等会放在这里，不挤占今日执行。</p>
        </div>
      </div>
    </main>
  );
}

function DesktopOrganizer({ onBack }: { onBack: () => void }) {
  const setToast = useAppStore((state) => state.setToast);
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
