import {
  forwardRef,
  useRef,
  type ChangeEvent,
  type InputHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './Icon';
import { cx, mergeRefs } from './utils';

export type ControlSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  /** Leading icon, e.g. "search". */
  prefixIcon?: IconName;
  /** Leading text, e.g. „+420“. */
  prefix?: ReactNode;
  /** Trailing unit or element, e.g. „Kč“, „h“, „%“ or <Kbd>⌘K</Kbd>. */
  suffix?: ReactNode;
  /** sm 32 · md 36 (default) · lg 44. Phones get 44 automatically. */
  size?: ControlSize;
  /** Grey fill with hairline border — the top-bar search look. */
  sunken?: boolean;
  invalid?: boolean;
  /** Convenience: receives the string value (native onChange still fires). */
  onValueChange?: (value: string) => void;
}

/** Text input in the shared control frame. `className`/`style` go to the frame. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    prefixIcon,
    prefix,
    suffix,
    size = 'md',
    sunken,
    invalid,
    onValueChange,
    onChange,
    className,
    style,
    disabled,
    type = 'text',
    ...rest
  },
  ref,
) {
  const innerRef = useRef<HTMLInputElement>(null);
  const ariaInvalid = rest['aria-invalid'];
  const isInvalid = invalid || ariaInvalid === true || ariaInvalid === 'true';

  const focusInput = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== innerRef.current && !disabled) {
      event.preventDefault();
      innerRef.current?.focus();
    }
  };

  return (
    <div
      className={cx(
        'control',
        size !== 'md' && `control--${size}`,
        sunken && 'control--sunken',
        isInvalid && 'control--invalid',
        disabled && 'control--disabled',
        className,
      )}
      style={style}
      onMouseDown={focusInput}
    >
      {prefixIcon && <Icon name={prefixIcon} size={16} className="control__icon" />}
      {prefix != null && <span className="control__prefix">{prefix}</span>}
      <input
        ref={mergeRefs(ref, innerRef)}
        type={type}
        className="control__input"
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onChange?.(event);
          onValueChange?.(event.target.value);
        }}
        {...rest}
        aria-invalid={isInvalid || undefined}
      />
      {suffix != null && <span className="control__suffix">{suffix}</span>}
    </div>
  );
});
