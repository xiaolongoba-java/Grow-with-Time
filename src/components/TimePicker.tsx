import { useEffect, useRef, useState } from "react";
import {
  addMinutesToTime,
  ensureEndAfterStart,
  nowTimeString,
} from "@/lib/dates";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Click-to-confirm time picker (no native OK step). */
export function TimePicker({
  value,
  onChange,
  placeholder = "选择时间",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const [hh, mm] = value
    ? value.split(":").map((x) => Number(x))
    : [null, null];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (hour: number, minute: number) => {
    onChange(`${pad(hour)}:${pad(minute)}`);
    setOpen(false);
  };

  return (
    <div className="time-picker" ref={rootRef}>
      <button
        type="button"
        className="field time-picker-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        {value || placeholder}
      </button>
      {open ? (
        <div className="time-picker-pop">
          <div className="time-picker-section">
            <div className="field-label">小时 · 点击即确认</div>
            <div className="time-picker-grid hours">
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  className={`time-chip ${hh === h ? "active" : ""}`}
                  onClick={() =>
                    pick(h, mm != null && !Number.isNaN(mm) ? mm : 0)
                  }
                >
                  {pad(h)}
                </button>
              ))}
            </div>
          </div>
          <div className="time-picker-section">
            <div className="field-label">分钟</div>
            <div className="time-picker-grid minutes">
              {MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`time-chip ${mm === m ? "active" : ""}`}
                  onClick={() =>
                    pick(hh != null && !Number.isNaN(hh) ? hh : 9, m)
                  }
                >
                  :{pad(m)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Required start + deadline (end) time range. */
export function TimeRangeFields({
  start,
  end,
  onStartChange,
  onEndChange,
}: {
  start: string;
  end: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
}) {
  const handleStart = (v: string) => {
    onStartChange(v);
    onEndChange(ensureEndAfterStart(v, end));
  };

  const handleEnd = (v: string) => {
    if (!start) {
      onStartChange(nowTimeString());
      onEndChange(ensureEndAfterStart(nowTimeString(), v));
      return;
    }
    onEndChange(ensureEndAfterStart(start, v));
  };

  return (
    <div className="time-range">
      <div>
        <label className="field-label">开始时间 *</label>
        <TimePicker
          value={start}
          onChange={handleStart}
          placeholder="点击选择（默认现在）"
        />
      </div>
      <div>
        <label className="field-label">截止时间 *</label>
        <TimePicker
          value={end}
          onChange={handleEnd}
          placeholder="点击选择（默认 +1 小时）"
        />
      </div>
      {!start || !end ? (
        <p className="time-range-hint">开始时间与截止时间均为必填</p>
      ) : null}
    </div>
  );
}

export function defaultTimeRange(): { start: string; end: string } {
  const start = nowTimeString();
  return { start, end: addMinutesToTime(start, 60) };
}
