import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { cx } from './utils';

export interface Crumb {
  label: ReactNode;
  /** Makes the crumb a link-style button. The last crumb is the current page. */
  onClick?: () => void;
  href?: string;
}

export interface BreadcrumbsProps {
  items: Crumb[];
  className?: string;
}

/** „Klienti › Martin Dvořák“ (13 px; last item is the current page). */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav aria-label="Drobečková navigace" className={cx('breadcrumbs', className)}>
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} className="breadcrumbs__item">
            {last ? (
              <span className="breadcrumbs__current" aria-current="page">
                {item.label}
              </span>
            ) : item.href ? (
              <a className="breadcrumbs__link" href={item.href} onClick={item.onClick}>
                {item.label}
              </a>
            ) : item.onClick ? (
              <button type="button" className="breadcrumbs__link" onClick={item.onClick}>
                {item.label}
              </button>
            ) : (
              <span>{item.label}</span>
            )}
            {!last && <Icon name="chevronRight" size={14} />}
          </span>
        );
      })}
    </nav>
  );
}

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Shows a back arrow button (mobile flows). */
  onBack?: () => void;
  backLabel?: string;
  /** 17 px title (mobile screens, dense top bars). */
  compact?: boolean;
  className?: string;
}

/** Page title block: optional breadcrumbs, 22 px h1, subtitle, actions on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
  onBack,
  backLabel = 'Zpět',
  compact,
  className,
}: PageHeaderProps) {
  return (
    <div className={cx('page-header', compact && 'page-header--compact', className)}>
      <div className="page-header__main">
        {onBack && (
          <IconButton icon="arrowLeft" label={backLabel} size="lg" className="page-header__back" onClick={onBack} />
        )}
        <div className="page-header__titles">
          {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
          <h1 className="page-header__title">{title}</h1>
          {subtitle != null && <span className="page-header__subtitle">{subtitle}</span>}
        </div>
      </div>
      {actions != null && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}
