import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Therapist, TimeRange, Tone } from '../../domain/types';
import { therapistInitials, therapistName } from '../../engine/selectors';
import { AvatarStack, Icon, Select } from '../../ui';
import { SHIFT_FROM, SHIFT_TO, TONE_OPTIONS, clone, cx, daySegments, deepEqual, timeOptions } from './helpers';
import './settings.css';

/* ------------------------------------------------------------------ */
/* Výběr barvy (kategorie, terapeut)                                   */
/* ------------------------------------------------------------------ */

export function TonePicker({
  value,
  onChange,
  legend,
  hint,
}: {
  value: Tone;
  onChange: (tone: Tone) => void;
  legend: string;
  hint?: ReactNode;
}): JSX.Element {
  const name = useId();
  return (
    <fieldset className="field set-tones">
      <legend className="field__label">{legend}</legend>
      <div className="set-tones__list">
        {TONE_OPTIONS.map((t) => (
          <label key={t.value} className={cx('set-tone', `set-tone--${t.value}`, value === t.value && 'is-checked')} title={t.label}>
            <input
              type="radio"
              className="set-tone__input"
              name={name}
              value={t.value}
              checked={value === t.value}
              onChange={() => onChange(t.value)}
            />
            <span className="set-tone__swatch" aria-hidden="true">
              {value === t.value && <Icon name="check" size={14} strokeWidth={2.25} />}
            </span>
            <span className="visually-hidden">{t.label}</span>
          </label>
        ))}
      </div>
      {hint != null && <span className="field__hint">{hint}</span>}
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */
/* Skupina ovládacích prvků s viditelným popiskem (Segmented apod.)    */
/* ------------------------------------------------------------------ */

export function FieldGroup({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cx('field', className)}>
      <span className="field__label">{label}</span>
      {children}
      {error != null && error !== false && (
        <span className="field__error" role="alert">
          <Icon name="alertCircle" size={14} />
          <span>{error}</span>
        </span>
      )}
      {hint != null && <span className="field__hint">{hint}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Výběr času po 15 minutách                                           */
/* ------------------------------------------------------------------ */

export function TimeSelect({
  value,
  onChange,
  label,
  invalid,
  from = SHIFT_FROM,
  to = SHIFT_TO,
  id,
  className,
  ...aria
}: {
  value: string;
  onChange: (value: string) => void;
  /** Přístupný název (když prvek nemá viditelný popisek), např. „Pondělí – začátek". */
  label?: string;
  invalid?: boolean;
  from?: number;
  to?: number;
  id?: string;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
}): JSX.Element {
  return (
    <Select
      id={id}
      size="sm"
      className={cx('set-time', className)}
      aria-label={label}
      aria-describedby={aria['aria-describedby']}
      invalid={invalid || aria['aria-invalid'] === true || aria['aria-invalid'] === 'true'}
      value={value}
      options={timeOptions(from, to, 15, [value])}
      onValueChange={onChange}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Terapeuti služby                                                    */
/* ------------------------------------------------------------------ */

export function TherapistStack({ therapists, max = 4 }: { therapists: Therapist[]; max?: number }): JSX.Element {
  if (!therapists.length) {
    return (
      <span className="set-warn-text">
        <Icon name="alert" size={14} /> Nikdo
      </span>
    );
  }
  return (
    <AvatarStack
      size="xs"
      max={max}
      label={therapists.map((t) => therapistName(t)).join(', ')}
      people={therapists.map((t) => ({ name: therapistName(t), initials: therapistInitials(t), tone: t.tone }))}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Mini náhled směny (6:00–21:00)                                      */
/* ------------------------------------------------------------------ */

const AXIS_FROM = 6 * 60;
const AXIS_TO = 21 * 60;

export function ShiftBar({ work, breaks, label }: { work: TimeRange[]; breaks: TimeRange[]; label: string }): JSX.Element {
  const seg = daySegments(work, breaks);
  const span = AXIS_TO - AXIS_FROM;
  const pos = (m: number): number => Math.min(100, Math.max(0, ((m - AXIS_FROM) / span) * 100));
  return (
    <span className="set-shift" role="img" aria-label={label}>
      {seg.work.map(([a, b], i) => (
        <span key={'w' + i} className="set-shift__work" style={{ left: `${pos(a)}%`, width: `${pos(b) - pos(a)}%` }} />
      ))}
      {seg.breaks.map(([a, b], i) => (
        <span key={'b' + i} className="set-shift__break" style={{ left: `${pos(a)}%`, width: `${pos(b) - pos(a)}%` }} />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Rozpracovaná kopie dat, která sleduje uložený stav                  */
/* ------------------------------------------------------------------ */

/**
 * Koncept úprav nad `base`. Dokud uživatel nic nezměnil, koncept sleduje uložená data
 * (např. změnu z jiného zařízení); rozpracované změny se nepřepíšou.
 * `base` musí mít stabilní identitu (část stavu nebo useMemo).
 */
export function useSyncedDraft<T>(
  base: T,
  /** Rozpracovaný koncept z dřívějška (např. po odchodu z obrazovky). */
  initial?: T | null,
): {
  draft: T;
  setDraft: (next: T | ((prev: T) => T)) => void;
  reset: () => void;
  dirty: boolean;
} {
  const [draft, setDraft] = useState<T>(() => clone(initial ?? base));
  const baseRef = useRef(base);
  useEffect(() => {
    if (baseRef.current === base) return;
    const previous = baseRef.current;
    baseRef.current = base;
    setDraft((d) => (deepEqual(d, previous) ? clone(base) : d));
  }, [base]);
  return {
    draft,
    setDraft,
    reset: () => setDraft(clone(base)),
    dirty: !deepEqual(draft, base),
  };
}

/* ------------------------------------------------------------------ */
/* Řádek nastavení: popisek a vysvětlení vlevo, ovládací prvek vpravo  */
/* ------------------------------------------------------------------ */

interface ControlA11y {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/**
 * Jeden ovládací prvek (Input, NumberInput, Select…) dostane id, aria-describedby
 * a aria-invalid stejně jako ve `Field`. Pro složené prvky použijte `group`.
 */
export function SettingRow({
  label,
  hint,
  error,
  children,
  group,
  wide,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  /** Složený ovládací prvek – obalí se do role="group" s popiskem. */
  group?: boolean;
  /** Ovládací prvek na celou šířku pod popiskem. */
  wide?: boolean;
  className?: string;
}): JSX.Element {
  const id = useId();
  const labelId = `${id}l`;
  const hintId = hint != null ? `${id}h` : undefined;
  const errorId = error ? `${id}e` : undefined;
  const child = !group && isValidElement<ControlA11y>(children) ? children : null;
  const controlId = child?.props.id ?? `${id}c`;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  const control = child
    ? cloneElement(child, { id: controlId, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })
    : children;
  return (
    <div className={cx('set-row', wide && 'set-row--wide', !!error && 'has-error', className)}>
      <div className="set-row__text">
        {child ? (
          <label id={labelId} className="set-row__label" htmlFor={controlId}>
            {label}
          </label>
        ) : (
          <span id={labelId} className="set-row__label">
            {label}
          </span>
        )}
        {hint != null && (
          <span id={hintId} className="set-row__hint">
            {hint}
          </span>
        )}
      </div>
      <div
        className="set-row__control"
        role={child ? undefined : 'group'}
        aria-labelledby={child ? undefined : labelId}
        aria-describedby={child ? undefined : describedBy}
      >
        {control}
        {error ? (
          <span id={errorId} className="field__error">
            <Icon name="alertCircle" size={14} />
            <span>{error}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
