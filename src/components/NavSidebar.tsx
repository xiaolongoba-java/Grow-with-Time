import { useMemo, useRef, useState } from "react";
import { useAppStore } from "@/store/app";
import { todayDateString } from "@/lib/dates";
import { parseNaturalInput } from "@/lib/nlp";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { isActiveTask } from "@/lib/tasks";

type NavSidebarProps = {
  onCollapse?: () => void;
};

export function NavSidebar({ onCollapse }: NavSidebarProps) {
  const nav = useAppStore((s) => s.nav);
  const setNav = useAppStore((s) => s.setNav);
  const tasks = useAppStore((s) => s.tasks);
  const tags = useAppStore((s) => s.tags);
  const smartLists = useAppStore((s) => s.smartLists);
  const filter = useAppStore((s) => s.filter);
  const setFilter = useAppStore((s) => s.setFilter);
  const addTask = useAppStore((s) => s.addTask);
  const selectTask = useAppStore((s) => s.selectTask);
  const addTag = useAppStore((s) => s.addTag);
  const removeTag = useAppStore((s) => s.removeTag);
  const setActiveTag = useAppStore((s) => s.setActiveTag);
  const activeTagId = useAppStore((s) => s.activeTagId);
  const saveSmartList = useAppStore((s) => s.saveSmartList);
  const applySmartList = useAppStore((s) => s.applySmartList);
  const removeSmartList = useAppStore((s) => s.removeSmartList);
  const [draft, setDraft] = useState("");
  const [tagName, setTagName] = useState("");
  const [hints, setHints] = useState<string[]>([]);
  const draftRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const today = todayDateString();
    const roots = tasks.filter((t) => !t.parent_id);
    return {
      today: roots.filter(
        (t) =>
          isActiveTask(t) && t.due_date !== null && t.due_date <= today,
      ).length,
      inbox: roots.filter((t) => isActiveTask(t) && t.due_date === null)
        .length,
      completed: roots.filter((t) => t.status === "completed").length,
      all: roots.length,
      myday: roots.filter(
        (t) => isActiveTask(t) && t.my_day_date === today,
      ).length,
    };
  }, [tasks]);

  const onDraftChange = (value: string) => {
    setDraft(value);
    const parsed = parseNaturalInput(value);
    setHints(parsed.hints);
  };

  const createFromDraft = async () => {
    const parsed = parseNaturalInput(draft);
    if (!parsed.title) {
      draftRef.current?.focus();
      return;
    }
    const task = await addTask({
      title: parsed.title,
      ...parsed.draft,
    });
    setDraft("");
    setHints([]);
    if (task) selectTask(task.id, { edit: true });
  };

  const beginCreate = () => {
    draftRef.current?.focus();
  };

  return (
    <aside className="nav-side">
      <div className="nav-side-scroll">
      <div className="brand-row">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden><AppIcon name="sparkle" size={19} /></span>
          <div>
            <h1>Grow with Time</h1>
            <span className="brand-caption">让每一天都有生长</span>
          </div>
        </div>
      </div>

      <input
        className="search-box"
        placeholder="搜索任务…"
        value={filter.keyword}
        onChange={(e) => setFilter({ keyword: e.target.value })}
      />

      <button type="button" className="btn-primary" onClick={beginCreate}>
        + 新建任务
      </button>

      <div className="quick-add-row">
        <input
          ref={draftRef}
          className="quick-add-input"
          placeholder="明天下午3点 开会 p1"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) void createFromDraft();
          }}
        />
        <button
          type="button"
          className="btn-primary quick-add-save"
          disabled={!draft.trim()}
          onClick={() => void createFromDraft()}
        >
          保存
        </button>
      </div>
      {hints.length > 0 && (
        <div className="nlp-hints">
          {hints.map((h) => (
            <span key={h} className="chip">
              {h}
            </span>
          ))}
        </div>
      )}

      <div className="nav-section-label">视图</div>
      {(
        [
          ["today", "今日", counts.today, "today"],
          ["myday", "我的一天", counts.myday, "sparkle"],
          ["inbox", "待办箱", counts.inbox, "inbox"],
          ["completed", "已完成", counts.completed, "check"],
          ["all", "全部", counts.all, "layers"],
        ] as const
      ).map(([id, label, count, icon]) => (
        <button
          key={id}
          type="button"
          className={`nav-item ${nav === id ? "active" : ""}`}
          onClick={() => setNav(id)}
        >
          <span className="nav-item-label"><AppIcon name={icon as AppIconName} size={17} />{label}</span>
          <span className="nav-count">{count}</span>
        </button>
      ))}

      <div className="nav-section-label">工具</div>
      <button
        type="button"
        className={`nav-item ${nav === "memos" ? "active" : ""}`}
        onClick={() => setNav("memos")}
      >
        <span className="nav-item-label"><AppIcon name="memo" size={17} />备忘录</span>
      </button>
      <button
        type="button"
        className={`nav-item ${nav === "projects" ? "active" : ""}`}
        onClick={() => setNav("projects")}
      >
        <span className="nav-item-label">
          <AppIcon name="layers" size={17} />
          项目与模板
        </span>
      </button>

      <div className="nav-section-label">标签</div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          className="field"
          placeholder="新标签"
          value={tagName}
          onChange={(e) => setTagName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && tagName.trim()) {
              void addTag(tagName.trim());
              setTagName("");
            }
          }}
        />
      </div>
      {tags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          className={`nav-item ${activeTagId === tag.id ? "active" : ""}`}
          onClick={() => setActiveTag(tag.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (window.confirm(`删除标签「${tag.name}」？`)) void removeTag(tag.id);
          }}
        >
          <span className="nav-item-label" style={{ color: tag.color }}><AppIcon name="tag" size={16} />{tag.name}</span>
        </button>
      ))}

      <div className="nav-section-label">智能列表</div>
      <button
        type="button"
        className="btn-ghost"
        onClick={() => {
          const name = window.prompt("智能列表名称");
          if (name?.trim()) void saveSmartList(name.trim());
        }}
      >
        保存当前筛选
      </button>
      {smartLists.map((list) => (
        <button
          key={list.id}
          type="button"
          className="nav-item"
          onClick={() => applySmartList(list.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (window.confirm("删除该智能列表？")) void removeSmartList(list.id);
          }}
        >
          <span>{list.name}</span>
        </button>
      ))}
      </div>
      {onCollapse ? (
        <button
          type="button"
          className="nav-edge-collapse"
          title="折叠侧栏，主区域占满窗口"
          aria-label="折叠侧栏"
          onClick={onCollapse}
        >
          ◂
        </button>
      ) : null}
    </aside>
  );
}
