import type { ReactNode } from 'react';
import { IconButton } from './IconButton';
import { cx } from './utils';

export interface PeriodNavProps {
  /** Current period, e.g. „Září 2026“. Announced politely when it changes. */
  label: ReactNode;
  onPrev: () => void;
  onNext: () => void;
  prevLabel?: string;
  nextLabel?: string;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  className?: string;
}

/** „‹ Září 2026 ›“ stepper in one bordered box (statistics period). */
export function PeriodNav({
  label,
  onPrev,
  onNext,
  prevLabel = 'Předchozí období',
  nextLabel = 'Následující období',
  prevDisabled,
  nextDisabled,
  className,
}: PeriodNavProps) {
  return (
    <div className={cx('period-nav', className)}>
      <IconButton icon="chevronLeft" label={prevLabel} size="sm" onClick={onPrev} disabled={prevDisabled} />
      <span className="period-nav__label" aria-live="polite">
        {label}
      </span>
      <IconButton icon="chevronRight" label={nextLabel} size="sm" onClick={onNext} disabled={nextDisabled} />
    </div>
  );
}
