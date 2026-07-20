import { StrictMode, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { MainApp } from "@/app/MainApp";
import { QuickAddApp } from "@/app/QuickAddApp";
import { FloatApp } from "@/app/FloatApp";
import "@/styles/global.css";

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

function AppByLabel() {
  if (label === "quick-add") return <QuickAddApp />;
  if (label === "float") return <FloatApp />;
  return <MainApp />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppByLabel />
    </ErrorBoundary>
  </StrictMode>,
);
