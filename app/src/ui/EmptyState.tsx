import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { cx } from './utils';

export interface EmptyStateProps {
  title: ReactNode;
  text?: ReactNode;
  icon?: IconName;
  /** Usually a <Button>. */
  action?: ReactNode;
  /** Less padding, for use inside cards and lists. */
  compact?: boolean;
  className?: string;
}

export function EmptyState({ title, text, icon = 'info', action, compact, className }: EmptyStateProps) {
  return (
    <div className={cx('empty', compact && 'empty--compact', className)}>
      <span className="empty__icon" aria-hidden="true">
        <Icon name={icon} size={compact ? 18 : 20} />
      </span>
      <p className="empty__title">{title}</p>
      {text != null && <p className="empty__text">{text}</p>}
      {action != null && <div className="empty__action">{action}</div>}
    </div>
  );
}
