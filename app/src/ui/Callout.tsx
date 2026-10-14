import type { HTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { cx } from './utils';

export type CalloutTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export interface CalloutProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: CalloutTone;
  /** Small uppercase heading in the tone colour, e.g. „Storno teď“. */
  title?: ReactNode;
  /** Defaults per tone; pass null to hide. */
  icon?: IconName | null;
  /** Buttons under the text. */
  actions?: ReactNode;
}

const DEFAULT_ICON: Record<CalloutTone, IconName> = {
  neutral: 'info',
  accent: 'info',
  success: 'checkCircle',
  warning: 'clock',
  danger: 'alertCircle',
  info: 'info',
};

/** Inline note (role="note"): soft tone fill, hairline border, no side stripe. */
export function Callout({ tone = 'neutral', title, icon, actions, className, children, ...rest }: CalloutProps) {
  const iconName = icon === undefined ? DEFAULT_ICON[tone] : icon;
  return (
    <div role="note" className={cx('callout', tone !== 'neutral' && `callout--${tone}`, className)} {...rest}>
      {iconName && <Icon name={iconName} size={16} className="callout__icon" />}
      <div className="callout__body">
        {title != null && <span className="callout__title">{title}</span>}
        {children != null && <div>{children}</div>}
        {actions != null && <div className="callout__actions">{actions}</div>}
      </div>
    </div>
  );
}
