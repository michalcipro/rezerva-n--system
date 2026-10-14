import type { HTMLAttributes, ReactNode } from 'react';
import type { Tone } from '../domain/types';
import { cssVars, cx } from './utils';

export type ProgressTone = 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | Tone;

export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  value: number;
  max?: number;
  tone?: ProgressTone;
  /** xs 3 · sm 4 (default) · md 8 · lg 14 px (lg = stats bar with square start). */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Target marker (same units as value), e.g. occupancy goal 85. */
  target?: number;
  /** true = „68 %“ after the bar; or pass custom content. */
  showValue?: boolean | ReactNode;
  /** Discrete segments instead of a continuous bar (step indicator, „4 lekce“). */
  segments?: number;
  /** Accessible name. */
  label?: string;
}

export function Progress({
  value,
  max = 100,
  tone = 'accent',
  size = 'sm',
  target,
  showValue,
  segments,
  label,
  className,
  ...rest
}: ProgressProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const percent = Math.round(ratio * 100);
  const valueNode = showValue === true ? `${percent} %` : showValue || null;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={segments ? `${value} z ${max}` : `${percent} %`}
      className={cx('progress', size !== 'sm' && `progress--${size}`, tone !== 'accent' && `progress--${tone}`, className)}
      {...rest}
    >
      {segments ? (
        <span className="progress__segments" style={cssVars({ '--segments': segments })} aria-hidden="true">
          {Array.from({ length: segments }, (_, i) => (
            <span key={i} className={cx('progress__segment', i < Math.round(ratio * segments) && 'is-filled')} />
          ))}
        </span>
      ) : (
        <span className="progress__track" aria-hidden="true">
          <span className="progress__fill" style={{ width: `${ratio * 100}%`, display: 'block' }} />
          {target != null && max > 0 && (
            <span className="progress__target" style={{ left: `${Math.min(100, Math.max(0, (target / max) * 100))}%` }} />
          )}
        </span>
      )}
      {valueNode != null && <span className="progress__value">{valueNode}</span>}
    </div>
  );
}
