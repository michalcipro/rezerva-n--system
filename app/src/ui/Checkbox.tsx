import {
  forwardRef,
  useEffect,
  useRef,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { cx, mergeRefs } from './utils';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'size'> {
  label?: ReactNode;
  description?: ReactNode;
  onChange?: (checked: boolean, event: ChangeEvent<HTMLInputElement>) => void;
  indeterminate?: boolean;
}

/** Native checkbox with custom box; the whole label row is clickable. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, onChange, indeterminate, disabled, className, ...rest },
  ref,
) {
  const innerRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);

  return (
    <label className={cx('checkbox', disabled && 'is-disabled', className)}>
      <input
        ref={mergeRefs(ref, innerRef)}
        type="checkbox"
        className="checkbox__input"
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked, event)}
        {...rest}
      />
      {(label != null || description != null) && (
        <span className="checkbox__text">
          {label != null && <span className="checkbox__label">{label}</span>}
          {description != null && <span className="checkbox__description">{description}</span>}
        </span>
      )}
    </label>
  );
});
