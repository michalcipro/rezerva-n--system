import { createElement, forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { cx } from './utils';

export type CardElement = 'div' | 'section' | 'article' | 'aside' | 'li';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: CardElement;
  /** none 0 · sm 12 · md 16 (default) · lg 24. Children stack with a 12 px gap. */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Hover affordance for clickable cards. */
  interactive?: boolean;
}

/** White surface, hairline border, 10 px radius. */
export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { as = 'div', padding = 'md', interactive, className, ...rest },
  ref,
) {
  return createElement(as, {
    ref,
    className: cx('card', `card--pad-${padding}`, interactive && 'card--interactive', className),
    ...rest,
  });
});

export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  /** Secondary line under the title. */
  subtitle?: ReactNode;
  /** Small uppercase label above the title (use with size="title"). */
  eyebrow?: ReactNode;
  /** Muted text on the right, e.g. „7 záznamů“. */
  meta?: ReactNode;
  /** Buttons / links on the right. */
  actions?: ReactNode;
  icon?: IconName;
  /** label = 11 px uppercase section label (design default) · title = 16 px heading. */
  size?: 'label' | 'title';
  /** 44 px header bar with a bottom hairline — for padding="none" cards. */
  divided?: boolean;
  headingLevel?: 2 | 3 | 4;
}

export function CardHeader({
  title,
  subtitle,
  eyebrow,
  meta,
  actions,
  icon,
  size = 'label',
  divided,
  headingLevel = 2,
  className,
  ...rest
}: CardHeaderProps) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  return (
    <div
      className={cx('card-header', size === 'title' && 'card-header--title', divided && 'card-header--divided', className)}
      {...rest}
    >
      {icon && <Icon name={icon} size={16} className="card-header__icon" />}
      <div className="card-header__titles">
        {eyebrow && <span className="card-header__eyebrow">{eyebrow}</span>}
        <Heading className="card-header__title">{title}</Heading>
        {subtitle && <span className="card-header__subtitle">{subtitle}</span>}
      </div>
      {meta != null && <span className="card-header__meta">{meta}</span>}
      {actions && <div className="card-header__actions">{actions}</div>}
    </div>
  );
}
