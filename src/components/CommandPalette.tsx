import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/store/app";
import { AppIcon } from "@/components/AppIcon";
import type { NavId } from "@/types";

const destinations: { id: NavId; label: string }[] = [
  { id: "myday", label: "打开我的一天" },
  { id: "today", label: "打开今日" },
  { id: "inbox", label: "打开待办箱" },
  { id: "projects", label: "打开项目与模板" },
  { id: "growth", label: "打开成长目标" },
  { id: "reminders", label: "打开提醒" },
  { id: "review", label: "打开复盘" },
  { id: "settings", label: "打开设置" },
];

export function CommandPalette() {
  const tasks = useAppStore((state) => state.tasks);
  const setNav = useAppStore((state) => state.setNav);
  const selectTask = useAppStore((state) => state.selectTask);
  const addTask = useAppStore((state) => state.addTask);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const taskResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return tasks.filter((task) => !task.deleted_at).slice(0, 6);
    return tasks
      .filter(
        (task) =>
          !task.deleted_at &&
          `${task.title} ${task.description}`.toLowerCase().includes(normalized),
      )
      .slice(0, 8);
  }, [query, tasks]);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="command-backdrop" onMouseDown={close}>
      <section
        className="command-palette"
        role="dialog"
        aria-label="命令面板"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-search">
          <AppIcon name="search" size={19} />
          <input
            ref={inputRef}
            value={query}
            placeholder="搜索任务或输入命令…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || !query.trim()) return;
              const first = taskResults[0];
              if (first) {
                selectTask(first.id);
                close();
                return;
              }
              void addTask({ title: query.trim() });
              close();
            }}
          />
          <kbd>Esc</kbd>
        </div>

        {!query.trim() ? (
          <>
            <p className="command-label">快速前往</p>
            <div className="command-grid">
              {destinations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setNav(item.id);
                    close();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        ) : null}

        <p className="command-label">任务</p>
        <div className="command-results">
          {taskResults.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => {
                selectTask(task.id);
                close();
              }}
            >
              <span>{task.status === "completed" ? "✓" : "○"}</span>
              <strong>{task.title}</strong>
              <small>{task.due_date ?? "无日期"}</small>
            </button>
          ))}
          {!taskResults.length && query.trim() ? (
            <button
              type="button"
              onClick={() => {
                void addTask({ title: query.trim() });
                close();
              }}
            >
              ＋ 创建任务“{query.trim()}”
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
