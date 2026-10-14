import { forwardRef, type ChangeEvent, type ReactNode, type SelectHTMLAttributes } from 'react';
import type { ControlSize } from './Input';
import { Icon } from './Icon';
import { cx } from './utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'prefix'> {
  options: SelectOption[];
  /** Adds a disabled empty first option shown while value is ''. */
  placeholder?: string;
  /** Muted inline label inside the frame, e.g. „Terapeut:“ (filter look). */
  prefix?: ReactNode;
  size?: ControlSize;
  sunken?: boolean;
  invalid?: boolean;
  /** Size to content instead of filling the row (filter buttons). */
  inline?: boolean;
  /** Convenience: receives the selected value (native onChange still fires). */
  onValueChange?: (value: string) => void;
}

/** Native select in the shared control frame (keyboard + mobile pickers for free). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    options,
    placeholder,
    prefix,
    size = 'md',
    sunken,
    invalid,
    inline,
    onValueChange,
    onChange,
    className,
    style,
    disabled,
    ...rest
  },
  ref,
) {
  const ariaInvalid = rest['aria-invalid'];
  const isInvalid = invalid || ariaInvalid === true || ariaInvalid === 'true';
  return (
    <div
      className={cx(
        'control',
        'control--select',
        size !== 'md' && `control--${size}`,
        sunken && 'control--sunken',
        inline && 'control--inline',
        isInvalid && 'control--invalid',
        disabled && 'control--disabled',
        className,
      )}
      style={style}
    >
      {prefix != null && <span className="control__prefix">{prefix}</span>}
      <select
        ref={ref}
        className="control__input control__select"
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
          onChange?.(event);
          onValueChange?.(event.target.value);
        }}
        {...rest}
        aria-invalid={isInvalid || undefined}
      >
        {placeholder != null && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={16} className="control__chevron" />
    </div>
  );
});
