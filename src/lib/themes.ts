import type { ThemeMode } from "@/types";

export type VisualTheme = Exclude<ThemeMode, "system">;

export const themeMeta: Record<VisualTheme, {
  name: string;
  mood: string;
  description: string;
  preview: [string, string, string];
  text: string;
  surface: string;
}> = {
  light: {
    name: "清昼",
    mood: "清爽 · 专注",
    description: "像晨间纸面，留白轻盈，信息边界清楚。",
    preview: ["#f7f9fd", "#ffffff", "#2f6fed"],
    text: "#17233b",
    surface: "#ffffff",
  },
  dawn: {
    name: "晨曦玻璃",
    mood: "通透 · 有光",
    description: "Windows 原生玻璃，让桌面壁纸成为氛围的一部分。",
    preview: ["#cfe0fb", "#f6d9e3", "#3478ee"],
    text: "#111b31",
    surface: "#e7eef9",
  },
  dark: {
    name: "静夜",
    mood: "沉静 · 低眩光",
    description: "深蓝夜色承托内容，适合晚间专注和长时间阅读。",
    preview: ["#101722", "#1a2638", "#70a1ff"],
    text: "#f4f7fc",
    surface: "#172131",
  },
};

export function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = hex.slice(1).match(/.{2}/g)?.map((value) => parseInt(value, 16) / 255) ?? [];
    const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
