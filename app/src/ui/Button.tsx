import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from 'react';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';
import { cx } from './utils';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'subtle'
  /** Accent outline on a tinted fill — the „Omluvit“ action. */
  | 'soft'
  /** Neutral outline with danger text — the „Zrušit“ action. */
  | 'danger-secondary';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** sm 32 px · md 36 px · lg 44 px (48 px on phones). */
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  /** Stretch to the container width. */
  full?: boolean;
  /** Shows a spinner, keeps focus, ignores clicks. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon,
    iconRight,
    full,
    loading,
    type = 'button',
    className,
    children,
    onClick,
    ...rest
  },
  ref,
) {
  const iconSize = size === 'lg' ? 18 : 16;
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'btn',
        `btn--${variant}`,
        `btn--${size}`,
        (icon || loading) && 'btn--icon-start',
        iconRight && 'btn--icon-end',
        full && 'btn--full',
        loading && 'is-loading',
        className,
      )}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} /> : icon ? <Icon name={icon} size={iconSize} /> : null}
      {children != null && children !== false && <span className="btn__label">{children}</span>}
      {iconRight && <Icon name={iconRight} size={iconSize} />}
    </button>
  );
});
