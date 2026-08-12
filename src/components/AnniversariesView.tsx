import { useEffect, useMemo, useState } from "react";
import {
  createAnniversary,
  deleteAnniversary,
  fetchAnniversaries,
  updateAnniversary,
} from "@/lib/db";
import { anniversaryHeadline, sortAnniversaries } from "@/lib/anniversaries";
import { todayDateString } from "@/lib/dates";
import type { Anniversary } from "@/types";

export function AnniversariesView() {
  const [items, setItems] = useState<Anniversary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState(todayDateString());
  const [recurYearly, setRecurYearly] = useState(true);
  const [note, setNote] = useState("");
  const today = todayDateString();

  const refresh = async () => {
    setLoading(true);
    try {
      setItems(await fetchAnniversaries());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const sorted = useMemo(() => sortAnniversaries(items, today), [items, today]);
  const upcoming = sorted.filter((item) => {
    const days = anniversaryHeadline(item, today).daysLeft;
    return days !== null && days <= 30;
  });

  const submit = async () => {
    if (!title.trim() || !eventDate || busy) return;
    setBusy(true);
    try {
      await createAnniversary({
        title: title.trim(),
        event_date: eventDate,
        recur_yearly: recurYearly ? 1 : 0,
        note: note.trim(),
      });
      setTitle("");
      setNote("");
      setEventDate(today);
      setRecurYearly(true);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="main-workspace moments-page anniversaries-page">
      <header className="moments-hero">
        <span>ANNIVERSARIES</span>
        <h2>纪念日</h2>
        <p>记下重要日子，按年循环倒数，看见日子慢慢堆成光阴。</p>
      </header>

      <section className="anni-composer" aria-label="添加纪念日">
        <input
          className="field"
          placeholder="例如：相识纪念日、入职日、项目上线…"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
        />
        <div className="anni-composer-row">
          <input
            className="field"
            type="date"
            value={eventDate}
            onChange={(event) => setEventDate(event.target.value)}
          />
          <label className="anni-check">
            <input
              type="checkbox"
              checked={recurYearly}
              onChange={(event) => setRecurYearly(event.target.checked)}
            />
            每年循环
          </label>
          <button
            type="button"
            className="btn-primary"
            style={{ width: "auto" }}
            disabled={busy || !title.trim() || !eventDate}
            onClick={() => void submit()}
          >
            添加
          </button>
        </div>
        <textarea
          className="field"
          rows={2}
          placeholder="可选备注"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </section>

      {upcoming.length ? (
        <section className="anni-upcoming" aria-label="近 30 天">
          <h3>近 30 天</h3>
          <div className="anni-upcoming-row">
            {upcoming.map((item) => {
              const head = anniversaryHeadline(item, today);
              return (
                <article key={item.id} className="anni-chip">
                  <strong>{item.title}</strong>
                  <span>{head.label}</span>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {loading ? (
        <div className="moments-loading">正在加载纪念日…</div>
      ) : !sorted.length ? (
        <div className="empty-state">添加第一个纪念日，开始收藏光阴。</div>
      ) : (
        <section className="anni-list" aria-label="全部纪念日">
          {sorted.map((item) => {
            const head = anniversaryHeadline(item, today);
            return (
              <article
                key={item.id}
                className={`anni-card ${head.daysLeft === 0 ? "is-today" : ""}`}
              >
                <div className="anni-card-main">
                  <div>
                    <h3>{item.title}</h3>
                    <p className="anni-meta">
                      原日 {item.event_date}
                      {item.recur_yearly ? " · 每年" : " · 单次"}
                      {head.nextDate ? ` · 下次 ${head.nextDate}` : ""}
                    </p>
                    {item.note ? <p className="anni-note">{item.note}</p> : null}
                  </div>
                  <div className="anni-countdown">
                    <strong>
                      {head.daysLeft === null
                        ? "—"
                        : head.daysLeft === 0
                          ? "今天"
                          : head.daysLeft}
                    </strong>
                    <span>{head.label}</span>
                  </div>
                </div>
                <div className="anni-card-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      void updateAnniversary(item.id, {
                        recur_yearly: item.recur_yearly ? 0 : 1,
                      }).then(refresh);
                    }}
                  >
                    {item.recur_yearly ? "改为单次" : "改为每年"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost danger"
                    onClick={() => {
                      if (window.confirm(`删除纪念日「${item.title}」？`)) {
                        void deleteAnniversary(item.id).then(refresh);
                      }
                    }}
                  >
                    删除
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
