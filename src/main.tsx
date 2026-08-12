import { StrictMode, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "@/styles/index.css";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "sans-serif" }}>
          <h1>界面加载失败</h1>
          <pre>{this.state.error}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

document.documentElement.dataset.theme ||= "system";

let label = "main";
try {
  label = getCurrentWebviewWindow().label;
} catch {
  label = "main";
}

async function resolveApp() {
  if (label === "quick-add") {
    const { QuickAddApp } = await import("@/app/QuickAddApp");
    return <QuickAddApp />;
  }
  if (label === "inspiration") {
    const { InspirationApp } = await import("@/app/InspirationApp");
    return <InspirationApp />;
  }
  if (label === "float") {
    const { FloatApp } = await import("@/app/FloatApp");
    return <FloatApp />;
  }
  if (label === "widget-dashboard") {
    const { DashboardStripApp } = await import("@/app/DashboardStripApp");
    return <DashboardStripApp />;
  }
  if (label.startsWith("widget-")) {
    const { DesktopWidgetApp } = await import("@/app/DesktopWidgetApp");
    return (
      <DesktopWidgetApp
        kind={label.slice("widget-".length) as "calendar" | "today" | "memo"}
      />
    );
  }
  const { MainApp } = await import("@/app/MainApp");
  return <MainApp />;
}

const root = createRoot(document.getElementById("root")!);

void resolveApp().then((app) => {
  root.render(
    <StrictMode>
      <ErrorBoundary>{app}</ErrorBoundary>
    </StrictMode>,
  );
});
