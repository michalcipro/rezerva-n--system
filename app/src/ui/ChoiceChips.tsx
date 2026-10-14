import type { ReactNode } from 'react';
import { cssVars, cx } from './utils';

export interface ChoiceOption<T extends string = string> {
  value: T;
  label: ReactNode;
  /** Accessible name when the label alone is ambiguous (e.g. a bare time). */
  ariaLabel?: string;
  disabled?: boolean;
}

export interface ChoiceChipsProps<T extends string = string> {
  options: ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  'aria-label': string;
  /** pill = rounded chips (reasons) · tile = 8 px radius (time slots). */
  shape?: 'pill' | 'tile';
  /** md 36 px · lg 44 px (touch). */
  size?: 'md' | 'lg';
  /** Fixed grid columns, e.g. 4 for time slots. Omit for wrapping chips. */
  columns?: number;
  className?: string;
}

/** Single-choice chips: „Nemoc / Práce / Rodina / Jiné“ or a time-slot grid. */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  shape = 'pill',
  size = 'md',
  columns,
  className,
  'aria-label': ariaLabel,
}: ChoiceChipsProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx(
        'chips',
        shape === 'tile' && 'chips--tile',
        size === 'lg' && 'chips--lg',
        columns && 'chips--grid',
        className,
      )}
      style={columns ? cssVars({ '--chips-cols': columns }) : undefined}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="chip"
          aria-pressed={option.value === value}
          aria-label={option.ariaLabel}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
