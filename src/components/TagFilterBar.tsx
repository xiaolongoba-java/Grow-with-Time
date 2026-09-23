import type { CSSProperties } from "react";
import { useAppStore } from "@/store/app";

export function TagFilterBar() {
  const tags = useAppStore((state) => state.tags);
  const filter = useAppStore((state) => state.filter);
  const setFilter = useAppStore((state) => state.setFilter);
  const setActiveTag = useAppStore((state) => state.setActiveTag);
  if (!tags.length) return null;

  const selected = new Set(filter.tagIds);

  return (
    <div className="tag-filter-bar" role="group" aria-label="按标签筛选任务">
      <span>标签</span>
      {tags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          className={selected.has(tag.id) ? "is-active" : ""}
          style={{ "--tag-color": tag.color } as CSSProperties}
          aria-pressed={selected.has(tag.id)}
          onClick={() => setActiveTag(tag.id)}
        >
          {tag.name}
        </button>
      ))}
      {selected.size ? (
        <button type="button" className="is-clear" onClick={() => { setFilter({ tagIds: [] }); setActiveTag(null); }}>
          清除
        </button>
      ) : null}
    </div>
  );
}
