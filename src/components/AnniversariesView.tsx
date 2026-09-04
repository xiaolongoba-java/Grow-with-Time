import { useEffect, useMemo, useState } from "react";
import {
  createAnniversary,
  deleteAnniversary,
  fetchAnniversaries,
  updateAnniversary,
} from "@/lib/db";
import {
  anniversaryHeadline,
  formatAnniversaryAnchor,
  leapMonthOfLunarYear,
  LUNAR_DAY_LABELS,
  LUNAR_MONTH_LABELS,
  lunarToSolarYmd,
  solarToLunarParts,
  sortAnniversaries,
} from "@/lib/anniversaries";
import { todayDateString } from "@/lib/dates";
import type { Anniversary } from "@/types";

export function AnniversariesView() {
  const [items, setItems] = useState<Anniversary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selected, setSelected] = useState<Anniversary | null>(null);
  const [title, setTitle] = useState("");
  const [calendar, setCalendar] = useState<"solar" | "lunar">("solar");
  const [eventDate, setEventDate] = useState(todayDateString());
  const todayLunar = useMemo(() => solarToLunarParts(todayDateString()), []);
  const [lunarYear, setLunarYear] = useState(todayLunar?.year ?? 2026);
  const [lunarMonth, setLunarMonth] = useState(todayLunar?.month ?? 1);
  const [lunarDay, setLunarDay] = useState(todayLunar?.day ?? 1);
  const [lunarLeap, setLunarLeap] = useState(todayLunar?.leap ?? false);
  const [recurYearly, setRecurYearly] = useState(true);
  const [note, setNote] = useState("");
  const today = todayDateString();

  const leapMonth = useMemo(() => leapMonthOfLunarYear(lunarYear), [lunarYear]);

  useEffect(() => {
    if (lunarLeap && leapMonth !== lunarMonth) {
      setLunarLeap(false);
    }
  }, [leapMonth, lunarLeap, lunarMonth]);

  const lunarSolarPreview = useMemo(() => {
    if (calendar !== "lunar") return null;
    return lunarToSolarYmd(lunarYear, lunarMonth, lunarDay, lunarLeap);
  }, [calendar, lunarYear, lunarMonth, lunarDay, lunarLeap]);

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
    if (!title.trim() || busy) return;
    let solarDate = eventDate;
    let month: number | null = null;
    let day: number | null = null;
    let leap = 0;
    if (calendar === "lunar") {
      const converted = lunarToSolarYmd(lunarYear, lunarMonth, lunarDay, lunarLeap);
      if (!converted) return;
      solarDate = converted;
      month = lunarMonth;
      day = lunarDay;
      leap = lunarLeap ? 1 : 0;
    }
    if (!solarDate) return;
    setBusy(true);
    try {
      await createAnniversary({
        title: title.trim(),
        event_date: solarDate,
        calendar,
        lunar_month: month,
        lunar_day: day,
        lunar_leap: leap,
        recur_yearly: recurYearly ? 1 : 0,
        note: note.trim(),
      });
      setTitle("");
      setNote("");
      setEventDate(today);
      setCalendar("solar");
      setRecurYearly(true);
      if (todayLunar) {
        setLunarYear(todayLunar.year);
        setLunarMonth(todayLunar.month);
        setLunarDay(todayLunar.day);
        setLunarLeap(todayLunar.leap);
      }
      await refresh();
      setComposerOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    Boolean(title.trim()) &&
    (calendar === "solar" ? Boolean(eventDate) : Boolean(lunarSolarPreview));

  return (
    <main className="main-workspace moments-page anniversaries-page">
      <header className="moments-hero anni-display-head">
        <div><span>ANNIVERSARIES</span><h2>纪念日</h2><p>重要的日子都在这里，离现在最近的会先被看见。</p></div>
        <button type="button" className="btn-primary" onClick={() => setComposerOpen(true)}>新增纪念日</button>
      </header>

      {composerOpen ? <div className="modal-backdrop" onMouseDown={() => !busy && setComposerOpen(false)}><section className="anni-composer anni-composer-dialog" role="dialog" aria-modal="true" aria-labelledby="anni-compose-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span>收藏一个日子</span><h2 id="anni-compose-title">新增纪念日</h2></div><button type="button" aria-label="关闭" onClick={() => setComposerOpen(false)}>×</button></header>
        <input
          className="field"
          placeholder="例如：相识纪念日、生日、入职日…"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
        />
        <div className="anni-composer-row">
          <div className="seg anni-cal-seg" role="group" aria-label="日历类型">
            <button
              type="button"
              className={calendar === "solar" ? "active" : ""}
              onClick={() => setCalendar("solar")}
            >
              公历
            </button>
            <button
              type="button"
              className={calendar === "lunar" ? "active" : ""}
              onClick={() => setCalendar("lunar")}
            >
              农历
            </button>
          </div>
          {calendar === "solar" ? (
            <input
              className="field"
              type="date"
              value={eventDate}
              onChange={(event) => setEventDate(event.target.value)}
            />
          ) : (
            <div className="anni-lunar-pickers">
              <input
                className="field"
                type="number"
                min={1900}
                max={2100}
                value={lunarYear}
                onChange={(event) => setLunarYear(Number(event.target.value) || lunarYear)}
                aria-label="农历年"
              />
              <select
                className="field"
                value={lunarMonth}
                onChange={(event) => setLunarMonth(Number(event.target.value))}
                aria-label="农历月"
              >
                {LUNAR_MONTH_LABELS.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                className="field"
                value={lunarDay}
                onChange={(event) => setLunarDay(Number(event.target.value))}
                aria-label="农历日"
              >
                {LUNAR_DAY_LABELS.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {label}
                  </option>
                ))}
              </select>
              {leapMonth > 0 && leapMonth === lunarMonth ? (
                <label className="anni-check">
                  <input
                    type="checkbox"
                    checked={lunarLeap}
                    onChange={(event) => setLunarLeap(event.target.checked)}
                  />
                  闰月
                </label>
              ) : null}
            </div>
          )}
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
            disabled={busy || !canSubmit}
            onClick={() => void submit()}
          >
            收好这个日子
          </button>
        </div>
        {calendar === "lunar" ? (
          <p className="anni-lunar-hint">
            {lunarSolarPreview
              ? `对应公历 ${lunarSolarPreview}${
                  recurYearly ? " · 每年按农历同日提醒" : ""
                }`
              : "该农历日在所选年份无效，请调整月日或闰月"}
          </p>
        ) : null}
        <textarea
          className="field"
          rows={2}
          placeholder="可选备注"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </section></div> : null}

      {upcoming.length ? (
        <section className="anni-upcoming" aria-label="近 30 天">
          <h3>近 30 天</h3>
          <div className="anni-upcoming-row">
            {upcoming.map((item) => {
              const head = anniversaryHeadline(item, today);
              return (
                <button type="button" key={item.id} className="anni-chip" onClick={() => setSelected(item)}>
                  <strong>{item.title}</strong>
                  <span>{head.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {loading ? (
        <div className="moments-loading">正在加载纪念日…</div>
      ) : !sorted.length ? (
        <div className="empty-state anni-empty"><strong>这里还没有重要日子</strong><p>添加生日、相识日或任何值得记住的一天。</p><button className="btn-primary" onClick={() => setComposerOpen(true)}>添加第一个纪念日</button></div>
      ) : (
        <section className="anni-list" aria-label="全部纪念日">
          {sorted.map((item) => {
            const head = anniversaryHeadline(item, today);
            return (
              <article
                key={item.id}
                className={`anni-card ${head.daysLeft === 0 ? "is-today" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(item)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(item); } }}
              >
                <div className="anni-card-main">
                  <div>
                    <h3>{item.title}</h3>
                    <p className="anni-meta">
                      {formatAnniversaryAnchor(item)}
                      {item.recur_yearly ? " · 每年" : " · 单次"}
                      {item.calendar === "lunar" ? ` · 锚定公历 ${item.event_date}` : ""}
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
              </article>
            );
          })}
        </section>
      )}
      {selected ? <div className="modal-backdrop" onMouseDown={() => setSelected(null)}><section className="anni-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="anni-detail-title" onMouseDown={(event) => event.stopPropagation()}>{(() => { const head = anniversaryHeadline(selected, today); return <><header><div><span>纪念日详情</span><h2 id="anni-detail-title">{selected.title}</h2></div><button type="button" aria-label="关闭" onClick={() => setSelected(null)}>×</button></header><div className="anni-detail-count"><strong>{head.daysLeft === 0 ? "今天" : head.daysLeft === null ? "—" : head.daysLeft}</strong><span>{head.label}</span></div><dl><div><dt>日期</dt><dd>{formatAnniversaryAnchor(selected)}</dd></div><div><dt>提醒方式</dt><dd>{selected.recur_yearly ? "每年提醒" : "仅记录一次"}</dd></div>{head.nextDate ? <div><dt>下一次</dt><dd>{head.nextDate}</dd></div> : null}</dl><section><span>留下的话</span><p>{selected.note || "这个日子还没有备注。"}</p></section><footer><button type="button" className="btn-ghost" onClick={() => { void updateAnniversary(selected.id, { recur_yearly: selected.recur_yearly ? 0 : 1 }).then(async () => { await refresh(); setSelected({ ...selected, recur_yearly: selected.recur_yearly ? 0 : 1 }); }); }}>{selected.recur_yearly ? "改为单次" : "改为每年"}</button><button type="button" className="btn-ghost danger" onClick={() => { if (window.confirm(`删除纪念日「${selected.title}」？`)) void deleteAnniversary(selected.id).then(async () => { await refresh(); setSelected(null); }); }}>删除</button></footer></>; })()}</section></div> : null}
    </main>
  );
}
