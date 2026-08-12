import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { createInspiration } from "@/lib/db";
import { emitDataChanged } from "@/lib/widgetRefresh";
import { useAppStore } from "@/store/app";

export function InspirationApp() {
  const bootstrap = useAppStore((state) => state.bootstrap);
  const theme = useAppStore((state) => state.settings.theme);
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { void bootstrap(); }, [bootstrap]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen("inspiration:focus", () => inputRef.current?.focus()).then((fn) => { unlisten = fn; });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") void getCurrentWebviewWindow().hide(); };
    window.addEventListener("keydown", onKey);
    return () => { unlisten?.(); window.removeEventListener("keydown", onKey); };
  }, []);
  const save = async () => {
    if (!content.trim()) return;
    await createInspiration(content); setContent(""); setSaved(true);
    void emitDataChanged("inspiration");
    window.setTimeout(() => { setSaved(false); void getCurrentWebviewWindow().hide(); }, 500);
  };
  return <main className="inspiration-shell"><header><div><span>拾念</span><strong>拾起一闪而过的灵感</strong></div><small>Ctrl/Cmd + Shift + Space</small></header><textarea ref={inputRef} autoFocus value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void save(); } }} placeholder="现在想到了什么？ #标签" /><footer><span>{saved ? "已拾起" : "Enter 保存 · Shift+Enter 换行"}</span><button onClick={() => void save()}>拾起</button></footer></main>;
}
