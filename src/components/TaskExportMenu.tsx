import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useAppStore } from "@/store/app";
import {
  buildTaskExportCsv,
  defaultTaskExportName,
  taskExportRange,
  tasksInExportRange,
  type TaskExportPeriod,
} from "@/lib/taskExport";

const PERIODS: { id: TaskExportPeriod; label: string }[] = [
  { id: "week", label: "本周" },
  { id: "month", label: "本月" },
  { id: "quarter", label: "本季度" },
];

export function TaskExportMenu() {
  const tasks = useAppStore((state) => state.tasks);
  const tags = useAppStore((state) => state.tags);
  const tagMap = useAppStore((state) => state.tagMap);
  const setToast = useAppStore((state) => state.setToast);
  const [open, setOpen] = useState(false);

  const exportPeriod = async (period: TaskExportPeriod) => {
    const range = taskExportRange(period);
    const count = tasksInExportRange(tasks, range).length;
    const path = await save({
      defaultPath: defaultTaskExportName(range),
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return;
    await writeTextFile(path, buildTaskExportCsv(tasks, range, tagMap, tags));
    setOpen(false);
    setToast(`已导出${range.label} ${count} 条任务`);
  };

  return (
    <div className="task-export-menu">
      <button type="button" className="btn-ghost" onClick={() => setOpen((value) => !value)}>
        导出任务
      </button>
      {open ? (
        <div className="task-export-pop" role="menu">
          {PERIODS.map((item) => (
            <button key={item.id} type="button" role="menuitem" onClick={() => void exportPeriod(item.id)}>
              导出{item.label}
              <small>{taskExportRange(item.id).label}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
