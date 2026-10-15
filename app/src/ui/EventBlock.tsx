import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import type { Tone } from '../domain/types';
import { Icon, type IconName } from './Icon';
import { cx } from './utils';

export type EventVariant =
  /** Upcoming booking in its category tone. */
  | 'default'
  /** In progress („Probíhá“): darker border. */
  | 'active'
  /** Past / done: muted grey. */
  | 'completed'
  | 'no_show'
  | 'cancelled'
  /** Free window: dashed outline, invites a booking. */
  | 'free'
  /** Released slot offered to the waitlist: dashed tone border, hatched. */
  | 'released'
  /** Break / blocked time: hatched, non-interactive. */
  | 'break';

/** By block height: xs 15 min (one line) · sm 30 min · md 45 min · lg 60 min · xl 90 min +. */
export type EventDensity = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface EventBlockProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  tone?: Tone;
  variant?: EventVariant;
  density?: EventDensity;
  /** Client name, lesson name… */
  title: ReactNode;
  /** Second line, e.g. „15:15 Mentální koučink“ (tabular numerals). */
  meta?: ReactNode;
  /** Third line: <EventStatus>, <EventChip>, <EventSeats>, payment info. */
  footer?: ReactNode;
  /** Trailing icon on the title line (e.g. "video" for online consultations). */
  icon?: IconName;
  selected?: boolean;
  /** Positioning from the calendar grid (top / height / left / right). */
  style?: CSSProperties;
}

/**
 * Calendar event block. Renders a <button> (or a <div> for breaks). Position it
 * absolutely from the grid via `style`. Selection uses aria-pressed.
 */
export const EventBlock = forwardRef<HTMLButtonElement, EventBlockProps>(function EventBlock(
  { tone = 'teal', variant = 'default', density = 'md', title, meta, footer, icon, selected, className, type = 'button', ...rest },
  ref,
) {
  const classes = cx(
    'event',
    `event--${tone}`,
    density !== 'md' && `event--${density}`,
    variant !== 'default' && `event--${variant}`,
    className,
  );
  const content = (
    <>
      <span className="event__title">
        <span className="event__title-text">{title}</span>
        {icon && <Icon name={icon} size={12} />}
      </span>
      {meta != null && <span className="event__meta">{meta}</span>}
      {footer != null && density !== 'xs' && <span className="event__footer">{footer}</span>}
    </>
  );

  if (variant === 'break') {
    return (
      <div className={classes} style={rest.style} aria-label={rest['aria-label']}>
        {content}
      </div>
    );
  }

  return (
    <button ref={ref} type={type} className={classes} aria-pressed={selected ?? undefined} {...rest}>
      {content}
    </button>
  );
});

/** Status line inside an event: dot + label, e.g. „Probíhá“ (accent) or „Proběhlo“ (muted). */
export function EventStatus({ tone = 'accent', children }: { tone?: 'accent' | 'muted' | 'danger'; children: ReactNode }) {
  return (
    <span className="event__status">
      <span className={cx('event__dot', tone !== 'accent' && `event__dot--${tone}`)} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Small pill inside an event: „Nový klient“, „Čeká na platbu“. */
export function EventChip({ tone = 'neutral', children }: { tone?: 'neutral' | 'warning' | 'danger'; children: ReactNode }) {
  return <span className={cx('event__chip', tone !== 'neutral' && `event__chip--${tone}`)}>{children}</span>;
}

/** Group lesson capacity squares + „6/8 míst“. */
export function EventSeats({ taken, capacity, children }: { taken: number; capacity: number; children?: ReactNode }) {
  const shown = Math.min(capacity, 12);
  return (
    <>
      <span className="event__seats" aria-hidden="true">
        {Array.from({ length: shown }, (_, i) => (
          <span key={i} className={cx('event__seat', i >= taken && 'event__seat--empty')} />
        ))}
      </span>
      {children ?? `${taken}/${capacity}`}
    </>
  );
}

/** Thin progress line for an event in progress (value 0–1). */
export function EventProgress({ value }: { value: number }) {
  return (
    <span className="event__progress" aria-hidden="true">
      <span className="event__progress-fill" style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </span>
  );
}
