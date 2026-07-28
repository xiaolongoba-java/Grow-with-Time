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
    icon: "sparkle",
    title: "欢迎来到 Grow with Time",
    body: "先把所有想法放进待办箱，再从中挑选今天真正要完成的事项。",
    hint: "左侧「我的一天」是每日计划入口",
  },
  {
    icon: "search",
    title: "快速找到任何内容",
    body: "使用命令面板搜索任务、切换页面，也可以直接创建新任务。",
    hint: "快捷键 Ctrl / Cmd + K",
  },
  {
    icon: "timer",
    title: "安排时间，而不只是列清单",
    body: "为任务设置预计耗时和多个提醒，时间冲突与计划过载会自动提示。",
    hint: "在任务详情中编辑时间与提醒",
  },
  {
    icon: "layers",
    title: "建立可复用的工作流",
    body: "用项目组织长期目标，把重复出现的任务保存为模板。",
    hint: "从左侧进入「项目与模板」",
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
            {step === steps.length - 1 ? "开始使用" : "下一步"}
          </button>
        </footer>
      </section>
    </div>
  );
}
