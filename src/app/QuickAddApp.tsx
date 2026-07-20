import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useAppStore } from "@/store/app";
import { parseNaturalInput } from "@/lib/nlp";

export function QuickAddApp() {
  const bootstrap = useAppStore((s) => s.bootstrap);
  const addTask = useAppStore((s) => s.addTask);
  const theme = useAppStore((s) => s.settings.theme);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen("quick-add:focus", () => {
      const input = document.querySelector<HTMLInputElement>(".quick-input");
      input?.focus();
      input?.select();
    }).then((fn) => {
      unlisten = fn;
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void getCurrentWebviewWindow().hide();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      unlisten?.();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div className="quick-add-shell" style={{ height: "100%", display: "flex", alignItems: "center", padding: 16, background: "var(--bg-root)" }}>
      <form
        className="quick-add-form"
        style={{ width: "100%", display: "flex", gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          const input = (e.target as HTMLFormElement).elements.namedItem(
            "title",
          ) as HTMLInputElement;
          const parsed = parseNaturalInput(input.value);
          if (!parsed.title) return;
          void addTask({ title: parsed.title, ...parsed.draft }).then(() => {
            input.value = "";
            void getCurrentWebviewWindow().hide();
          });
        }}
      >
        <input
          className="quick-input field"
          name="title"
          autoFocus
          placeholder="快速添加，支持「明天 p1 开会」"
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn-primary" style={{ width: "auto" }}>
          添加
        </button>
      </form>
    </div>
  );
}
