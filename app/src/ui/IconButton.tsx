import { forwardRef, type ButtonHTMLAttributes } from 'react';
import type { ButtonSize } from './Button';
import { Icon, type IconName } from './Icon';
import { cx } from './utils';

export type IconButtonVariant = 'ghost' | 'secondary' | 'outline' | 'subtle' | 'primary' | 'danger';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Required accessible name (also shown as a native tooltip). */
  label: string;
  /** ghost (default) · outline = hairline border (top bar) · secondary = strong border. */
  variant?: IconButtonVariant;
  /** sm 32 px · md 36 px · lg 44 px. */
  size?: ButtonSize;
  /** Small accent dot, e.g. unread notifications. Mention it in `label` too. */
  dot?: boolean;
  /** Set false to suppress the native title tooltip. */
  tooltip?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', dot, tooltip = true, type = 'button', className, title, ...rest },
  ref,
) {
  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 20 : 18;
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={tooltip ? (title ?? label) : title}
      className={cx('btn', 'btn--icon', `btn--${variant}`, `btn--${size}`, className)}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
      {dot && <span className="btn__dot" aria-hidden="true" />}
    </button>
  );
});
