import type { ReactNode } from 'react';
import type { Tone } from '../domain/types';
import { cx } from './utils';

export interface SwatchProps {
  /** Category tone, 'accent', 'neutral', or a calendar pattern ('break' hatched, 'free' dashed). */
  tone: Tone | 'accent' | 'neutral' | 'break' | 'free';
  /** solid = chart colour chip · soft (default) = event-style tinted chip. */
  variant?: 'soft' | 'solid';
  children?: ReactNode;
  className?: string;
}

/** Legend item: 10 px chip + label. Wrap several in <div className="legend">. */
export function Swatch({ tone, variant = 'soft', children, className }: SwatchProps) {
  return (
    <span className={cx('swatch', `swatch--${tone}`, variant === 'solid' && 'swatch--solid', className)}>
      <span className="swatch__chip" aria-hidden="true" />
      {children}
    </span>
  );
}
