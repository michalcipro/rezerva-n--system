import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { cx } from './utils';

export interface BannerProps {
  /** warning (default — test mode) · accent · info · danger · inverse (ink bar). */
  tone?: 'warning' | 'accent' | 'info' | 'danger' | 'inverse';
  icon?: IconName | null;
  /** Message; <strong> parts take the tone colour. */
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Full-width strip for AppShell's `banner` slot, e.g. „Testovací režim · simulovaný čas …“. */
export function Banner({ tone = 'warning', icon = 'alertCircle', children, actions, className }: BannerProps) {
  return (
    <div className={cx('banner', tone !== 'warning' && `banner--${tone}`, className)}>
      {icon && <Icon name={icon} size={16} className="banner__icon" />}
      <div className="banner__body">{children}</div>
      {actions != null && <div className="banner__actions">{actions}</div>}
    </div>
  );
}
