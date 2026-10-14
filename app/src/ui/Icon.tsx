import { forwardRef, useId, type SVGProps } from 'react';
import { ICONS, type IconName } from './icons';
import { cx } from './utils';

export type { IconName };
export { ICON_NAMES } from './icons';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'ref' | 'title'> {
  name: IconName;
  /** Pixel size (width = height). Default 18. */
  size?: number;
  /** Accessible name. Without it the icon is decorative (aria-hidden). */
  title?: string;
  strokeWidth?: number;
}

/** Inline stroke icon: `<Icon name="calendar" size={18} />`. */
export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  { name, size = 18, title, strokeWidth = 1.75, className, ...rest },
  ref,
) {
  const titleId = useId();
  const a11y = title
    ? { role: 'img', 'aria-labelledby': titleId }
    : { 'aria-hidden': true as const };
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      className={cx('icon', className)}
      {...a11y}
      {...rest}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      {ICONS[name]}
    </svg>
  );
});
