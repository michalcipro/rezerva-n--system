import { useId, type ReactNode } from 'react';
import { cssVars, cx } from './utils';

export interface RadioCardOption<T extends string = string> {
  value: T;
  title: ReactNode;
  description?: ReactNode;
  /** Element next to the title, e.g. <Badge tone="success">Doporučeno</Badge>. */
  badge?: ReactNode;
  /** Right-aligned content, e.g. a price. */
  aside?: ReactNode;
  disabled?: boolean;
}

export interface RadioCardsProps<T extends string = string> {
  options: RadioCardOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Visible group label (eyebrow style). Provide it or `aria-label`. */
  legend?: ReactNode;
  'aria-label'?: string;
  /** Grid columns on wider screens (always 1 on phones). */
  columns?: 1 | 2 | 3;
  name?: string;
  className?: string;
}

/** Single-choice option cards (cancel / excuse / reschedule). Native radios: arrow keys work. */
export function RadioCards<T extends string>({
  options,
  value,
  onChange,
  legend,
  columns = 1,
  name,
  className,
  'aria-label': ariaLabel,
}: RadioCardsProps<T>) {
  const autoId = useId();
  const groupName = name ?? `${autoId}radio`;
  return (
    <fieldset className={cx('radio-cards', className)} aria-label={legend == null ? ariaLabel : undefined}>
      {legend != null && <legend className="radio-cards__legend">{legend}</legend>}
      <div className="radio-cards__list" style={columns > 1 ? cssVars({ '--rc-cols': columns }) : undefined}>
        {options.map((option, i) => {
          const checked = option.value === value;
          const titleId = `${autoId}t${i}`;
          const descriptionId = option.description != null ? `${autoId}d${i}` : undefined;
          return (
            <label
              key={option.value}
              className={cx('radio-card', checked && 'is-checked', option.disabled && 'is-disabled')}
            >
              <input
                type="radio"
                className="radio-card__input"
                name={groupName}
                value={option.value}
                checked={checked}
                disabled={option.disabled}
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                onChange={() => onChange(option.value)}
              />
              <span className="radio-card__control" aria-hidden="true" />
              <span className="radio-card__body">
                <span className="radio-card__title-row">
                  <span id={titleId} className="radio-card__title">
                    {option.title}
                  </span>
                  {option.badge}
                </span>
                {option.description != null && (
                  <span id={descriptionId} className="radio-card__description">
                    {option.description}
                  </span>
                )}
              </span>
              {option.aside != null && <span className="radio-card__aside">{option.aside}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
