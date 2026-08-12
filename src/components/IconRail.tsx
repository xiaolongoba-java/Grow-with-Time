import type { NavId } from "@/types";
import { useAppStore } from "@/store/app";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { openDesktopWidgets } from "@/lib/desktopWidgets";

/** 仅保留侧栏没有的入口，避免与「视图」列表重复 */
const BOTTOM: { id: NavId; label: string; icon: AppIconName }[] = [
  { id: "trash", label: "回收站", icon: "trash" },
  { id: "settings", label: "设置", icon: "settings" },
];

export function IconRail() {
  const nav = useAppStore((s) => s.nav);
  const setNav = useAppStore((s) => s.setNav);
  const desktopWidgetMode = useAppStore((s) => s.settings.desktopWidgetMode);
  const desktopWidgetLayer = useAppStore((s) => s.settings.desktopWidgetLayer);

  return (
    <aside className="icon-rail" aria-label="功能导航">
      <button
        type="button"
        className="rail-btn"
        title={
          desktopWidgetMode === "classic"
            ? "打开经典桌面组件（月历 / 今日计划 / 备忘录）"
            : "打开桌面横条仪表盘（备忘 / 打卡 / 月历 / 倒计时）"
        }
        aria-label="打开桌面组件"
        onClick={() => {
          void openDesktopWidgets(desktopWidgetMode, desktopWidgetLayer);
        }}
      >
        <AppIcon name="panel" />
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
          <AppIcon name={item.icon} />
        </button>
      ))}
    </aside>
  );
}
