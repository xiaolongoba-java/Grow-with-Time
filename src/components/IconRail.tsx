import type { NavId } from "@/types";
import { useAppStore } from "@/store/app";

/** 仅保留侧栏没有的入口，避免与「视图」列表重复 */
const RAIL: { id: NavId; label: string; icon: string }[] = [
  { id: "memos", label: "备忘录", icon: "✎" },
  { id: "habits", label: "习惯", icon: "♡" },
  { id: "review", label: "复盘", icon: "◔" },
];

const BOTTOM: { id: NavId; label: string; icon: string }[] = [
  { id: "trash", label: "回收站", icon: "⌫" },
  { id: "settings", label: "设置", icon: "⚙" },
];

export function IconRail() {
  const nav = useAppStore((s) => s.nav);
  const setNav = useAppStore((s) => s.setNav);

  return (
    <aside className="icon-rail" aria-label="功能导航">
      {RAIL.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`rail-btn ${nav === item.id ? "active" : ""}`}
          title={item.label}
          aria-label={item.label}
          onClick={() => setNav(item.id)}
        >
          {item.icon}
        </button>
      ))}
      <button
        type="button"
        className="rail-btn"
        title="打开桌面浮窗（今日待办 / 速记）"
        aria-label="打开桌面浮窗"
        onClick={() => {
          void import("@tauri-apps/api/core").then(({ invoke }) =>
            invoke("show_float"),
          );
        }}
      >
        ▤
      </button>
      <div className="rail-spacer" />
      {BOTTOM.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`rail-btn ${nav === item.id ? "active" : ""}`}
          title={item.label}
          aria-label={item.label}
          onClick={() => setNav(item.id)}
        >
          {item.icon}
        </button>
      ))}
    </aside>
  );
}
