import { WEEKDAY_OPTIONS, toggleWeekday } from "@/lib/repeat";

type Props = {
  weekdays: number[];
  onChange: (weekdays: number[]) => void;
};

/** Mon-first chips for weekly repeat (0=Sun … 6=Sat). */
export function RepeatWeekdayPicker({ weekdays, onChange }: Props) {
  return (
    <div className="repeat-weekday-picker" role="group" aria-label="重复星期">
      {WEEKDAY_OPTIONS.map((day) => {
        const on = weekdays.includes(day.value);
        return (
          <button
            key={day.value}
            type="button"
            className={`repeat-weekday-chip ${on ? "on" : ""}`}
            aria-pressed={on}
            onClick={() => onChange(toggleWeekday(weekdays, day.value))}
          >
            {day.label}
          </button>
        );
      })}
    </div>
  );
}
