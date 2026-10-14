import type { HTMLAttributes } from 'react';
import { cx } from './utils';

/** Keyboard hint chip, e.g. <Kbd>⌘K</Kbd> inside the search field. */
export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <kbd className={cx('kbd', className)} {...rest} />;
}
