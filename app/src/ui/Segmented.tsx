import { Icon, type IconName } from './Icon';
import { cx } from './utils';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
  icon?: IconName;
  /** Icon-only option; label becomes the accessible name. */
  hideLabel?: boolean;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label': string;
  /** Item height: sm 26 · md 28 (default, next to 32 px controls) · lg 32 (next to 36 px controls). */
  size?: 'sm' | 'md' | 'lg';
  /** Stretch options to equal widths across the container. */
  full?: boolean;
  className?: string;
}

/** „Den / Týden / Měsíc“ switcher: grey track, white active item with accent text. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  full,
  className,
  'aria-label': ariaLabel,
}: SegmentedProps<T>) {
  const iconOnly = options.every((o) => o.hideLabel);
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx(
        'segmented',
        size !== 'md' && `segmented--${size}`,
        full && 'segmented--full',
        iconOnly && 'segmented--icon-only',
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented__item"
          aria-pressed={option.value === value}
          aria-label={option.hideLabel ? option.label : undefined}
          title={option.hideLabel ? option.label : undefined}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.icon && <Icon name={option.icon} size={size === 'sm' ? 14 : 16} />}
          {!option.hideLabel && option.label}
        </button>
      ))}
    </div>
  );
}
