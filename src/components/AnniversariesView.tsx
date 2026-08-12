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
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    Boolean(title.trim()) &&
    (calendar === "solar" ? Boolean(eventDate) : Boolean(lunarSolarPreview));

  return (
    <main className="main-workspace moments-page anniversaries-page">
      <header className="moments-hero">
        <span>ANNIVERSARIES</span>
        <h2>纪念日</h2>
        <p>记下重要日子，可按公历或农历每年循环，看见日子慢慢堆成光阴。</p>
      </header>

      <section className="anni-composer" aria-label="添加纪念日">
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
            添加
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
