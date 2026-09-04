import { useState } from "react";
import { createPortal } from "react-dom";
import { enable } from "@tauri-apps/plugin-autostart";
import { useAppStore } from "@/store/app";
import { AppIcon, type AppIconName } from "@/components/AppIcon";

const steps: {
  icon: AppIconName;
  title: string;
  body: string;
  hint: string;
}[] = [
  {
    icon: "today",
    title: "日进：把今天过好",
    body: "先收集，再从「今日」挑出真正要做的事；安排、专注、完成和收尾都在这一条线上。",
    hint: "每天从「今日」开始，只关注下一步",
  },
  {
    icon: "sparkle",
    title: "拾光：把时间留下",
    body: "拾念记瞬间，今日拾光记今天，备忘录存长期，拾光变迁寄未来。它们各自保存不同时间尺度的内容。",
    hint: "快捷键 Ctrl / Cmd + Shift + Space 随时拾起灵感",
  },
  {
    icon: "bell",
    title: "提醒不会因为关窗口而消失",
    body: "点关闭只会放到托盘，不会退出。完全退出后，到期提醒仍由系统送达。建议开启开机自启，周报一类的周期任务更不容易漏。",
    hint: "彻底退出请用托盘菜单里的「退出应用」；可在设置中随时开关开机自启",
  },
];

export function OnboardingGuide() {
  const complete = useAppStore((state) => state.settings.onboardingComplete);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  if (complete || dismissed) return null;
  const current = steps[step];
  const last = step === steps.length - 1;

  const finish = (enableAutostart = false) => {
    setDismissed(true);
    void (async () => {
      if (enableAutostart) {
        try {
          await enable();
          await updateSettings({ autostart: true, onboardingComplete: true });
          return;
        } catch {
          /* keep going even if OS autostart is denied */
        }
      }
      await updateSettings({ onboardingComplete: true });
    })();
  };

  return createPortal(
    <div className="onboarding-backdrop" role="dialog" aria-modal="true">
      <section className="onboarding-card">
        <div className="onboarding-icon">
          <AppIcon name={current.icon} size={25} />
        </div>
        <span className="onboarding-step">
          {step + 1} / {steps.length}
        </span>
        <h2>{current.title}</h2>
        <p>{current.body}</p>
        <div className="onboarding-hint">{current.hint}</div>
        <div className="onboarding-dots">
          {steps.map((_, index) => (
            <span key={index} className={index === step ? "active" : ""} />
          ))}
        </div>
        <footer>
          <button type="button" className="btn-ghost" onClick={() => finish(false)}>
            {last ? "暂不开启" : "跳过"}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (!last) {
                setStep((value) => value + 1);
                return;
              }
              finish(true);
            }}
          >
            {last ? "开启开机自启并开始" : "下一步"}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
