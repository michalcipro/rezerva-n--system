import type { ReactNode } from 'react';
import { cx } from './utils';

export interface ActionBarProps {
  /** Summary above the buttons (selected slot, price, policy line). */
  summary?: ReactNode;
  /** Buttons; they share the row equally. */
  children: ReactNode;
  className?: string;
}

/** Sticky bottom action area for mobile flows (white, top hairline, safe-area aware). */
export function ActionBar({ summary, children, className }: ActionBarProps) {
  return (
    <div className={cx('action-bar', className)}>
      {summary != null && <div>{summary}</div>}
      <div className="action-bar__row">{children}</div>
    </div>
  );
}
