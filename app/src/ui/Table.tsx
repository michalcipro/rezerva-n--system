import type { ReactNode, TableHTMLAttributes } from 'react';
import { cx } from './utils';

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode;
  /** Minimum table width before the wrapper scrolls horizontally (px). */
  minWidth?: number;
  /** Cap the height so the sticky header works while scrolling inside the table. */
  maxHeight?: number | string;
  density?: 'compact' | 'default' | 'comfortable';
  /** Row hover highlight (for clickable rows). */
  hover?: boolean;
  /** Visually hidden caption for screen readers. */
  caption?: string;
  wrapperClassName?: string;
}

/**
 * Thin wrapper around a native table: uppercase 11 px header (sticky), 13 px
 * tabular rows, subtle row hairlines, horizontal scroll inside its own box.
 * Put className="num" on numeric <th>/<td> to right-align them.
 */
export function Table({
  children,
  minWidth,
  maxHeight,
  density = 'default',
  hover,
  caption,
  className,
  wrapperClassName,
  style,
  ...rest
}: TableProps) {
  return (
    <div
      className={cx('table-wrap', maxHeight != null && 'table-wrap--scroll', wrapperClassName)}
      style={maxHeight != null ? { maxHeight } : undefined}
    >
      <table
        className={cx('table', density !== 'default' && `table--${density}`, hover && 'table--hover', className)}
        style={minWidth ? { minWidth, ...style } : style}
        {...rest}
      >
        {caption && <caption className="visually-hidden">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}
