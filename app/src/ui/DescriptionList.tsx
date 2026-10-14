import type { ReactNode } from 'react';
import { cssVars, cx } from './utils';

export interface DescriptionItem {
  term: ReactNode;
  detail: ReactNode;
  /** Stable key when terms are not plain strings. */
  id?: string;
}

export interface DescriptionListProps {
  items: DescriptionItem[];
  /** Term column width in px. Default 84 (drawer layout). */
  termWidth?: number;
  /** No hairlines, tighter rows. */
  plain?: boolean;
  /** Term above detail. */
  stacked?: boolean;
  className?: string;
}

/** Term / detail rows separated by hairlines (booking drawer: Platba, Omluvenky, Připomínka…). */
export function DescriptionList({ items, termWidth, plain, stacked, className }: DescriptionListProps) {
  return (
    <dl
      className={cx('dl', plain && 'dl--plain', stacked && 'dl--stacked', className)}
      style={termWidth ? cssVars({ '--dl-term-w': `${termWidth}px` }) : undefined}
    >
      {items.map((item, i) => (
        <div key={item.id ?? (typeof item.term === 'string' ? item.term : i)} className="dl__row">
          <dt className="dl__term">{item.term}</dt>
          <dd className="dl__detail">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
