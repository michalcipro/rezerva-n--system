import { cx } from './utils';

export interface DayStripItem {
  value: string;
  /** Short weekday, e.g. „Pá“. */
  dow: string;
  /** Day of month, e.g. 16. */
  day: string | number;
  /** Tiny line under the number: „dnes“, „zavřeno“. */
  sub?: string;
  /** Full accessible name, e.g. „pátek 16. října“. */
  label?: string;
  disabled?: boolean;
}

export interface DayStripProps {
  days: DayStripItem[];
  value: string | null;
  onChange: (value: string) => void;
  'aria-label': string;
  className?: string;
}

/** Row of day buttons from the mobile booking flow (64 px tall, accent when selected). */
export function DayStrip({ days, value, onChange, className, 'aria-label': ariaLabel }: DayStripProps) {
  return (
    <div role="group" aria-label={ariaLabel} className={cx('daystrip', className)}>
      {days.map((d) => (
        <button
          key={d.value}
          type="button"
          className="daystrip__day"
          aria-pressed={d.value === value}
          aria-label={d.label}
          disabled={d.disabled}
          onClick={() => onChange(d.value)}
        >
          <span className="daystrip__dow">{d.dow}</span>
          <span className="daystrip__num">{d.day}</span>
          <span className="daystrip__sub">{d.sub}</span>
        </button>
      ))}
    </div>
  );
}
