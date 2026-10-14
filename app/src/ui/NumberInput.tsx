import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { ControlSize } from './Input';
import { Icon } from './Icon';
import { cx, mergeRefs } from './utils';

export interface NumberInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'size' | 'type' | 'min' | 'max' | 'step' | 'prefix'
  > {
  value: number | null | undefined;
  /** Called with a parsed, clamped number (never NaN). */
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Arrow keys and steppers move by `step` (Shift = ×10). Default 1. */
  step?: number;
  /** Unit after the number: „Kč“, „h“, „%“, „min“. */
  suffix?: ReactNode;
  size?: ControlSize;
  invalid?: boolean;
  /** Show − / + buttons. Default true. */
  stepper?: boolean;
}

const format = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? '' : String(n).replace('.', ',');

const parse = (text: string): number | null => {
  const t = text.replace(/[\s ]/g, '').replace(',', '.');
  if (t === '' || t === '-' || t === '.' || t === '-.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Numeric field with Czech decimal comma, clamping, keyboard + button stepping. */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  {
    value,
    onChange,
    min,
    max,
    step = 1,
    suffix,
    size = 'md',
    invalid,
    stepper = true,
    disabled,
    className,
    style,
    onBlur,
    onFocus,
    onKeyDown,
    ...rest
  },
  ref,
) {
  const innerRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(() => format(value));
  const focused = useRef(false);
  const decimals = (String(step).split('.')[1] ?? '').length;

  useEffect(() => {
    if (!focused.current) setDraft(format(value));
  }, [value]);

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const round = (n: number) => Number(n.toFixed(decimals));

  const commit = (n: number) => {
    const next = round(clamp(n));
    if (next !== value) onChange(next);
    return next;
  };

  const stepBy = (direction: 1 | -1, multiplier = 1) => {
    const base = parse(draft) ?? value ?? min ?? 0;
    const next = commit(base + direction * step * multiplier);
    setDraft(format(next));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      stepBy(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey ? 10 : 1);
    }
  };

  const ariaInvalid = rest['aria-invalid'];
  const isInvalid = invalid || ariaInvalid === true || ariaInvalid === 'true';
  const atMin = min != null && value != null && value <= min;
  const atMax = max != null && value != null && value >= max;

  return (
    <div
      className={cx(
        'control',
        'control--number',
        size !== 'md' && `control--${size}`,
        isInvalid && 'control--invalid',
        disabled && 'control--disabled',
        className,
      )}
      style={style}
    >
      <input
        ref={mergeRefs(ref, innerRef)}
        type="text"
        inputMode={decimals > 0 ? 'decimal' : 'numeric'}
        autoComplete="off"
        role="spinbutton"
        aria-valuenow={value ?? undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={
          value != null && typeof suffix === 'string' ? `${format(value)} ${suffix}` : undefined
        }
        className="control__input"
        disabled={disabled}
        value={draft}
        onFocus={(event) => {
          focused.current = true;
          onFocus?.(event);
        }}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const n = parse(text);
          if (n !== null && n >= (min ?? -Infinity) && n <= (max ?? Infinity)) {
            const next = round(n);
            if (next !== value) onChange(next);
          }
        }}
        onBlur={(event) => {
          focused.current = false;
          const n = parse(draft);
          setDraft(format(n === null ? value : commit(n)));
          onBlur?.(event);
        }}
        onKeyDown={handleKeyDown}
        {...rest}
        aria-invalid={isInvalid || undefined}
      />
      {suffix != null && <span className="control__suffix">{suffix}</span>}
      {stepper && (
        <span className="control__steppers">
          <button
            type="button"
            tabIndex={-1}
            className="control__step"
            aria-label="Snížit"
            disabled={disabled || atMin}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => stepBy(-1)}
          >
            <Icon name="minus" size={14} />
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="control__step"
            aria-label="Zvýšit"
            disabled={disabled || atMax}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => stepBy(1)}
          >
            <Icon name="plus" size={14} />
          </button>
        </span>
      )}
    </div>
  );
});
