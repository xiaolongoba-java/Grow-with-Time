import { StrictMode, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "@/styles/index.css";

function BootError({ message }: { message: string }) {
  const restart = async () => {
    try {
      await invoke("restart_app");
    } catch {
      window.location.reload();
    }
  };
  const openDataDirectory = async () => {
    try {
      await invoke("open_data_directory");
    } catch {
      /* widget / aux windows may not be allowed to open the data dir */
    }
  };
  return (
    <div
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        color: "#1f2933",
        background: "#f6f4ef",
      }}
    >
      <h1 style={{ fontSize: 18, margin: "0 0 12px" }}>界面加载失败</h1>
      <p style={{ margin: "0 0 12px", color: "#5b6570" }}>
        安装文件可能损坏，或某个模块没有正确加载。可以重启应用，或打开数据目录检查备份。
      </p>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          padding: 12,
          background: "#fff",
          borderRadius: 8,
          fontSize: 12,
        }}
      >
        {message}
      </pre>
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button type="button" onClick={() => void restart()}>
          重启应用
        </button>
        <button type="button" onClick={() => void openDataDirectory()}>
          打开数据目录
        </button>
      </div>
    </div>
  );
}

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
      return <BootError message={this.state.error} />;
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

void resolveApp()
  .then((app) => {
    root.render(
      <StrictMode>
        <ErrorBoundary>{app}</ErrorBoundary>
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    const message =
      error instanceof Error
        ? error.message || String(error)
        : String(error ?? "未知错误");
    root.render(<BootError message={message} />);
  });
