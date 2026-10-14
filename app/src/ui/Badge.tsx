import { forwardRef, type HTMLAttributes } from 'react';
import type { Tone } from '../domain/types';
import { Icon, type IconName } from './Icon';
import { cx } from './utils';

export type SemanticTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeTone = SemanticTone | Tone;
/** circle = done / positive · ring = pending / excused · square = penalty / warning. */
export type DotShape = 'circle' | 'ring' | 'square';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** sm 18 px (11/600) · md 22 px (12/600). */
  size?: 'sm' | 'md';
  /** Leading status dot; pass a shape to change it. */
  dot?: boolean | DotShape;
  icon?: IconName;
  /** Bordered tag look (client tags such as „Běžec“). */
  outline?: boolean;
  /** No pill background: dot + coloured text (table / drawer status). */
  plain?: boolean;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = 'neutral', size = 'sm', dot, icon, outline, plain, className, children, ...rest },
  ref,
) {
  const shape: DotShape | null = dot === true ? 'circle' : dot ? dot : null;
  return (
    <span
      ref={ref}
      className={cx(
        'badge',
        `badge--${tone}`,
        size === 'md' && 'badge--md',
        outline && 'badge--outline',
        plain && 'badge--plain',
        className,
      )}
      {...rest}
    >
      {shape && <span className={cx('badge__dot', shape !== 'circle' && `badge__dot--${shape}`)} aria-hidden="true" />}
      {icon && <Icon name={icon} size={size === 'md' ? 14 : 12} />}
      <span className="badge__text">{children}</span>
    </span>
  );
});
