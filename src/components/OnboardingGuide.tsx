import { useState } from "react";
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
    body: "先收集，再从「我的一天」挑出真正要做的事；安排、专注、完成和收尾都在这一条线上。",
    hint: "每天从「我的一天」开始，只关注下一步",
  },
  {
    icon: "sparkle",
    title: "拾光：把时间留下",
    body: "拾念记瞬间，今日拾光记今天，备忘录存长期，拾光变迁寄未来。它们各自保存不同时间尺度的内容。",
    hint: "快捷键 Ctrl / Cmd + Shift + Space 随时拾起灵感",
  },
];

export function OnboardingGuide() {
  const complete = useAppStore((state) => state.settings.onboardingComplete);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [step, setStep] = useState(0);

  if (complete) return null;
  const current = steps[step];

  return (
    <div className="onboarding-backdrop">
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
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void updateSettings({ onboardingComplete: true })}
          >
            跳过
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (step < steps.length - 1) {
                setStep((value) => value + 1);
              } else {
                void updateSettings({ onboardingComplete: true });
              }
            }}
          >
            {step === steps.length - 1 ? "开始日进·拾光" : "认识拾光"}
          </button>
        </footer>
      </section>
    </div>
  );
}
